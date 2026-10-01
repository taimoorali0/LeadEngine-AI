<?php

namespace App\Jobs;

use App\Models\Company;
use App\Models\Lead;
use App\Models\UsageEvent;
use App\Services\EngineClient;
use App\Services\LeadScorer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/** Website enrichment via the Python engine (spec §14). */
class EnrichCompany implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public function __construct(public Company $company) {}

    public function handle(EngineClient $engine, LeadScorer $scorer): void
    {
        $c = $this->company;
        $region = $c->location?->countryCode() ?? 'PK';
        try {
            $data = $engine->enrichWebsite($c->website, $region);
        } catch (Throwable $e) {
            $c->update(['enrichment_status' => 'failed']);

            throw $e;
        }

        foreach ($data['emails'] as $e) {
            $c->emails()->firstOrCreate(['email' => $e['email']], ['type' => $e['type'], 'status' => $e['status'], 'source' => 'website']);
        }
        foreach ($data['phones'] as $p) {
            $c->phones()->firstOrCreate(['normalized' => $p['normalized']], [
                'original' => $p['original'], 'country_code' => $p['country_code'], 'country' => $p['country'],
                'phone_type' => $p['phone_type'], 'source' => 'website',
            ]);
        }
        $c->update([
            'social_links' => array_merge($data['social_links'], $c->social_links ?? []),
            'description_en' => $c->description_en ?? $data['description'],
            'enrichment_status' => 'enriched',
            'last_checked_at' => now(),
        ]);
        UsageEvent::create(['organization_id' => $c->organization_id, 'kind' => 'website_enrichment', 'credits' => 1]);

        Lead::withoutGlobalScopes()->where('company_id', $c->id)->get()->each(function (Lead $lead) use ($scorer) {
            $scorer->score($lead);
            $lead->log('enriched', 'Website enriched', [], null);
        });
    }
}
