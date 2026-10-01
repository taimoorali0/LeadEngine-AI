<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Sources\GooglePlacesSource;
use App\Services\Sources\LeadSourceInterface;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(LeadSourceInterface::class, GooglePlacesSource::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Every permission key is a Gate ability; super admins pass everything.
        Gate::before(fn (User $user, string $ability) => $user->isSuperAdmin() ?: ($user->hasPermission($ability) ?: null));

        RateLimiter::for('login', fn (Request $r) => Limit::perMinute(5)->by(strtolower((string) $r->input('email')).'|'.$r->ip()));
    }
}
