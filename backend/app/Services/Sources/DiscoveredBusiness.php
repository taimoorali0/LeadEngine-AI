<?php

namespace App\Services\Sources;

/** A business as returned by any discovery source, before normalization/dedup. */
final class DiscoveredBusiness
{
    public function __construct(
        public readonly string $source,
        public readonly string $name,
        public readonly ?string $externalRef = null,
        public readonly ?string $address = null,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?string $phone = null,
        public readonly ?string $website = null,
        public readonly ?string $email = null,
        public readonly ?float $rating = null,
        public readonly ?int $reviewCount = null,
        public readonly ?string $businessStatus = null,
        public readonly ?string $category = null,
        public readonly array $raw = [],
        /** e.g. ['linkedin' => 'https://linkedin.com/company/...'] */
        public readonly array $socialLinks = [],
        /** Known location (e.g. a CSV "city" column matched to the location tree). */
        public readonly ?int $locationId = null,
    ) {}
}
