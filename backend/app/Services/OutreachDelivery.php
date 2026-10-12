<?php
namespace App\Services;

use App\Models\OutreachMessage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use RuntimeException;

class OutreachDelivery
{
    public function send(OutreachMessage $message, array $config): ?string
    {
        if ($message->channel === 'email') {
            $email = $config['email'] ?? [];
            if (empty($email['host']) || empty($email['from_address'])) {
                throw new RuntimeException('Email connection is incomplete.');
            }
            $mailer = Mail::build([
                'transport' => 'smtp', 'host' => $email['host'], 'port' => $email['port'] ?? 587,
                'scheme' => ($email['port'] ?? 587) == 465 ? 'smtps' : 'smtp',
                'username' => $email['username'] ?? null, 'password' => $email['password'] ?? null,
                'timeout' => 30,
            ]);
            $url = url('/api/outreach/unsubscribe/'.$message->unsubscribe_token);
            $sent = $mailer->raw($message->body."\n\nTo stop these messages: ".$url, function ($mail) use ($message, $email, $config) {
                $mail->to($message->recipient)->from($email['from_address'], $config['seller_name'])->subject($message->subject);
            });
            return $sent?->getMessageId();
        }
        $wa = $config['whatsapp'] ?? [];
        if (empty($wa['token']) || empty($wa['phone_number_id']) || empty($wa['api_version']) || ! $message->template) {
            throw new RuntimeException('WhatsApp connection or approved template is incomplete.');
        }
        $response = Http::withToken($wa['token'])->timeout(30)->post(
            'https://graph.facebook.com/'.$wa['api_version'].'/'.$wa['phone_number_id'].'/messages',
            ['messaging_product' => 'whatsapp', 'to' => ltrim($message->recipient, '+'), 'type' => 'template', 'template' => $message->template]
        );
        if (! $response->successful() || ! $response->json('messages.0.id')) {
            // Never expose provider responses containing credentials or personal data.
            throw new RuntimeException('WhatsApp provider did not confirm acceptance. Check provider logs.');
        }
        return $response->json('messages.0.id');
    }
}
