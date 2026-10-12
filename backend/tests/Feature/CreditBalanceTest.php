<?php
namespace Tests\Feature;

use App\Models\Organization;
use App\Services\Billing;
use App\Services\InsufficientCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CreditBalanceTest extends TestCase
{
    use RefreshDatabase;
    protected $seed = true;

    public function test_charge_reduces_balance_and_records_usage_and_transaction(): void
    {
        $user = $this->makeUser('owner');
        $org = $user->organization;
        $org->update(['credit_balance' => 10]);
        app(Billing::class)->charge($org->id, 'ai_analysis');
        $this->assertEquals(8, $org->fresh()->credit_balance);
        $this->assertDatabaseHas('usage_events', ['organization_id' => $org->id, 'kind' => 'ai_analysis', 'credits' => 2]);
        $this->assertDatabaseHas('credit_transactions', ['organization_id' => $org->id, 'amount' => -2, 'balance_after' => 8]);
        $this->actingAs($user)->getJson('/api/billing/balance')->assertOk()->assertJsonPath('credit_balance', 8);
    }

    public function test_repeated_billable_actions_each_deduct_credits(): void
    {
        $org = $this->makeUser('owner')->organization;
        $org->update(['credit_balance' => 10]);
        foreach (range(1, 3) as $i) { app(Billing::class)->charge($org->id, 'google_search'); }
        $this->assertEquals(7, $org->fresh()->credit_balance);
        $this->assertEquals(3, DB::table('usage_events')->where('organization_id', $org->id)->count());
    }

    public function test_insufficient_credits_do_not_create_usage_or_negative_balance(): void
    {
        $org = $this->makeUser('owner')->organization;
        $org->update(['credit_balance' => 1]);
        try { app(Billing::class)->charge($org->id, 'ai_analysis'); $this->fail('Charge should fail'); }
        catch (InsufficientCredits) { }
        $this->assertEquals(1, $org->fresh()->credit_balance);
        $this->assertEquals(0, DB::table('usage_events')->where('organization_id', $org->id)->count());
        $this->assertEquals(0, DB::table('credit_transactions')->where('organization_id', $org->id)->count());
    }

    public function test_balance_endpoint_uses_current_tenant_only(): void
    {
        $user = $this->makeUser('owner');
        $user->organization->update(['credit_balance' => 42]);
        Organization::create(['name' => 'Other', 'slug' => 'other-credit-org', 'credit_balance' => 999]);
        $this->actingAs($user)->getJson('/api/billing/balance')->assertOk()->assertJsonPath('organization_id', $user->organization_id)->assertJsonPath('credit_balance', 42);
        $this->getJson('/api/billing/balance?organization_id=999')->assertJsonPath('credit_balance', 42);
    }
}
