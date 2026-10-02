<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Services\Billing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PlatformController extends Controller
{
    public function organizations(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        $ownerRole = Role::where('key', 'owner')->value('id');
        $q = Organization::query()->withCount(['users' => fn ($u) => $u->where('is_active', true)])
            ->with(['users' => fn ($u) => $u->where('role_id', $ownerRole)->select('id', 'organization_id', 'name', 'email')])
            ->latest();
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

    /** Super admin onboards a customer: creates the company account and its owner login. */
    public function storeOrganization(Request $request, Billing $billing): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'plan' => ['required', Rule::in(array_keys(config('plans.plans')))],
            'access' => ['required', Rule::in(['trial', 'paid'])],
            'months' => 'required_if:access,paid|nullable|integer|in:1,3,6,12',
            'trial_days' => 'nullable|integer|between:1,90',
            'owner_name' => 'required|string|max:255',
            'owner_email' => 'required|email|max:255|unique:users,email',
            'owner_password' => 'required|string|min:10|max:255',
        ]);

        $org = DB::transaction(function () use ($data, $billing) {
            $base = Str::slug($data['name']) ?: 'company';
            $slug = $base;
            for ($i = 2; Organization::where('slug', $slug)->exists(); $i++) {
                $slug = "{$base}-{$i}";
            }
            $org = Organization::create(['name' => $data['name'], 'slug' => $slug, 'plan' => $data['plan']]);
            if ($data['access'] === 'paid') {
                $billing->activate($org, (int) $data['months']);
            } else {
                $org->forceFill(['subscription_status' => 'trialing', 'plan_renews_at' => now()->addDays((int) ($data['trial_days'] ?? 14))])->save();
                $billing->refillCredits($org);
            }
            User::create([
                'organization_id' => $org->id,
                'role_id' => Role::where('key', 'owner')->value('id'),
                'name' => $data['owner_name'],
                'email' => strtolower($data['owner_email']),
                'password' => $data['owner_password'],
            ]);

            return $org;
        });

        AuditLog::record('platform.organization_created', $org, ['plan' => $org->plan, 'access' => $data['access']]);

        return response()->json($org->fresh()->loadCount('users'), 201);
    }

    public const PAYMENT_FIELDS = ['bank_name', 'account_title', 'account_number', 'iban', 'wallets', 'instructions', 'currency', 'prices'];

    /** Where customers send payment, and plan prices in the local currency. Shown on every customer's billing page. */
    public static function paymentInfo(): array
    {
        $stored = DB::table('platform_settings')->where('key', 'payment_info')->value('value');
        $info = $stored ? json_decode($stored, true) : [];

        return array_merge(array_fill_keys(self::PAYMENT_FIELDS, null), ['currency' => 'PKR', 'prices' => []], $info ?: []);
    }

    public function showPaymentInfo(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        return response()->json(self::paymentInfo());
    }

    public function updatePaymentInfo(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        $data = $request->validate([
            'bank_name' => 'nullable|string|max:120',
            'account_title' => 'nullable|string|max:120',
            'account_number' => 'nullable|string|max:60',
            'iban' => 'nullable|string|max:60',
            'wallets' => 'nullable|string|max:500',
            'instructions' => 'nullable|string|max:2000',
            'currency' => 'required|string|size:3',
            'prices' => 'nullable|array',
            'prices.*' => 'nullable|numeric|min:0|max:999999999',
        ]);
        $data['currency'] = strtoupper($data['currency']);
        $data['prices'] = array_intersect_key($data['prices'] ?? [], config('plans.plans'));
        DB::table('platform_settings')->updateOrInsert(['key' => 'payment_info'], ['value' => json_encode($data), 'updated_at' => now(), 'created_at' => now()]);
        AuditLog::record('platform.payment_info_updated', null, []);

        return response()->json(self::paymentInfo());
    }

    /** Super admin sets a new password for a customer's user (e.g. owner forgot it). */
    public function resetUserPassword(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        abort_if($user->isSuperAdmin(), 403);
        $data = $request->validate(['password' => 'required|string|min:10|max:255']);
        $user->forceFill(['password' => $data['password'], 'two_factor_secret' => null, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null])->save();
        $user->tokens()->delete();
        AuditLog::record('platform.user_password_reset', $user);

        return response()->json(['ok' => true]);
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
