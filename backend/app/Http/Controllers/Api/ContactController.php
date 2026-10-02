<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Contact;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * People at a company. Added by the sales team (e.g. after looking someone up on
 * LinkedIn themselves) or imported from a CSV, never scraped from LinkedIn.
 */
class ContactController extends Controller
{
    public function store(Request $request, Company $company): JsonResponse
    {
        $this->authorize('notes.create');
        $this->ensureVisible($request->user(), $company);
        $contact = $company->contacts()->create($this->validated($request) + [
            'source' => 'manual', 'created_by' => $request->user()->id,
        ]);
        AuditLog::record('contact.created', $contact, ['company_id' => $company->id]);

        return response()->json($contact, 201);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        $this->authorize('notes.create');
        $this->ensureVisible($request->user(), $contact->company);
        $contact->update($this->validated($request, true));

        return response()->json($contact);
    }

    public function destroy(Request $request, Contact $contact): JsonResponse
    {
        $user = $request->user();
        $this->ensureVisible($user, $contact->company);
        abort_unless($contact->created_by === $user->id || $user->can('companies.edit'), 403);
        AuditLog::record('contact.deleted', $contact, ['name' => $contact->name]);
        $contact->delete();

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $data = $request->validate([
            'name' => ($partial ? 'sometimes' : 'required').'|string|max:160',
            'title' => 'nullable|string|max:160',
            'email' => 'nullable|email|max:200',
            'phone' => 'nullable|string|max:40',
            'linkedin_url' => ['nullable', 'url', 'max:500', 'regex:#^https?://([a-z]{2,3}\.)?(www\.)?linkedin\.com/#i'],
            'notes' => 'nullable|string|max:2000',
        ], ['linkedin_url.regex' => 'Enter a linkedin.com profile link.']);

        return $data;
    }

    /** Same visibility as the company profile: agents only reach companies of their own leads. */
    private function ensureVisible(User $user, ?Company $company): void
    {
        abort_if(! $company, 404);  // tenancy scope hides other organizations' companies
        $canSeeAll = $user->isSuperAdmin() || $user->hasPermission('leads.view_all');
        abort_unless($canSeeAll || $company->leads()->where('assigned_to', $user->id)->exists(), 403);
    }
}
