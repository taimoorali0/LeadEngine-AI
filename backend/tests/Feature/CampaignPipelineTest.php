<?php

namespace Tests\Feature;

use App\Jobs\EnrichCompany;
use App\Jobs\RunCampaign;
use App\Models\Campaign;
use App\Models\Company;
use App\Models\Industry;
use App\Models\Lead;
use App\Models\Location;
use App\Services\CompanyIngestor;
use App\Services\LeadScorer;
use App\Services\Sources\LeadSourceInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class CampaignPipelineTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function fakeExternal(array $places): void
    {
        config(['services.google_places.key' => 'test-key', 'services.python_engine.url' => 'http://engine.test']);
        Http::fake([
            'places.googleapis.com/*' => Http::response(['places' => $places]),
            'engine.test/keywords/generate' => Http::response(['Paper Manufacturer', 'Paper Mill']),
            'engine.test/phones/normalize' => fn (Request $r) => Http::response(array_map(fn ($n) => [
                'original' => $n, 'normalized' => '+92'.substr(preg_replace('/\D/', '', $n), -10),
                'country_code' => '+92', 'country' => 'PK', 'phone_type' => 'mobile', 'valid' => true,
            ], $r['numbers'])),
            // Engine says "ABC Paper Mills Pvt Ltd" duplicates the first candidate.
            'engine.test/dedup/check' => fn (Request $r) => Http::response(
                str_contains($r['record']['name'], 'Pvt Ltd')
                    ? [['candidate_id' => $r['existing'][0]['id'], 'confidence' => 99, 'is_duplicate' => true]]
                    : []
            ),
            'engine.test/scoring/score' => fn (Request $r) => Http::response([
                'score' => $r['lead']['has_website'] ? 80 : 40,
                'category' => $r['lead']['has_website'] ? 'Qualified' : 'Needs Enrichment',
                'breakdown' => ['website' => 15],
            ]),
        ]);
    }

    private function place(string $id, string $name, ?string $phone, ?string $site, float $rating = 4.2): array
    {
        return ['id' => $id, 'displayName' => ['text' => $name], 'formattedAddress' => 'Lahore', 'internationalPhoneNumber' => $phone,
            'websiteUri' => $site, 'rating' => $rating, 'userRatingCount' => 25, 'businessStatus' => 'OPERATIONAL',
            'location' => ['latitude' => 31.5, 'longitude' => 74.3]];
    }

    public function test_full_campaign_flow(): void
    {
        Queue::fake(); // enrichment jobs are asserted, not executed
        $this->fakeExternal([
            $this->place('p1', 'ABC Paper Mills', '+92 304 1234567', 'https://abcpaper.com'),
            $this->place('p2', 'ABC Paper Mills Pvt Ltd', '0304 1234567', 'https://www.abcpaper.com'),
            $this->place('p3', 'Prime Tissue', '0300 7654321', null),
            $this->place('p4', 'Low Rated Paper', '0300 1111111', 'https://low.pk', 2.0),
        ]);
        $owner = $this->makeUser('owner');
        $lahore = Location::where('name_en', 'Lahore')->first();

        $created = $this->actingAs($owner)->postJson('/api/campaigns', [
            'name' => 'Lahore Paper Manufacturers',
            'country_id' => Location::where('iso_code', 'PK')->value('id'),
            'industry_id' => Industry::where('slug', 'paper-manufacturing')->value('id'),
            'company_type' => 'Paper Manufacturer',
            'target_results' => 50,
            'location_ids' => [$lahore->id],
            'filters' => ['min_rating' => 3.5],
        ])->assertCreated();
        $this->assertSame(['Paper Manufacturer', 'Paper Mill'], array_column($created->json('keywords'), 'keyword'));

        // Disable the second keyword so each place is seen once.
        $id = $created->json('id');
        $this->putJson("/api/campaigns/$id", ['keywords' => [['keyword' => 'Paper Manufacturer'], ['keyword' => 'Paper Mill', 'enabled' => false]]])->assertOk();

        // Run the job synchronously (Queue::fake swallowed the dispatch).
        $this->postJson("/api/campaigns/$id/run")->assertStatus(202);
        (new RunCampaign(Campaign::find($id)))->handle(app(LeadSourceInterface::class),
            app(CompanyIngestor::class), app(LeadScorer::class));

        $campaign = Campaign::find($id);
        $this->assertSame('completed', $campaign->status);
        $this->assertEquals(['queries' => 1, 'found' => 4, 'filtered_out' => 1, 'duplicates' => 1, 'saved' => 2,
            'new_companies' => 2, 'websites' => 1, 'failed_queries' => 0], $campaign->stats);
        $this->assertSame(100, $campaign->progress['scoring']);

        $abc = Company::where('google_place_id', 'p1')->first();
        $this->assertSame('abcpaper.com', $abc->website_domain);
        $this->assertSame(['+923041234567'], $abc->phones()->pluck('normalized')->all());
        $this->assertSame(2, $abc->sources()->count(), 'merged duplicate keeps both source sightings');
        $this->assertSame(80, Lead::where('company_id', $abc->id)->value('score'));
        Queue::assertPushed(EnrichCompany::class, 1);

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'places.googleapis.com')
            && $r->hasHeader('X-Goog-Api-Key', 'test-key') && $r['textQuery'] === 'Paper Manufacturer in Lahore, Pakistan');

        // Re-run: nothing new (spec §32).
        (new RunCampaign($campaign))->handle(app(LeadSourceInterface::class),
            app(CompanyIngestor::class), app(LeadScorer::class));
        $this->assertSame(0, $campaign->runs()->latest('id')->first()->new_companies);
        $this->assertSame(2, Company::count());
    }

    public function test_agent_cannot_create_campaigns(): void
    {
        $this->actingAs($this->makeUser('agent'))->postJson('/api/campaigns', [
            'name' => 'x', 'country_id' => Location::where('iso_code', 'PK')->value('id'), 'company_type' => 'x',
        ])->assertForbidden();
    }
}
