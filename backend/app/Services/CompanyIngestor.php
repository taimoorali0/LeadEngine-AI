<?php

namespace App\Services;

use App\Models\Campaign;
use App\Models\Company;
use App\Models\Lead;
use App\Services\Sources\DiscoveredBusiness;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Normalizes a discovered business, merges it into an existing company when it
 * is a duplicate (spec §20), and makes sure a lead exists for the campaign (spec §21).
 */
class CompanyIngestor
{
    public function __construct(private readonly EngineClient $engine) {}

    /** @return array{company: Company, company_created: bool, lead: Lead, lead_created: bool} */
    public function ingest(DiscoveredBusiness $b, Campaign $campaign, ?string $keyword = null, string $region = 'PK'): array
    {
        $phone = $this->normalizePhone($b->phone, $region);

        return DB::transaction(function () use ($b, $campaign, $keyword, $phone) {
            $company = $this->findExisting($b, $campaign->organization_id, $phone['normalized'] ?? null);
            $created = $company === null;

            $company ??= new Company(['organization_id' => $campaign->organization_id]);
            $this->fill($company, $b, $campaign);
            $company->save();

            if ($phone) {
                $company->phones()->firstOrCreate(
                    isset($phone['normalized']) ? ['normalized' => $phone['normalized']] : ['original' => $phone['original'], 'normalized' => null],
                    ['original' => $phone['original'],
                        'country_code' => $phone['country_code'] ?? null, 'country' => $phone['country'] ?? null,
                        'phone_type' => $phone['phone_type'] ?? null, 'source' => $b->source],
                );
            }
            if ($b->email) {
                $company->emails()->firstOrCreate(['email' => strtolower($b->email)], ['status' => 'published', 'source' => $b->source]);
            }
            $company->sources()->create([
                'source' => $b->source, 'external_ref' => $b->externalRef, 'campaign_id' => $campaign->id,
                'keyword' => $keyword, 'raw_payload' => $b->raw ?: null,
            ]);

            $lead = Lead::withoutGlobalScopes()->firstOrCreate(
                ['company_id' => $company->id, 'campaign_id' => $campaign->id],
                ['organization_id' => $campaign->organization_id, 'status' => 'new'],
            );
            if ($lead->wasRecentlyCreated) {
                $lead->log('created', "Discovered via {$b->source}", ['keyword' => $keyword]);
            }

            return ['company' => $company, 'company_created' => $created, 'lead' => $lead, 'lead_created' => $lead->wasRecentlyCreated];
        });
    }

    private function normalizePhone(?string $phone, string $region): ?array
    {
        if (! $phone) {
            return null;
        }
        try {
            $result = $this->engine->normalizePhones([$phone], $region)[0];

            return $result['valid'] ? $result : ['original' => $phone];
        } catch (Throwable $e) {
            Log::warning('Phone normalization unavailable', ['error' => $e->getMessage()]);

            return ['original' => $phone];
        }
    }

    private function findExisting(DiscoveredBusiness $b, int $orgId, ?string $phone): ?Company
    {
        $base = fn () => Company::withoutGlobalScopes()->where('organization_id', $orgId)->whereNull('merged_into_id');

        // Exact identifiers first: they are cheap and definitive.
        if ($b->externalRef && $hit = $base()->where('google_place_id', $b->externalRef)->first()) {
            return $hit;
        }
        $domain = Company::domainOf($b->website);
        $name = Company::normalizeName($b->name);

        // Fuzzy candidates: similar name, or shared domain/phone; the engine decides.
        $candidates = $base()
            ->where(function ($q) use ($name, $domain, $phone) {
                $q->whereRaw('similarity(normalized_name, ?) > 0.3', [$name]);
                if ($domain) {
                    $q->orWhere('website_domain', $domain);
                }
                if ($phone) {
                    $q->orWhereIn('id', fn ($s) => $s->select('company_id')->from('company_phones')->where('normalized', $phone));
                }
            })
            ->with('phones')
            ->limit(20)
            ->get();
        if ($candidates->isEmpty()) {
            return null;
        }

        try {
            $matches = $this->engine->findDuplicates(
                $this->toRecord(null, $b->name, $b->website, $phone ?? $b->phone, $b->address, $b->externalRef, $b->latitude, $b->longitude),
                $candidates->map(fn (Company $c) => $this->toRecord(
                    (string) $c->id, $c->name_en, $c->website, $c->phones->first()?->normalized,
                    $c->address_en, $c->google_place_id, $c->latitude, $c->longitude,
                ))->all(),
            );

            return $matches ? $candidates->firstWhere('id', (int) $matches[0]['candidate_id']) : null;
        } catch (Throwable $e) {
            Log::warning('Dedup engine unavailable, using exact-match fallback', ['error' => $e->getMessage()]);

            return $candidates->first(fn (Company $c) => ($domain && $c->website_domain === $domain && $c->normalized_name === $name)
                || ($phone && $c->phones->contains('normalized', $phone) && $c->normalized_name === $name));
        }
    }

    private function toRecord(?string $id, string $name, ?string $website, ?string $phone, ?string $address, ?string $ref, ?float $lat, ?float $lng): array
    {
        return array_filter([
            'id' => $id, 'name' => $name, 'website' => $website, 'phone' => $phone, 'address' => $address,
            'google_place_id' => $ref, 'latitude' => $lat, 'longitude' => $lng,
        ], fn ($v) => $v !== null);
    }

    /** Fill blanks only: existing data (possibly edited by users) is never overwritten. */
    private function fill(Company $c, DiscoveredBusiness $b, Campaign $campaign): void
    {
        $values = [
            'name_en' => $b->name,
            'normalized_name' => Company::normalizeName($b->name),
            'industry_id' => $campaign->industry_id,
            'business_category' => $b->category,
            'address_en' => $b->address,
            'latitude' => $b->latitude,
            'longitude' => $b->longitude,
            'website' => $b->website,
            'website_domain' => Company::domainOf($b->website),
            'google_place_id' => $b->source === 'google_places' ? $b->externalRef : null,
            'business_status' => $b->businessStatus,
        ];
        foreach ($values as $key => $value) {
            if ($c->{$key} === null && $value !== null) {
                $c->{$key} = $value;
            }
        }
        // Reputation figures are refreshed on every sighting.
        $c->rating = $b->rating ?? $c->rating;
        $c->review_count = $b->reviewCount ?? $c->review_count;
        $c->last_checked_at = now();
    }
}
