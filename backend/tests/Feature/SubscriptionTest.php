<?php

namespace Tests\Feature;

use App\Jobs\RunCampaign;
use App\Models\BillingRequest;
use App\Models\Campaign;
use App\Models\Location;
use App\Models\Role;
use App\Models\User;
use App\Services\Billing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function admin(): User
    {
        return User::create(['role_id' => Role::where('key', 'super_admin')->value('id'), 'name' => 'Admin',
            'email' => 'root@example.test', 'password' => 'secret-password']);
    }

    public function test_yearly_renewal_extends_from_current_end_and_refills_monthly(): void
    {
        $owner = $this->makeUser('owner');
        $org = $owner->organization;
        app(Billing::class)->activate($org, 1);
        $end = $org->fresh()->plan_renews_at;

        $req = $this->actingAs($owner)->postJson('/api/billing/requests', ['type' => 'renewal', 'months' => 12])->assertCreated();
        $this->actingAs($this->admin())->patchJson("/api/admin/billing/requests/{$req->json('id')}", ['status' => 'approved'])->assertOk();

        $org->refresh();
        $this->assertTrue($org->plan_renews_at->equalTo($end->copy()->addMonths(12)), 'paid time stacks on the existing period');
        $this->assertSame('active', $org->subscription_status);

        // A month later the allowance refills, without waiting for the next payment.
        $org->update(['credit_balance' => 5, 'credits_renew_at' => now()->subMinute()]);
        $this->artisan('credits:refill')->assertSuccessful();
        $this->assertSame(20000, $org->fresh()->credit_balance);  // business plan allowance
        $this->assertTrue($org->fresh()->credits_renew_at->isFuture());

        // Expiry still applies once the paid period is over.
        $org->update(['plan_renews_at' => now()->subMinute()]);
        $this->artisan('subscriptions:expire')->assertSuccessful();
        $this->assertSame('expired', $org->fresh()->subscription_status);
        $org->update(['credits_renew_at' => now()->subMinute(), 'credit_balance' => 0]);
        $this->artisan('credits:refill')->assertSuccessful();
        $this->assertSame(0, $org->fresh()->credit_balance, 'no refill after expiry');
    }

    public function test_only_billing_managers_can_submit_requests(): void
    {
        $agent = $this->makeUser('agent');
        $this->actingAs($agent)->postJson('/api/billing/requests', ['type' => 'credits', 'requested_credits' => 1000000])->assertForbidden();
        $this->assertSame(0, BillingRequest::count());
        $this->actingAs($this->makeUser('owner', $agent->organization))
            ->postJson('/api/billing/requests', ['type' => 'renewal', 'months' => 5])->assertStatus(422);
    }

    public function test_super_admin_gets_clear_errors_on_customer_pages(): void
    {
        $this->actingAs($this->admin());
        $this->getJson('/api/billing')->assertNotFound()->assertJsonPath('message', 'Platform administrators have no customer plan. Use the platform billing pages.');
        $this->getJson('/api/settings')->assertNotFound();
        $this->getJson('/api/admin/organizations')->assertOk();
        $this->getJson('/api/admin/billing/requests')->assertOk();
    }

    public function test_queued_campaign_stops_when_account_is_suspended(): void
    {
        $owner = $this->makeUser('owner');
        $c = Campaign::create(['organization_id' => $owner->organization_id, 'name' => 'x', 'company_type' => 'x', 'created_by' => $owner->id,
            'country_id' => Location::where('iso_code', 'PK')->value('id'), 'status' => 'queued']);
        $c->keywords()->create(['keyword' => 'x']);
        $owner->organization->update(['subscription_status' => 'suspended']);

        RunCampaign::dispatchSync($c);

        $this->assertSame('failed', $c->fresh()->status);
        $this->assertSame('Subscription is not active.', $c->fresh()->stats['error']);
        $this->assertSame(0, $c->runs()->count());
    }
}
