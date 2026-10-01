<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Industry extends Model
{
    public $timestamps = false;

    protected $fillable = ['parent_id', 'slug', 'name_en', 'name_ar', 'name_ur'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function aliases(): HasMany
    {
        return $this->hasMany(IndustryAlias::class);
    }
}
