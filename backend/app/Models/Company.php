<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name_en', 'name_ar', 'normalized_name', 'industry_id', 'sub_industry_id',
        'classification_confidence', 'business_category', 'location_id', 'address_en', 'address_ar',
        'latitude', 'longitude', 'website', 'website_domain', 'google_place_id', 'rating', 'review_count',
        'business_status', 'description_en', 'description_ar', 'products', 'services', 'possible_needs',
        'social_links', 'enrichment_status', 'last_checked_at', 'ai_summary', 'ai_analyzed_at',
    ];

    protected $casts = [
        'products' => 'array',
        'services' => 'array',
        'possible_needs' => 'array',
        'social_links' => 'array',
        'latitude' => 'float',
        'longitude' => 'float',
        'rating' => 'float',
        'last_checked_at' => 'datetime',
        'ai_analyzed_at' => 'datetime',
    ];

    public static function normalizeName(string $name): string
    {
        $name = mb_strtolower($name);
        $name = preg_replace('/\b(pvt|private|ltd|limited|llc|inc|co|company|corp|corporation|plc|smc|est|group)\b\.?/u', ' ', $name);
        $name = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $name);

        return trim(preg_replace('/\s+/u', ' ', $name));
    }

    public static function domainOf(?string $url): ?string
    {
        if (! $url) {
            return null;
        }
        $host = parse_url(str_contains($url, '://') ? $url : "http://{$url}", PHP_URL_HOST);

        return $host ? preg_replace('/^www\./', '', strtolower($host)) : null;
    }

    public function industry(): BelongsTo
    {
        return $this->belongsTo(Industry::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function phones(): HasMany
    {
        return $this->hasMany(CompanyPhone::class);
    }

    public function emails(): HasMany
    {
        return $this->hasMany(CompanyEmail::class);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class);
    }

    public function sources(): HasMany
    {
        return $this->hasMany(CompanySource::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }
}
