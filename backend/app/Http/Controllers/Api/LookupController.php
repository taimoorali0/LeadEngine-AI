<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BusinessType;
use App\Models\Industry;
use App\Models\Location;
use App\Models\Sector;
use App\Models\ServiceCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LookupController extends Controller
{
    public function locations(Request $request): JsonResponse
    {
        $q = Location::query()->orderByDesc('search_priority')->orderBy('name_en');
        $request->filled('parent_id') ? $q->where('parent_id', $request->integer('parent_id')) : $q->whereNull('parent_id');

        if ($request->filled('q')) {
            $q->where('name_en', 'ilike', '%'.$request->string('q')->trim()->toString().'%');
        }

        return response()->json($q->limit(500)->get());
    }

    public function industries(): JsonResponse
    {
        return response()->json(Industry::with('aliases:id,industry_id,alias,language')->orderBy('name_en')->get());
    }

    public function taxonomy(Request $request): JsonResponse
    {
        $sectorId = $request->integer('sector_id') ?: null;

        return response()->json([
            'sectors' => Sector::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(),
            'business_types' => BusinessType::where('is_active', true)
                ->when($sectorId, fn ($q) => $q->where('sector_id', $sectorId))
                ->with('sector:id,name')->orderBy('name')->get(),
            'services' => ServiceCatalog::where('is_active', true)
                ->when($sectorId, fn ($q) => $q->where('sector_id', $sectorId))
                ->with('sector:id,name')->orderBy('name')->get(),
        ]);
    }
}
