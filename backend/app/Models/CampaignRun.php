<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CampaignRun extends Model
{
    public $timestamps = false;

    protected $fillable = ['campaign_id', 'started_at', 'finished_at', 'stats', 'new_companies'];

    protected $casts = ['stats' => 'array', 'started_at' => 'datetime', 'finished_at' => 'datetime'];
}
