<?php

namespace App\Services;

use App\Jobs\EnrichCompany;
use App\Models\AutomationRule;
use App\Models\Lead;
use App\Models\Team;
use App\Models\User;
use App\Notifications\AppNotification;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * WHEN <trigger> AND <conditions> THEN <actions> (spec §62).
 * lead_created / lead_scored rules run at most once per lead; status_changed
 * rules run on every matching change. Nested triggers are capped at depth 3.
 */
class AutomationEngine
{
    private int $depth = 0;

    public function __construct(private readonly LeadAssigner $assigner) {}

    /** Called once a newly discovered lead has its first score. */
    public function leadReady(Lead $lead): void
    {
        $this->fire('lead_created', $lead);
        $this->fire('lead_scored', $lead);
        $this->assigner->autoAssign($lead->fresh());
    }

    public function fire(string $trigger, Lead $lead, array $context = []): void
    {
        if ($this->depth >= 3) {
            return;
        }
        $this->depth++;
        try {
            $rules = AutomationRule::withoutGlobalScopes()->where('organization_id', $lead->organization_id)
                ->where('trigger', $trigger)->where('enabled', true)->orderBy('priority')->orderBy('id')->get();
            foreach ($rules as $rule) {
                $lead->refresh();
                if ($trigger !== 'status_changed' && $this->alreadyRan($rule, $lead)) {
                    continue;
                }
                if (! $this->matches($rule->conditions, $this->facts($lead, $context))) {
                    continue;
                }
                $lead->log('automation', $rule->name, ['rule_id' => $rule->id, 'trigger' => $trigger]);
                $rule->increment('runs');
                foreach ($rule->actions as $action) {
                    try {
                        $this->run($action, $lead, $rule);
                    } catch (Throwable $e) {
                        Log::warning('Automation action failed', ['rule' => $rule->id, 'lead' => $lead->id, 'error' => $e->getMessage()]);
                    }
                }
            }
        } finally {
            $this->depth--;
        }
    }

    public function facts(Lead $lead, array $context = []): array
    {
        $c = $lead->company()->withCount(['phones', 'emails'])->first();

        return [
            'score' => $lead->score,
            'quality' => $lead->quality,
            'status' => $lead->status,
            'previous_status' => $context['previous_status'] ?? null,
            'has_phone' => $c->phones_count > 0,
            'has_email' => $c->emails_count > 0,
            'has_website' => (bool) $c->website,
            'industry_id' => $c->industry_id,
            'location_id' => $c->location_id,
            'campaign_id' => $lead->campaign_id,
            'assigned' => $lead->assigned_to !== null,
        ];
    }

    /** @param list<array{field:string,op:string,value?:mixed}> $conditions all must match */
    public function matches(array $conditions, array $facts): bool
    {
        foreach ($conditions as $c) {
            $actual = $facts[$c['field']] ?? null;
            $want = $c['value'] ?? null;
            $ok = match ($c['op']) {
                'eq' => $actual == $want,
                'neq' => $actual != $want,
                'gt' => $actual !== null && $actual > $want,
                'gte' => $actual !== null && $actual >= $want,
                'lt' => $actual !== null && $actual < $want,
                'lte' => $actual !== null && $actual <= $want,
                'in' => in_array($actual, (array) $want, false),
                'empty' => $actual === null || $actual === false || $actual === '',
                'not_empty' => ! ($actual === null || $actual === false || $actual === ''),
                default => false,
            };
            if (! $ok) {
                return false;
            }
        }

        return true;
    }

    private function alreadyRan(AutomationRule $rule, Lead $lead): bool
    {
        return $lead->activities()->where('type', 'automation')->where('meta->rule_id', $rule->id)->exists();
    }

    private function run(array $action, Lead $lead, AutomationRule $rule): void
    {
        $p = $action['params'] ?? [];
        switch ($action['type']) {
            case 'assign_user':
                $user = User::where('organization_id', $lead->organization_id)->where('is_active', true)->find($p['user_id'] ?? 0);
                $user && $this->assigner->assign($lead, $user, null, "rule:{$rule->id}");
                break;
            case 'assign_team':
                $team = Team::withoutGlobalScopes()->where('organization_id', $lead->organization_id)->find($p['team_id'] ?? 0);
                $team && $this->assigner->autoAssign($lead, $team->members()->pluck('users.id')->all(), true);
                break;
            case 'assign_auto':
                $this->assigner->autoAssign($lead, null, true);
                break;
            case 'set_status':
                $from = $lead->status;
                if (in_array($p['status'] ?? null, Lead::statuses(), true) && $from !== $p['status']) {
                    $lead->update(['status' => $p['status']]);
                    $lead->log('status_changed', null, ['from' => $from, 'to' => $p['status'], 'rule_id' => $rule->id]);
                    $this->fire('status_changed', $lead, ['previous_status' => $from]);
                }
                break;
            case 'create_follow_up':
                $lead->followUps()->create([
                    'user_id' => $lead->assigned_to,
                    'due_at' => now()->addDays((int) ($p['days'] ?? 1))->setTime(10, 0),
                    'type' => in_array($p['type'] ?? '', ['call', 'email', 'meeting', 'whatsapp', 'task'], true) ? $p['type'] : 'call',
                    'priority' => $p['priority'] ?? 'normal',
                    'notes' => $p['notes'] ?? "Created by rule: {$rule->name}",
                ]);
                $lead->update(['next_follow_up_at' => $lead->followUps()->whereNull('completed_at')->min('due_at')]);
                break;
            case 'enrich':
                $lead->company->website && EnrichCompany::dispatch($lead->company);
                break;
            case 'notify':
                $users = User::where('organization_id', $lead->organization_id)->where('is_active', true)
                    ->when(isset($p['user_id']), fn ($q) => $q->whereKey($p['user_id']))
                    ->when(isset($p['role_key']), fn ($q) => $q->whereHas('role', fn ($r) => $r->where('key', $p['role_key'])))
                    ->when(! isset($p['user_id']) && ! isset($p['role_key']) && $lead->assigned_to, fn ($q) => $q->whereKey($lead->assigned_to))
                    ->get();
                foreach ($users as $u) {
                    $u->notify(new AppNotification('automation', $p['message'] ?? $rule->name, $lead->company->name_en, "/leads/{$lead->id}", ['rule_id' => $rule->id]));
                }
                break;
        }
    }
}
