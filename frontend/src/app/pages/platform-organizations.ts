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
        <button class="btn-primary" (click)="openCreate()">+ New customer account</button>
      </div>
    </div>

    <div class="card !p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50"><tr>
            <th class="th">Organization</th><th class="th">Owner login</th><th class="th">Plan</th><th class="th">Status</th><th class="th">Users</th>
            <th class="th">Credits</th><th class="th">Renews</th><th class="th text-end">Actions</th>
          </tr></thead>
          <tbody>
            @for (o of rows(); track o.id) {
              <tr class="border-t border-slate-100">
                <td class="td"><div class="font-semibold text-slate-900">{{ o.name }}</div><div class="text-xs text-slate-400">{{ o.slug }}</div></td>
                <td class="td">@for (u of o.users ?? []; track u.id) { <div class="text-sm text-slate-800">{{ u.name }}</div><div class="text-xs text-slate-500">{{ u.email }}</div> } @empty { <span class="text-xs text-slate-400">—</span> }</td>
                <td class="td"><span class="badge bg-slate-100 text-slate-700">{{ title(o.plan) }}</span></td>
                <td class="td"><span class="badge" [class]="statusClass(o.subscription_status)">{{ title(o.subscription_status) }}</span></td>
                <td class="td tabular-nums">{{ o.users_count }}</td>
                <td class="td font-semibold tabular-nums">{{ o.credit_balance | number }}</td>
                <td class="td">{{ o.plan_renews_at ? (o.plan_renews_at | date:'mediumDate') : '—' }}</td>
                <td class="td text-end"><button class="btn-ghost !px-3 !py-1.5" (click)="edit(o)">Manage</button></td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="p-8 text-center text-sm text-slate-500">No organizations found.</td></tr>
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

            @for (u of o.users ?? []; track u.id) {
              <div class="mt-6 rounded-2xl border border-slate-200 p-4">
                <div class="text-sm font-semibold text-slate-900">Owner login: {{ u.email }}</div>
                <p class="mt-1 text-xs text-slate-500">Set a new password if the customer forgot it. Their 2FA is reset and they are signed out everywhere.</p>
                <div class="mt-3 flex gap-2">
                  <input class="input" type="text" [(ngModel)]="newPassword" placeholder="New password (min. 10 characters)" />
                  <button class="btn-ghost shrink-0" [disabled]="newPassword.length < 10 || busy()" (click)="resetPassword(u)">Set password</button>
                </div>
              </div>
            }
          </div>
        </aside>
      </div>
    }

    @if (creating()) {
      <div class="fixed inset-0 z-50 flex justify-end bg-slate-950/35" (click)="creating.set(false)">
        <aside class="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="mb-6 flex items-start justify-between gap-3">
            <div><div class="text-xs font-bold uppercase tracking-wider text-violet-600">Onboard a customer</div><h2 class="mt-1 text-2xl font-bold text-slate-950">New customer account</h2>
              <p class="mt-1 text-sm text-slate-500">Creates the company and its owner login. Send the email and password to the customer; they can add their team themselves.</p></div>
            <button class="btn-ghost !h-9 !w-9 !p-0" (click)="creating.set(false)">×</button>
          </div>
          <div class="space-y-4">
            <div><label class="label">Company name</label><input class="input" [(ngModel)]="form.name" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="label">Owner name</label><input class="input" [(ngModel)]="form.owner_name" /></div>
              <div><label class="label">Owner email (login)</label><input class="input" type="email" [(ngModel)]="form.owner_email" /></div>
            </div>
            <div><label class="label">Password</label>
              <div class="flex gap-2"><input class="input" type="text" [(ngModel)]="form.owner_password" /><button class="btn-ghost shrink-0" (click)="generate()">Generate</button></div></div>
            <div><label class="label">Plan</label><select class="input" [(ngModel)]="form.plan">
              <option value="starter">Starter</option><option value="professional">Professional</option><option value="business">Business</option><option value="enterprise">Enterprise</option>
            </select></div>
            <div><label class="label">Access</label><select class="input" [(ngModel)]="form.access">
              <option value="trial">Free trial</option><option value="paid">Paid (payment received)</option>
            </select></div>
            @if (form.access === 'trial') {
              <div><label class="label">Trial days</label><input class="input" type="number" min="1" max="90" [(ngModel)]="form.trial_days" /></div>
            } @else {
              <div><label class="label">Paid period</label><select class="input" [(ngModel)]="form.months">
                <option [ngValue]="1">1 month</option><option [ngValue]="3">3 months</option><option [ngValue]="6">6 months</option><option [ngValue]="12">12 months</option>
              </select></div>
            }
            @if (createError()) { <p class="text-sm text-rose-600">{{ createError() }}</p> }
            @if (created(); as c) {
              <div class="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <div class="font-semibold">Account created. Send these details to the customer:</div>
                <pre class="mt-2 whitespace-pre-wrap font-mono text-xs">{{ c }}</pre>
                <button class="btn-ghost mt-2 !py-1.5" (click)="copy(c)">Copy</button>
              </div>
            }
            <button class="btn-primary w-full" [disabled]="busy()" (click)="create()">{{ busy() ? 'Creating…' : 'Create account' }}</button>
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
  newPassword = '';
  creating = signal(false);
  created = signal('');
  createError = signal('');
  form: any = {};

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
  openCreate() {
    this.form = { name: '', owner_name: '', owner_email: '', owner_password: '', plan: 'starter', access: 'trial', trial_days: 14, months: 1 };
    this.generate(); this.created.set(''); this.createError.set(''); this.creating.set(true);
  }
  generate() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const buf = crypto.getRandomValues(new Uint32Array(12));
    this.form.owner_password = Array.from(buf, n => chars[n % chars.length]).join('');
  }
  create() {
    this.busy.set(true); this.createError.set('');
    this.api.createAdminOrganization(this.form).subscribe({
      next: () => {
        this.busy.set(false);
        this.created.set(`Website: ${location.origin}\nEmail: ${this.form.owner_email}\nPassword: ${this.form.owner_password}`);
        this.load();
      },
      error: e => {
        this.busy.set(false);
        this.createError.set(e.error?.errors ? (Object.values(e.error.errors)[0] as string[])[0] : e.error?.message ?? 'Could not create account.');
      },
    });
  }
  resetPassword(u: any) {
    this.busy.set(true);
    this.api.resetAdminUserPassword(u.id, this.newPassword).subscribe({
      next: () => { this.busy.set(false); this.notice.set(`New password set for ${u.email}: ${this.newPassword}`); this.newPassword = ''; },
      error: e => { this.busy.set(false); this.notice.set(e.error?.message ?? 'Could not set password.'); },
    });
  }
  copy(text: string) { navigator.clipboard?.writeText(text); }
  title(s: string) { return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  statusClass(s: string) { return s === 'active' ? 'bg-emerald-100 text-emerald-700' : s === 'suspended' ? 'bg-rose-100 text-rose-700' : s === 'expired' ? 'bg-slate-200 text-slate-700' : s === 'past_due' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'; }
}
