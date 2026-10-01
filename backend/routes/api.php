<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\CampaignController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PlatformController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('auth/2fa/challenge', [AuthController::class, 'twoFactorChallenge'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::put('auth/me', [AuthController::class, 'updateProfile']);
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::post('auth/2fa/setup', [AuthController::class, 'twoFactorSetup']);
    Route::post('auth/2fa/confirm', [AuthController::class, 'twoFactorConfirm']);
    Route::post('auth/2fa/disable', [AuthController::class, 'twoFactorDisable']);

    Route::get('dashboard', DashboardController::class);
    Route::get('reports', ReportController::class);
    Route::get('search', SearchController::class);
    Route::get('locations', [LookupController::class, 'locations']);
    Route::get('industries', [LookupController::class, 'industries']);
    Route::get('taxonomy', [LookupController::class, 'taxonomy']);

    Route::get('notifications', [NotificationController::class, 'index']);
    Route::post('notifications/read', [NotificationController::class, 'markRead']);

    Route::get('users', [UserController::class, 'index']);
    Route::get('roles', [UserController::class, 'roles']);
    Route::post('users', [UserController::class, 'store']);
    Route::put('users/{user}', [UserController::class, 'update']);
    Route::post('users/{user}/reset-2fa', [UserController::class, 'resetTwoFactor']);
    Route::apiResource('teams', TeamController::class)->except('show');

    Route::get('settings', [SettingsController::class, 'show']);
    Route::put('settings', [SettingsController::class, 'update']);
    Route::apiResource('automations', AutomationController::class)->except('show');

    Route::get('billing', [BillingController::class, 'show']);
    Route::post('billing/requests', [BillingController::class, 'submitRequest']);
    Route::get('admin/billing/requests', [BillingController::class, 'requests']);
    Route::patch('admin/billing/requests/{billingRequest}', [BillingController::class, 'review']);
    Route::post('admin/billing/plan', [BillingController::class, 'changePlan']);
    Route::post('admin/organizations/{organization}/credits', [BillingController::class, 'grant']);
    Route::get('admin/costs', [BillingController::class, 'costs']);
    Route::get('admin/organizations', [PlatformController::class, 'organizations']);
    Route::patch('admin/organizations/{organization}', [PlatformController::class, 'updateOrganization']);

    Route::post('keywords/suggest', [CampaignController::class, 'suggestKeywords']);
    Route::post('campaigns/preview', [CampaignController::class, 'preview']);
    Route::post('campaigns/{campaign}/run', [CampaignController::class, 'run']);
    Route::apiResource('campaigns', CampaignController::class);

    Route::apiResource('companies', CompanyController::class)->except('store');
    Route::post('companies/{company}/analyze', [CompanyController::class, 'analyze']);

    Route::get('leads/board', [LeadController::class, 'board']);
    Route::get('leads/export', [LeadController::class, 'export']);
    Route::get('leads', [LeadController::class, 'index']);
    Route::get('leads/{lead}', [LeadController::class, 'show']);
    Route::get('leads/{lead}/brief', [LeadController::class, 'brief']);
    Route::patch('leads/{lead}', [LeadController::class, 'update']);
    Route::post('leads/{lead}/notes', [LeadController::class, 'addNote']);
    Route::post('leads/{lead}/follow-ups', [LeadController::class, 'addFollowUp']);

    Route::get('follow-ups', [LeadController::class, 'followUps']);
    Route::post('follow-ups/{followUp}/complete', [LeadController::class, 'completeFollowUp']);
});
