<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IndustryAlias extends Model
{
    public $timestamps = false;

    protected $fillable = ['industry_id', 'alias', 'language'];
}
