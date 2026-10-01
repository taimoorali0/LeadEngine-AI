<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class AutomationRule extends Model
{
    use BelongsToOrganization;

    public const TRIGGERS = ['lead_created', 'lead_scored', 'status_changed'];

    public const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'empty', 'not_empty'];

    public const FIELDS = ['score', 'quality', 'status', 'previous_status', 'has_phone', 'has_email', 'has_website',
        'industry_id', 'location_id', 'campaign_id', 'assigned'];

    public const ACTIONS = ['assign_user', 'assign_team', 'assign_auto', 'set_status', 'create_follow_up', 'enrich', 'notify'];

    protected $fillable = ['organization_id', 'name', 'trigger', 'conditions', 'actions', 'enabled', 'priority'];

    protected $casts = ['conditions' => 'array', 'actions' => 'array', 'enabled' => 'boolean'];
}
