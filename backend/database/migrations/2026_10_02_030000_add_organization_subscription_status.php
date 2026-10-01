<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $t) {
            $t->string('subscription_status')->default('active')->index();
            $t->timestampTz('suspended_at')->nullable();
            $t->text('suspension_reason')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn(['subscription_status','suspended_at','suspension_reason']));
    }
};
