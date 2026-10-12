<?php
namespace App\Jobs;

use App\Models\Organization;
use App\Models\OutreachMessage;
use App\Models\OutreachPermission;
use App\Services\Billing;
use App\Services\OutreachDelivery;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\DB;
use Throwable;

class SendOutreach implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    // Provider timeouts are ambiguous: never automatically resend.
    public int $tries = 1;
    public int $timeout = 60;

    public function __construct(public int $messageId) {}

    public function handle(OutreachDelivery $delivery, Billing $billing): void
    {
        $claimed = DB::transaction(function () use ($billing) {
            $snapshot = OutreachMessage::withoutGlobalScopes()->find($this->messageId);
            if (! $snapshot) { return null; }
            $org = Organization::lockForUpdate()->find($snapshot->organization_id);
            $m = OutreachMessage::withoutGlobalScopes()->lockForUpdate()->find($this->messageId);
            if (! $m || $m->status !== 'queued') { return null; }
            $config = $org?->outreach_config ?? [];
            $allowed = OutreachPermission::withoutGlobalScopes()->where('organization_id', $m->organization_id)
                ->where('channel', $m->channel)->where('recipient', $m->recipient)->where('allowed', true)->exists();
            $replied = OutreachMessage::withoutGlobalScopes()->where('organization_id', $m->organization_id)
                ->where('channel', $m->channel)->where('recipient', $m->recipient)->whereNotNull('replied_at')->exists();
            $count = OutreachMessage::withoutGlobalScopes()->where('organization_id', $m->organization_id)
                ->whereNotNull('attempted_at')->where('attempted_at', '>=', now()->startOfDay())->count();
            if (! $org || ! $billing->isOperational($org) || ! ($config['enabled'] ?? false) || ! $allowed || $replied || $count >= ($config['daily_limit'] ?? 50)) {
                $m->update(['status' => 'blocked', 'error' => 'Paused, contact permission missing, reply received, or daily limit reached.']);
                return null;
            }
            $m->update(['status' => 'sending', 'attempted_at' => now(), 'error' => null]);
            return [$m, $config];
        });
        if (! $claimed) { return; }
        [$message, $config] = $claimed;
        try {
            $id = $delivery->send($message, $config);
            $message->update(['status' => 'accepted', 'provider_id' => $id, 'sent_at' => now()]);
            $lead = $message->lead;
            $lead?->log($message->channel, $message->body, ['outreach_id' => $message->id, 'status' => 'accepted']);
        } catch (Throwable) {
            $message->update(['status' => 'unknown', 'error' => 'Provider acceptance could not be confirmed. Check provider logs before sending again.']);
        }
    }
}
