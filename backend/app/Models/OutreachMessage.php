<?php
namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class OutreachMessage extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id'];
    protected $hidden = ['unsubscribe_token'];
    protected $casts = ['research' => 'array', 'template' => 'array', 'approved_at' => 'datetime', 'sent_at' => 'datetime', 'replied_at' => 'datetime'];

    public function lead() { return $this->belongsTo(Lead::class); }
}
