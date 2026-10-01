<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Billing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Team member management for an organization (spec §5). */
class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = User::where('organization_id', $request->user()->organization_id)->with('role:id,key,name', 'teams:id,name')->orderBy('name');
        if (! $request->user()->can('users.manage')) {
            $q->where('is_active', true)->select(['id', 'name', 'email', 'role_id']);
        }

        return response()->json($q->get());
    }

    public function roles(): JsonResponse
    {
        return response()->json(Role::where('key', '!=', 'super_admin')->with('permissions:id,key')->orderBy('id')->get());
    }

    public function store(Request $request, Billing $billing): JsonResponse
    {
        $this->authorize('users.manage');
        $org = $request->user()->organization;
        abort_if(! $billing->canAddUser($org), 422, 'Your plan’s user limit has been reached.');
        $data = $this->validated($request);
        $user = User::create($data + ['organization_id' => $org->id]);
        AuditLog::record('user.created', $user, ['role' => $user->role->key]);

        return response()->json($user->load('role:id,key,name'), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorize('users.manage');
        $this->sameOrg($request, $user);
        $data = $this->validated($request, $user);
        abort_if($user->is($request->user()) && (($data['is_active'] ?? true) === false), 422, 'You cannot deactivate yourself.');
        $before = $user->only(['role_id', 'is_active']);
        $user->update(array_filter($data, fn ($v) => $v !== null));
        if (($data['is_active'] ?? true) === false) {
            $user->tokens()->delete();
        }
        if ($before !== $user->only(['role_id', 'is_active'])) {
            AuditLog::record('user.permissions_changed', $user, ['before' => $before, 'after' => $user->only(['role_id', 'is_active'])]);
        }

        return response()->json($user->load('role:id,key,name'));
    }

    public function resetTwoFactor(Request $request, User $user): JsonResponse
    {
        $this->authorize('users.manage');
        $this->sameOrg($request, $user);
        $user->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null])->save();
        AuditLog::record('user.2fa_reset', $user);

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $req = $user ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "$req|string|max:120",
            'email' => [$req, 'email', Rule::unique('users', 'email')->ignore($user?->id)],
            'password' => ($user ? 'nullable' : 'required').'|string|min:10',
            'role_id' => [$req, Rule::exists('roles', 'id')->whereNot('key', 'super_admin')],
            'daily_lead_limit' => 'nullable|integer|min:1|max:10000',
            'is_active' => 'sometimes|boolean',
            'locale' => 'sometimes|in:en,ur,ar',
        ]);
    }

    private function sameOrg(Request $request, User $user): void
    {
        abort_if($user->organization_id !== $request->user()->organization_id, 404);
    }
}
