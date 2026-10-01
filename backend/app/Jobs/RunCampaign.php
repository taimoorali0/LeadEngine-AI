<?php

namespace App\Jobs;

use App\Models\AuditLog;
use App\Models\Campaign;
use App\Models\Location;
use App\Models\UsageEvent;
use App\Services\CompanyIngestor;
use App\Services\LeadScorer;
use App\Services\Sources\DiscoveredBusiness;
use App\Services\Sources\LeadSourceInterface;
use App\Services\Sources\SearchArea;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Search → discover → filter → dedup/store → score, for every keyword × area (spec §45). */
class RunCampaign implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 3600;

    public int $tries = 1;

    public function __construct(public Campaign $campaign) {}

    public function handle(LeadSourceInterface $source, CompanyIngestor $ingestor, LeadScorer $scorer): void
    {
        $campaign = $this->campaign;
        $keywords = $campaign->keywords()->where('enabled', true)->pluck('keyword');
        $areas = $this->areas($campaign);
        $region = $campaign->country?->iso_code ?? 'PK';

        $run = $campaign->runs()->create(['started_at' => now()]);
        $stats = ['queries' => 0, 'found' => 0, 'filtered_out' => 0, 'duplicates' => 0, 'saved' => 0,
            'new_companies' => 0, 'websites' => 0, 'failed_queries' => 0];
        $progress = array_fill_keys(Campaign::STAGES, 0);
        $campaign->update(['status' => 'running', 'last_run_at' => now(), 'progress' => $progress, 'stats' => $stats]);

        $leadIds = [];
        $totalQueries = max(1, $keywords->count() * count($areas));
        try {
            foreach ($keywords as $keyword) {
                foreach ($areas as $area) {
                    if (count($leadIds) >= $campaign->target_results) {
                        break 2;
                    }
                    $stats['queries']++;
                    try {
                        $results = $source->search($keyword, $area, $campaign->target_results);
                        UsageEvent::create(['organization_id' => $campaign->organization_id, 'campaign_id' => $campaign->id,
                            'kind' => 'google_search', 'credits' => 1]);
                        foreach ($results as $business) {
                            $stats['found']++;
                            if (! $this->passesFilters($business, $campaign)) {
                                $stats['filtered_out']++;

                                continue;
                            }
                            try {
                                $r = $ingestor->ingest($business, $campaign, $keyword, $region);
                            } catch (Throwable $e) {
                                $stats['failed_records'] = ($stats['failed_records'] ?? 0) + 1;
                                Log::error('Ingest failed', ['campaign' => $campaign->id, 'business' => $business->name, 'error' => $e->getMessage()]);

                                continue;
                            }
                            $r['company_created'] ? $stats['new_companies']++ : $stats['duplicates']++;
                            if ($r['lead_created']) {
                                $stats['saved']++;
                                $stats['websites'] += $r['company']->website ? 1 : 0;
                            }
                            $leadIds[$r['lead']->id] = $r['company'];
                        }
                    } catch (Throwable $e) {
                        $stats['failed_queries']++;
                        Log::error('Campaign query failed', ['campaign' => $campaign->id, 'keyword' => $keyword, 'error' => $e->getMessage()]);
                    }
                    $progress['search'] = (int) round(100 * $stats['queries'] / $totalQueries);
                    $progress['companies'] = $progress['deduplication'] = $progress['search'];
                    $campaign->update(['progress' => $progress, 'stats' => $stats]);
                }
            }
            $progress['search'] = $progress['companies'] = $progress['deduplication'] = 100;

            $done = 0;
            foreach (array_keys($leadIds) as $leadId) {
                $lead = $campaign->leads()->withoutGlobalScopes()->find($leadId);
                $scorer->score($lead);
                if ($lead->company->website && $lead->company->enrichment_status === 'pending') {
                    EnrichCompany::dispatch($lead->company);
                }
                $progress['scoring'] = (int) round(100 * ++$done / count($leadIds));
            }
            $progress['scoring'] = 100;

            $failed = $stats['queries'] > 0 && $stats['failed_queries'] === $stats['queries'];
            $campaign->update(['status' => $failed ? 'failed' : 'completed', 'progress' => $progress, 'stats' => $stats]);
            $run->update(['finished_at' => now(), 'stats' => $stats, 'new_companies' => $stats['new_companies']]);
            AuditLog::record('campaign.completed', $campaign, $stats, $campaign->creator);
        } catch (Throwable $e) {
            $campaign->update(['status' => 'failed', 'stats' => $stats + ['error' => $e->getMessage()]]);
            $run->update(['finished_at' => now(), 'stats' => $stats]);

            throw $e;
        }
    }

    /** @return list<SearchArea> one per selected location, or the country as a single area */
    private function areas(Campaign $campaign): array
    {
        $locations = $campaign->locations()->with('parent.parent.parent')->get();
        if ($locations->isEmpty()) {
            $locations = collect([$campaign->country]);
        }

        return $locations->map(function (Location $l) {
            $labels = [];
            for ($node = $l; $node; $node = $node->parent) {
                if ($node->level !== 'province') {
                    $labels[] = $node->name_en;
                }
            }

            return new SearchArea(implode(', ', $labels), $l->latitude, $l->longitude, $l->radius_m ?? 25000);
        })->all();
    }

    private function passesFilters(DiscoveredBusiness $b, Campaign $c): bool
    {
        return ! ($c->filter('must_have_phone') && ! $b->phone)
            && ! ($c->filter('must_have_website') && ! $b->website)
            && ! (($min = $c->filter('min_rating')) && ($b->rating ?? 0) < $min)
            && ! (($min = $c->filter('min_reviews')) && ($b->reviewCount ?? 0) < $min);
    }
}
