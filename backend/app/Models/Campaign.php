<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Campaign extends Model
{
    use BelongsToOrganization;

    public const STAGES = ['search', 'companies', 'enrichment', 'deduplication', 'scoring'];

    protected $fillable = [
        'organization_id', 'created_by', 'name', 'country_id', 'industry_id', 'company_type',
        'target_results', 'filters', 'status', 'progress', 'stats', 'last_run_at',
    ];

    protected $casts = [
        'filters' => 'array',
        'progress' => 'array',
        'stats' => 'array',
        'last_run_at' => 'datetime',
    ];

    public function country(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'country_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function industry(): BelongsTo
    {
        return $this->belongsTo(Industry::class);
    }

    public function locations(): BelongsToMany
    {
        return $this->belongsToMany(Location::class, 'campaign_locations');
    }

    public function keywords(): HasMany
    {
        return $this->hasMany(CampaignKeyword::class);
    }

    public function runs(): HasMany
    {
        return $this->hasMany(CampaignRun::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function filter(string $key, mixed $default = null): mixed
    {
        return $this->filters[$key] ?? $default;
    }
}
