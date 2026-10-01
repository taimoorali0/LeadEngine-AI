<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $fillable = [
        'organization_id', 'role_id', 'name', 'email', 'password', 'locale', 'daily_lead_limit', 'is_active',
    ];

    protected $hidden = ['password', 'two_factor_secret'];

    /** @var array<string, bool>|null */
    private ?array $permissionCache = null;

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class, 'assigned_to');
    }

    public function isSuperAdmin(): bool
    {
        return $this->role?->key === 'super_admin';
    }

    public function hasPermission(string $key): bool
    {
        $this->permissionCache ??= $this->role?->permissions()->pluck('key')->flip()->map(fn () => true)->all() ?? [];

        return isset($this->permissionCache[$key]);
    }

    /** @return list<string> */
    public function permissionKeys(): array
    {
        return $this->role?->permissions()->pluck('key')->all() ?? [];
    }
}
