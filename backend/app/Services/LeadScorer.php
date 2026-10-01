<?php

namespace App\Services;

use App\Http\Controllers\Api\SettingsController;
use App\Models\Lead;
use Illuminate\Support\Facades\Log;
use Throwable;

class LeadScorer
{
    public function __construct(private readonly EngineClient $engine) {}

    public function score(Lead $lead): Lead
    {
        $company = $lead->company()->withCount(['phones', 'emails'])->first();
        $campaign = $lead->campaign;
        $locationIds = $campaign?->locations()->pluck('locations.id')->all() ?? [];

        $input = [
            'has_phone' => $company->phones_count > 0,
            'has_website' => (bool) $company->website,
            'has_email' => $company->emails_count > 0,
            'business_active' => $company->business_status === 'OPERATIONAL',
            'industry_match' => $campaign?->industry_id !== null && $company->industry_id === $campaign->industry_id,
            // Discovery is already location-bounded; an explicit match is preferred when known.
            'location_match' => $company->location_id ? in_array($company->location_id, $locationIds, true) : $campaign !== null,
            'rating' => $company->rating,
            'has_social_profiles' => ! empty($company->social_links),
            'profile_complete' => $company->website && $company->address_en && $company->description_en,
        ];

        try {
            $rules = SettingsController::for($lead->organization)['scoring_rules'];
            $result = $this->engine->score($input, $rules);
            $lead->update([
                'score' => $result['score'],
                'quality' => $result['category'],
                'score_breakdown' => $result['breakdown'],
            ]);
        } catch (Throwable $e) {
            Log::warning('Scoring engine unavailable', ['lead' => $lead->id, 'error' => $e->getMessage()]);
        }

        return $lead;
    }
}
