<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The domain schema lives in /database/schema.sql (shared with the Python engine
 * and docker-compose), so it is loaded verbatim rather than duplicated here.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(file_get_contents(base_path('../database/schema.sql')));

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        DB::unprepared('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }
};
