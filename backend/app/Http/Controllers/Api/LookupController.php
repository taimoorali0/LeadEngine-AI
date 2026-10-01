<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Industry;
use App\Models\Location;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LookupController extends Controller
{
    public function locations(Request $request): JsonResponse
    {
        $q = Location::query()->orderByDesc('search_priority')->orderBy('name_en');
        $request->filled('parent_id') ? $q->where('parent_id', $request->integer('parent_id')) : $q->whereNull('parent_id');

        return response()->json($q->get());
    }

    public function industries(): JsonResponse
    {
        return response()->json(Industry::with('aliases:id,industry_id,alias,language')->orderBy('name_en')->get());
    }

    /** Team members, for assignment pickers. */
    public function users(Request $request): JsonResponse
    {
        return response()->json(
            User::where('organization_id', $request->user()->organization_id)->where('is_active', true)
                ->with('role:id,key,name')->orderBy('name')->get(['id', 'name', 'email', 'role_id'])
        );
    }
}
