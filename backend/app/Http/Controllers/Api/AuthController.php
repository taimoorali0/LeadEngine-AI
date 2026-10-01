<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\TwoFactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Throwable;

class AuthController extends Controller
{
    private const CHALLENGE_TTL = 300;

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! $user->is_active || ! Hash::check($data['password'], $user->password)) {
            AuditLog::record('auth.failed', null, ['email' => $data['email']], $user);
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        if ($user->two_factor_enabled) {
            // Password was right; a second step is required before a token is issued.
            return response()->json([
                'two_factor_required' => true,
                'challenge' => Crypt::encryptString(json_encode(['uid' => $user->id, 'exp' => time() + self::CHALLENGE_TTL])),
            ]);
        }

        return $this->issueToken($request, $user);
    }

    public function twoFactorChallenge(Request $request, TwoFactor $tf): JsonResponse
    {
        $data = $request->validate(['challenge' => 'required|string', 'code' => 'nullable|string', 'recovery_code' => 'nullable|string']);
        try {
            $payload = json_decode(Crypt::decryptString($data['challenge']), true);
        } catch (Throwable) {
            $payload = null;
        }
        $user = ($payload && $payload['exp'] >= time()) ? User::find($payload['uid']) : null;
        if (! $user || ! $user->is_active) {
            throw ValidationException::withMessages(['code' => 'The sign-in attempt expired. Sign in again.']);
        }
        if (! $tf->check($user, $data['code'] ?? null, $data['recovery_code'] ?? null)) {
            AuditLog::record('auth.2fa_failed', $user, [], $user);
            throw ValidationException::withMessages(['code' => 'Invalid authentication code.']);
        }

        return $this->issueToken($request, $user);
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

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'locale' => 'sometimes|in:en,ur,ar',
            'current_password' => 'required_with:password|current_password:sanctum',
            'password' => 'sometimes|string|min:10|confirmed',
        ]);
        unset($data['current_password']);
        $user->update($data);
        if (isset($data['password'])) {
            // Sign out every other session after a password change.
            $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();
            AuditLog::record('auth.password_changed', $user);
        }

        return response()->json($this->profile($user));
    }

    /** Step 1: create a secret and QR code; not active until confirmed. */
    public function twoFactorSetup(Request $request, TwoFactor $tf): JsonResponse
    {
        $user = $request->user();
        abort_if($user->two_factor_enabled, 409, 'Two-factor authentication is already enabled.');
        $secret = $tf->generateSecret();
        $user->forceFill(['two_factor_secret' => $secret])->save();

        return response()->json(['secret' => $secret, 'qr_svg' => $tf->qrSvg($user, $secret)]);
    }

    /** Step 2: confirm with a code from the authenticator app. */
    public function twoFactorConfirm(Request $request, TwoFactor $tf): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string']);
        $user = $request->user();
        if (! $user->two_factor_secret || ! $tf->verify($user->two_factor_secret, $data['code'])) {
            throw ValidationException::withMessages(['code' => 'Invalid authentication code.']);
        }
        $codes = $tf->recoveryCodes();
        $user->forceFill(['two_factor_confirmed_at' => now(), 'two_factor_recovery_codes' => $codes])->save();
        AuditLog::record('auth.2fa_enabled', $user);

        return response()->json(['recovery_codes' => $codes]);
    }

    public function twoFactorDisable(Request $request): JsonResponse
    {
        $request->validate(['password' => 'required|current_password:sanctum']);
        $request->user()->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null])->save();
        AuditLog::record('auth.2fa_disabled', $request->user());

        return response()->json(['ok' => true]);
    }

    private function issueToken(Request $request, User $user): JsonResponse
    {
        $user->forceFill(['last_login_at' => now(), 'last_login_ip' => $request->ip()])->save();
        AuditLog::record('auth.login', $user, [], $user);

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $this->profile($user),
        ]);
    }

    private function profile(User $user): array
    {
        return $user->load('role:id,key,name', 'organization:id,name,slug,plan,credit_balance,plan_renews_at,subscription_status,suspension_reason')->toArray()
            + ['permissions' => $user->isSuperAdmin() ? ['*'] : $user->permissionKeys()];
    }
}
