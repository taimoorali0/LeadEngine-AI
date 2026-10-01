<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $fillable = ['name', 'slug', 'plan', 'settings'];

    protected $casts = ['settings' => 'array'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
