<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_login_returns_token_and_permissions_and_is_audited(): void
    {
        $user = $this->makeUser('agent');

        $res = $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'secret-password'])->assertOk();

        $this->assertContains('leads.view_assigned', $res->json('user.permissions'));
        $this->assertNotContains('leads.view_all', $res->json('user.permissions'));
        $this->assertSame('agent', $res->json('user.role.key'));
        $this->withToken($res->json('token'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('id', $user->id);
        $this->assertTrue(AuditLog::where('action', 'auth.login')->where('user_id', $user->id)->exists());
    }

    public function test_wrong_password_rejected_and_rate_limited(): void
    {
        $user = $this->makeUser();
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'nope'])->assertStatus(422);
        }
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'secret-password'])->assertStatus(429);
    }

    public function test_api_requires_auth(): void
    {
        $this->getJson('/api/leads')->assertUnauthorized();
    }
}
