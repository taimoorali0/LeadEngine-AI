<?php

namespace App\Services;

use App\Http\Controllers\Api\SettingsController;
use App\Models\Lead;
use App\Models\Location;
use App\Models\User;
use App\Notifications\AppNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Manual and automatic lead assignment (spec §28). */
class LeadAssigner
{
    public function assign(Lead $lead, ?User $to, ?User $by = null, string $reason = 'manual'): Lead
    {
        $from = $lead->assigned_to;
        if ($from === $to?->id) {
            return $lead;
        }
        $data = ['assigned_to' => $to?->id];
        if ($to && $lead->status === 'new') {
            $data['status'] = 'assigned';
        }
        $lead->update($data);
        $lead->log('assigned', null, ['from' => $from, 'to' => $to?->id, 'reason' => $reason], $by);
        if (isset($data['status'])) {
            $lead->log('status_changed', null, ['from' => 'new', 'to' => 'assigned'], $by);
        }

        $company = $lead->company?->name_en ?? 'a lead';
        $to?->notify(new AppNotification('lead_assigned', "New lead assigned: {$company}", null, "/leads/{$lead->id}", ['lead_id' => $lead->id]));
        if ($from && $from !== $to?->id) {
            User::find($from)?->notify(new AppNotification('lead_reassigned', "{$company} was reassigned", null, "/leads/{$lead->id}", ['lead_id' => $lead->id]));
        }

        return $lead;
    }

    /** Applies the organization's assignment settings to an unassigned lead. */
    public function autoAssign(Lead $lead, ?array $onlyUserIds = null, bool $force = false): ?User
    {
        $cfg = SettingsController::for($lead->organization)['assignment'];
        if ($lead->assigned_to || (! $force && (! $cfg['enabled'] || ($lead->score ?? 0) < $cfg['min_score']))) {
            return null;
        }

        return DB::transaction(function () use ($lead, $cfg, $onlyUserIds) {
            // Serialize assignment per organization so concurrent workers do not pick the same agent.
            DB::select('select pg_advisory_xact_lock(?)', [crc32('assign:'.$lead->organization_id)]);
            $candidates = $this->candidates($lead, $cfg, $onlyUserIds);
            $user = match ($cfg['method']) {
                'weighted' => $this->weighted($candidates, $cfg['weights'] ?? []),
                default => $this->roundRobin($candidates),
            };
            if ($user) {
                $this->assign($lead, $user, null, 'auto:'.$cfg['method']);
            }

            return $user;
        });
    }

    private function candidates(Lead $lead, array $cfg, ?array $onlyUserIds): Collection
    {
        $users = User::where('organization_id', $lead->organization_id)->where('is_active', true)
            ->when($onlyUserIds !== null, fn ($q) => $q->whereIn('id', $onlyUserIds))
            ->when($onlyUserIds === null, fn ($q) => $q->whereHas('role', fn ($r) => $r->whereIn('key', $cfg['role_keys'])))
            ->get();

        if ($onlyUserIds === null && $cfg['method'] === 'territory') {
            $users = $users->whereIn('id', $this->territoryUserIds($lead, $cfg['territories'] ?? []));
        }

        $today = $this->assignedToday($users->pluck('id'));

        return $users->filter(fn (User $u) => ! $u->daily_lead_limit || ($today[$u->id] ?? 0) < $u->daily_lead_limit)
            ->each(fn (User $u) => $u->setAttribute('assigned_today', $today[$u->id] ?? 0))
            ->values();
    }

    /** Territories: [{user_ids:[], location_ids:[], industry_ids:[]}]; empty lists match anything. */
    private function territoryUserIds(Lead $lead, array $territories): array
    {
        $company = $lead->company;
        $locations = [];
        for ($l = $company->location_id ? Location::find($company->location_id) : null; $l; $l = $l->parent) {
            $locations[] = $l->id;
        }
        $ids = [];
        foreach ($territories as $t) {
            $locOk = empty($t['location_ids']) || array_intersect($t['location_ids'], $locations);
            $indOk = empty($t['industry_ids']) || in_array($company->industry_id, $t['industry_ids'], true);
            if ($locOk && $indOk) {
                $ids = [...$ids, ...($t['user_ids'] ?? [])];
            }
        }

        return array_unique($ids);
    }

    private function assignedToday(Collection $userIds): array
    {
        return DB::table('leads')->whereIn('assigned_to', $userIds)
            ->whereIn('id', fn ($q) => $q->select('lead_id')->from('lead_activities')->where('type', 'assigned')->where('created_at', '>=', today()))
            ->selectRaw('assigned_to, count(*) as n')->groupBy('assigned_to')->pluck('n', 'assigned_to')->all();
    }

    /** The candidate whose last assignment is oldest (never-assigned first). */
    private function roundRobin(Collection $candidates): ?User
    {
        if ($candidates->isEmpty()) {
            return null;
        }
        $last = DB::table('lead_activities')->where('type', 'assigned')
            ->whereIn(DB::raw("(meta->>'to')::bigint"), $candidates->pluck('id'))
            ->selectRaw("(meta->>'to')::bigint as uid, max(created_at) as at")->groupBy('uid')->pluck('at', 'uid');

        return $candidates->sortBy(fn (User $u) => [$last[$u->id] ?? '0000', $u->id])->first();
    }

    /** Lowest assigned_today / weight wins; weights default to 1. */
    private function weighted(Collection $candidates, array $weights): ?User
    {
        return $candidates->sortBy(fn (User $u) => [$u->assigned_today / max(0.1, (float) ($weights[$u->id] ?? 1)), $u->id])->first();
    }
}
