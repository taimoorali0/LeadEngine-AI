<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $leads = Lead::query()->visibleTo($request->user());
        $user = $request->user();
        $companies = Company::query()->whereNull('merged_into_id')
            ->when(! $user->isSuperAdmin() && ! $user->hasPermission('leads.view_all'),
                fn ($q) => $q->whereHas('leads', fn ($l) => $l->where('assigned_to', $user->id)));
        $count = fn ($q, callable $f) => $f(clone $q)->count();

        return response()->json([
            'total_companies' => $companies->count(),
            'new_leads_today' => $count($leads, fn ($q) => $q->where('created_at', '>=', today())),
            'verified_leads' => $count($leads, fn ($q) => $q->whereNotIn('status', ['new', 'invalid', 'duplicate'])),
            'with_phone' => $count($companies, fn ($q) => $q->has('phones')),
            'with_website' => $count($companies, fn ($q) => $q->whereNotNull('website')),
            'with_email' => $count($companies, fn ($q) => $q->has('emails')),
            'high_quality' => $count($leads, fn ($q) => $q->where('score', '>=', 75)),
            'by_status' => (clone $leads)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            'by_quality' => (clone $leads)->whereNotNull('quality')->selectRaw('quality, count(*) as total')->groupBy('quality')->pluck('total', 'quality'),
        ]);
    }
}
