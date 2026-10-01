<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceCatalog extends Model
{
    protected $table = 'service_catalog';
    public $timestamps = false;
    protected $fillable = ['sector_id','slug','name','aliases','is_active'];
    protected $casts = ['aliases'=>'array','is_active'=>'boolean'];

    public function sector(): BelongsTo { return $this->belongsTo(Sector::class); }
}
