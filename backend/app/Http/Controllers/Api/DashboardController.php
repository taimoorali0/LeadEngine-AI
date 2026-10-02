<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\FollowUp;
use App\Models\Lead;
use Illuminate\Database\Eloquent\Builder;
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
            'total_leads' => (clone $leads)->count(),
            'trend' => $this->trend($leads),
            'top_locations' => (clone $leads)->join('companies', 'companies.id', '=', 'leads.company_id')
                ->join('locations', 'locations.id', '=', 'companies.location_id')
                ->selectRaw('locations.name_en as name, count(*) as total')->groupBy('locations.name_en')
                ->orderByDesc('total')->limit(5)->get(),
            'follow_ups' => [
                'due_today' => $this->followUps($user)->whereBetween('due_at', [today(), today()->endOfDay()])->count(),
                'overdue' => $this->followUps($user)->where('due_at', '<', now())->count(),
                'upcoming' => $this->followUps($user)->where('due_at', '>=', now())->orderBy('due_at')->limit(5)
                    ->with('lead:id,company_id', 'lead.company:id,name_en')->get(['id', 'lead_id', 'due_at', 'type']),
            ],
        ]);
    }

    /**
     * Daily counts for the last 14 days (first 7 = previous week, last 7 = this week),
     * so tiles can show a 7-day mini chart and the change against the week before.
     */
    private function trend(Builder $leads): array
    {
        $from = today()->subDays(13);
        $rows = (clone $leads)->where('leads.created_at', '>=', $from)
            ->selectRaw("to_char(date_trunc('day', leads.created_at), 'YYYY-MM-DD') as day, count(*) as created,
                count(*) filter (where score >= 75) as qualified,
                count(*) filter (where status not in ('new', 'invalid', 'duplicate')) as worked")
            ->groupBy('day')->get()->keyBy('day');
        $out = [];
        for ($d = $from->copy(); $d->lte(today()); $d->addDay()) {
            $r = $rows->get($d->toDateString());
            $out[] = ['day' => $d->toDateString(), 'created' => (int) ($r->created ?? 0),
                'qualified' => (int) ($r->qualified ?? 0), 'worked' => (int) ($r->worked ?? 0)];
        }

        return $out;
    }

    private function followUps($user)
    {
        return FollowUp::whereNull('completed_at')
            ->whereHas('lead', fn ($l) => $l->visibleTo($user))
            ->when(! $user->isSuperAdmin() && ! $user->hasPermission('leads.view_all'), fn ($q) => $q->where('user_id', $user->id));
    }
}
