<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompanySource extends Model
{
    const CREATED_AT = 'discovered_at';

    const UPDATED_AT = null;

    protected $fillable = ['company_id', 'source', 'external_ref', 'campaign_id', 'keyword', 'raw_payload'];

    protected $casts = ['raw_payload' => 'array', 'discovered_at' => 'datetime'];
}
