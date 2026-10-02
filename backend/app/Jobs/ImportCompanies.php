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
use App\Services\CsvReader;
use App\Services\LeadScorer;
use App\Services\Sources\DiscoveredBusiness;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * CSV import (spec §33-34 CsvSource): each row goes through the same dedup,
 * scoring, enrichment and automation pipeline as Google discovery.
 */
class ImportCompanies implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 3600;

    public int $tries = 1;

    /** @param array<string, int> $mapping LeadEngine field => column index */
    public function __construct(public Campaign $campaign, public string $path, public array $mapping) {}

    public function handle(CsvReader $csv, CompanyIngestor $ingestor, LeadScorer $scorer, AutomationEngine $automation, Billing $billing): void
    {
        $campaign = $this->campaign;
        if ($campaign->organization && ! $billing->isOperational($campaign->organization)) {
            $campaign->update(['status' => 'failed', 'stats' => ['error' => 'Subscription is not active.']]);

            return;
        }
        $stats = ['rows' => 0, 'skipped' => 0, 'duplicates' => 0, 'saved' => 0, 'new_companies' => 0, 'websites' => 0, 'failed_records' => 0];
        $progress = array_fill_keys(Campaign::STAGES, 0);
        $campaign->update(['status' => 'running', 'last_run_at' => now(), 'progress' => $progress, 'stats' => $stats]);
        $run = $campaign->runs()->create(['started_at' => now()]);
        CampaignUpdated::send($campaign);

        try {
            $data = $csv->read(Storage::disk('local')->path($this->path));
            $region = $campaign->country?->iso_code ?? 'PK';
            $cities = $this->cityIndex($campaign);
            $total = max(1, count($data['rows']));
            $leadIds = [];

            foreach ($data['rows'] as $i => $row) {
                $stats['rows']++;
                $get = function (string $field) use ($row): ?string {
                    $value = isset($this->mapping[$field]) ? trim((string) ($row[$this->mapping[$field]] ?? '')) : '';

                    return $value === '' ? null : $value;
                };
                $name = $get('name');
                if (! $name) {
                    $stats['skipped']++;

                    continue;
                }
                $linkedin = $get('linkedin');
                $business = new DiscoveredBusiness(
                    source: 'csv',
                    name: mb_substr($name, 0, 200),
                    externalRef: null,
                    address: $get('address'),
                    phone: $get('phone'),
                    website: $this->url($get('website')),
                    email: filter_var($get('email'), FILTER_VALIDATE_EMAIL) ?: null,
                    rating: is_numeric($get('rating')) ? min(5, (float) $get('rating')) : null,
                    reviewCount: is_numeric($get('reviews')) ? (int) $get('reviews') : null,
                    category: $get('category'),
                    raw: ['row' => $i + 2, 'file' => basename($this->path)],
                    socialLinks: $linkedin && str_contains(mb_strtolower($linkedin), 'linkedin.com') ? ['linkedin' => $this->url($linkedin)] : [],
                    locationId: ($city = $get('city')) ? ($cities[mb_strtolower($city)] ?? null) : null,
                );
                try {
                    $r = $ingestor->ingest($business, $campaign, null, $region);
                } catch (Throwable $e) {
                    $stats['failed_records']++;
                    Log::warning('CSV row failed', ['campaign' => $campaign->id, 'row' => $i + 2, 'error' => $e->getMessage()]);

                    continue;
                }
                $r['company_created'] ? $stats['new_companies']++ : $stats['duplicates']++;
                if ($r['lead_created']) {
                    $stats['saved']++;
                    $stats['websites'] += $r['company']->website ? 1 : 0;
                    $leadIds[] = $r['lead']->id;
                }
                if ($stats['rows'] % 100 === 0) {
                    $progress['companies'] = $progress['deduplication'] = (int) round(100 * $stats['rows'] / $total);
                    $campaign->update(['progress' => $progress, 'stats' => $stats]);
                    CampaignUpdated::send($campaign);
                }
            }
            $progress['search'] = $progress['companies'] = $progress['deduplication'] = 100;

            foreach ($leadIds as $n => $leadId) {
                $lead = $campaign->leads()->withoutGlobalScopes()->find($leadId);
                $scorer->score($lead);
                $automation->leadReady($lead);
                if ($lead->company->website && $lead->company->enrichment_status === 'pending') {
                    EnrichCompany::dispatch($lead->company);
                }
                $progress['scoring'] = (int) round(100 * ($n + 1) / max(1, count($leadIds)));
            }
            $progress['scoring'] = $progress['enrichment'] = 100;

            $campaign->update(['status' => 'completed', 'progress' => $progress, 'stats' => $stats]);
            $run->update(['finished_at' => now(), 'stats' => $stats, 'new_companies' => $stats['new_companies']]);
            AuditLog::record('companies.imported', $campaign, $stats, $campaign->creator);
            $campaign->creator?->notify(new AppNotification('campaign_completed', "Import finished: {$campaign->name}",
                "{$stats['saved']} leads saved, {$stats['duplicates']} duplicates merged", "/campaigns/{$campaign->id}", $stats));
        } catch (Throwable $e) {
            $campaign->update(['status' => 'failed', 'progress' => $progress, 'stats' => $stats + ['error' => mb_substr($e->getMessage(), 0, 200)]]);
            $run->update(['finished_at' => now(), 'stats' => $stats]);
            $campaign->creator?->notify(new AppNotification('campaign_failed', "Import failed: {$campaign->name}", mb_substr($e->getMessage(), 0, 200), "/campaigns/{$campaign->id}"));
        } finally {
            CampaignUpdated::send($campaign);
            Storage::disk('local')->delete($this->path);  // the data now lives in the database
        }
    }

    /** City and area names (English/Arabic/Urdu) in the campaign's country, lower-cased => id. */
    private function cityIndex(Campaign $campaign): array
    {
        $ids = [$campaign->country_id];
        $index = [];
        for ($depth = 0; $depth < 3 && $ids; $depth++) {
            $children = Location::whereIn('parent_id', $ids)->get(['id', 'level', 'name_en', 'name_ar', 'name_ur']);
            foreach ($children as $l) {
                if (in_array($l->level, ['city', 'area'], true)) {
                    foreach ([$l->name_en, $l->name_ar, $l->name_ur] as $n) {
                        // Cities win over areas with the same name.
                        if ($n && (! isset($index[mb_strtolower($n)]) || $l->level === 'city')) {
                            $index[mb_strtolower($n)] = $l->id;
                        }
                    }
                }
            }
            $ids = $children->pluck('id')->all();
        }

        return $index;
    }

    private function url(?string $v): ?string
    {
        if (! $v) {
            return null;
        }
        $v = trim($v);

        return preg_match('#^https?://#i', $v) ? $v : 'https://'.ltrim($v, '/');
    }
}
