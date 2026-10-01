<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Reports (spec §57). All figures are scoped to the user's organization and date range. */
class ReportController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $this->authorize('reports.view');
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from']);
        $orgId = $request->user()->organization_id;
        $from = $request->date('from') ?? now()->subDays(30)->startOfDay();
        $to = ($request->date('to') ?? now())->endOfDay();

        $leads = fn () => DB::table('leads')->where('leads.organization_id', $orgId)->whereBetween('leads.created_at', [$from, $to]);
        $activity = fn () => DB::table('lead_activities')->join('leads', 'leads.id', '=', 'lead_activities.lead_id')
            ->where('leads.organization_id', $orgId)->whereBetween('lead_activities.created_at', [$from, $to]);
        $reached = "('contacted','follow_up','interested','meeting','proposal','won','not_interested')";

        $total = $leads()->count();
        $funnel = $leads()->selectRaw("
            count(*) as leads,
            count(*) filter (where status in $reached) as contacted,
            count(*) filter (where status in ('interested','meeting','proposal','won')) as interested,
            count(*) filter (where status in ('meeting','proposal','won')) as meetings,
            count(*) filter (where status = 'won') as won")->first();

        return response()->json([
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'funnel' => $funnel,
            'rates' => [
                'contact_rate' => $this->pct($funnel->contacted, $total),
                'interest_rate' => $this->pct($funnel->interested, $funnel->contacted),
                'meeting_rate' => $this->pct($funnel->meetings, $funnel->contacted),
                'conversion_rate' => $this->pct($funnel->won, $total),
            ],
            'leads_by_day' => $leads()->selectRaw("to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as n")
                ->groupBy('day')->orderBy('day')->get(),
            'by_city' => $leads()->join('companies', 'companies.id', '=', 'leads.company_id')
                ->leftJoin('locations', 'locations.id', '=', 'companies.location_id')
                ->selectRaw("coalesce(locations.name_en, 'Unknown') as label, count(*) as n, round(avg(leads.score)) as avg_score")
                ->groupBy('label')->orderByDesc('n')->limit(15)->get(),
            'by_industry' => $leads()->join('companies', 'companies.id', '=', 'leads.company_id')
                ->leftJoin('industries', 'industries.id', '=', 'companies.industry_id')
                ->selectRaw("coalesce(industries.name_en, 'Unclassified') as label, count(*) as n, round(avg(leads.score)) as avg_score")
                ->groupBy('label')->orderByDesc('n')->limit(15)->get(),
            'by_source' => DB::table('company_sources')->join('leads', 'leads.company_id', '=', 'company_sources.company_id')
                ->where('leads.organization_id', $orgId)->whereBetween('leads.created_at', [$from, $to])
                ->selectRaw('company_sources.source as label, count(distinct leads.id) as n')->groupBy('label')->orderByDesc('n')->get(),
            'by_quality' => $leads()->selectRaw("coalesce(quality, 'Unscored') as label, count(*) as n")->groupBy('label')->get(),
            'agents' => DB::table('users')->where('users.organization_id', $orgId)->where('is_active', true)
                ->leftJoin('leads', fn ($j) => $j->on('leads.assigned_to', '=', 'users.id')->whereBetween('leads.created_at', [$from, $to]))
                ->selectRaw("users.id, users.name, count(leads.id) as assigned,
                    count(leads.id) filter (where leads.status in $reached) as contacted,
                    count(leads.id) filter (where leads.status in ('meeting','proposal','won')) as meetings,
                    count(leads.id) filter (where leads.status = 'won') as won")
                ->groupBy('users.id', 'users.name')->havingRaw('count(leads.id) > 0')->orderByDesc('won')->orderByDesc('assigned')->get()
                ->map(function ($a) use ($activity) {
                    $a->calls = $activity()->where('lead_activities.user_id', $a->id)->where('lead_activities.type', 'call')->count();
                    $a->conversion_rate = $this->pct($a->won, $a->assigned);

                    return $a;
                }),
            'follow_ups' => DB::table('follow_ups')->join('leads', 'leads.id', '=', 'follow_ups.lead_id')
                ->where('leads.organization_id', $orgId)->whereBetween('follow_ups.due_at', [$from, $to])
                ->selectRaw('count(*) as scheduled,
                    count(*) filter (where completed_at is not null) as completed,
                    count(*) filter (where completed_at is not null and completed_at <= due_at + interval \'1 day\') as on_time,
                    count(*) filter (where completed_at is null and due_at < now()) as overdue')->first(),
            'campaigns' => DB::table('campaigns')->where('campaigns.organization_id', $orgId)
                ->leftJoin('leads', fn ($j) => $j->on('leads.campaign_id', '=', 'campaigns.id')->whereBetween('leads.created_at', [$from, $to]))
                ->selectRaw("campaigns.id, campaigns.name, count(leads.id) as leads, round(avg(leads.score)) as avg_score,
                    count(leads.id) filter (where leads.score >= 75) as qualified, count(leads.id) filter (where leads.status = 'won') as won,
                    (select coalesce(sum(cost_usd), 0) from usage_events u where u.campaign_id = campaigns.id and u.created_at between ? and ?) as cost_usd",
                    [$from, $to])
                ->groupBy('campaigns.id', 'campaigns.name')->orderByDesc('leads')->limit(20)->get(),
            'new_companies' => DB::table('companies')->where('organization_id', $orgId)->whereBetween('created_at', [$from, $to])->count(),
        ]);
    }

    private function pct(int|float $n, int|float $d): ?float
    {
        return $d > 0 ? round(100 * $n / $d, 1) : null;
    }
}
