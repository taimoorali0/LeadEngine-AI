<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->text('two_factor_recovery_codes')->nullable();
            $t->timestampTz('two_factor_confirmed_at')->nullable();
        });

        Schema::table('organizations', function (Blueprint $t) {
            $t->integer('credit_balance')->default(0);
            $t->timestampTz('plan_renews_at')->nullable();
        });

        Schema::table('companies', function (Blueprint $t) {
            // AI output is kept apart from sourced facts (spec §58).
            $t->text('ai_summary')->nullable();
            $t->timestampTz('ai_analyzed_at')->nullable();
        });

        Schema::table('campaigns', function (Blueprint $t) {
            $t->unsignedSmallInteger('refresh_interval_days')->nullable();
            $t->timestampTz('next_refresh_at')->nullable()->index();
        });

        Schema::table('follow_ups', function (Blueprint $t) {
            $t->timestampTz('reminded_at')->nullable();
        });

        Schema::create('notifications', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('type');
            $t->morphs('notifiable');
            $t->jsonb('data');
            $t->timestampTz('read_at')->nullable();
            $t->timestampsTz();
        });

        Schema::create('automation_rules', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('trigger');            // lead_created | lead_scored | status_changed
            $t->jsonb('conditions')->default('[]');
            $t->jsonb('actions')->default('[]');
            $t->boolean('enabled')->default(true);
            $t->unsignedSmallInteger('priority')->default(100);
            $t->unsignedInteger('runs')->default(0);
            $t->timestampsTz();
            $t->index(['organization_id', 'trigger', 'enabled']);
        });

        Schema::create('credit_transactions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->integer('amount');            // + top-up / plan grant, - usage
            $t->string('reason');
            $t->integer('balance_after');
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->timestampTz('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_transactions');
        Schema::dropIfExists('automation_rules');
        Schema::dropIfExists('notifications');
        Schema::table('follow_ups', fn (Blueprint $t) => $t->dropColumn('reminded_at'));
        Schema::table('campaigns', fn (Blueprint $t) => $t->dropColumn(['refresh_interval_days', 'next_refresh_at']));
        Schema::table('companies', fn (Blueprint $t) => $t->dropColumn(['ai_summary', 'ai_analyzed_at']));
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn(['credit_balance', 'plan_renews_at']));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['two_factor_recovery_codes', 'two_factor_confirmed_at']));
    }
};
