<?php
namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class OutreachPermission extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id'];
    protected $casts = ['allowed' => 'boolean', 'recorded_at' => 'datetime'];
}
