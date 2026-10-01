<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BusinessType extends Model
{
    public $timestamps = false;
    protected $fillable = ['sector_id','slug','name','aliases','google_types','is_active'];
    protected $casts = ['aliases'=>'array','google_types'=>'array','is_active'=>'boolean'];

    public function sector(): BelongsTo { return $this->belongsTo(Sector::class); }
}
