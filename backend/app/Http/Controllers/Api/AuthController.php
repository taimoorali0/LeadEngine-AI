<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! $user->is_active || ! Hash::check($data['password'], $user->password)) {
            AuditLog::record('auth.failed', null, ['email' => $data['email']], $user);
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        $user->forceFill(['last_login_at' => now(), 'last_login_ip' => $request->ip()])->save();
        AuditLog::record('auth.login', $user, [], $user);

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $this->profile($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->profile($request->user()));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        AuditLog::record('auth.logout');

        return response()->json(['ok' => true]);
    }

    private function profile(User $user): array
    {
        return $user->load('role:id,key,name', 'organization:id,name,slug')->toArray()
            + ['permissions' => $user->isSuperAdmin() ? ['*'] : $user->permissionKeys()];
    }
}
