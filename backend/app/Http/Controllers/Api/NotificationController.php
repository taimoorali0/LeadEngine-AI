<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'unread' => $user->unreadNotifications()->count(),
            'items' => $user->notifications()->limit(50)->get(['id', 'type', 'data', 'read_at', 'created_at']),
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => 'array', 'ids.*' => 'uuid']);
        $q = $request->user()->unreadNotifications();
        if (! empty($data['ids'])) {
            $q->whereIn('id', $data['ids']);
        }
        $q->update(['read_at' => now()]);

        return response()->json(['unread' => $request->user()->unreadNotifications()->count()]);
    }
}
