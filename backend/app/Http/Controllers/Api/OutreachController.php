<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendOutreach;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\OutreachMessage;
use App\Models\OutreachPermission;
use App\Services\Billing;
use App\Services\EngineClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OutreachController extends Controller
{
    private function org(Request $request): Organization
    {
        abort_unless($request->user()->organization_id, 403, 'Choose an organization workspace.');
        return $request->user()->organization;
    }

    private function lead(Request $request, int $id): Lead
    {
        return Lead::where('organization_id', $this->org($request)->id)->visibleTo($request->user())->with('company.emails', 'company.phones')->findOrFail($id);
    }

    private function message(Request $request, OutreachMessage $message): void
    {
        abort_unless($message->organization_id === $this->org($request)->id, 404);
        $this->lead($request, $message->lead_id);
    }

    public function index(Request $request)
    {
        $org = $this->org($request);
        return response()->json(OutreachMessage::where('organization_id', $org->id)
            ->whereHas('lead', fn ($q) => $q->visibleTo($request->user()))->with('lead.company:id,name_en')->latest()->paginate(25));
    }

    public function settings(Request $request)
    {
        $this->authorize('settings.manage');
        $org = $this->org($request);
        $config = $org->outreach_config ?? [];
        foreach (['email' => ['password'], 'whatsapp' => ['token', 'app_secret', 'verify_token']] as $channel => $keys) {
            foreach ($keys as $key) {
                $config[$channel][$key.'_configured'] = ! empty($config[$channel][$key]);
                unset($config[$channel][$key]);
            }
        }
        return response()->json(['config' => $config, 'webhook_url' => url('/api/outreach/whatsapp/'.$org->id)]);
    }

    public function saveSettings(Request $request)
    {
        $this->authorize('settings.manage');
        $data = $request->validate([
            'enabled' => 'required|boolean', 'seller_name' => 'required|string|max:160', 'offer' => 'required|string|min:5|max:2000',
            'daily_limit' => 'required|integer|between:1,500',
            'email.host' => 'nullable|string|max:253|regex:/^[a-zA-Z0-9.-]+$/', 'email.port' => 'nullable|integer|in:465,587',
            'email.username' => 'nullable|string|max:254', 'email.password' => 'nullable|string|max:1000', 'email.from_address' => 'nullable|email|max:254',
            'whatsapp.phone_number_id' => 'nullable|regex:/^[0-9]+$/|max:50', 'whatsapp.api_version' => 'nullable|regex:/^v[0-9]+\.0$/|max:10',
            'whatsapp.token' => 'nullable|string|max:3000', 'whatsapp.app_secret' => 'nullable|string|max:200', 'whatsapp.verify_token' => 'nullable|string|max:200',
        ]);
        $org = $this->org($request);
        $config = $org->outreach_config ?? [];
        foreach (['email' => ['password'], 'whatsapp' => ['token', 'app_secret', 'verify_token']] as $channel => $keys) {
            foreach ($keys as $key) {
                if (empty($data[$channel][$key])) { unset($data[$channel][$key]); }
            }
        }
        $org->outreach_config = array_replace_recursive($config, $data);
        $org->save();
        return $this->settings($request);
    }

    public function draft(Request $request, EngineClient $engine, Billing $billing)
    {
        $this->authorize('notes.create');
        $data = $request->validate(['lead_id' => 'required|integer', 'channel' => 'required|in:email,whatsapp', 'recipient' => 'required|string|max:254', 'language' => 'required|in:en,ar,ur']);
        $org = $this->org($request);
        $billing->assertOperational($org);
        abort_unless($billing->hasFeature($org, 'ai_analysis'), 403, 'Your plan does not include AI analysis.');
        $lead = $this->lead($request, $data['lead_id']);
        $config = $org->outreach_config ?? [];
        abort_unless(! empty($config['seller_name']) && ! empty($config['offer']), 422, 'Set your company name and offer in Outreach connections first.');
        $recipient = $this->recipient($data['channel'], $data['recipient']);
        $known = $data['channel'] === 'email'
            ? $lead->company->emails->pluck('email')->map(fn ($v) => strtolower(trim($v)))
            : $lead->company->phones->pluck('normalized');
        abort_unless($known->contains($recipient), 422, 'Select a contact recorded on this company.');
        abort_if(($org->settings['ai']['enabled'] ?? true) === false, 403, 'AI analysis is disabled.');
        $billing->charge($org->id, 'ai_analysis');
        try {
        $draft = $engine->outreach(['company_name' => $lead->company->name_en, 'website' => $lead->company->website,
            'seller_name' => $config['seller_name'], 'offer' => $config['offer'], 'language' => $data['language']]);
        } catch (\Throwable) {
            $billing->grant($org, $billing->cost('ai_analysis')['credits'], 'outreach_draft_failed');
            abort(502, 'AI drafting failed. Check the engine configuration. Draft credits were refunded.');
        }
        $message = OutreachMessage::create([
            'organization_id' => $org->id, 'lead_id' => $lead->id, 'created_by' => $request->user()->id,
            'channel' => $data['channel'], 'recipient' => $recipient, 'subject' => $draft['subject'], 'body' => $draft['body'],
            'research' => $draft, 'status' => 'draft', 'unsubscribe_token' => Str::random(64),
        ]);
        return response()->json($message, 201);
    }

    private function recipient(string $channel, string $value): string
    {
        $value = trim($value);
        if ($channel === 'email') {
            abort_unless(filter_var($value, FILTER_VALIDATE_EMAIL), 422, 'Invalid email.');
            return strtolower($value);
        }
        abort_unless(preg_match('/^\+[1-9][0-9]{7,14}$/', $value), 422, 'Select an international phone number.');
        return $value;
    }

    public function approve(Request $request, OutreachMessage $message)
    {
        $this->authorize('notes.create');
        $this->message($request, $message);
        $data = $request->validate([
            'subject' => 'required|string|max:200|not_regex:/[\r\n]/', 'body' => 'required|string|max:4000',
            'permission_evidence' => 'required|string|min:10|max:1000',
            'template.name' => 'nullable|regex:/^[a-z0-9_]+$/|max:100',
            'template.language.code' => 'nullable|regex:/^[a-z]{2}(_[A-Z]{2})?$/',
            'template.components' => 'nullable|array|max:1',
            'template.components.*.type' => 'required|in:body',
            'template.components.*.parameters' => 'required|array|max:10',
            'template.components.*.parameters.*.type' => 'required|in:text',
            'template.components.*.parameters.*.text' => 'required|string|max:1024',
        ]);
        if ($message->channel === 'whatsapp') {
            abort_unless(! empty($data['template']['name']) && ! empty($data['template']['language']['code']), 422, 'Select an approved WhatsApp template and language.');
        }
        DB::transaction(function () use ($request, $message, $data) {
            $org = Organization::lockForUpdate()->findOrFail($message->organization_id);
            $locked = OutreachMessage::lockForUpdate()->findOrFail($message->id);
            abort_unless($locked->status === 'draft', 409, 'This message has already been approved or stopped.');
            abort_unless($org->outreach_config['enabled'] ?? false, 422, 'Enable sending in Outreach connections.');
            $permission = OutreachPermission::where('organization_id', $org->id)->where('channel', $message->channel)->where('recipient', $message->recipient)->first();
            abort_if($permission && ! $permission->allowed, 422, 'This contact has opted out or is blocked.');
            $recent = OutreachMessage::where('organization_id', $org->id)->where('channel', $message->channel)->where('recipient', $message->recipient)
                ->where('id', '!=', $message->id)->whereIn('status', ['queued', 'sending', 'accepted', 'sent', 'delivered', 'read', 'unknown'])
                ->where('created_at', '>=', now()->subDay())->exists();
            abort_if($recent, 409, 'This contact already has a recent or pending message.');
            OutreachPermission::updateOrCreate(['organization_id' => $org->id, 'channel' => $message->channel, 'recipient' => $message->recipient],
                ['allowed' => true, 'evidence' => $data['permission_evidence'], 'recorded_at' => now()]);
            $locked->update(['subject' => $data['subject'], 'body' => $data['body'], 'template' => $message->channel === 'whatsapp' ? $this->template($data['template']) : null, 'status' => 'queued', 'approved_at' => now()]);
            SendOutreach::dispatch($locked->id)->afterCommit();
        });
        return response()->json($message->fresh());
    }

    private function template(array $template): array
    {
        $result = ['name' => $template['name'], 'language' => ['code' => $template['language']['code']]];
        if (! empty($template['components'])) {
            $result['components'] = [['type' => 'body', 'parameters' => array_map(fn ($p) => ['type' => 'text', 'text' => $p['text']], $template['components'][0]['parameters'])]];
        }
        return $result;
    }

    public function stop(Request $request, OutreachMessage $message)
    {
        $this->authorize('notes.create');
        $this->message($request, $message);
        abort_unless(OutreachMessage::whereKey($message->id)->whereIn('status', ['draft', 'queued', 'blocked'])->update(['status' => 'cancelled']), 409, 'This message has already been handed to the provider.');
        return response()->json(['ok' => true]);
    }

    public function outcome(Request $request, OutreachMessage $message)
    {
        $this->authorize('notes.create');
        $this->message($request, $message);
        $data = $request->validate(['outcome' => 'required|in:replied,opt_out']);
        DB::transaction(function () use ($message, $data) {
            Organization::lockForUpdate()->findOrFail($message->organization_id);
            if ($data['outcome'] === 'replied') { $message->update(['replied_at' => now()]); }
            else { OutreachPermission::updateOrCreate(['organization_id' => $message->organization_id, 'channel' => $message->channel, 'recipient' => $message->recipient], ['allowed' => false, 'evidence' => 'Opt-out recorded by team', 'recorded_at' => now()]); }
            OutreachMessage::where('organization_id', $message->organization_id)->where('channel', $message->channel)->where('recipient', $message->recipient)->whereIn('status', ['draft', 'queued'])->update(['status' => 'cancelled']);
        });
        return response()->json(['ok' => true]);
    }
}
