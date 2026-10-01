<?php

namespace App\Services;

use App\Models\User;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

/** TOTP two-factor authentication (spec §53). */
class TwoFactor
{
    public function __construct(private readonly Google2FA $g2fa = new Google2FA) {}

    public function generateSecret(): string
    {
        return $this->g2fa->generateSecretKey(32);
    }

    public function qrSvg(User $user, string $secret): string
    {
        $url = $this->g2fa->getQRCodeUrl(config('app.name'), $user->email, $secret);

        return (new Writer(new ImageRenderer(new RendererStyle(192), new SvgImageBackEnd)))->writeString($url);
    }

    public function verify(string $secret, string $code): bool
    {
        return $this->g2fa->verifyKey($secret, preg_replace('/\s+/', '', $code), 1);
    }

    /** @return list<string> */
    public function recoveryCodes(): array
    {
        return collect(range(1, 8))->map(fn () => Str::lower(Str::random(5).'-'.Str::random(5)))->all();
    }

    /** Accepts a TOTP code or consumes a one-time recovery code. */
    public function check(User $user, ?string $code, ?string $recovery): bool
    {
        if ($code && $user->two_factor_secret && $this->verify($user->two_factor_secret, $code)) {
            return true;
        }
        $codes = $user->two_factor_recovery_codes ?? [];
        if ($recovery && in_array(Str::lower(trim($recovery)), $codes, true)) {
            $user->forceFill(['two_factor_recovery_codes' => array_values(array_diff($codes, [Str::lower(trim($recovery))]))])->save();

            return true;
        }

        return false;
    }
}
