import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { AuthService } from '../core/auth';

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
        <div class="card"><div class="label">{{ 'Current plan' | t }}</div><div class="text-2xl font-bold text-slate-950">{{ b.plan.name }}</div><div class="mt-1 text-sm text-slate-500">{{ 'Paid until' | t }} {{ b.renews_at ? (b.renews_at | date:'mediumDate') : '—' }}</div></div>
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
                  @else if (canRequest) { <button class="btn-ghost !px-3 !py-2" (click)="start('upgrade', p.key)">{{ 'Request upgrade' | t }}</button> }
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
          @if (canRequest) {
          <section class="card">
            <h2 class="section-title">{{ 'Request plan action' | t }}</h2>
            <p class="mt-1 text-sm text-slate-500">{{ 'Payments are reviewed manually by the platform Super Admin.' | t }}</p>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <button class="btn-ghost" (click)="start('renewal')">{{ 'Renew' | t }}</button>
              <button class="btn-ghost" (click)="start('reactivation')">{{ 'Reactivate' | t }}</button>
              <button class="btn-ghost col-span-2" (click)="start('credits')">{{ 'Request more credits' | t }}</button>
            </div>
          </section>
          } @else {
            <p class="card text-sm text-slate-500">{{ 'Ask your company owner to request plan changes.' | t }}</p>
          }

          @if (showForm()) {
            <form class="card space-y-3" (ngSubmit)="submit()">
              <div class="flex items-center justify-between"><h2 class="section-title">{{ label(type) }}</h2><button type="button" class="text-slate-400" (click)="showForm.set(false)">×</button></div>
              @if (type === 'upgrade') {
                <div><label class="label">{{ 'Requested plan' | t }}</label><select class="input" [(ngModel)]="requestedPlan" name="plan" (ngModelChange)="fillAmount()">
                  @for (p of entries(b.plans); track p.key) { <option [value]="p.key">{{ p.value.name }}</option> }
                </select></div>
              }
              @if (type !== 'credits') {
                <div><label class="label">{{ 'Billing period' | t }}</label><select class="input" [(ngModel)]="months" name="months" (ngModelChange)="fillAmount()">
                  @for (m of [1, 3, 6, 12]; track m) { <option [ngValue]="m">{{ (m === 1 ? '1 month' : '{n} months') | t: { n: m } }}</option> }
                </select></div>
              }
              @if (type === 'credits') {
                <div><label class="label">{{ 'Credits requested' | t }}</label><input class="input" type="number" min="1" [(ngModel)]="requestedCredits" name="credits" /></div>
              }
              @if (b.payment_info; as pi) {
                @if (pi.bank_name || pi.account_number || pi.iban || pi.wallets || pi.instructions) {
                  <div class="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-slate-700">
                    <div class="mb-2 font-semibold text-violet-800">{{ 'Send payment to' | t }}</div>
                    @if (pi.bank_name) { <div><span class="text-slate-500">{{ 'Bank' | t }}:</span> {{ pi.bank_name }}</div> }
                    @if (pi.account_title) { <div><span class="text-slate-500">{{ 'Account title' | t }}:</span> {{ pi.account_title }}</div> }
                    @if (pi.account_number) { <div><span class="text-slate-500">{{ 'Account number' | t }}:</span> <span class="font-mono">{{ pi.account_number }}</span></div> }
                    @if (pi.iban) { <div><span class="text-slate-500">IBAN:</span> <span class="font-mono">{{ pi.iban }}</span></div> }
                    @if (pi.wallets) { <div class="mt-1 whitespace-pre-line">{{ pi.wallets }}</div> }
                    @if (pi.instructions) { <div class="mt-2 whitespace-pre-line text-xs text-slate-500">{{ pi.instructions }}</div> }
                  </div>
                }
              }
              <div class="grid grid-cols-2 gap-3">
                <div><label class="label">{{ 'Amount' | t }}</label><input class="input" type="number" step="0.01" [(ngModel)]="amount" name="amount" /></div>
                <div><label class="label">{{ 'Currency' | t }}</label><input class="input" [(ngModel)]="currency" name="currency" maxlength="3" /></div>
              </div>
              <div><label class="label">{{ 'Payment method' | t }}</label><input class="input" [(ngModel)]="paymentMethod" name="method" placeholder="Bank transfer" /></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="label">{{ 'Transaction reference' | t }}</label><input class="input" [(ngModel)]="reference" name="reference" /></div>
                <div><label class="label">{{ 'Payment date' | t }}</label><input class="input" type="date" [(ngModel)]="paymentDate" name="paymentDate" /></div>
              </div>
              <p class="text-xs text-slate-500">{{ 'Attach a receipt/screenshot or enter the transaction ID — at least one is required.' | t }}</p>
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
                  <div><div class="text-sm font-semibold">{{ label(r.type) }}</div><div class="text-xs text-slate-500">{{ r.created_at | date:'mediumDate' }}</div>
                    @if (r.admin_note) { <div class="mt-1 text-xs text-amber-700">{{ r.admin_note }}</div> }</div>
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
  protected canRequest = inject(AuthService).can('billing.manage');
  months = 12;
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
  paymentDate = new Date().toISOString().slice(0, 10);

  ngOnInit() { this.reload(); }
  reload() { this.api.billing().subscribe(x => this.b.set(x)); }
  entries = (o: Record<string, any>) => Object.entries(o ?? {}).map(([key, value]) => ({ key, value: value as any }));
  label = (s: string) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  start(type: string, plan?: string) {
    this.type = type; if (plan) this.requestedPlan = plan;
    this.notice.set(''); this.showForm.set(true);
    this.currency = this.b()?.payment_info?.currency ?? 'PKR';
    this.fillAmount();
  }

  /** Suggest the amount from the platform's local price list (plan price × months). */
  fillAmount() {
    const prices = this.b()?.payment_info?.prices ?? {};
    const plan = this.type === 'upgrade' ? this.requestedPlan : this.b()?.plan_key;
    const price = Number(prices[plan]);
    if (this.type !== 'credits' && price > 0) this.amount = price * this.months;
  }

  submit() {
    const fd = new FormData();
    fd.append('type', this.type);
    if (this.type === 'upgrade') fd.append('requested_plan', this.requestedPlan);
    if (this.type !== 'credits') fd.append('months', String(this.months));
    if (this.type === 'credits' && this.requestedCredits) fd.append('requested_credits', String(this.requestedCredits));
    if (this.amount !== null) fd.append('amount', String(this.amount));
    fd.append('currency', this.currency || 'PKR');
    if (this.paymentMethod) fd.append('payment_method', this.paymentMethod);
    if (this.reference) fd.append('transaction_reference', this.reference);
    if (this.paymentDate) fd.append('payment_date', this.paymentDate);
    if (this.message) fd.append('message', this.message);
    if (!this.proof && !this.reference.trim()) { this.noticeOk.set(false); this.notice.set('Attach payment proof or enter the transaction reference.'); return; }
    if (this.proof) fd.append('payment_proof', this.proof);
    this.busy.set(true); this.notice.set('');
    this.api.submitBillingRequest(fd).subscribe({
      next: () => {
        this.busy.set(false); this.noticeOk.set(true); this.notice.set('Request submitted for Super Admin review.');
        this.reference = ''; this.message = ''; this.proof = null; this.reload();
      },
      error: e => {
        this.busy.set(false); this.noticeOk.set(false);
        this.notice.set(e.error?.errors ? (Object.values(e.error.errors)[0] as string[])[0] : e.error?.message ?? 'Could not submit request.');
      },
    });
  }

  statusClass(s: string) {
    return s === 'approved' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : s === 'needs_info' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700';
  }
}
