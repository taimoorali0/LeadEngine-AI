<?php

namespace App\Events;

use App\Models\Campaign;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Live campaign progress (spec §46-47), pushed over Reverb. */
class CampaignUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public readonly array $campaign, private readonly int $organizationId) {}

    public static function send(Campaign $c): void
    {
        try {
            broadcast(new self($c->only(['id', 'name', 'status', 'progress', 'stats', 'last_run_at']), $c->organization_id));
        } catch (Throwable $e) {
            // Live updates are best-effort; the UI falls back to polling.
            Log::debug('Broadcast failed', ['error' => $e->getMessage()]);
        }
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel("organization.{$this->organizationId}");
    }

    public function broadcastAs(): string
    {
        return 'campaign.updated';
    }
}
