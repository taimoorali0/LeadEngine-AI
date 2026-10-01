<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Notification;

/**
 * One notification class for every in-app event (spec §61). `kind` drives the
 * icon and translation on the client; `url` is the in-app link.
 */
class AppNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const KINDS = [
        'lead_assigned', 'lead_reassigned', 'follow_up_due', 'campaign_completed', 'campaign_failed',
        'new_businesses', 'duplicate_found', 'automation', 'credits_low',
    ];

    public function __construct(
        public readonly string $kind,
        public readonly string $title,
        public readonly ?string $body = null,
        public readonly ?string $url = null,
        public readonly array $meta = [],
    ) {}

    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    public function toArray(object $notifiable): array
    {
        return ['kind' => $this->kind, 'title' => $this->title, 'body' => $this->body, 'url' => $this->url, 'meta' => $this->meta];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function databaseType(object $notifiable): string
    {
        return $this->kind;
    }
}
