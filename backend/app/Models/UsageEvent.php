<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UsageEvent extends Model
{
    const UPDATED_AT = null;

    protected $fillable = ['organization_id', 'campaign_id', 'kind', 'credits', 'cost_usd'];
}
