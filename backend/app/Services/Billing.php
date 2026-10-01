<?php

namespace App\Services;

use App\Models\Campaign;
use App\Models\Organization;
use App\Models\UsageEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Plans, limits and usage credits (spec §65-67). */
class Billing
{
    public function plan(Organization $org): array
    {
        return config("plans.plans.{$org->plan}") ?? config('plans.plans.starter');
    }

    public function hasFeature(Organization $org, string $feature): bool
    {
        return in_array($feature, $this->plan($org)['features'], true);
    }

    public function isOperational(Organization $org): bool
    {
        return in_array($org->subscription_status ?? 'active', ['trialing', 'active'], true);
    }

    public function assertOperational(Organization $org): void
    {
        abort_unless($this->isOperational($org), 402, 'Your subscription is not active. Submit a renewal or reactivation request.');
    }

    public function canAddUser(Organization $org): bool
    {
        if (! $this->isOperational($org)) {
            return false;
        }
        $limit = $this->plan($org)['users'];

        return $limit === null || $org->users()->where('is_active', true)->count() < $limit;
    }

    public function canRunCampaign(Organization $org, ?Campaign $except = null): bool
    {
        if (! $this->isOperational($org)) {
            return false;
        }

        $limit = $this->plan($org)['active_campaigns'];
        $active = Campaign::withoutGlobalScopes()->where('organization_id', $org->id)
            ->whereIn('status', ['queued', 'running'])->when($except, fn ($q) => $q->whereKeyNot($except->id))->count();

        return $limit === null || $active < $limit;
    }

    public function cost(string $kind): array
    {
        return config("plans.costs.$kind") ?? ['credits' => 1, 'usd' => 0];
    }

    /** Atomically deducts credits and records usage; throws when the balance is too low. */
    public function charge(int $orgId, string $kind, ?int $campaignId = null, int $units = 1): void
    {
        $cost = $this->cost($kind);
        $credits = $cost['credits'] * $units;
        DB::transaction(function () use ($orgId, $kind, $campaignId, $units, $cost, $credits) {
            $balance = DB::table('organizations')->where('id', $orgId)->where('credit_balance', '>=', $credits)
                ->decrementEach(['credit_balance' => $credits]) ? DB::table('organizations')->where('id', $orgId)->value('credit_balance') : null;
            if ($balance === null) {
                throw new InsufficientCredits('Not enough credits. Top up or upgrade your plan.');
            }
            UsageEvent::create(['organization_id' => $orgId, 'campaign_id' => $campaignId, 'kind' => $kind,
                'credits' => $credits, 'cost_usd' => $cost['usd'] * $units]);
            DB::table('credit_transactions')->insert(['organization_id' => $orgId, 'amount' => -$credits,
                'reason' => $kind, 'balance_after' => $balance, 'created_at' => now()]);
        });
    }

    public function grant(Organization $org, int $credits, string $reason, ?User $by = null): void
    {
        DB::transaction(function () use ($org, $credits, $reason, $by) {
            DB::table('organizations')->where('id', $org->id)->increment('credit_balance', $credits);
            $balance = DB::table('organizations')->where('id', $org->id)->value('credit_balance');
            DB::table('credit_transactions')->insert(['organization_id' => $org->id, 'amount' => $credits, 'reason' => $reason,
                'balance_after' => $balance, 'user_id' => $by?->id, 'created_at' => now()]);
            $org->credit_balance = $balance;
        });
    }

    /** Monthly renewal: top the balance up to the plan allowance (unused credits do not stack). */
    public function renew(Organization $org): void
    {
        $allowance = $this->plan($org)['monthly_credits'];
        $org->refresh();
        if ($org->credit_balance < $allowance) {
            $this->grant($org, $allowance - $org->credit_balance, 'monthly_renewal');
        }
        $org->forceFill(['plan_renews_at' => now()->addMonth(), 'subscription_status' => 'active', 'suspended_at' => null, 'suspension_reason' => null])->save();
    }
}
