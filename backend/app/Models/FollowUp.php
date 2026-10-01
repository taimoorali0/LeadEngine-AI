<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FollowUp extends Model
{
    public $timestamps = false;

    public const TYPES = ['call', 'email', 'meeting', 'whatsapp', 'task'];

    protected $fillable = ['lead_id', 'user_id', 'due_at', 'type', 'priority', 'notes', 'completed_at', 'reminded_at'];

    protected $casts = ['due_at' => 'datetime', 'completed_at' => 'datetime', 'reminded_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
