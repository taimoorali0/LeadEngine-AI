<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('type'); // upgrade | renewal | reactivation | credits
            $table->string('requested_plan')->nullable();
            $table->unsignedInteger('requested_credits')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->string('currency', 3)->default('PKR');
            $table->string('payment_method')->nullable();
            $table->string('transaction_reference')->nullable();
            $table->date('payment_date')->nullable();
            $table->string('payment_proof_path')->nullable();
            $table->text('message')->nullable();
            $table->string('status')->default('pending'); // pending | approved | rejected | needs_info
            $table->text('admin_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('reviewed_at')->nullable();
            $table->timestampsTz();
            $table->index(['organization_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_requests');
    }
};
