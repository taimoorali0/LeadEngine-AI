<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sector extends Model
{
    public $timestamps = false;

    protected $fillable = ['slug', 'name', 'sort_order', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function businessTypes(): HasMany
    {
        return $this->hasMany(BusinessType::class);
    }

    public function services(): HasMany
    {
        return $this->hasMany(ServiceCatalog::class, 'sector_id');
    }
}
