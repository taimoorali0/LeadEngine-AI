<?php

namespace App\Jobs;

use App\Http\Controllers\Api\SettingsController;
use App\Models\Company;
use App\Models\Industry;
use App\Services\Billing;
use App\Services\EngineClient;
use App\Services\InsufficientCredits;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/** AI summary, classification and possible needs (spec §15-17, §58). */
class AnalyzeCompany implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public function __construct(public Company $company, public string $text = '') {}

    public function handle(EngineClient $engine, Billing $billing): void
    {
        $c = $this->company;
        $org = $c->organization;
        $settings = SettingsController::for($org);
        if (! $settings['ai']['enabled'] || ! $billing->hasFeature($org, 'ai_analysis')) {
            return;
        }
        try {
            $billing->charge($c->organization_id, 'ai_analysis');
        } catch (InsufficientCredits) {
            return;
        }

        $industries = Industry::with('aliases', 'parent')->get();
        $result = $engine->analyze([
            'name' => $c->name_en,
            'text' => $this->text,
            'description' => $c->description_en,
            'category' => $c->business_category,
            'industries' => $industries->map(fn (Industry $i) => [
                'slug' => $i->slug, 'name' => $i->name_en, 'parent_slug' => $i->parent?->slug,
                'aliases' => $i->aliases->pluck('alias')->all(),
            ])->all(),
            'offerings' => $settings['ai']['offerings'] ?? [],
            'language' => $settings['default_locale'] === 'ar' ? 'ar' : 'en',
        ]);

        $bySlug = $industries->keyBy('slug');
        $update = [
            'ai_summary' => $result['summary'],
            'possible_needs' => $result['possible_needs'],
            'products' => $result['products'] ?: $c->products,
            'services' => $result['services'] ?: $c->services,
            'ai_analyzed_at' => now(),
        ];
        // Only overwrite the campaign-assigned industry when the classifier is confident.
        if (($industry = $bySlug->get($result['industry_slug'] ?? '')) && ($result['confidence'] >= 70 || ! $c->industry_id)) {
            $update += ['industry_id' => $industry->id, 'classification_confidence' => $result['confidence'],
                'sub_industry_id' => $bySlug->get($result['sub_industry_slug'] ?? '')?->id];
        }
        $c->update($update);
    }
}
