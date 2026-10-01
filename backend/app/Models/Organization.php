<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $fillable = ['name', 'slug', 'plan', 'settings', 'credit_balance', 'plan_renews_at'];

    protected $casts = ['settings' => 'array', 'plan_renews_at' => 'datetime'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
