<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CampaignKeyword extends Model
{
    public $timestamps = false;

    protected $fillable = ['campaign_id', 'keyword', 'language', 'origin', 'enabled'];

    protected $casts = ['enabled' => 'boolean'];
}
