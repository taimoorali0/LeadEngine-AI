import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';

@Component({
  selector: 'app-platform-organizations',
  imports: [DatePipe, DecimalPipe, FormsModule],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-violet-600">Platform</div>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">Organizations</h1>
        <p class="mt-1 text-sm text-slate-500">Manage customer plans, account status, credits and renewal dates.</p>
      </div>
      <div class="flex gap-2">
        <input class="input w-64" [(ngModel)]="q" (keyup.enter)="load()" placeholder="Search organization..." />
        <select class="input !w-auto" [(ngModel)]="status" (ngModelChange)="load()">
          <option value="">All statuses</option>
          <option value="active">Active</option><option value="trialing">Trialing</option>
          <option value="past_due">Past due</option><option value="expired">Expired</option><option value="suspended">Suspended</option>
        </select>
        <button class="btn-ghost" (click)="load()">Search</button>
      </div>
    </div>

    <div class="card !p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50"><tr>
            <th class="th">Organization</th><th class="th">Plan</th><th class="th">Status</th><th class="th">Users</th>
            <th class="th">Credits</th><th class="th">Renews</th><th class="th text-end">Actions</th>
          </tr></thead>
          <tbody>
            @for (o of rows(); track o.id) {
              <tr class="border-t border-slate-100">
                <td class="td"><div class="font-semibold text-slate-900">{{ o.name }}</div><div class="text-xs text-slate-400">{{ o.slug }}</div></td>
                <td class="td"><span class="badge bg-slate-100 text-slate-700">{{ title(o.plan) }}</span></td>
                <td class="td"><span class="badge" [class]="statusClass(o.subscription_status)">{{ title(o.subscription_status) }}</span></td>
                <td class="td tabular-nums">{{ o.users_count }}</td>
                <td class="td font-semibold tabular-nums">{{ o.credit_balance | number }}</td>
                <td class="td">{{ o.plan_renews_at ? (o.plan_renews_at | date:'mediumDate') : '—' }}</td>
                <td class="td text-end"><button class="btn-ghost !px-3 !py-1.5" (click)="edit(o)">Manage</button></td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="p-8 text-center text-sm text-slate-500">No organizations found.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (selected(); as o) {
      <div class="fixed inset-0 z-50 flex justify-end bg-slate-950/35" (click)="selected.set(null)">
        <aside class="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="mb-6 flex items-start justify-between gap-3">
            <div><div class="text-xs font-bold uppercase tracking-wider text-violet-600">Manage organization</div><h2 class="mt-1 text-2xl font-bold text-slate-950">{{ o.name }}</h2></div>
            <button class="btn-ghost !h-9 !w-9 !p-0" (click)="selected.set(null)">×</button>
          </div>

          <div class="space-y-4">
            <div><label class="label">Plan</label><select class="input" [(ngModel)]="editPlan">
              <option value="starter">Starter</option><option value="professional">Professional</option><option value="business">Business</option><option value="enterprise">Enterprise</option>
            </select></div>
            <div><label class="label">Subscription status</label><select class="input" [(ngModel)]="editStatus">
              <option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="expired">Expired</option><option value="suspended">Suspended</option>
            </select></div>
            <div><label class="label">Renewal date</label><input class="input" type="date" [(ngModel)]="editRenewal" /></div>
            <div><label class="label">Credit adjustment</label><input class="input" type="number" [(ngModel)]="creditAdjustment" placeholder="+5000 or -500" /></div>
            @if (editStatus === 'suspended') {
              <div><label class="label">Suspension reason</label><textarea class="input min-h-24" [(ngModel)]="reason"></textarea></div>
            }
            @if (notice()) { <p class="text-sm text-emerald-700">{{ notice() }}</p> }
            <button class="btn-primary w-full" [disabled]="busy()" (click)="save()">{{ busy() ? 'Saving…' : 'Save changes' }}</button>
          </div>
        </aside>
      </div>
    }
  `,
})
export class PlatformOrganizationsPage implements OnInit {
  private api = inject(Api);
  rows = signal<any[]>([]);
  selected = signal<any | null>(null);
  busy = signal(false);
  notice = signal('');
  q = '';
  status = '';
  editPlan = '';
  editStatus = '';
  editRenewal = '';
  creditAdjustment: number | null = null;
  reason = '';

  ngOnInit() { this.load(); }
  load() { this.api.adminOrganizations({ q: this.q, status: this.status }).subscribe(r => this.rows.set(r.data ?? [])); }
  edit(o: any) {
    this.selected.set(o); this.editPlan = o.plan; this.editStatus = o.subscription_status ?? 'active';
    this.editRenewal = o.plan_renews_at ? String(o.plan_renews_at).slice(0, 10) : '';
    this.creditAdjustment = null; this.reason = o.suspension_reason ?? ''; this.notice.set('');
  }
  save() {
    const o = this.selected(); if (!o) return;
    this.busy.set(true);
    this.api.updateAdminOrganization(o.id, {
      plan: this.editPlan, subscription_status: this.editStatus,
      plan_renews_at: this.editRenewal || null, credit_adjustment: this.creditAdjustment,
      suspension_reason: this.editStatus === 'suspended' ? this.reason : null,
    }).subscribe({
      next: updated => { this.busy.set(false); this.notice.set('Organization updated.'); this.selected.set(updated); this.load(); },
      error: e => { this.busy.set(false); this.notice.set(e.error?.message ?? 'Could not update organization.'); },
    });
  }
  title(s: string) { return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  statusClass(s: string) { return s === 'active' ? 'bg-emerald-100 text-emerald-700' : s === 'suspended' ? 'bg-rose-100 text-rose-700' : s === 'expired' ? 'bg-slate-200 text-slate-700' : s === 'past_due' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'; }
}
