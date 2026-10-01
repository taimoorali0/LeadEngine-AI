import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';

@Component({
  selector: 'app-platform-billing',
  imports: [DatePipe, DecimalPipe, FormsModule],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><div class="text-sm font-semibold text-violet-600">Platform</div><h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Billing Requests</h1><p class="mt-1 text-sm text-slate-500">Approve upgrades, renewals, reactivations and credit requests.</p></div>
      <select class="input !w-auto" [(ngModel)]="status" (ngModelChange)="load()"><option value="">All statuses</option><option value="pending">Pending</option><option value="needs_info">Needs information</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
    </div>

    <div class="card !p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50"><tr><th class="th">Organization</th><th class="th">Request</th><th class="th">Payment</th><th class="th">Submitted</th><th class="th">Status</th><th class="th text-end">Action</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-t border-slate-100">
                <td class="td"><div class="font-semibold text-slate-900">{{ r.organization?.name }}</div><div class="text-xs text-slate-500">{{ r.requester?.name }} · {{ r.requester?.email }}</div></td>
                <td class="td"><div class="font-semibold">{{ label(r.type) }}</div><div class="text-xs text-slate-500">{{ r.requested_plan || (r.requested_credits ? (r.requested_credits | number) + ' credits' : '') }}</div></td>
                <td class="td"><div>{{ r.amount ? (r.amount | number:'1.0-2') + ' ' + r.currency : '—' }}</div><div class="text-xs text-slate-500">{{ r.payment_method || '' }} {{ r.transaction_reference || '' }}</div></td>
                <td class="td">{{ r.created_at | date:'medium' }}</td>
                <td class="td"><span class="badge" [class]="statusClass(r.status)">{{ label(r.status) }}</span></td>
                <td class="td text-end">
                  @if (r.status === 'pending' || r.status === 'needs_info') {
                    <div class="inline-flex gap-2">
                      <button class="btn-ghost !px-3 !py-1.5" (click)="review(r, 'needs_info')">Need info</button>
                      <button class="btn-ghost !px-3 !py-1.5" (click)="review(r, 'rejected')">Reject</button>
                      <button class="btn-primary !px-3 !py-1.5" (click)="review(r, 'approved')">Approve</button>
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="p-8 text-center text-sm text-slate-500">No billing requests.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class PlatformBillingPage implements OnInit {
  private api = inject(Api);
  rows = signal<any[]>([]);
  status = '';
  ngOnInit() { this.load(); }
  load() { this.api.adminBillingRequests(this.status || undefined).subscribe(r => this.rows.set(r.data ?? [])); }
  review(r: any, status: string) {
    const note = status === 'approved' ? '' : (prompt('Admin note (optional):') ?? '');
    this.api.reviewBillingRequest(r.id, { status, admin_note: note }).subscribe(() => this.load());
  }
  label = (s: string) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  statusClass(s: string) { return s === 'approved' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : s === 'needs_info' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'; }
}
