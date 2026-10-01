<?php

// SaaS plans and credit costs (spec §65-67). Prices are display values; no
// payment provider is wired up yet, so plan changes are recorded directly.
return [
    'plans' => [
        'starter' => ['name' => 'Starter', 'price_usd' => 49, 'users' => 3, 'active_campaigns' => 5, 'monthly_credits' => 1000,
            'features' => ['basic_enrichment']],
        'professional' => ['name' => 'Professional', 'price_usd' => 149, 'users' => 10, 'active_campaigns' => 25, 'monthly_credits' => 5000,
            'features' => ['basic_enrichment', 'ai_analysis', 'crm']],
        'business' => ['name' => 'Business', 'price_usd' => 399, 'users' => 30, 'active_campaigns' => 100, 'monthly_credits' => 20000,
            'features' => ['basic_enrichment', 'ai_analysis', 'crm', 'automation', 'teams', 'api', 'advanced_reports']],
        'enterprise' => ['name' => 'Enterprise', 'price_usd' => null, 'users' => null, 'active_campaigns' => null, 'monthly_credits' => 100000,
            'features' => ['basic_enrichment', 'ai_analysis', 'crm', 'automation', 'teams', 'api', 'advanced_reports', 'custom_integrations']],
    ],

    // Credits charged per unit of work, and the estimated provider cost per unit.
    'costs' => [
        'google_search' => ['credits' => 1, 'usd' => 0.032],
        'website_enrichment' => ['credits' => 1, 'usd' => 0.0005],
        'ai_analysis' => ['credits' => 2, 'usd' => 0.002],
        'email_verification' => ['credits' => 1, 'usd' => 0.004],
    ],
];
