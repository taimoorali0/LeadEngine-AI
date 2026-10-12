<?php
namespace Tests\Feature;

use App\Jobs\SendOutreach;
use App\Models\Company;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\OutreachMessage;
use App\Models\OutreachPermission;
use App\Services\Billing;
use App\Services\OutreachDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class OutreachTest extends TestCase
{
    use RefreshDatabase;
    protected $seed = true;

    private function fixture(): OutreachMessage
    {
        $owner = $this->makeUser('owner');
        $this->actingAs($owner);
        $org = $owner->organization;
        $org->outreach_config = ['enabled' => true, 'seller_name' => 'Acme', 'offer' => 'Maintenance services', 'daily_limit' => 50, 'email' => ['host' => 'smtp.example.com', 'port' => 587, 'from_address' => 'sales@example.com', 'password' => 'secret-password']];
        $org->save();
        $company = Company::create(['organization_id' => $org->id, 'name_en' => 'Paper Co', 'normalized_name' => 'paper']);
        $lead = Lead::create(['organization_id' => $org->id, 'company_id' => $company->id]);
        return OutreachMessage::create(['organization_id' => $org->id, 'lead_id' => $lead->id, 'channel' => 'email', 'recipient' => 'info@example.com', 'subject' => 'Hello', 'body' => 'Maintenance introduction', 'unsubscribe_token' => Str::random(64)]);
    }

    private function approval(): array
    {
        return ['subject' => 'Hello', 'body' => 'Maintenance introduction', 'permission_evidence' => 'Requested email information at our meeting.'];
    }

    public function test_settings_hide_and_encrypt_secrets(): void
    {
        $m = $this->fixture();
        $this->getJson('/api/outreach/settings')->assertOk()->assertJsonPath('config.email.password_configured', true)->assertJsonMissing(['password' => 'secret-password']);
        $this->assertStringNotContainsString('secret-password', DB::table('organizations')->where('id', $m->organization_id)->value('outreach_config'));
    }

    public function test_approval_is_one_time_and_requires_permission_evidence(): void
    {
        Queue::fake();
        $m = $this->fixture();
        $this->postJson("/api/outreach/{$m->id}/approve", ['subject' => 'Hello', 'body' => 'Hi'])->assertUnprocessable();
        $this->postJson("/api/outreach/{$m->id}/approve", $this->approval())->assertOk()->assertJsonPath('status', 'queued');
        $this->postJson("/api/outreach/{$m->id}/approve", $this->approval())->assertStatus(409);
    }

    public function test_opt_out_blocks_approval_and_cancels_pending(): void
    {
        $m = $this->fixture();
        $this->postJson("/api/outreach/{$m->id}/outcome", ['outcome' => 'opt_out'])->assertOk();
        $this->assertSame('cancelled', $m->fresh()->status);
        $m->update(['status' => 'draft']);
        $this->postJson("/api/outreach/{$m->id}/approve", $this->approval())->assertUnprocessable();
    }

    public function test_other_tenant_cannot_access_or_approve_message(): void
    {
        $m = $this->fixture();
        $org = Organization::create(['name' => 'Other', 'slug' => 'other']);
        $this->actingAs($this->makeUser('owner', $org));
        $this->getJson('/api/outreach')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson("/api/outreach/{$m->id}/approve", $this->approval())->assertNotFound();
    }

    public function test_duplicate_jobs_send_only_once(): void
    {
        $m = $this->fixture();
        $m->update(['status' => 'queued']);
        OutreachPermission::create(['organization_id' => $m->organization_id, 'channel' => 'email', 'recipient' => $m->recipient, 'allowed' => true]);
        $delivery = $this->mock(OutreachDelivery::class);
        $delivery->shouldReceive('send')->once()->andReturn('provider-1');
        (new SendOutreach($m->id))->handle($delivery, app(Billing::class));
        (new SendOutreach($m->id))->handle($delivery, app(Billing::class));
        $this->assertSame('accepted', $m->fresh()->status);
    }

    public function test_permission_is_rechecked_by_worker(): void
    {
        $m = $this->fixture();
        $m->update(['status' => 'queued']);
        $delivery = $this->mock(OutreachDelivery::class);
        $delivery->shouldNotReceive('send');
        (new SendOutreach($m->id))->handle($delivery, app(Billing::class));
        $this->assertSame('blocked', $m->fresh()->status);
    }

    public function test_unsigned_whatsapp_webhook_is_rejected(): void
    {
        $m = $this->fixture();
        $this->postJson('/api/outreach/whatsapp/'.$m->organization_id, ['entry' => []])->assertForbidden();
    }
}
