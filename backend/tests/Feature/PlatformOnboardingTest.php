<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatformOnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function admin(): User
    {
        return User::create(['role_id' => Role::where('key', 'super_admin')->value('id'), 'name' => 'Admin',
            'email' => 'root@example.test', 'password' => 'secret-password']);
    }

    public function test_super_admin_creates_customer_account_that_can_sign_in(): void
    {
        $this->actingAs($this->admin())->postJson('/api/admin/organizations', [
            'name' => 'Acme Traders', 'plan' => 'starter', 'access' => 'paid', 'months' => 3,
            'owner_name' => 'Ali Khan', 'owner_email' => 'ali@acme.test', 'owner_password' => 'welcome-2026',
        ])->assertCreated()->assertJsonPath('subscription_status', 'active');

        $org = Organization::where('slug', 'acme-traders')->firstOrFail();
        $this->assertGreaterThan(0, $org->credit_balance);
        $this->assertTrue($org->plan_renews_at->isAfter(now()->addMonths(2)));
        $owner = User::where('email', 'ali@acme.test')->firstOrFail();
        $this->assertSame('owner', $owner->role->key);
        $this->assertSame($org->id, $owner->organization_id);

        auth()->forgetGuards();
        $this->postJson('/api/auth/login', ['email' => 'ali@acme.test', 'password' => 'welcome-2026'])->assertOk();
    }

    public function test_trial_account_and_password_reset(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/admin/organizations', [
            'name' => 'Trial Co', 'plan' => 'starter', 'access' => 'trial', 'trial_days' => 7,
            'owner_name' => 'T', 'owner_email' => 't@trial.test', 'owner_password' => 'first-password',
        ])->assertCreated()->assertJsonPath('subscription_status', 'trialing');

        $owner = User::where('email', 't@trial.test')->firstOrFail();
        $this->actingAs($admin)->postJson("/api/admin/users/{$owner->id}/password", ['password' => 'second-password'])->assertOk();
        $this->actingAs($admin)->postJson("/api/admin/users/{$admin->id}/password", ['password' => 'xxxxxxxxxxxx'])->assertForbidden();

        auth()->forgetGuards();
        $this->postJson('/api/auth/login', ['email' => 't@trial.test', 'password' => 'second-password'])->assertOk();
    }

    public function test_only_super_admin_can_create_accounts(): void
    {
        $owner = $this->makeUser('owner');
        $this->actingAs($owner)->postJson('/api/admin/organizations', [
            'name' => 'X', 'plan' => 'starter', 'access' => 'trial',
            'owner_name' => 'X', 'owner_email' => 'x@x.test', 'owner_password' => 'xxxxxxxxxxxx',
        ])->assertForbidden();
    }

    public function test_payment_info_shown_to_customers_and_requests_need_evidence(): void
    {
        $this->actingAs($this->admin())->putJson('/api/admin/payment-info', [
            'bank_name' => 'Meezan Bank', 'account_title' => 'Marg101', 'iban' => 'PK00MEZN0000', 'currency' => 'pkr',
            'prices' => ['starter' => 14000, 'bogus' => 1],
        ])->assertOk()->assertJsonPath('currency', 'PKR')->assertJsonMissingPath('prices.bogus');

        $owner = $this->makeUser('owner');
        auth()->forgetGuards();
        $this->actingAs($owner)->getJson('/api/billing')->assertOk()
            ->assertJsonPath('payment_info.bank_name', 'Meezan Bank')->assertJsonPath('payment_info.prices.starter', 14000);

        $this->actingAs($owner)->postJson('/api/billing/requests', ['type' => 'renewal', 'months' => 1])->assertStatus(422);
        $this->actingAs($owner)->postJson('/api/billing/requests', ['type' => 'renewal', 'months' => 1, 'transaction_reference' => 'TX123'])->assertCreated();
    }
}
