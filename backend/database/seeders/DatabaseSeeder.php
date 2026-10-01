<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use App\Services\Billing;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        DB::unprepared(file_get_contents(base_path('../database/seed.sql')));

        $org = Organization::create(['name' => 'Demo Company', 'slug' => 'demo', 'plan' => 'professional']);
        app(Billing::class)->renew($org);
        User::create([
            'organization_id' => $org->id,
            'role_id' => Role::where('key', 'owner')->value('id'),
            'name' => 'Demo Owner',
            'email' => 'owner@leadengine.test',
            'password' => 'password',
        ]);
    }
}
