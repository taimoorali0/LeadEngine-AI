<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', fn ($user, $id) => (int) $user->id === (int) $id);

// Campaign progress and other organization-wide live updates.
Broadcast::channel('organization.{id}', fn ($user, $id) => (int) $user->organization_id === (int) $id);
