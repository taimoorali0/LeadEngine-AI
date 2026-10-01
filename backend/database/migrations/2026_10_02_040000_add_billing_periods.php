<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Subscriptions are paid for a period (1/3/6/12 months), while credits refill
 * monthly within that period. credits_renew_at tracks the next monthly refill.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billing_requests', function (Blueprint $t) {
            $t->unsignedSmallInteger('months')->default(1);
        });
        Schema::table('organizations', function (Blueprint $t) {
            $t->timestampTz('credits_renew_at')->nullable();
        });
        // Existing organizations refill one month after their last renewal.
        DB::statement('UPDATE organizations SET credits_renew_at = plan_renews_at WHERE plan_renews_at IS NOT NULL');
    }

    public function down(): void
    {
        Schema::table('billing_requests', fn (Blueprint $t) => $t->dropColumn('months'));
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn('credits_renew_at'));
    }
};
