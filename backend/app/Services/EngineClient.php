<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/** HTTP client for the Python data engine (python-engine/app/main.py). */
class EngineClient
{
    private function http(): PendingRequest
    {
        return Http::baseUrl(config('services.python_engine.url'))
            ->timeout((int) config('services.python_engine.timeout'))
            ->acceptJson()
            ->throw();
    }

    /** @return list<array{original:string,normalized:?string,country_code:?string,country:?string,phone_type:?string,valid:bool}> */
    public function normalizePhones(array $numbers, string $region = 'PK'): array
    {
        if ($numbers === []) {
            return [];
        }

        return $this->http()->post('/phones/normalize', ['numbers' => array_values($numbers), 'default_region' => $region])->json();
    }

    /** @return list<array<string, mixed>> matches sorted by confidence, duplicates only */
    public function findDuplicates(array $record, array $existing): array
    {
        if ($existing === []) {
            return [];
        }

        return $this->http()->post('/dedup/check', ['record' => $record, 'existing' => $existing])->json();
    }

    /** @return array{score:int,category:string,breakdown:array<string,int>} */
    public function score(array $lead, ?array $rules = null): array
    {
        return $this->http()->post('/scoring/score', array_filter(['lead' => $lead, 'rules' => $rules]))->json();
    }

    /** @return list<string> */
    public function keywords(string $companyType, array $languages = ['en']): array
    {
        return $this->http()->post('/keywords/generate', ['company_type' => $companyType, 'languages' => $languages])->json();
    }

    public function enrichWebsite(string $url, string $region = 'PK'): array
    {
        return $this->http()->timeout(90)->post('/enrich/website', ['url' => $url, 'default_region' => $region])->json();
    }
}
