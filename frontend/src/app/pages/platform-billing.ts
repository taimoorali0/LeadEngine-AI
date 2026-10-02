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

    <details class="card mb-6" [open]="!hasPaymentInfo()">
      <summary class="cursor-pointer font-semibold text-slate-900">Payment details shown to customers @if (!hasPaymentInfo()) { <span class="badge ms-2 bg-amber-100 text-amber-700">Not set</span> }</summary>
      <p class="mt-1 text-sm text-slate-500">Customers see these on their Billing page when they renew, upgrade or buy credits.</p>
      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <div><label class="label">Bank name</label><input class="input" [(ngModel)]="pi.bank_name" /></div>
        <div><label class="label">Account title</label><input class="input" [(ngModel)]="pi.account_title" /></div>
        <div><label class="label">Account number</label><input class="input" [(ngModel)]="pi.account_number" /></div>
        <div><label class="label">IBAN</label><input class="input" [(ngModel)]="pi.iban" /></div>
        <div class="md:col-span-2"><label class="label">Mobile wallets (JazzCash, EasyPaisa, STC Pay…)</label><textarea class="input min-h-16" [(ngModel)]="pi.wallets" placeholder="JazzCash: 03xx-xxxxxxx (Name)"></textarea></div>
        <div class="md:col-span-2"><label class="label">Instructions</label><textarea class="input min-h-16" [(ngModel)]="pi.instructions" placeholder="Send the screenshot with your request. Activation within 24 hours."></textarea></div>
        <div><label class="label">Currency</label><input class="input" maxlength="3" [(ngModel)]="pi.currency" /></div>
      </div>
      <div class="mt-4"><label class="label">Monthly price per plan ({{ pi.currency }})</label>
        <div class="grid gap-3 sm:grid-cols-4">
          @for (p of planKeys; track p) { <div><div class="mb-1 text-xs text-slate-500">{{ label(p) }}</div><input class="input" type="number" min="0" [(ngModel)]="pi.prices[p]" /></div> }
        </div>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button class="btn-primary" (click)="savePaymentInfo()">Save payment details</button>
        @if (piNotice()) { <span class="text-sm text-emerald-700">{{ piNotice() }}</span> }
      </div>
    </details>

    <div class="card !p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50"><tr><th class="th">Organization</th><th class="th">Request</th><th class="th">Payment</th><th class="th">Submitted</th><th class="th">Status</th><th class="th text-end">Action</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-t border-slate-100">
                <td class="td"><div class="font-semibold text-slate-900">{{ r.organization?.name }}</div><div class="text-xs text-slate-500">{{ r.requester?.name }} · {{ r.requester?.email }}</div></td>
                <td class="td"><div class="font-semibold">{{ label(r.type) }}</div><div class="text-xs text-slate-500">{{ r.requested_plan || (r.requested_credits ? (r.requested_credits | number) + ' credits' : '') }}@if (r.type !== 'credits') { · {{ r.months }} {{ r.months === 1 ? 'month' : 'months' }} }</div></td>
                <td class="td"><div>{{ r.amount ? (r.amount | number:'1.0-2') + ' ' + r.currency : '—' }}</div><div class="text-xs text-slate-500">{{ r.payment_method || '' }} {{ r.transaction_reference || '' }}</div>@if (r.payment_date) { <div class="text-xs text-slate-500">Paid {{ r.payment_date | date:'mediumDate' }}</div> }
                  @if(r.payment_proof_path){<button type="button" class="mt-1 text-xs font-semibold text-violet-700" (click)="openProof(r)">View proof ↗</button>} @else { <div class="text-xs text-amber-600">No proof file</div> }
                  @if (r.message) { <div class="mt-1 max-w-xs text-xs italic text-slate-500">“{{ r.message }}”</div> }</td>
                <td class="td">{{ r.created_at | date:'medium' }}</td>
                <td class="td"><span class="badge" [class]="statusClass(r.status)">{{ label(r.status) }}</span>
                  @if (r.admin_note) { <div class="mt-1 text-xs text-slate-500">{{ r.admin_note }}</div> }</td>
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
  pi: any = { prices: {} };
  piNotice = signal('');
  planKeys = ['starter', 'professional', 'business', 'enterprise'];
  ngOnInit() { this.load(); this.api.paymentInfo().subscribe(x => this.pi = { ...x, prices: { ...(x.prices ?? {}) } }); }
  hasPaymentInfo() { return !!(this.pi.bank_name || this.pi.account_number || this.pi.iban || this.pi.wallets); }
  savePaymentInfo() {
    this.piNotice.set('');
    this.api.updatePaymentInfo(this.pi).subscribe({
      next: x => { this.pi = { ...x, prices: { ...(x.prices ?? {}) } }; this.piNotice.set('Saved.'); },
      error: e => this.piNotice.set(e.error?.message ?? 'Could not save.'),
    });
  }
  load() { this.api.adminBillingRequests(this.status || undefined).subscribe(r => this.rows.set(r.data ?? [])); }
  review(r: any, status: string) {
    const note = status === 'approved' ? '' : (prompt('Admin note (optional):') ?? '');
    if (status === 'approved' && !r.payment_proof_path && !confirm('This request has no proof file. Approve anyway?')) return;
    this.api.reviewBillingRequest(r.id, { status, admin_note: note }).subscribe({
      next: () => this.load(),
      error: e => alert(e.error?.message ?? 'Could not update request.'),
    });
  }

  openProof(r: any) {
    // Open the tab synchronously (popup blockers), then load the file into it.
    const win = window.open('', '_blank');
    this.api.billingProof(r.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (win) win.location.href = url; else window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => { win?.close(); alert('Proof file not found on the server.'); },
    });
  }
  label = (s: string) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  statusClass(s: string) { return s === 'approved' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : s === 'needs_info' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'; }
}
