<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Request;

class AuditLog extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'organization_id', 'user_id', 'action', 'subject_type', 'subject_id', 'meta', 'ip', 'user_agent',
    ];

    protected $casts = ['meta' => 'array'];

    public static function record(string $action, ?Model $subject = null, array $meta = [], ?User $user = null): self
    {
        $user ??= auth()->user();

        return self::create([
            'organization_id' => $user?->organization_id,
            'user_id' => $user?->id,
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'meta' => $meta,
            'ip' => Request::ip(),
            'user_agent' => substr((string) Request::userAgent(), 0, 500),
        ]);
    }
}
