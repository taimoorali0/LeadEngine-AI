<?php

namespace App\Services\Sources;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Google Places API (New) Text Search connector. The API key stays server-side. */
class GooglePlacesSource implements LeadSourceInterface
{
    private const URL = 'https://places.googleapis.com/v1/places:searchText';

    private const FIELDS = [
        'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
        'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
        'places.rating', 'places.userRatingCount', 'places.businessStatus', 'places.primaryTypeDisplayName',
        'places.googleMapsUri', 'nextPageToken',
    ];

    public function __construct(private readonly ?string $apiKey = null) {}

    public function key(): string
    {
        return 'google_places';
    }

    public function search(string $keyword, SearchArea $area, int $limit): iterable
    {
        $apiKey = $this->apiKey ?? config('services.google_places.key');
        if (! $apiKey) {
            throw new RuntimeException('GOOGLE_PLACES_API_KEY is not configured.');
        }

        $body = ['textQuery' => trim("{$keyword} in {$area->label}"), 'pageSize' => 20];
        if ($area->latitude !== null && $area->longitude !== null) {
            $body['locationBias'] = ['circle' => [
                'center' => ['latitude' => $area->latitude, 'longitude' => $area->longitude],
                'radius' => min($area->radiusM, 50000),
            ]];
        }

        $yielded = 0;
        do {
            $response = Http::withHeaders([
                'X-Goog-Api-Key' => $apiKey,
                'X-Goog-FieldMask' => implode(',', self::FIELDS),
            ])->timeout(20)->retry(2, 500)->post(self::URL, $body)->throw()->json();

            foreach ($response['places'] ?? [] as $place) {
                yield $this->map($place);
                if (++$yielded >= $limit) {
                    return;
                }
            }
            $body['pageToken'] = $response['nextPageToken'] ?? null;
        } while ($body['pageToken']);
    }

    private function map(array $p): DiscoveredBusiness
    {
        return new DiscoveredBusiness(
            source: $this->key(),
            name: $p['displayName']['text'] ?? 'Unknown',
            externalRef: $p['id'] ?? null,
            address: $p['formattedAddress'] ?? null,
            latitude: $p['location']['latitude'] ?? null,
            longitude: $p['location']['longitude'] ?? null,
            phone: $p['internationalPhoneNumber'] ?? $p['nationalPhoneNumber'] ?? null,
            website: $p['websiteUri'] ?? null,
            rating: isset($p['rating']) ? (float) $p['rating'] : null,
            reviewCount: $p['userRatingCount'] ?? null,
            businessStatus: $p['businessStatus'] ?? null,
            category: $p['primaryTypeDisplayName']['text'] ?? null,
            raw: $p,
        );
    }
}
