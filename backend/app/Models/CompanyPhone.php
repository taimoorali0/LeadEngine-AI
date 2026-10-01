<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompanyPhone extends Model
{
    public $timestamps = false;

    protected $fillable = ['company_id', 'original', 'normalized', 'country_code', 'country', 'phone_type', 'source'];
}
