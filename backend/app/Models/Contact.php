<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    const UPDATED_AT = null;

    protected $fillable = ['company_id', 'name', 'title', 'phone', 'email', 'source'];
}
