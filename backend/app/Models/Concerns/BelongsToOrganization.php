<?php

namespace App\Models\Concerns;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Scopes every query to the signed-in user's organization (spec §64) and
 * stamps organization_id on create. Super admins (no organization) see all.
 */
trait BelongsToOrganization
{
    public static function bootBelongsToOrganization(): void
    {
        static::addGlobalScope('organization', function (Builder $query) {
            $orgId = Auth::user()?->organization_id;
            if ($orgId !== null) {
                $query->where($query->qualifyColumn('organization_id'), $orgId);
            }
        });

        static::creating(function ($model) {
            $model->organization_id ??= Auth::user()?->organization_id;
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
