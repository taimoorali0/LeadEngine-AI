<?php

namespace App\Services\Sources;

/** One cell of the geographic search grid (spec §11). */
final class SearchArea
{
    public function __construct(
        public readonly string $label,
        public readonly ?float $latitude,
        public readonly ?float $longitude,
        public readonly int $radiusM = 5000,
    ) {}
}
