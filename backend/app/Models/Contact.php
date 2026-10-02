<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A person at a company, added by the sales team or imported (never scraped). */
class Contact extends Model
{
    const UPDATED_AT = null;

    protected $fillable = ['company_id', 'name', 'title', 'phone', 'email', 'linkedin_url', 'notes', 'source', 'created_by'];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
