<?php

namespace Tests;

use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function makeUser(string $role = 'owner', ?Organization $org = null): User
    {
        $org ??= Organization::firstOrCreate(['slug' => 'acme'], ['name' => 'Acme']);

        return User::create([
            'organization_id' => $org->id,
            'role_id' => Role::where('key', $role)->value('id'),
            'name' => ucfirst($role).' '.uniqid(),
            'email' => uniqid($role).'@example.test',
            'password' => 'secret-password',
        ]);
    }
}
