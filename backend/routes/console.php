<?php

use App\Jobs\RunCampaign;
use App\Models\Campaign;
use App\Models\FollowUp;
use App\Models\Organization;
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

Artisan::command('billing:renew', function (Billing $billing) {
    $orgs = Organization::where(fn ($q) => $q->whereNull('plan_renews_at')->orWhere('plan_renews_at', '<=', now()))->get();
    $orgs->each(fn (Organization $o) => $billing->renew($o));
    $this->info("Renewed {$orgs->count()} organizations.");
})->purpose('Grant monthly plan credits');

Schedule::command('followups:remind')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('campaigns:refresh')->hourly()->withoutOverlapping();
Schedule::command('billing:renew')->dailyAt('00:30');
