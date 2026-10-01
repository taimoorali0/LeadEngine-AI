<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CampaignController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\SearchController;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::post('auth/logout', [AuthController::class, 'logout']);

    Route::get('dashboard', DashboardController::class);
    Route::get('search', SearchController::class);
    Route::get('locations', [LookupController::class, 'locations']);
    Route::get('industries', [LookupController::class, 'industries']);
    Route::get('users', [LookupController::class, 'users']);

    Route::post('keywords/suggest', [CampaignController::class, 'suggestKeywords']);
    Route::post('campaigns/{campaign}/run', [CampaignController::class, 'run']);
    Route::apiResource('campaigns', CampaignController::class);

    Route::apiResource('companies', CompanyController::class)->except('store');

    Route::get('leads/board', [LeadController::class, 'board']);
    Route::get('leads/export', [LeadController::class, 'export']);
    Route::get('leads', [LeadController::class, 'index']);
    Route::get('leads/{lead}', [LeadController::class, 'show']);
    Route::patch('leads/{lead}', [LeadController::class, 'update']);
    Route::post('leads/{lead}/notes', [LeadController::class, 'addNote']);
    Route::post('leads/{lead}/follow-ups', [LeadController::class, 'addFollowUp']);

    Route::get('follow-ups', [LeadController::class, 'followUps']);
    Route::post('follow-ups/{followUp}/complete', [LeadController::class, 'completeFollowUp']);
});
