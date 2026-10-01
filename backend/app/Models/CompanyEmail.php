<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompanyEmail extends Model
{
    public $timestamps = false;

    protected $fillable = ['company_id', 'email', 'type', 'status', 'source'];
}
