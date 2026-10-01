<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\RunCampaign;
use App\Models\AuditLog;
use App\Models\Campaign;
use App\Services\Billing;
use App\Services\EngineClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CampaignController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Campaign::with('country:id,name_en', 'industry:id,name_en')->withCount('leads')->latest()->paginate(25)
        );
    }

    public function store(Request $request, EngineClient $engine): JsonResponse
    {
        $this->authorize('campaigns.manage');
        $data = $this->validated($request);

        $campaign = DB::transaction(function () use ($data, $request, $engine) {
            $campaign = Campaign::create($data + ['created_by' => $request->user()->id]);
            $campaign->locations()->sync($data['location_ids'] ?? []);
            $keywords = $data['keywords'] ?? $this->generate($engine, $campaign);
            $this->syncKeywords($campaign, $keywords);

            return $campaign;
        });
        AuditLog::record('campaign.created', $campaign);

        return response()->json($this->detail($campaign), 201);
    }

    public function show(Campaign $campaign): JsonResponse
    {
        return response()->json($this->detail($campaign));
    }

    public function update(Request $request, Campaign $campaign): JsonResponse
    {
        $this->authorize('campaigns.manage');
        $data = $this->validated($request, partial: true);
        DB::transaction(function () use ($campaign, $data) {
            $campaign->update($data);
            if (array_key_exists('refresh_interval_days', $data)) {
                $campaign->update(['next_refresh_at' => $data['refresh_interval_days'] && $campaign->last_run_at
                    ? $campaign->last_run_at->addDays($data['refresh_interval_days']) : null]);
            }
            if (array_key_exists('location_ids', $data)) {
                $campaign->locations()->sync($data['location_ids']);
            }
            if (array_key_exists('keywords', $data)) {
                $this->syncKeywords($campaign, $data['keywords']);
            }
        });

        return response()->json($this->detail($campaign));
    }

    public function destroy(Campaign $campaign): JsonResponse
    {
        $this->authorize('campaigns.manage');
        AuditLog::record('campaign.deleted', $campaign, ['name' => $campaign->name]);
        $campaign->delete();

        return response()->json(['ok' => true]);
    }

    /** Suggest search keywords without saving (spec §8). */
    public function suggestKeywords(Request $request, EngineClient $engine): JsonResponse
    {
        $data = $request->validate(['company_type' => 'required|string|max:120', 'languages' => 'array', 'languages.*' => 'in:en,ar,ur']);

        return response()->json($engine->keywords($data['company_type'], $data['languages'] ?? ['en']));
    }

    public function run(Campaign $campaign, Billing $billing): JsonResponse
    {
        $this->authorize('campaigns.manage');
        $org = $campaign->organization;
        abort_if(! $billing->canRunCampaign($org, $campaign), 422, 'Your plan’s limit of running campaigns has been reached.');
        abort_if($org->fresh()->credit_balance < 1, 422, 'Not enough credits. Top up or upgrade your plan.');
        abort_if(in_array($campaign->status, ['queued', 'running'], true), 409, 'Campaign is already running.');
        abort_if(! $campaign->keywords()->where('enabled', true)->exists(), 422, 'Campaign has no enabled keywords.');

        $previous = $campaign->status;
        $campaign->update(['status' => 'queued']);
        try {
            RunCampaign::dispatch($campaign);
        } catch (\Throwable $e) {
            // Never leave a campaign stuck in "queued" when the queue is unreachable.
            $campaign->update(['status' => $previous]);
            report($e);
            abort(503, 'The job queue is unavailable. Try again shortly.');
        }
        AuditLog::record('campaign.started', $campaign);

        return response()->json($this->detail($campaign->fresh()), 202);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "$req|string|max:160",
            'country_id' => ["$req", Rule::exists('locations', 'id')->where('level', 'country')],
            'industry_id' => 'nullable|exists:industries,id',
            'company_type' => "$req|string|max:120",
            'target_results' => 'integer|min:1|max:5000',
            'refresh_interval_days' => 'nullable|integer|min:1|max:365',
            'filters' => 'array',
            'filters.must_have_phone' => 'boolean',
            'filters.must_have_website' => 'boolean',
            'filters.min_rating' => 'nullable|numeric|between:0,5',
            'filters.min_reviews' => 'nullable|integer|min:0',
            'filters.languages' => 'array',
            'location_ids' => 'array',
            'location_ids.*' => 'exists:locations,id',
            'keywords' => 'array',
            'keywords.*.keyword' => 'required|string|max:120',
            'keywords.*.enabled' => 'boolean',
            'keywords.*.language' => 'in:en,ar,ur',
            'keywords.*.origin' => 'in:generated,custom',
        ]);
    }

    private function generate(EngineClient $engine, Campaign $campaign): array
    {
        try {
            $words = $engine->keywords($campaign->company_type, $campaign->filter('languages', ['en']));
        } catch (\Throwable) {
            $words = [$campaign->company_type];
        }

        return array_map(fn ($k) => ['keyword' => $k, 'origin' => 'generated',
            'language' => preg_match('/\p{Arabic}/u', $k) ? 'ar' : 'en'], $words);
    }

    private function syncKeywords(Campaign $campaign, array $keywords): void
    {
        $campaign->keywords()->delete();
        $seen = [];
        foreach ($keywords as $k) {
            $key = mb_strtolower(trim($k['keyword']));
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $campaign->keywords()->create([
                'keyword' => trim($k['keyword']),
                'enabled' => $k['enabled'] ?? true,
                'language' => $k['language'] ?? 'en',
                'origin' => $k['origin'] ?? 'custom',
            ]);
        }
    }

    private function detail(Campaign $campaign): array
    {
        return $campaign->load('country:id,name_en,iso_code', 'industry:id,name_en', 'locations:id,name_en,level',
            'keywords', 'runs')->loadCount('leads')->toArray();
    }
}
