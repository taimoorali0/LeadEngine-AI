<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Universal top-bar search (spec §60). */
class SearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q'));
        if (mb_strlen($term) < 2) {
            return response()->json(['companies' => [], 'leads' => []]);
        }
        $digits = preg_replace('/\D/', '', $term);
        $user = $request->user();

        $companies = Company::query()->whereNull('merged_into_id')
            ->where(function ($q) use ($term, $digits) {
                $q->where('name_en', 'ilike', "%{$term}%")
                    ->orWhere('name_ar', 'ilike', "%{$term}%")
                    ->orWhere('website_domain', 'ilike', "%{$term}%")
                    ->orWhereHas('emails', fn ($e) => $e->where('email', 'ilike', "%{$term}%"));
                if (strlen($digits) >= 6) {
                    $q->orWhereHas('phones', fn ($p) => $p->where('normalized', 'like', "%{$digits}%"));
                }
            })
            ->when(! $user->hasPermission('leads.view_all') && ! $user->isSuperAdmin(),
                fn ($q) => $q->whereHas('leads', fn ($l) => $l->where('assigned_to', $user->id)))
            ->with('industry:id,name_en', 'location:id,name_en')
            ->addSelect(['top_score' => Lead::selectRaw('max(score)')->whereColumn('company_id', 'companies.id')])
            ->limit(10)->get(['id', 'name_en', 'industry_id', 'location_id', 'website']);

        $leads = ctype_digit($term)
            ? Lead::visibleTo($user)->whereKey((int) $term)->with('company:id,name_en')->get()
            : collect();

        return response()->json(['companies' => $companies, 'leads' => $leads]);
    }
}
