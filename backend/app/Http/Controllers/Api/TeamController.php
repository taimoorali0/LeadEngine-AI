<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Team::with('leader:id,name', 'members:id,name')->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('teams.manage');
        $team = Team::create($this->validated($request));
        $team->members()->sync($request->input('member_ids', []));

        return response()->json($team->load('leader:id,name', 'members:id,name'), 201);
    }

    public function update(Request $request, Team $team): JsonResponse
    {
        $this->authorize('teams.manage');
        $team->update($this->validated($request));
        if ($request->has('member_ids')) {
            $team->members()->sync($request->input('member_ids'));
        }

        return response()->json($team->load('leader:id,name', 'members:id,name'));
    }

    public function destroy(Team $team): JsonResponse
    {
        $this->authorize('teams.manage');
        $team->delete();

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request): array
    {
        $member = Rule::exists('users', 'id')->where('organization_id', $request->user()->organization_id);

        return $request->validate([
            'name' => 'required|string|max:120',
            'leader_id' => ['nullable', $member],
            'member_ids' => 'array',
            'member_ids.*' => [$member],
        ]);
    }
}
