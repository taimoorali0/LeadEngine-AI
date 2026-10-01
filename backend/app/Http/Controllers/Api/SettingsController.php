<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Organization settings: scoring rules, assignment, locale (spec §23, §28). */
class SettingsController extends Controller
{
    public const DEFAULTS = [
        'default_locale' => 'en',
        'scoring_rules' => [
            'phone' => 15, 'website' => 15, 'email' => 20, 'business_active' => 10, 'industry_match' => 15,
            'location_match' => 10, 'rating_above_threshold' => 5, 'online_presence' => 5, 'profile_complete' => 5,
            'rating_threshold' => 3.5,
            'bands' => [[90, 'Highly Qualified'], [75, 'Qualified'], [55, 'Needs Review'], [0, 'Needs Enrichment']],
        ],
        'assignment' => ['enabled' => false, 'method' => 'round_robin', 'min_score' => 0, 'role_keys' => ['agent'], 'weights' => [], 'territories' => []],
        'ai' => ['enabled' => true, 'auto_analyze' => true],
    ];

    public static function for(?Organization $org): array
    {
        return array_replace_recursive(self::DEFAULTS, $org?->settings ?? []);
    }

    public function show(Request $request): JsonResponse
    {
        $org = $request->user()->organization;

        return response()->json(['organization' => $org->only(['id', 'name', 'slug']), 'settings' => self::for($org)]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorize('settings.manage');
        $data = $request->validate([
            'name' => 'sometimes|string|max:160',
            'settings.default_locale' => 'sometimes|in:en,ur,ar',
            'settings.scoring_rules' => 'sometimes|array',
            'settings.scoring_rules.*' => 'nullable',
            'settings.scoring_rules.rating_threshold' => 'sometimes|numeric|between:0,5',
            'settings.scoring_rules.bands' => 'sometimes|array|min:1',
            'settings.scoring_rules.bands.*' => 'array|size:2',
            'settings.assignment' => 'sometimes|array',
            'settings.assignment.enabled' => 'boolean',
            'settings.assignment.method' => 'in:round_robin,weighted,territory',
            'settings.assignment.min_score' => 'integer|between:0,100',
            'settings.assignment.role_keys' => 'array',
            'settings.assignment.weights' => 'array',
            'settings.assignment.territories' => 'array',
            'settings.ai' => 'sometimes|array',
            'settings.ai.enabled' => 'boolean',
            'settings.ai.auto_analyze' => 'boolean',
        ]);
        foreach (['phone', 'website', 'email', 'business_active', 'industry_match', 'location_match', 'rating_above_threshold', 'online_presence', 'profile_complete'] as $k) {
            if (isset($data['settings']['scoring_rules'][$k])) {
                $request->validate(["settings.scoring_rules.$k" => 'integer|between:0,100']);
            }
        }
        $org = $request->user()->organization;
        if (isset($data['name'])) {
            $org->name = $data['name'];
        }
        if (isset($data['settings'])) {
            // Lists are replaced, not merged.
            $merged = array_replace_recursive($org->settings ?? [], $data['settings']);
            foreach (['bands' => ['scoring_rules', 'bands'], 'role_keys' => ['assignment', 'role_keys'], 'territories' => ['assignment', 'territories'], 'weights' => ['assignment', 'weights']] as [$a, $b]) {
                if (isset($data['settings'][$a][$b])) {
                    $merged[$a][$b] = $data['settings'][$a][$b];
                }
            }
            $org->settings = $merged;
        }
        $org->save();
        AuditLog::record('settings.updated', $org, ['keys' => array_keys($data['settings'] ?? [])]);

        return $this->show($request);
    }
}
