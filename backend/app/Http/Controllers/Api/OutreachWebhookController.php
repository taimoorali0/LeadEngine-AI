<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OutreachMessage;
use App\Models\OutreachPermission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OutreachWebhookController extends Controller
{
    public function unsubscribe(Request $request, string $token)
    {
        $message = OutreachMessage::withoutGlobalScopes()->where('unsubscribe_token', $token)->firstOrFail();
        if ($request->isMethod('get')) {
            $action = e(url('/api/outreach/unsubscribe/'.$token));
            return response('<h1>Stop outreach emails</h1><form method="post" action="'.$action.'"><button type="submit">Unsubscribe</button></form>');
        }
        $this->suppress($message->organization_id, $message->channel, $message->recipient);
        return response('You have been unsubscribed.');
    }

    private function suppress(int $orgId, string $channel, string $recipient): void
    {
        DB::transaction(function () use ($orgId, $channel, $recipient) {
            Organization::lockForUpdate()->findOrFail($orgId);
            OutreachPermission::withoutGlobalScopes()->updateOrCreate(['organization_id' => $orgId, 'channel' => $channel, 'recipient' => $recipient], ['allowed' => false, 'evidence' => 'Recipient opted out', 'recorded_at' => now()]);
            OutreachMessage::withoutGlobalScopes()->where('organization_id', $orgId)->where('channel', $channel)->where('recipient', $recipient)->whereIn('status', ['draft', 'queued'])->update(['status' => 'cancelled']);
        });
    }

    public function whatsapp(Request $request, Organization $organization)
    {
        $config = $organization->outreach_config['whatsapp'] ?? [];
        if ($request->isMethod('get')) {
            abort_unless(! empty($config['verify_token']) && hash_equals($config['verify_token'], (string) $request->query('hub_verify_token')) && $request->query('hub_mode') === 'subscribe', 403);
            return response((string) $request->query('hub_challenge'));
        }
        $signature = 'sha256='.hash_hmac('sha256', $request->getContent(), $config['app_secret'] ?? '');
        abort_unless(! empty($config['app_secret']) && hash_equals($signature, (string) $request->header('X-Hub-Signature-256')), 403);
        foreach ($request->input('entry', []) as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $value = $change['value'] ?? [];
                if (($value['metadata']['phone_number_id'] ?? '') !== ($config['phone_number_id'] ?? '')) { continue; }
                foreach ($value['statuses'] ?? [] as $status) {
                    $m = OutreachMessage::withoutGlobalScopes()->where('organization_id', $organization->id)->where('channel', 'whatsapp')->where('provider_id', $status['id'] ?? '')->first();
                    if (! $m) { continue; }
                    $rank = ['sending' => 0, 'accepted' => 1, 'sent' => 2, 'delivered' => 3, 'read' => 4];
                    $next = $status['status'] ?? '';
                    if ($next === 'failed' && ! in_array($m->status, ['delivered', 'read'])) { $m->update(['status' => 'failed', 'error' => 'WhatsApp delivery failed.']); }
                    elseif (isset($rank[$next]) && $rank[$next] > ($rank[$m->status] ?? -1)) { $m->update(['status' => $next]); }
                }
                foreach ($value['messages'] ?? [] as $incoming) {
                    $recipient = '+'.ltrim($incoming['from'] ?? '', '+');
                    $messages = OutreachMessage::withoutGlobalScopes()->where('organization_id', $organization->id)->where('channel', 'whatsapp')->where('recipient', $recipient);
                    $messages->whereNotNull('sent_at')->update(['replied_at' => now()]);
                    OutreachMessage::withoutGlobalScopes()->where('organization_id', $organization->id)->where('channel', 'whatsapp')->where('recipient', $recipient)->whereIn('status', ['draft', 'queued'])->update(['status' => 'cancelled']);
                    $text = strtolower(trim($incoming['text']['body'] ?? $incoming['button']['text'] ?? $incoming['interactive']['button_reply']['title'] ?? ''));
                    if (in_array($text, ['stop', 'unsubscribe', 'opt out', 'إيقاف', 'توقف', 'بند'])) { $this->suppress($organization->id, 'whatsapp', $recipient); }
                }
            }
        }
        return response()->json(['ok' => true]);
    }
}
