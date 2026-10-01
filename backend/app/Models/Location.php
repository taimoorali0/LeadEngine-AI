<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Location extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'parent_id', 'level', 'iso_code', 'name_en', 'name_ar', 'name_ur',
        'latitude', 'longitude', 'radius_m', 'search_priority',
    ];

    protected $casts = ['latitude' => 'float', 'longitude' => 'float'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    /** Walks up to the country to find its ISO code (used as phone default region). */
    public function countryCode(): ?string
    {
        $node = $this;
        while ($node && $node->level !== 'country') {
            $node = $node->parent;
        }

        return $node?->iso_code;
    }
}
