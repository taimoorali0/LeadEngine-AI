import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';

@Component({
  selector: 'app-plan-usage',
  imports: [DatePipe, DecimalPipe, FormsModule, TPipe],
  template: `
    <div class="mb-6">
      <div class="text-sm font-semibold text-violet-600">{{ 'Account' | t }}</div>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">{{ 'Plan & Usage' | t }}</h1>
      <p class="mt-1 text-sm text-slate-500">{{ 'View your plan and submit upgrade, renewal, reactivation or credit requests.' | t }}</p>
    </div>

    @if (b(); as b) {
      <div class="grid gap-4 md:grid-cols-3">
        <div class="card"><div class="label">{{ 'Current plan' | t }}</div><div class="text-2xl font-bold text-slate-950">{{ b.plan.name }}</div><div class="mt-1 text-sm text-slate-500">{{ 'Renews' | t }} {{ b.renews_at ? (b.renews_at | date:'mediumDate') : '—' }}</div></div>
        <div class="card"><div class="label">{{ 'Credit balance' | t }}</div><div class="text-2xl font-bold text-violet-700 tabular-nums">{{ b.credit_balance | number }}</div><div class="mt-1 text-sm text-slate-500">{{ 'Usage-based discovery and enrichment credits' | t }}</div></div>
        <div class="card"><div class="label">{{ 'Active users' | t }}</div><div class="text-2xl font-bold text-slate-950 tabular-nums">{{ b.users }} / {{ b.plan.users ?? '∞' }}</div><div class="mt-1 text-sm text-slate-500">{{ 'Organization seats' | t }}</div></div>
      </div>

      <div class="mt-6 grid gap-5 xl:grid-cols-[1fr_420px]">
        <section class="card">
          <div class="mb-4 flex items-center justify-between">
            <div><h2 class="section-title">{{ 'Available plans' | t }}</h2><p class="muted">{{ 'Plan changes require Super Admin approval.' | t }}</p></div>
          </div>
          <div class="grid gap-4 lg:grid-cols-2">
            @for (p of entries(b.plans); track p.key) {
              <div class="rounded-2xl border p-4" [class]="p.key === b.plan_key ? 'border-violet-400 bg-violet-50/60' : 'border-slate-200 bg-white'">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-lg font-bold text-slate-950">{{ p.value.name }}</div>
                    <div class="text-sm text-slate-500">{{ p.value.monthly_credits | number }} {{ 'credits / month' | t }}</div>
                  </div>
                  @if (p.key === b.plan_key) { <span class="badge bg-violet-100 text-violet-700">{{ 'Current' | t }}</span> }
                  @else { <button class="btn-ghost !px-3 !py-2" (click)="start('upgrade', p.key)">{{ 'Request upgrade' | t }}</button> }
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                  <span>{{ p.value.users ?? '∞' }} {{ 'users' | t }}</span>
                  <span>{{ p.value.active_campaigns ?? '∞' }} {{ 'campaigns' | t }}</span>
                </div>
              </div>
            }
          </div>

          <h3 class="mt-6 mb-3 font-semibold text-slate-900">{{ 'Usage this month' | t }}</h3>
          @for (u of b.usage_this_month; track u.kind) {
            <div class="flex items-center justify-between border-b border-slate-100 py-2.5 text-sm">
              <span>{{ label(u.kind) }}</span><b class="tabular-nums">{{ u.credits | number }} {{ 'credits' | t }}</b>
            </div>
          } @empty { <p class="text-sm text-slate-500">{{ 'No usage yet.' | t }}</p> }
        </section>

        <aside class="space-y-5">
          <section class="card">
            <h2 class="section-title">{{ 'Request plan action' | t }}</h2>
            <p class="mt-1 text-sm text-slate-500">{{ 'Payments are reviewed manually by the platform Super Admin.' | t }}</p>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <button class="btn-ghost" (click)="start('renewal')">{{ 'Renew' | t }}</button>
              <button class="btn-ghost" (click)="start('reactivation')">{{ 'Reactivate' | t }}</button>
              <button class="btn-ghost col-span-2" (click)="start('credits')">{{ 'Request more credits' | t }}</button>
            </div>
          </section>

          @if (showForm()) {
            <form class="card space-y-3" (ngSubmit)="submit()">
              <div class="flex items-center justify-between"><h2 class="section-title">{{ label(type) }}</h2><button type="button" class="text-slate-400" (click)="showForm.set(false)">×</button></div>
              @if (type === 'upgrade') {
                <div><label class="label">{{ 'Requested plan' | t }}</label><select class="input" [(ngModel)]="requestedPlan" name="plan">
                  @for (p of entries(b.plans); track p.key) { <option [value]="p.key">{{ p.value.name }}</option> }
                </select></div>
              }
              @if (type === 'credits') {
                <div><label class="label">{{ 'Credits requested' | t }}</label><input class="input" type="number" min="1" [(ngModel)]="requestedCredits" name="credits" /></div>
              }
              <div class="grid grid-cols-2 gap-3">
                <div><label class="label">{{ 'Amount' | t }}</label><input class="input" type="number" step="0.01" [(ngModel)]="amount" name="amount" /></div>
                <div><label class="label">{{ 'Currency' | t }}</label><input class="input" [(ngModel)]="currency" name="currency" maxlength="3" /></div>
              </div>
              <div><label class="label">{{ 'Payment method' | t }}</label><input class="input" [(ngModel)]="paymentMethod" name="method" placeholder="Bank transfer" /></div>
              <div><label class="label">{{ 'Transaction reference' | t }}</label><input class="input" [(ngModel)]="reference" name="reference" /></div>
              <div><label class="label">{{ 'Payment proof' | t }}</label><input class="input" type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="proof = $any($event.target).files?.[0] ?? null" /></div>
              <div><label class="label">{{ 'Message' | t }}</label><textarea class="input min-h-24" [(ngModel)]="message" name="message"></textarea></div>
              @if (notice()) { <p class="text-sm" [class]="noticeOk() ? 'text-emerald-700' : 'text-rose-700'">{{ notice() }}</p> }
              <button class="btn-primary w-full" [disabled]="busy()">{{ busy() ? ('Submitting…' | t) : ('Submit request' | t) }}</button>
            </form>
          }

          <section class="card">
            <h2 class="section-title">{{ 'Recent requests' | t }}</h2>
            <div class="mt-3 space-y-2">
              @for (r of b.requests; track r.id) {
                <div class="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <div><div class="text-sm font-semibold">{{ label(r.type) }}</div><div class="text-xs text-slate-500">{{ r.created_at | date:'mediumDate' }}</div></div>
                  <span class="badge" [class]="statusClass(r.status)">{{ label(r.status) }}</span>
                </div>
              } @empty { <p class="text-sm text-slate-500">{{ 'No requests submitted.' | t }}</p> }
            </div>
          </section>
        </aside>
      </div>
    }
  `,
})
export class PlanUsagePage implements OnInit {
  private api = inject(Api);
  b = signal<any>(null);
  showForm = signal(false);
  notice = signal('');
  noticeOk = signal(false);
  busy = signal(false);
  type = 'renewal';
  requestedPlan = 'professional';
  requestedCredits: number | null = null;
  amount: number | null = null;
  currency = 'PKR';
  paymentMethod = '';
  reference = '';
  message = '';
  proof: File | null = null;

  ngOnInit() { this.reload(); }
  reload() { this.api.billing().subscribe(x => this.b.set(x)); }
  entries = (o: Record<string, any>) => Object.entries(o ?? {}).map(([key, value]) => ({ key, value: value as any }));
  label = (s: string) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  start(type: string, plan?: string) {
    this.type = type; if (plan) this.requestedPlan = plan;
    this.notice.set(''); this.showForm.set(true);
  }

  submit() {
    const fd = new FormData();
    fd.append('type', this.type);
    if (this.type === 'upgrade') fd.append('requested_plan', this.requestedPlan);
    if (this.type === 'credits' && this.requestedCredits) fd.append('requested_credits', String(this.requestedCredits));
    if (this.amount !== null) fd.append('amount', String(this.amount));
    fd.append('currency', this.currency || 'PKR');
    if (this.paymentMethod) fd.append('payment_method', this.paymentMethod);
    if (this.reference) fd.append('transaction_reference', this.reference);
    if (this.message) fd.append('message', this.message);
    if (this.proof) fd.append('payment_proof', this.proof);
    this.busy.set(true); this.notice.set('');
    this.api.submitBillingRequest(fd).subscribe({
      next: () => { this.busy.set(false); this.noticeOk.set(true); this.notice.set('Request submitted for Super Admin review.'); this.reload(); },
      error: e => { this.busy.set(false); this.noticeOk.set(false); this.notice.set(e.error?.message ?? 'Could not submit request.'); },
    });
  }

  statusClass(s: string) {
    return s === 'approved' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : s === 'needs_info' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700';
  }
}
