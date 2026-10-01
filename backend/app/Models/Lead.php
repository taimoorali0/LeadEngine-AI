<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lead extends Model
{
    use BelongsToOrganization;

    /** Pipeline order (spec §26). */
    public const PIPELINE = [
        'new', 'verified', 'qualified', 'assigned', 'contacted', 'follow_up',
        'interested', 'meeting', 'proposal', 'won',
    ];

    public const OUTCOMES = ['not_interested', 'invalid', 'duplicate', 'closed'];

    protected $fillable = [
        'organization_id', 'company_id', 'campaign_id', 'assigned_to', 'status', 'score',
        'score_breakdown', 'quality', 'pipeline_position', 'next_follow_up_at',
    ];

    protected $casts = ['score_breakdown' => 'array', 'next_follow_up_at' => 'datetime'];

    public static function statuses(): array
    {
        return [...self::PIPELINE, ...self::OUTCOMES];
    }

    /** Agents without leads.view_all only see leads assigned to them. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $user->hasPermission('leads.view_all') ? $query : $query->where('assigned_to', $user->id);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class)->latest('created_at');
    }

    public function followUps(): HasMany
    {
        return $this->hasMany(FollowUp::class);
    }

    public function log(string $type, ?string $body = null, array $meta = [], ?User $user = null): LeadActivity
    {
        return $this->activities()->create([
            'type' => $type,
            'body' => $body,
            'meta' => $meta,
            'user_id' => $user?->id ?? auth()->id(),
        ]);
    }
}
