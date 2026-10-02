<?php

namespace Tests\Feature;

use App\Jobs\EnrichCompany;
use App\Models\Campaign;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Location;
use App\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImportAndContactsTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function fakeEngine(): void
    {
        config(['services.python_engine.url' => 'http://engine.test']);
        Http::fake([
            'engine.test/phones/normalize' => fn ($r) => Http::response(array_map(fn ($n) => [
                'original' => $n, 'normalized' => '+92'.substr(preg_replace('/\D/', '', $n), -10), 'country_code' => '+92',
                'country' => 'PK', 'phone_type' => 'mobile', 'valid' => true], $r['numbers'])),
            'engine.test/dedup/check' => fn ($r) => Http::response(str_contains($r['record']['name'], 'ABC')
                ? [['candidate_id' => $r['existing'][0]['id'], 'confidence' => 99, 'is_duplicate' => true]] : []),
            'engine.test/scoring/score' => Http::response(['score' => 70, 'category' => 'Needs Review', 'breakdown' => []]),
        ]);
    }

    public function test_csv_preview_detects_columns_then_import_runs_the_pipeline(): void
    {
        Storage::fake('local');
        Queue::fake([EnrichCompany::class]);
        $this->fakeEngine();
        $owner = $this->makeUser('owner');
        $org = $owner->organization;
        $existing = Company::create(['organization_id' => $org->id, 'name_en' => 'ABC Paper Mills', 'normalized_name' => 'abc paper mills']);

        $file = new UploadedFile(base_path('tests/fixtures/directory.csv'), 'yellow-pages.csv', 'text/csv', null, true);
        $preview = $this->actingAs($owner)->post('/api/imports/preview', ['file' => $file], ['Accept' => 'application/json'])->assertOk();
        $preview->assertJsonPath('row_count', 4)->assertJsonPath('headers.0', 'Business Name')
            ->assertJsonPath('mapping.name', 0)->assertJsonPath('mapping.phone', 1)->assertJsonPath('mapping.website', 2)
            ->assertJsonPath('mapping.city', 3)->assertJsonPath('mapping.category', 4)->assertJsonPath('mapping.linkedin', 5)
            ->assertJsonPath('mapping.email', 6)->assertJsonPath('sample.1.0', 'Noor Textiles, Faisalabad');

        $res = $this->postJson('/api/imports', [
            'upload_id' => $preview->json('upload_id'), 'name' => 'Yellow Pages Lahore',
            'country_id' => Location::where('iso_code', 'PK')->value('id'), 'mapping' => $preview->json('mapping'),
        ])->assertStatus(202);

        $campaign = Campaign::find($res->json('id'));
        $this->assertSame('completed', $campaign->status);  // sync queue in tests
        $this->assertSame(4, $campaign->stats['rows']);
        $this->assertSame(1, $campaign->stats['skipped'], 'row without a name');
        $this->assertSame(1, $campaign->stats['duplicates'], 'ABC merged into the existing company');
        $this->assertSame(3, $campaign->stats['saved']);

        $existing->refresh();
        $this->assertSame('https://www.linkedin.com/company/abc-paper', $existing->social_links['linkedin']);
        $this->assertSame('https://abcpaper.com', $existing->website);
        $this->assertSame(Location::where('name_en', 'Lahore')->value('id'), $existing->location_id);
        $this->assertSame(['info@abcpaper.com'], $existing->emails()->pluck('email')->all());
        $this->assertTrue(Company::where('name_en', 'مصنع الرياض')->exists(), 'Arabic names survive');
        $this->assertSame(3, Lead::where('campaign_id', $campaign->id)->whereNotNull('score')->count());
        Queue::assertPushed(EnrichCompany::class, 1);
        Storage::disk('local')->assertMissing("imports/{$org->id}/{$preview->json('upload_id')}.csv");

        $this->postJson("/api/campaigns/{$campaign->id}/run")->assertStatus(422);
    }

    public function test_import_cannot_use_another_organizations_upload(): void
    {
        Storage::fake('local');
        $owner = $this->makeUser('owner');
        Storage::disk('local')->put('imports/999/11111111-1111-1111-1111-111111111111.csv', "name\nx\n");
        $this->actingAs($owner)->postJson('/api/imports', ['upload_id' => '11111111-1111-1111-1111-111111111111', 'name' => 'x',
            'country_id' => Location::where('iso_code', 'PK')->value('id'), 'mapping' => ['name' => 0]])->assertNotFound();
        $this->actingAs($this->makeUser('agent', $owner->organization))
            ->post('/api/imports/preview', ['file' => UploadedFile::fake()->createWithContent('a.csv', "name\nx\n")], ['Accept' => 'application/json'])
            ->assertForbidden();
    }

    public function test_contacts_add_edit_delete_with_visibility_rules(): void
    {
        $owner = $this->makeUser('owner');
        $org = $owner->organization;
        $agent = $this->makeUser('agent', $org);
        $mine = Company::create(['organization_id' => $org->id, 'name_en' => 'Mine', 'normalized_name' => 'mine']);
        $other = Company::create(['organization_id' => $org->id, 'name_en' => 'Other', 'normalized_name' => 'other']);
        $lead = Lead::create(['organization_id' => $org->id, 'company_id' => $mine->id, 'assigned_to' => $agent->id]);

        $this->actingAs($agent);
        $c = $this->postJson("/api/companies/{$mine->id}/contacts", ['name' => 'Ayesha Khan', 'title' => 'Plant Manager',
            'linkedin_url' => 'https://pk.linkedin.com/in/ayesha-khan'])->assertCreated()->json();
        $this->postJson("/api/companies/{$mine->id}/contacts", ['name' => 'X', 'linkedin_url' => 'https://evil.example/in/x'])->assertStatus(422);
        $this->postJson("/api/companies/{$other->id}/contacts", ['name' => 'Y'])->assertForbidden();
        $this->patchJson("/api/contacts/{$c['id']}", ['title' => 'Operations Director'])->assertOk()->assertJsonPath('title', 'Operations Director');
        $this->getJson("/api/leads/{$lead->id}/brief")->assertOk()->assertJsonPath('contacts.0.name', 'Ayesha Khan');

        $byOwner = $this->actingAs($owner)->postJson("/api/companies/{$mine->id}/contacts", ['name' => 'Owner added'])->json();
        $this->actingAs($agent)->deleteJson("/api/contacts/{$byOwner['id']}")->assertForbidden();
        $this->deleteJson("/api/contacts/{$c['id']}")->assertOk();
        $this->assertSame(['Owner added'], Contact::pluck('name')->all());

        $rival = $this->makeUser('owner', Organization::create(['name' => 'Rival', 'slug' => 'rival', 'credit_balance' => 10]));
        $this->actingAs($rival)->patchJson("/api/contacts/{$byOwner['id']}", ['name' => 'hacked'])->assertNotFound();
    }
}
