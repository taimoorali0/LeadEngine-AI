<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Lead;
use App\Models\Organization;
use App\Services\Billing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BillingController extends Controller
{
    public function show(Request $request, Billing $billing): JsonResponse
    {
        $org = $request->user()->organization->fresh();
        $since = now()->startOfMonth();

        return response()->json([
            'plan_key' => $org->plan,
            'plan' => $billing->plan($org),
            'plans' => config('plans.plans'),
            'costs' => config('plans.costs'),
            'credit_balance' => $org->credit_balance,
            'renews_at' => $org->plan_renews_at,
            'users' => $org->users()->where('is_active', true)->count(),
            'usage_this_month' => DB::table('usage_events')->where('organization_id', $org->id)->where('created_at', '>=', $since)
                ->selectRaw('kind, sum(credits) as credits, count(*) as units')->groupBy('kind')->get(),
            'transactions' => DB::table('credit_transactions')->where('organization_id', $org->id)->latest('id')->limit(30)->get(),
        ]);
    }

    /** Plan change. Without a payment provider this applies immediately. */
    public function changePlan(Request $request, Billing $billing): JsonResponse
    {
        $this->authorize('billing.manage');
        $data = $request->validate(['plan' => ['required', Rule::in(array_keys(config('plans.plans')))]]);
        $org = $request->user()->organization;
        $from = $org->plan;
        $org->update(['plan' => $data['plan']]);
        $billing->renew($org);
        AuditLog::record('billing.plan_changed', $org, ['from' => $from, 'to' => $data['plan']]);

        return $this->show($request, $billing);
    }

    /** Super admin: add credits to any organization (e.g. after an invoice is paid). */
    public function grant(Request $request, Organization $organization, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate(['credits' => 'required|integer|min:1|max:10000000', 'reason' => 'nullable|string|max:120']);
        $billing->grant($organization, $data['credits'], $data['reason'] ?? 'manual_top_up', $request->user());
        AuditLog::record('billing.credits_granted', $organization, $data);

        return response()->json(['credit_balance' => $organization->credit_balance]);
    }

    /** Super admin cost dashboard (spec §67). */
    public function costs(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $since = $request->date('since') ?? now()->startOfMonth();
        $usage = DB::table('usage_events')->where('usage_events.created_at', '>=', $since);
        $leads = Lead::withoutGlobalScopes()->where('created_at', '>=', $since);
        $total = (float) (clone $usage)->sum('cost_usd');
        $leadCount = (clone $leads)->count();
        $qualified = (clone $leads)->where('score', '>=', 75)->count();

        return response()->json([
            'since' => $since->toDateString(),
            'total_cost_usd' => round($total, 2),
            'by_kind' => (clone $usage)->selectRaw('kind, count(*) as units, sum(credits) as credits, round(sum(cost_usd)::numeric, 2) as cost_usd')->groupBy('kind')->get(),
            'by_organization' => (clone $usage)->join('organizations', 'organizations.id', '=', 'usage_events.organization_id')
                ->selectRaw('organizations.id, organizations.name, organizations.plan, round(sum(cost_usd)::numeric, 2) as cost_usd, sum(credits) as credits')
                ->groupBy('organizations.id', 'organizations.name', 'organizations.plan')->orderByDesc('cost_usd')->get(),
            'by_campaign' => (clone $usage)->whereNotNull('campaign_id')->join('campaigns', 'campaigns.id', '=', 'usage_events.campaign_id')
                ->selectRaw('campaigns.id, campaigns.name, round(sum(cost_usd)::numeric, 2) as cost_usd')
                ->groupBy('campaigns.id', 'campaigns.name')->orderByDesc('cost_usd')->limit(20)->get(),
            'leads' => $leadCount,
            'qualified_leads' => $qualified,
            'cost_per_lead' => $leadCount ? round($total / $leadCount, 4) : null,
            'cost_per_qualified_lead' => $qualified ? round($total / $qualified, 4) : null,
        ]);
    }
}
