<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Organization;
use App\Services\Billing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PlatformController extends Controller
{
    public function organizations(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        $q = Organization::query()->withCount(['users' => fn ($u) => $u->where('is_active', true)])->latest();
        if ($request->filled('q')) {
            $term = $request->string('q')->trim()->toString();
            $q->where(fn ($x) => $x->where('name', 'ilike', "%{$term}%")->orWhere('slug', 'ilike', "%{$term}%"));
        }
        if ($request->filled('status')) {
            $q->where('subscription_status', $request->string('status')->toString());
        }
        if ($request->filled('plan')) {
            $q->where('plan', $request->string('plan')->toString());
        }

        return response()->json($q->paginate(50));
    }

    public function updateOrganization(Request $request, Organization $organization, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate([
            'subscription_status' => ['sometimes', Rule::in(['trialing', 'active', 'past_due', 'expired', 'suspended'])],
            'suspension_reason' => 'nullable|string|max:1000',
            'plan' => ['sometimes', Rule::in(array_keys(config('plans.plans')))],
            'credit_adjustment' => 'nullable|integer|between:-10000000,10000000',
            'plan_renews_at' => 'nullable|date',
        ]);

        $before = $organization->only(['plan', 'subscription_status', 'credit_balance', 'plan_renews_at']);
        if (isset($data['plan'])) {
            $organization->plan = $data['plan'];
        }
        if (isset($data['subscription_status'])) {
            $organization->subscription_status = $data['subscription_status'];
            $organization->suspended_at = $data['subscription_status'] === 'suspended' ? now() : null;
        }
        if (array_key_exists('suspension_reason', $data)) {
            $organization->suspension_reason = $data['suspension_reason'];
        }
        if (array_key_exists('plan_renews_at', $data)) {
            $organization->plan_renews_at = $data['plan_renews_at'];
        }
        $organization->save();

        $adjust = (int) ($data['credit_adjustment'] ?? 0);
        if ($adjust > 0) {
            $billing->grant($organization, $adjust, 'super_admin_adjustment', $request->user());
        } elseif ($adjust < 0) {
            $deduct = min(abs($adjust), max(0, $organization->fresh()->credit_balance));
            if ($deduct) {
                \DB::table('organizations')->where('id', $organization->id)->decrement('credit_balance', $deduct);
                $balance = \DB::table('organizations')->where('id', $organization->id)->value('credit_balance');
                \DB::table('credit_transactions')->insert([
                    'organization_id' => $organization->id, 'amount' => -$deduct, 'reason' => 'super_admin_adjustment',
                    'balance_after' => $balance, 'user_id' => $request->user()->id, 'created_at' => now(),
                ]);
            }
        }

        AuditLog::record('platform.organization_updated', $organization, ['before' => $before, 'after' => $organization->fresh()->only(['plan', 'subscription_status', 'credit_balance', 'plan_renews_at'])]);

        return response()->json($organization->fresh()->loadCount('users'));
    }
}
