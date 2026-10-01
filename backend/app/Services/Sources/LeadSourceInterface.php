<?php

namespace App\Services\Sources;

/** Contract every discovery connector implements (spec §33-34). */
interface LeadSourceInterface
{
    public function key(): string;

    /** @return iterable<DiscoveredBusiness> */
    public function search(string $keyword, SearchArea $area, int $limit): iterable;
}
