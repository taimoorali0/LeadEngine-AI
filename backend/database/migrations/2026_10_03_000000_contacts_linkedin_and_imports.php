<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $t) {
            $t->string('linkedin_url', 500)->nullable();
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->index('company_id');
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $t) {
            $t->dropConstrainedForeignId('created_by');
            $t->dropIndex(['company_id']);
            $t->dropColumn(['linkedin_url', 'notes']);
        });
    }
};
