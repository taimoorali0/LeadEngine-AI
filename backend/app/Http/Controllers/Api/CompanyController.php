<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\EnrichCompany;
use App\Models\AuditLog;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Company::query()->whereNull('merged_into_id')
            ->with('industry:id,name_en', 'location:id,name_en')
            ->withCount(['phones', 'emails', 'leads']);

        if ($term = $request->string('q')->trim()->toString()) {
            $q->where(fn ($w) => $w->where('name_en', 'ilike', "%{$term}%")->orWhere('website_domain', 'ilike', "%{$term}%"));
        }
        $q->when($request->filled('industry_id'), fn ($w) => $w->where('industry_id', $request->integer('industry_id')))
            ->when($request->boolean('has_website'), fn ($w) => $w->whereNotNull('website'))
            ->when($request->boolean('has_email'), fn ($w) => $w->has('emails'));

        $dir = $request->query('dir') === 'desc' ? 'desc' : 'asc';
        $expr = match ($request->query('sort')) {
            'rating' => 'companies.rating',
            'reviews' => 'companies.review_count',
            'city' => '(select lower(name_en) from locations where locations.id = companies.location_id)',
            'industry' => '(select lower(name_en) from industries where industries.id = companies.industry_id)',
            'created_at' => 'companies.created_at',
            'phones' => 'phones_count',
            'emails' => 'emails_count',
            default => 'lower(companies.name_en)',
        };
        $q->orderByRaw("{$expr} {$dir} nulls last")->orderBy('companies.id', $dir);

        return response()->json($q->paginate($request->integer('per_page', 25)));
    }

    /** Company 360° profile (spec §25). */
    public function show(Request $request, Company $company): JsonResponse
    {
        $user = $request->user();
        $company->load([
            'industry', 'location.parent', 'phones', 'emails', 'contacts', 'sources',
            'leads' => fn ($q) => $q->visibleTo($user)->with('assignee:id,name', 'campaign:id,name', 'activities.user:id,name'),
        ]);
        abort_if(! $user->hasPermission('leads.view_all') && ! $user->isSuperAdmin() && $company->leads->isEmpty(), 403);

        return response()->json($company);
    }

    public function update(Request $request, Company $company): JsonResponse
    {
        $this->authorize('companies.edit');
        $data = $request->validate([
            'name_en' => 'sometimes|string|max:200', 'name_ar' => 'nullable|string|max:200',
            'industry_id' => 'nullable|exists:industries,id', 'website' => 'nullable|url|max:300',
            'address_en' => 'nullable|string|max:500', 'address_ar' => 'nullable|string|max:500',
            'description_en' => 'nullable|string|max:5000', 'description_ar' => 'nullable|string|max:5000',
        ]);
        if (isset($data['name_en'])) {
            $data['normalized_name'] = Company::normalizeName($data['name_en']);
        }
        if (array_key_exists('website', $data)) {
            $data['website_domain'] = Company::domainOf($data['website']);
        }
        $company->update($data);
        AuditLog::record('company.edited', $company, ['fields' => array_keys($data)]);

        return response()->json($company);
    }

    /** Re-run website enrichment + AI analysis on demand. */
    public function analyze(Company $company): JsonResponse
    {
        $this->authorize('companies.edit');
        abort_if(! $company->website, 422, 'This company has no website to analyze.');
        $company->update(['enrichment_status' => 'pending']);
        EnrichCompany::dispatch($company);

        return response()->json(['queued' => true], 202);
    }

    public function destroy(Company $company): JsonResponse
    {
        $this->authorize('companies.delete');
        AuditLog::record('company.deleted', $company, ['name' => $company->name_en]);
        $company->delete();

        return response()->json(['ok' => true]);
    }
}
