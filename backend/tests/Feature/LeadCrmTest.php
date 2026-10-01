<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeadCrmTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function lead(Organization $org, string $name, array $attrs = []): Lead
    {
        $company = Company::create(['organization_id' => $org->id, 'name_en' => $name, 'normalized_name' => Company::normalizeName($name)]);

        return Lead::create(['organization_id' => $org->id, 'company_id' => $company->id] + $attrs);
    }

    public function test_agent_sees_only_assigned_leads_and_cannot_assign(): void
    {
        $agent = $this->makeUser('agent');
        $org = $agent->organization;
        $mine = $this->lead($org, 'Mine Co', ['assigned_to' => $agent->id]);
        $other = $this->lead($org, 'Other Co');

        $this->actingAs($agent);
        $this->getJson('/api/leads')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id);
        $this->getJson("/api/leads/{$other->id}")->assertForbidden();
        $this->patchJson("/api/leads/{$mine->id}", ['status' => 'contacted'])->assertOk();
        $this->patchJson("/api/leads/{$mine->id}", ['assigned_to' => null])->assertForbidden();
        $this->deleteJson("/api/companies/{$mine->company_id}")->assertForbidden();
    }

    public function test_organizations_are_isolated(): void
    {
        $owner = $this->makeUser('owner');
        $rival = Organization::create(['name' => 'Rival', 'slug' => 'rival']);
        $theirs = $this->lead($rival, 'Rival Lead');

        $this->actingAs($owner)->getJson('/api/leads')->assertJsonCount(0, 'data');
        $this->getJson("/api/leads/{$theirs->id}")->assertNotFound();
        $this->getJson('/api/search?q=Rival')->assertJsonCount(0, 'companies');
    }

    public function test_assignment_status_notes_follow_ups_and_timeline(): void
    {
        $manager = $this->makeUser('sales_manager');
        $agent = $this->makeUser('agent', $manager->organization);
        $lead = $this->lead($manager->organization, 'ABC Paper Mills', ['score' => 91]);

        $this->actingAs($manager);
        $this->patchJson("/api/leads/{$lead->id}", ['assigned_to' => $agent->id])->assertOk()->assertJsonPath('status', 'assigned');

        $this->actingAs($agent);
        $this->postJson("/api/leads/{$lead->id}/notes", ['type' => 'call', 'body' => 'Spoke to plant manager', 'outcome' => 'interested'])->assertCreated();
        $this->postJson("/api/leads/{$lead->id}/follow-ups", ['due_at' => now()->addDays(2)->toIso8601String(), 'type' => 'meeting'])->assertCreated();
        $this->patchJson("/api/leads/{$lead->id}", ['status' => 'interested'])->assertOk();

        $types = collect($this->getJson("/api/leads/{$lead->id}")->assertOk()->json('activities'))->pluck('type')->sort()->values()->all();
        $this->assertSame(['assigned', 'call', 'follow_up', 'status_changed', 'status_changed'], $types);
        $this->assertNotNull($lead->fresh()->next_follow_up_at);
        $this->getJson('/api/follow-ups')->assertJsonCount(1);

        $board = $this->getJson('/api/leads/board')->assertOk();
        $this->assertSame($lead->id, $board->json('interested.0.id'));
        $this->assertCount(10, $board->json());
    }

    public function test_export_respects_scope_and_is_audited(): void
    {
        $agent = $this->makeUser('agent');
        $this->lead($agent->organization, 'Mine Co', ['assigned_to' => $agent->id]);
        $this->lead($agent->organization, 'Other Co');

        $csv = $this->actingAs($agent)->get('/api/leads/export')->assertOk()->streamedContent();
        $this->assertStringContainsString('Mine Co', $csv);
        $this->assertStringNotContainsString('Other Co', $csv);
        $this->assertDatabaseHas('audit_logs', ['action' => 'leads.exported', 'user_id' => $agent->id]);

        $this->actingAs($this->makeUser('viewer', $agent->organization))->get('/api/leads/export')->assertForbidden();
    }

    public function test_dashboard_and_global_search(): void
    {
        $owner = $this->makeUser('owner');
        $this->lead($owner->organization, 'ABC Paper Mills', ['score' => 91]);

        $this->actingAs($owner)->getJson('/api/dashboard')->assertOk()
            ->assertJsonPath('total_companies', 1)->assertJsonPath('high_quality', 1);
        $this->getJson('/api/search?q=abc paper')->assertOk()
            ->assertJsonPath('companies.0.name_en', 'ABC Paper Mills')->assertJsonPath('companies.0.top_score', 91);
    }
}
