<?php

use App\Jobs\RunCampaign;
use App\Models\Campaign;
use App\Models\FollowUp;
use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use App\Notifications\AppNotification;
use App\Services\Billing;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Spec §61: remind agents shortly before a follow-up is due.
Artisan::command('followups:remind', function () {
    $due = FollowUp::whereNull('completed_at')->whereNull('reminded_at')->whereNotNull('user_id')
        ->where('due_at', '<=', now()->addMinutes(15))->with('user', 'lead.company')->limit(500)->get();
    foreach ($due as $f) {
        $f->user?->notify(new AppNotification('follow_up_due', ucfirst($f->type).' due: '.$f->lead?->company?->name_en,
            $f->notes, "/leads/{$f->lead_id}", ['follow_up_id' => $f->id, 'due_at' => $f->due_at->toIso8601String()]));
        $f->update(['reminded_at' => now()]);
    }
    $this->info("Reminded {$due->count()} follow-ups.");
})->purpose('Notify agents about follow-ups due within 15 minutes');

// Spec §32 / Phase 6: scheduled campaign refresh to detect new businesses.
Artisan::command('campaigns:refresh', function (Billing $billing) {
    $campaigns = Campaign::withoutGlobalScopes()->whereNotNull('refresh_interval_days')
        ->where('next_refresh_at', '<=', now())->whereNotIn('status', ['queued', 'running'])->get();
    foreach ($campaigns as $c) {
        if (! $billing->canRunCampaign($c->organization, $c) || $c->organization->credit_balance < 1) {
            $c->update(['next_refresh_at' => now()->addDay()]);  // try again tomorrow

            continue;
        }
        $c->update(['status' => 'queued', 'next_refresh_at' => null]);
        RunCampaign::dispatch($c);
    }
    $this->info("Queued {$campaigns->count()} campaign refreshes.");
})->purpose('Re-run campaigns whose refresh interval has elapsed');

Artisan::command('subscriptions:expire', function () {
    $orgs = Organization::whereIn('subscription_status', ['active', 'trialing'])
        ->whereNotNull('plan_renews_at')->where('plan_renews_at', '<=', now())->get();
    foreach ($orgs as $org) {
        $org->update(['subscription_status' => 'expired']);
    }
    $this->info("Expired {$orgs->count()} organizations awaiting manual renewal approval.");
})->purpose('Expire subscriptions when their approved period ends');

// Monthly credit allowance for organizations whose paid period is still running.
Artisan::command('credits:refill', function (Billing $billing) {
    $orgs = Organization::whereIn('subscription_status', ['active', 'trialing'])
        ->where('plan_renews_at', '>', now())
        ->where(fn ($q) => $q->whereNull('credits_renew_at')->orWhere('credits_renew_at', '<=', now()))->get();
    $orgs->each(fn (Organization $o) => $billing->refillCredits($o));
    $this->info("Refilled credits for {$orgs->count()} organizations.");
})->purpose('Grant the monthly credit allowance during an active subscription');

Artisan::command('platform:create-admin {email?}', function (?string $email = null) {
    $email ??= $this->ask('Super Admin email');
    $name = $this->ask('Name', 'Platform Administrator');
    $password = $this->secret('Password (minimum 10 characters)');
    if (! $email || ! $password || mb_strlen($password) < 10) {
        $this->error('A valid email and password of at least 10 characters are required.');

        return 1;
    }

    $roleId = Role::where('key', 'super_admin')->value('id');
    if (! $roleId) {
        $this->error('Super Admin role is missing. Run migrations/seed first.');

        return 1;
    }

    $user = User::updateOrCreate(
        ['email' => $email],
        ['organization_id' => null, 'role_id' => $roleId, 'name' => $name, 'password' => $password, 'is_active' => true]
    );
    $this->info("Super Admin ready: {$user->email}");

    return 0;
})->purpose('Create or reset the platform Super Admin account');

Schedule::command('followups:remind')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('campaigns:refresh')->hourly()->withoutOverlapping();
Schedule::command('subscriptions:expire')->dailyAt('00:30');
Schedule::command('credits:refill')->dailyAt('00:45');
