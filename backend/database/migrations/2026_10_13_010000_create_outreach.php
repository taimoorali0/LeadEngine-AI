<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', fn (Blueprint $t) => $t->text('outreach_config')->nullable());
        Schema::create('outreach_permissions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->string('channel', 20);
            $t->string('recipient', 254);
            $t->boolean('allowed')->default(false);
            $t->text('evidence')->nullable();
            $t->timestamp('recorded_at')->nullable();
            $t->timestamps();
            $t->unique(['organization_id', 'channel', 'recipient']);
        });
        Schema::create('outreach_messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('channel', 20);
            $t->string('recipient', 254);
            $t->string('subject', 200);
            $t->text('body');
            $t->jsonb('research')->default('{}');
            $t->jsonb('template')->nullable();
            $t->string('status', 30)->default('draft');
            $t->string('provider_id')->nullable()->index();
            $t->text('error')->nullable();
            $t->string('unsubscribe_token', 64)->unique();
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('attempted_at')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamp('replied_at')->nullable();
            $t->timestamps();
            $t->index(['organization_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_messages');
        Schema::dropIfExists('outreach_permissions');
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn('outreach_config'));
    }
};
