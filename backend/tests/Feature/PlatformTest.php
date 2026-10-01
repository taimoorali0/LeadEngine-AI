<?php

namespace Tests\Feature;

use App\Jobs\EnrichCompany;
use App\Jobs\RunCampaign;
use App\Models\AutomationRule;
use App\Models\Campaign;
use App\Models\Company;
use App\Models\Industry;
use App\Models\Lead;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use App\Notifications\AppNotification;
use App\Services\AutomationEngine;
use App\Services\Billing;
use App\Services\InsufficientCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class PlatformTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function lead(Organization $org, array $attrs = [], array $company = []): Lead
    {
        $c = Company::create(['organization_id' => $org->id, 'name_en' => 'Co '.uniqid(), 'normalized_name' => 'co'] + $company);

        return Lead::create(['organization_id' => $org->id, 'company_id' => $c->id] + $attrs);
    }

    public function test_two_factor_setup_login_challenge_and_recovery_code(): void
    {
        $user = $this->makeUser('agent');
        $g = new Google2FA;

        $this->actingAs($user);
        $secret = $this->postJson('/api/auth/2fa/setup')->assertOk()->json('secret');
        $this->postJson('/api/auth/2fa/confirm', ['code' => '000000'])->assertStatus(422);
        $codes = $this->postJson('/api/auth/2fa/confirm', ['code' => $g->getCurrentOtp($secret)])->assertOk()->json('recovery_codes');
        $this->assertCount(8, $codes);
        $this->app['auth']->forgetGuards();

        $login = $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'secret-password'])->assertOk();
        $this->assertTrue($login->json('two_factor_required'));
        $this->assertNull($login->json('token'));
        $challenge = $login->json('challenge');

        $this->postJson('/api/auth/2fa/challenge', ['challenge' => $challenge, 'code' => '123456'])->assertStatus(422);
        $this->postJson('/api/auth/2fa/challenge', ['challenge' => 'tampered', 'code' => $g->getCurrentOtp($secret)])->assertStatus(422);
        $this->postJson('/api/auth/2fa/challenge', ['challenge' => $challenge, 'code' => $g->getCurrentOtp($secret)])
            ->assertOk()->assertJsonStructure(['token']);

        // A recovery code works once.
        $this->postJson('/api/auth/2fa/challenge', ['challenge' => $challenge, 'recovery_code' => $codes[0]])->assertOk();
        $this->postJson('/api/auth/2fa/challenge', ['challenge' => $challenge, 'recovery_code' => $codes[0]])->assertStatus(422);
    }

    public function test_user_management_permissions_and_plan_limit(): void
    {
        $owner = $this->makeUser('owner');
        $agentRole = Role::where('key', 'agent')->value('id');

        $this->actingAs($owner)->postJson('/api/users', ['name' => 'Ali', 'email' => 'ali@x.test', 'password' => 'long-password-1', 'role_id' => $agentRole])
            ->assertCreated();
        $this->postJson('/api/users', ['name' => 'Bad', 'email' => 'b@x.test', 'password' => 'long-password-1',
            'role_id' => Role::where('key', 'super_admin')->value('id')])->assertStatus(422);
        $this->putJson("/api/users/{$owner->id}", ['is_active' => false])->assertStatus(422);

        $owner->organization->update(['plan' => 'starter']);  // 3 users
        $this->postJson('/api/users', ['name' => 'C', 'email' => 'c@x.test', 'password' => 'long-password-1', 'role_id' => $agentRole])->assertCreated();
        $this->postJson('/api/users', ['name' => 'D', 'email' => 'd@x.test', 'password' => 'long-password-1', 'role_id' => $agentRole])->assertStatus(422);

        $this->actingAs($this->makeUser('agent', $owner->organization))
            ->postJson('/api/users', ['name' => 'E', 'email' => 'e@x.test', 'password' => 'long-password-1', 'role_id' => $agentRole])->assertForbidden();
    }

    public function test_settings_update_merges_and_validates(): void
    {
        $this->actingAs($this->makeUser('owner'));
        $this->putJson('/api/settings', ['settings' => ['scoring_rules' => ['email' => 30], 'assignment' => ['enabled' => true, 'method' => 'weighted']]])
            ->assertOk()->assertJsonPath('settings.scoring_rules.email', 30)->assertJsonPath('settings.scoring_rules.phone', 15)
            ->assertJsonPath('settings.assignment.method', 'weighted');
        $this->putJson('/api/settings', ['settings' => ['assignment' => ['method' => 'random']]])->assertStatus(422);
        $this->actingAs($this->makeUser('agent'))->putJson('/api/settings', ['name' => 'x'])->assertForbidden();
    }

    public function test_round_robin_auto_assignment_respects_daily_limit(): void
    {
        Notification::fake();
        $owner = $this->makeUser('owner');
        $org = $owner->organization;
        $org->update(['settings' => ['assignment' => ['enabled' => true, 'method' => 'round_robin', 'min_score' => 50]]]);
        $a = $this->makeUser('agent', $org);
        $b = $this->makeUser('agent', $org);
        $b->update(['daily_lead_limit' => 1]);
        $engine = app(AutomationEngine::class);

        $assigned = collect(range(1, 4))->map(function () use ($org, $engine) {
            $lead = $this->lead($org, ['score' => 80]);
            $engine->leadReady($lead);

            return $lead->fresh()->assigned_to;
        });
        $this->assertSame([$a->id, $b->id, $a->id, $a->id], $assigned->all());

        $low = $this->lead($org, ['score' => 20]);
        $engine->leadReady($low);
        $this->assertNull($low->fresh()->assigned_to, 'below min_score stays unassigned');
        $this->assertSame('assigned', Lead::whereNotNull('assigned_to')->first()->status);
        Notification::assertSentTo($a, AppNotification::class, fn ($n) => $n->kind === 'lead_assigned');
    }

    public function test_automation_rules_conditions_actions_and_once_per_lead(): void
    {
        Notification::fake();
        $owner = $this->makeUser('owner');
        $org = $owner->organization;
        $senior = $this->makeUser('agent', $org);

        $this->actingAs($owner)->postJson('/api/automations', [
            'name' => 'Hot leads to senior', 'trigger' => 'lead_scored',
            'conditions' => [['field' => 'score', 'op' => 'gt', 'value' => 80]],
            'actions' => [['type' => 'assign_user', 'params' => ['user_id' => $senior->id]]],
        ])->assertCreated();
        $this->postJson('/api/automations', [
            'name' => 'Interested → follow-up', 'trigger' => 'status_changed',
            'conditions' => [['field' => 'status', 'op' => 'eq', 'value' => 'interested']],
            'actions' => [['type' => 'create_follow_up', 'params' => ['days' => 2, 'type' => 'call']]],
        ])->assertCreated();
        $this->postJson('/api/automations', ['name' => 'bad', 'trigger' => 'whenever', 'actions' => [['type' => 'assign_auto']]])->assertStatus(422);

        $hot = $this->lead($org, ['score' => 90]);
        $cold = $this->lead($org, ['score' => 60]);
        $engine = app(AutomationEngine::class);
        $engine->leadReady($hot);
        $engine->leadReady($cold);
        $this->assertSame($senior->id, $hot->fresh()->assigned_to);
        $this->assertNull($cold->fresh()->assigned_to);

        // Re-scoring does not re-run a once-per-lead rule.
        $engine->fire('lead_scored', $hot);
        $this->assertSame(1, AutomationRule::where('name', 'Hot leads to senior')->value('runs'));

        $this->patchJson("/api/leads/{$hot->id}", ['status' => 'interested'])->assertOk();
        $f = $hot->followUps()->first();
        $this->assertNotNull($f);
        $this->assertTrue($f->due_at->isSameDay(now()->addDays(2)));
        $this->assertSame($senior->id, $f->user_id);
    }

    public function test_credits_are_charged_and_block_when_exhausted(): void
    {
        $owner = $this->makeUser('owner');
        $org = $owner->organization;
        $org->update(['credit_balance' => 2]);
        $billing = app(Billing::class);

        $billing->charge($org->id, 'google_search');
        $billing->charge($org->id, 'google_search');
        $this->assertSame(0, $org->fresh()->credit_balance);
        $this->expectException(InsufficientCredits::class);
        $billing->charge($org->id, 'ai_analysis');
    }

    public function test_billing_endpoints_and_plan_change(): void
    {
        $owner = $this->makeUser('owner');
        $this->actingAs($owner)->getJson('/api/billing')->assertOk()->assertJsonPath('plan_key', 'business');
        $this->postJson('/api/billing/plan', ['plan' => 'enterprise'])->assertOk()
            ->assertJsonPath('plan_key', 'enterprise')->assertJsonPath('credit_balance', 100000);
        $this->getJson('/api/admin/costs')->assertForbidden();
        $this->actingAs($this->makeUser('agent', $owner->organization))->postJson('/api/billing/plan', ['plan' => 'starter'])->assertForbidden();
    }

    public function test_notifications_list_and_mark_read(): void
    {
        $user = $this->makeUser('agent');
        $user->notifyNow(new AppNotification('lead_assigned', 'New lead', null, '/leads/1'), ['database']);
        $user->notifyNow(new AppNotification('follow_up_due', 'Call due', null, '/leads/2'), ['database']);

        $res = $this->actingAs($user)->getJson('/api/notifications')->assertOk()->assertJsonPath('unread', 2);
        $this->postJson('/api/notifications/read', ['ids' => [$res->json('items.0.id')]])->assertJsonPath('unread', 1);
        $this->postJson('/api/notifications/read')->assertJsonPath('unread', 0);
    }

    public function test_follow_up_reminder_command(): void
    {
        Notification::fake();
        $agent = $this->makeUser('agent');
        $lead = $this->lead($agent->organization, ['assigned_to' => $agent->id]);
        $lead->followUps()->create(['user_id' => $agent->id, 'due_at' => now()->addMinutes(10), 'type' => 'call']);
        $lead->followUps()->create(['user_id' => $agent->id, 'due_at' => now()->addDay(), 'type' => 'call']);

        $this->artisan('followups:remind')->assertSuccessful();
        $this->artisan('followups:remind')->assertSuccessful();
        Notification::assertSentToTimes($agent, AppNotification::class, 1);
    }

    public function test_reports_and_brief(): void
    {
        $owner = $this->makeUser('owner');
        $agent = $this->makeUser('agent', $owner->organization);
        $this->lead($owner->organization, ['status' => 'won', 'assigned_to' => $agent->id, 'score' => 90]);
        $l = $this->lead($owner->organization, ['status' => 'contacted', 'assigned_to' => $agent->id, 'score' => 70],
            ['ai_summary' => 'Makes tissue.', 'possible_needs' => ['Automation']]);

        $r = $this->actingAs($owner)->getJson('/api/reports')->assertOk();
        $r->assertJsonPath('funnel.leads', 2)->assertJsonPath('funnel.won', 1)->assertJsonPath('rates.conversion_rate', 50);
        $this->assertSame(2, $r->json('agents.0.assigned'));
        $this->actingAs($agent)->getJson('/api/reports')->assertForbidden();

        $this->actingAs($agent)->getJson("/api/leads/{$l->id}/brief")->assertOk()
            ->assertJsonPath('summary', 'Makes tissue.')->assertJsonPath('summary_is_ai', true)->assertJsonPath('possible_needs.0', 'Automation');
    }

    public function test_campaign_run_blocked_without_credits(): void
    {
        $owner = $this->makeUser('owner');
        $owner->organization->update(['credit_balance' => 0]);
        $c = Campaign::create(['organization_id' => $owner->organization_id, 'name' => 'x', 'company_type' => 'x',
            'country_id' => Location::where('iso_code', 'PK')->value('id')]);
        $c->keywords()->create(['keyword' => 'x']);
        $this->actingAs($owner)->postJson("/api/campaigns/{$c->id}/run")->assertStatus(422);
    }

    public function test_enrichment_then_ai_analysis_updates_company(): void
    {
        config(['services.python_engine.url' => 'http://engine.test']);
        Http::fake([
            'engine.test/enrich/website' => Http::response(['emails' => [['email' => 'info@abc.pk', 'type' => 'general', 'status' => 'published']],
                'phones' => [], 'social_links' => ['linkedin' => 'https://linkedin.com/company/abc'], 'title' => 'ABC', 'description' => 'Paper mill', 'text' => 'We are a tissue mill.']),
            'engine.test/scoring/score' => Http::response(['score' => 70, 'category' => 'Needs Review', 'breakdown' => []]),
            'engine.test/ai/analyze' => Http::response(['summary' => 'ABC makes tissue.', 'industry_slug' => 'paper-manufacturing',
                'sub_industry_slug' => 'tissue-manufacturing', 'confidence' => 88, 'possible_needs' => ['Automation'], 'products' => ['Tissue'], 'services' => [], 'provider' => 'rules']),
        ]);
        $owner = $this->makeUser('owner');
        $lead = $this->lead($owner->organization, [], ['website' => 'https://abc.pk']);
        $before = $owner->organization->fresh()->credit_balance;

        EnrichCompany::dispatchSync($lead->company);

        $c = $lead->company->fresh();
        $this->assertSame('enriched', $c->enrichment_status);
        $this->assertSame('ABC makes tissue.', $c->ai_summary);
        $this->assertSame('Paper mill', $c->description_en, 'sourced description is kept separate from AI summary');
        $this->assertSame(Industry::where('slug', 'tissue-manufacturing')->value('id'), $c->sub_industry_id);
        $this->assertSame(['Automation'], $c->possible_needs);
        $this->assertSame(['info@abc.pk'], $c->emails()->pluck('email')->all());
        $this->assertSame($before - 3, $owner->organization->fresh()->credit_balance, '1 enrichment + 2 AI credits');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/ai/analyze') && $r['text'] === 'We are a tissue mill.');
    }

    public function test_campaign_failing_every_search_explains_why(): void
    {
        config(['services.google_places.key' => null]);
        Notification::fake();
        $owner = $this->makeUser('owner');
        $c = Campaign::create(['organization_id' => $owner->organization_id, 'name' => 'x', 'company_type' => 'x',
            'country_id' => Location::where('iso_code', 'PK')->value('id'), 'created_by' => $owner->id]);
        $c->keywords()->create(['keyword' => 'x']);

        RunCampaign::dispatchSync($c);

        $c->refresh();
        $this->assertSame('failed', $c->status);
        $this->assertStringContainsString('GOOGLE_PLACES_API_KEY is not configured', $c->stats['error']);
        Notification::assertSentTo($owner, AppNotification::class, fn ($n) => $n->kind === 'campaign_failed');
    }

    public function test_super_admin_cost_dashboard_with_campaign_usage(): void
    {
        $owner = $this->makeUser('owner');
        $c = Campaign::create(['organization_id' => $owner->organization_id, 'name' => 'Paper', 'company_type' => 'x',
            'country_id' => Location::where('iso_code', 'PK')->value('id')]);
        app(Billing::class)->charge($owner->organization_id, 'google_search', $c->id);
        $admin = User::create(['role_id' => Role::where('key', 'super_admin')->value('id'), 'name' => 'Admin',
            'email' => 'root@example.test', 'password' => 'secret-password']);

        $this->actingAs($admin)->getJson('/api/admin/costs')->assertOk()
            ->assertJsonPath('by_campaign.0.name', 'Paper')->assertJsonPath('by_organization.0.name', 'Acme');
    }
}
