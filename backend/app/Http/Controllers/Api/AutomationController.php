<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\AutomationRule;
use App\Services\Billing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AutomationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'rules' => AutomationRule::orderBy('priority')->orderBy('id')->get(),
            'schema' => ['triggers' => AutomationRule::TRIGGERS, 'fields' => AutomationRule::FIELDS,
                'operators' => AutomationRule::OPERATORS, 'actions' => AutomationRule::ACTIONS],
        ]);
    }

    public function store(Request $request, Billing $billing): JsonResponse
    {
        $this->authorize('automation.manage');
        $billing->assertOperational($request->user()->organization);
        $rule = AutomationRule::create($this->validated($request));
        AuditLog::record('automation.created', $rule);

        return response()->json($rule, 201);
    }

    public function update(Request $request, AutomationRule $automation, Billing $billing): JsonResponse
    {
        $this->authorize('automation.manage');
        $billing->assertOperational($request->user()->organization);
        $automation->update($this->validated($request, true));
        AuditLog::record('automation.updated', $automation);

        return response()->json($automation);
    }

    public function destroy(AutomationRule $automation): JsonResponse
    {
        $this->authorize('automation.manage');
        AuditLog::record('automation.deleted', $automation, ['name' => $automation->name]);
        $automation->delete();

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "$req|string|max:160",
            'trigger' => [$req, Rule::in(AutomationRule::TRIGGERS)],
            'enabled' => 'boolean',
            'priority' => 'integer|between:0,1000',
            'conditions' => 'array',
            'conditions.*.field' => ['required', Rule::in(AutomationRule::FIELDS)],
            'conditions.*.op' => ['required', Rule::in(AutomationRule::OPERATORS)],
            'conditions.*.value' => 'nullable',
            'actions' => "$req|array|min:1",
            'actions.*.type' => ['required', Rule::in(AutomationRule::ACTIONS)],
            'actions.*.params' => 'array',
        ]);
    }
}
