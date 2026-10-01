<?php

namespace App\Jobs;

use App\Events\CampaignUpdated;
use App\Models\AuditLog;
use App\Models\Campaign;
use App\Models\Location;
use App\Notifications\AppNotification;
use App\Services\AutomationEngine;
use App\Services\Billing;
use App\Services\CompanyIngestor;
use App\Services\InsufficientCredits;
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

/** Search → discover → filter → dedup/store → score → automate, for every keyword × area (spec §45). */
class RunCampaign implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 3600;

    public int $tries = 1;

    public function __construct(public Campaign $campaign) {}

    public function handle(LeadSourceInterface $source, CompanyIngestor $ingestor, LeadScorer $scorer,
        ?Billing $billing = null, ?AutomationEngine $automation = null): void
    {
        $billing ??= app(Billing::class);
        $automation ??= app(AutomationEngine::class);
        $campaign = $this->campaign;
        $keywords = $campaign->keywords()->where('enabled', true)->pluck('keyword');
        $depth = $campaign->filter('search_depth', 'standard');
        if ($depth === 'quick') {
            $keywords = $keywords->take(4);
        }
        $areas = $this->areas($campaign);
        $region = $campaign->country?->iso_code ?? 'PK';
        $isRerun = $campaign->runs()->exists();

        $run = $campaign->runs()->create(['started_at' => now()]);
        $stats = ['queries' => 0, 'found' => 0, 'filtered_out' => 0, 'duplicates' => 0, 'saved' => 0,
            'new_companies' => 0, 'websites' => 0, 'failed_queries' => 0];
        $progress = array_fill_keys(Campaign::STAGES, 0);
        $campaign->update(['status' => 'running', 'last_run_at' => now(), 'progress' => $progress, 'stats' => $stats]);
        CampaignUpdated::send($campaign);

        $leadIds = [];
        $outOfCredits = false;
        $lastError = null;
        $totalQueries = max(1, $keywords->count() * count($areas));
        try {
            foreach ($keywords as $keyword) {
                foreach ($areas as $area) {
                    if (count($leadIds) >= $campaign->target_results) {
                        break 2;
                    }
                    try {
                        $billing->charge($campaign->organization_id, 'google_search', $campaign->id);
                    } catch (InsufficientCredits) {
                        $outOfCredits = true;
                        break 2;
                    }
                    $stats['queries']++;
                    try {
                        foreach ($source->search($keyword, $area, $campaign->target_results) as $business) {
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
                                $leadIds[$r['lead']->id] = true;
                            }
                        }
                    } catch (Throwable $e) {
                        $stats['failed_queries']++;
                        $lastError = $e->getMessage();
                        Log::error('Campaign query failed', ['campaign' => $campaign->id, 'keyword' => $keyword, 'error' => $e->getMessage()]);
                    }
                    $progress['search'] = (int) round(100 * $stats['queries'] / $totalQueries);
                    $progress['companies'] = $progress['deduplication'] = $progress['search'];
                    $campaign->update(['progress' => $progress, 'stats' => $stats]);
                    CampaignUpdated::send($campaign);
                }
            }
            $progress['search'] = $progress['companies'] = $progress['deduplication'] = 100;

            $done = 0;
            $enrichQueued = 0;
            foreach (array_keys($leadIds) as $leadId) {
                $lead = $campaign->leads()->withoutGlobalScopes()->find($leadId);
                $scorer->score($lead);
                $automation->leadReady($lead);
                if ($lead->company->website && $lead->company->enrichment_status === 'pending') {
                    EnrichCompany::dispatch($lead->company);
                    $enrichQueued++;
                }
                $progress['scoring'] = (int) round(100 * ++$done / count($leadIds));
                if ($done % 25 === 0) {
                    $campaign->update(['progress' => $progress]);
                    CampaignUpdated::send($campaign);
                }
            }
            $progress['scoring'] = 100;
            // Enrichment continues in its own jobs; 100 here means "queued".
            $progress['enrichment'] = 100;

            if ($outOfCredits) {
                $stats['error'] = 'Stopped: not enough credits.';
            }
            $failed = $outOfCredits && $stats['queries'] === 0 || ($stats['queries'] > 0 && $stats['failed_queries'] === $stats['queries']);
            if ($failed && ! $outOfCredits) {
                // Surface why, e.g. a missing API key. Trimmed: it is shown to users.
                $stats['error'] = 'All searches failed: '.mb_substr((string) $lastError, 0, 200);
            }
            $campaign->update([
                'status' => $failed ? 'failed' : 'completed',
                'progress' => $progress,
                'stats' => $stats,
                'next_refresh_at' => $campaign->refresh_interval_days ? now()->addDays($campaign->refresh_interval_days) : null,
            ]);
            $run->update(['finished_at' => now(), 'stats' => $stats, 'new_companies' => $stats['new_companies']]);
            AuditLog::record('campaign.completed', $campaign, $stats, $campaign->creator);
            CampaignUpdated::send($campaign);
            $this->notify($campaign, $failed, $isRerun, $stats);
        } catch (Throwable $e) {
            $campaign->update(['status' => 'failed', 'stats' => $stats + ['error' => $e->getMessage()]]);
            $run->update(['finished_at' => now(), 'stats' => $stats]);
            CampaignUpdated::send($campaign);
            $this->notify($campaign, true, $isRerun, $stats);

            throw $e;
        }
    }

    private function notify(Campaign $campaign, bool $failed, bool $isRerun, array $stats): void
    {
        $creator = $campaign->creator;
        if (! $creator) {
            return;
        }
        $url = "/campaigns/{$campaign->id}";
        $creator->notify($failed
            ? new AppNotification('campaign_failed', "Campaign failed: {$campaign->name}", $stats['error'] ?? null, $url)
            : new AppNotification('campaign_completed', "Campaign completed: {$campaign->name}", "{$stats['saved']} leads saved", $url, $stats));
        // Spec §32: highlight new businesses found by a refresh.
        if ($isRerun && $stats['new_companies'] > 0) {
            $creator->notify(new AppNotification('new_businesses', "{$stats['new_companies']} new businesses found",
                $campaign->name, $url, ['count' => $stats['new_companies']]));
        }
    }

    /** @return list<SearchArea> one per selected location. Deep mode expands a whole city into its known areas. */
    private function areas(Campaign $campaign): array
    {
        $locations = $campaign->locations()->with('parent.parent.parent')->get();
        if ($locations->isEmpty()) {
            $locations = collect([$campaign->country]);
        }

        if ($campaign->filter('search_depth', 'standard') === 'deep') {
            $expanded = collect();
            foreach ($locations as $location) {
                if ($location->level === 'city') {
                    $children = $location->children()->orderByDesc('search_priority')->with('parent.parent.parent')->get();
                    if ($children->isNotEmpty()) {
                        $expanded->push(...$children);
                        continue;
                    }
                }
                $expanded->push($location);
            }
            $locations = $expanded;
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
        $haystack = mb_strtolower(trim($b->name.' '.($b->category ?? '')));
        foreach ((array) $c->filter('exclusions', []) as $excluded) {
            $excluded = mb_strtolower(trim((string) $excluded));
            if ($excluded !== '' && str_contains($haystack, $excluded)) {
                return false;
            }
        }

        return ! ($c->filter('must_have_phone') && ! $b->phone)
            && ! ($c->filter('must_have_website') && ! $b->website)
            && ! (($min = $c->filter('min_rating')) && ($b->rating ?? 0) < $min)
            && ! (($min = $c->filter('min_reviews')) && ($b->reviewCount ?? 0) < $min);
    }
}
