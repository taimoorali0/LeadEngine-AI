<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BillingRequest;
use App\Models\Lead;
use App\Models\Organization;
use App\Services\Billing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class BillingController extends Controller
{
    public function show(Request $request, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->organization, 404, 'Platform administrators have no customer plan. Use the platform billing pages.');
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
            'requests' => BillingRequest::where('organization_id', $org->id)->latest()->limit(20)->get(),
        ]);
    }

    /**
     * Customer billing is request-based. Users cannot activate or switch plans directly.
     * They submit proof/reference and a platform super admin reviews it.
     */
    public function submitRequest(Request $request): JsonResponse
    {
        $this->authorize('billing.manage');
        $org = $request->user()->organization;
        abort_unless($org, 422, 'Organization account required.');

        $data = $request->validate([
            'type' => ['required', Rule::in(['upgrade', 'renewal', 'reactivation', 'credits'])],
            'requested_plan' => ['nullable', Rule::in(array_keys(config('plans.plans')))],
            'requested_credits' => 'nullable|integer|min:1|max:10000000',
            'amount' => 'nullable|numeric|min:0|max:999999999',
            'currency' => 'nullable|string|size:3',
            'payment_method' => 'nullable|string|max:80',
            'transaction_reference' => 'nullable|string|max:160',
            'payment_date' => 'nullable|date',
            'payment_proof' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:8192',
            'message' => 'nullable|string|max:2000',
            'months' => 'nullable|integer|in:1,3,6,12',
        ]);
        $data['months'] = in_array($data['type'], ['credits'], true) ? 1 : (int) ($data['months'] ?? 1);

        if ($data['type'] === 'upgrade' && empty($data['requested_plan'])) {
            return response()->json(['message' => 'Choose the requested plan.'], 422);
        }
        if ($data['type'] === 'credits' && empty($data['requested_credits'])) {
            return response()->json(['message' => 'Enter the number of credits requested.'], 422);
        }

        $proof = $request->file('payment_proof')?->store('billing-proofs', 'local');

        $billingRequest = BillingRequest::create([
            ...collect($data)->except('payment_proof')->all(),
            'organization_id' => $org->id,
            'requested_by' => $request->user()->id,
            'currency' => strtoupper($data['currency'] ?? 'PKR'),
            'payment_proof_path' => $proof,
            'status' => 'pending',
        ]);

        AuditLog::record('billing.request_submitted', $billingRequest, [
            'organization_id' => $org->id,
            'type' => $billingRequest->type,
        ]);

        return response()->json($billingRequest, 201);
    }

    /** Super admin queue. */
    public function requests(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        $query = BillingRequest::with(['organization:id,name,plan,credit_balance', 'requester:id,name,email', 'reviewer:id,name'])
            ->latest();

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        return response()->json($query->paginate(50));
    }

    public function proof(Request $request, BillingRequest $billingRequest)
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        abort_unless($billingRequest->payment_proof_path && Storage::disk('local')->exists($billingRequest->payment_proof_path), 404);

        return Storage::disk('local')->download($billingRequest->payment_proof_path);
    }

    /** Super admin review + entitlement activation. */
    public function review(Request $request, BillingRequest $billingRequest, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        abort_if(in_array($billingRequest->status, ['approved', 'rejected'], true), 409, 'Request already finalized.');

        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'needs_info'])],
            'admin_note' => 'nullable|string|max:2000',
        ]);

        DB::transaction(function () use ($billingRequest, $billing, $request, $data) {
            $org = Organization::lockForUpdate()->findOrFail($billingRequest->organization_id);

            if ($data['status'] === 'approved') {
                if ($billingRequest->type === 'upgrade' && $billingRequest->requested_plan) {
                    $org->update(['plan' => $billingRequest->requested_plan]);
                    $billing->activate($org, $billingRequest->months ?: 1);
                } elseif (in_array($billingRequest->type, ['renewal', 'reactivation'], true)) {
                    $billing->activate($org, $billingRequest->months ?: 1);
                } elseif ($billingRequest->type === 'credits' && $billingRequest->requested_credits) {
                    $billing->grant($org, $billingRequest->requested_credits, 'approved_credit_request', $request->user());
                }
            }

            $billingRequest->update([
                'status' => $data['status'],
                'admin_note' => $data['admin_note'] ?? null,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);
        });

        AuditLog::record('billing.request_reviewed', $billingRequest, [
            'status' => $data['status'],
            'admin_note' => $data['admin_note'] ?? null,
        ]);

        return response()->json($billingRequest->fresh(['organization', 'requester', 'reviewer']));
    }

    /**
     * Legacy direct plan switch is restricted to the platform super admin.
     * Customer-facing UI must use submitRequest().
     */
    public function changePlan(Request $request, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate([
            'organization_id' => 'required|integer|exists:organizations,id',
            'plan' => ['required', Rule::in(array_keys(config('plans.plans')))],
        ]);

        $org = Organization::findOrFail($data['organization_id']);
        $from = $org->plan;
        $org->update(['plan' => $data['plan']]);
        $billing->renew($org);
        AuditLog::record('billing.plan_changed', $org, ['from' => $from, 'to' => $data['plan']]);

        return response()->json(['organization' => $org->fresh(), 'plan' => $billing->plan($org)]);
    }

    /** Super admin: add credits to any organization. */
    public function grant(Request $request, Organization $organization, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate(['credits' => 'required|integer|min:1|max:10000000', 'reason' => 'nullable|string|max:120']);
        $billing->grant($organization, $data['credits'], $data['reason'] ?? 'manual_top_up', $request->user());
        AuditLog::record('billing.credits_granted', $organization, $data);

        return response()->json(['credit_balance' => $organization->credit_balance]);
    }

    /** Super admin cost dashboard. */
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
