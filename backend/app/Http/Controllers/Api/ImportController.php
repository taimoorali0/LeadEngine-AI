<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ImportCompanies;
use App\Models\AuditLog;
use App\Models\Campaign;
use App\Services\Billing;
use App\Services\CsvReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

/** Two steps: upload + preview (columns are detected), then import with the confirmed column mapping. */
class ImportController extends Controller
{
    public function preview(Request $request, CsvReader $csv, Billing $billing): JsonResponse
    {
        $this->authorize('campaigns.manage');
        $billing->assertOperational($request->user()->organization);
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:10240']);

        $orgId = $request->user()->organization_id;
        $uploadId = (string) Str::uuid();
        $path = $request->file('file')->storeAs("imports/{$orgId}", "{$uploadId}.csv", 'local');
        try {
            $data = $csv->read(Storage::disk('local')->path($path));
        } catch (RuntimeException $e) {
            Storage::disk('local')->delete($path);
            abort(422, $e->getMessage());
        }
        abort_if(! $data['headers'] || ! $data['rows'], 422, 'The file needs a header row and at least one data row.');

        return response()->json([
            'upload_id' => $uploadId,
            'filename' => $request->file('file')->getClientOriginalName(),
            'headers' => $data['headers'],
            'sample' => array_slice($data['rows'], 0, 5),
            'row_count' => count($data['rows']),
            'mapping' => $csv->guessMapping($data['headers']),
            'fields' => array_keys(CsvReader::FIELDS),
        ]);
    }

    public function store(Request $request, Billing $billing): JsonResponse
    {
        $this->authorize('campaigns.manage');
        $org = $request->user()->organization;
        $billing->assertOperational($org);
        $data = $request->validate([
            'upload_id' => 'required|uuid',
            'name' => 'required|string|max:160',
            'country_id' => ['required', Rule::exists('locations', 'id')->where('level', 'country')],
            'industry_id' => 'nullable|exists:industries,id',
            'mapping' => 'required|array',
            'mapping.name' => 'required|integer|min:0',
            'mapping.*' => 'nullable|integer|min:0',
        ], ['mapping.name.required' => 'Choose which column holds the company name.']);

        // Uploads are stored per organization, so one organization cannot import another's file.
        $path = "imports/{$org->id}/{$data['upload_id']}.csv";
        abort_unless(Storage::disk('local')->exists($path), 404, 'Upload expired. Choose the file again.');
        $mapping = array_intersect_key(array_filter($data['mapping'], fn ($v) => $v !== null), CsvReader::FIELDS);

        $campaign = Campaign::create([
            'organization_id' => $org->id,
            'created_by' => $request->user()->id,
            'name' => $data['name'],
            'country_id' => $data['country_id'],
            'industry_id' => $data['industry_id'] ?? null,
            'company_type' => 'CSV import',
            'target_results' => CsvReader::MAX_ROWS,
            'filters' => ['source' => 'csv'],
            'status' => 'queued',
        ]);
        AuditLog::record('companies.import_started', $campaign, ['mapping' => $mapping]);
        ImportCompanies::dispatch($campaign, $path, $mapping);

        return response()->json($campaign, 202);
    }
}
