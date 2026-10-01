<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\FollowUp;
use App\Models\Lead;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $sort = in_array($request->query('sort'), ['score', 'created_at', 'updated_at'], true) ? $request->query('sort') : 'created_at';

        return response()->json(
            $this->filtered($request)
                ->with('company:id,name_en,website,location_id,industry_id', 'company.location:id,name_en',
                    'company.industry:id,name_en', 'assignee:id,name', 'campaign:id,name')
                ->withCount(['company as phones_count' => fn ($q) => $q->join('company_phones', 'company_phones.company_id', '=', 'companies.id')])
                ->orderByDesc($sort)->orderByDesc('id')
                ->paginate($request->integer('per_page', 25))
        );
    }

    /** Kanban board: leads grouped by pipeline status (spec §27). */
    public function board(Request $request): JsonResponse
    {
        $leads = $this->filtered($request)->whereIn('status', Lead::PIPELINE)
            ->with('company:id,name_en', 'assignee:id,name')
            ->orderBy('pipeline_position')->orderByDesc('score')->limit(1000)->get()
            ->groupBy('status');

        return response()->json(collect(Lead::PIPELINE)->mapWithKeys(fn ($s) => [$s => $leads->get($s, collect())->values()]));
    }

    public function show(Request $request, Lead $lead): JsonResponse
    {
        $this->ensureVisible($request->user(), $lead);

        return response()->json($lead->load('company.phones', 'company.emails', 'campaign:id,name', 'assignee:id,name',
            'activities.user:id,name', 'followUps'));
    }

    public function update(Request $request, Lead $lead): JsonResponse
    {
        $user = $request->user();
        $this->ensureVisible($user, $lead);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(Lead::statuses())],
            'pipeline_position' => 'sometimes|integer|min:0',
            'assigned_to' => ['sometimes', 'nullable', Rule::exists('users', 'id')->where('organization_id', $user->organization_id)],
        ]);
        if (array_key_exists('status', $data) || array_key_exists('pipeline_position', $data)) {
            $this->authorize('leads.update_status');
        }
        if (array_key_exists('assigned_to', $data)) {
            $this->authorize('leads.assign');
        }

        DB::transaction(function () use ($lead, $data) {
            $before = $lead->only(['status', 'assigned_to']);
            if (array_key_exists('assigned_to', $data) && $data['assigned_to'] && $lead->status === 'new' && ! isset($data['status'])) {
                $data['status'] = 'assigned';
            }
            $lead->update($data);
            if (isset($data['status']) && $data['status'] !== $before['status']) {
                $lead->log('status_changed', null, ['from' => $before['status'], 'to' => $data['status']]);
            }
            if (array_key_exists('assigned_to', $data) && $data['assigned_to'] !== $before['assigned_to']) {
                $lead->log('assigned', null, ['from' => $before['assigned_to'], 'to' => $data['assigned_to']]);
            }
        });

        return response()->json($lead->fresh(['company:id,name_en', 'assignee:id,name']));
    }

    public function addNote(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('notes.create');
        $this->ensureVisible($request->user(), $lead);
        $data = $request->validate([
            'type' => 'in:note,call,email,meeting,whatsapp',
            'body' => 'required|string|max:5000',
            'outcome' => 'nullable|string|max:120',
        ]);

        return response()->json($lead->log($data['type'] ?? 'note', $data['body'], array_filter(['outcome' => $data['outcome'] ?? null]))
            ->load('user:id,name'), 201);
    }

    public function addFollowUp(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('follow_ups.create');
        $this->ensureVisible($request->user(), $lead);
        $data = $request->validate([
            'due_at' => 'required|date|after:now',
            'type' => ['required', Rule::in(FollowUp::TYPES)],
            'priority' => 'in:low,normal,high,urgent',
            'notes' => 'nullable|string|max:2000',
        ]);

        $followUp = DB::transaction(function () use ($lead, $data, $request) {
            $followUp = $lead->followUps()->create($data + ['user_id' => $lead->assigned_to ?? $request->user()->id]);
            $this->syncNextFollowUp($lead);
            $lead->log('follow_up', $data['notes'] ?? null, ['type' => $data['type'], 'due_at' => $followUp->due_at->toIso8601String()]);

            return $followUp;
        });

        return response()->json($followUp, 201);
    }

    public function completeFollowUp(Request $request, FollowUp $followUp): JsonResponse
    {
        $lead = $followUp->lead;
        abort_if(! $lead, 404);
        $this->ensureVisible($request->user(), $lead);
        $followUp->update(['completed_at' => now()]);
        $this->syncNextFollowUp($lead);

        return response()->json($followUp);
    }

    /** Due and overdue follow-ups for the current user (or everyone, for managers). */
    public function followUps(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = FollowUp::whereNull('completed_at')
            ->whereHas('lead', fn ($l) => $l->visibleTo($user))
            ->with('lead:id,company_id,status', 'lead.company:id,name_en')
            ->orderBy('due_at');
        if (! $request->boolean('all') || ! $user->hasPermission('leads.view_all')) {
            $q->where('user_id', $user->id);
        }

        return response()->json($q->limit(200)->get());
    }

    /** CSV export, limited by export permission (spec §56). */
    public function export(Request $request): StreamedResponse
    {
        $user = $request->user();
        $q = $this->filtered($request)->with('company.phones', 'company.emails', 'company.location', 'assignee:id,name');
        if ($user->isSuperAdmin() || $user->hasPermission('leads.export_all')) {
            // no restriction
        } elseif ($user->hasPermission('leads.export_team')) {
            $teamIds = DB::table('team_user')->whereIn('team_id', DB::table('team_user')->where('user_id', $user->id)->select('team_id'))->pluck('user_id');
            $q->whereIn('assigned_to', $teamIds->push($user->id));
        } elseif ($user->hasPermission('leads.export_assigned')) {
            $q->where('assigned_to', $user->id);
        } else {
            abort(403);
        }
        AuditLog::record('leads.exported', null, ['count' => (clone $q)->count(), 'filters' => $request->query()]);

        return response()->streamDownload(function () use ($q) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Lead ID', 'Company', 'City', 'Phone', 'Email', 'Website', 'Score', 'Quality', 'Status', 'Assigned To']);
            $q->chunkById(500, function ($leads) use ($out) {
                foreach ($leads as $l) {
                    fputcsv($out, [$l->id, $l->company->name_en, $l->company->location?->name_en,
                        $l->company->phones->first()?->normalized, $l->company->emails->first()?->email,
                        $l->company->website, $l->score, $l->quality, $l->status, $l->assignee?->name]);
                }
            });
            fclose($out);
        }, 'leads-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    private function filtered(Request $request): Builder
    {
        $q = Lead::query()->visibleTo($request->user());
        foreach (['status', 'campaign_id', 'assigned_to', 'quality'] as $f) {
            $q->when($request->filled($f), fn ($w) => $w->where("leads.$f", $request->query($f)));
        }
        $q->when($request->filled('min_score'), fn ($w) => $w->where('score', '>=', $request->integer('min_score')));
        if ($term = $request->string('q')->trim()->toString()) {
            $q->whereHas('company', fn ($c) => $c->where('name_en', 'ilike', "%{$term}%"));
        }

        return $q;
    }

    private function ensureVisible(User $user, Lead $lead): void
    {
        abort_if(! $user->isSuperAdmin() && ! $user->hasPermission('leads.view_all') && $lead->assigned_to !== $user->id, 403);
    }

    private function syncNextFollowUp(Lead $lead): void
    {
        $lead->update(['next_follow_up_at' => $lead->followUps()->whereNull('completed_at')->min('due_at')]);
    }
}
