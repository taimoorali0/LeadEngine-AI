import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TPipe } from '../core/i18n/i18n';
import { apiError } from './account';

/** Plans, credits and usage (spec §65-66). */
@Component({
  selector: 'app-billing',
  imports: [DatePipe, DecimalPipe, TPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Billing' | t }}</h1>
    @if (b(); as b) {
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="card"><div class="label">{{ 'Current plan' | t }}</div><div class="text-2xl font-bold">{{ b.plan.name | t }}</div></div>
        <div class="card"><div class="label">{{ 'Credit balance' | t }}</div><div class="text-2xl font-bold tabular-nums">{{ b.credit_balance | number }}</div>
          <div class="text-xs text-slate-500">{{ 'Renews' | t }} {{ b.renews_at ? (b.renews_at | date: 'mediumDate') : '—' }}</div></div>
        <div class="card"><div class="label">{{ 'Active users' | t }}</div><div class="text-2xl font-bold tabular-nums">{{ b.users }} / {{ b.plan.users ?? '∞' }}</div></div>
      </div>

      <h2 class="mt-6 mb-3 font-semibold">{{ 'Plans' | t }}</h2>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        @for (p of entries(b.plans); track p.key) {
          <div class="card flex flex-col" [class.!border-indigo-500]="p.key === b.plan_key" [class.ring-2]="p.key === b.plan_key" [class.ring-indigo-100]="p.key === b.plan_key">
            <div class="text-lg font-bold">{{ p.value.name | t }}</div>
            <div class="mb-3 text-sm text-slate-500">{{ p.value.price_usd !== null ? '$' + p.value.price_usd + ' / ' + ('month' | t) : ('Contact sales' | t) }}</div>
            <ul class="mb-4 flex-1 space-y-1 text-sm">
              <li>{{ p.value.users ?? '∞' }} {{ 'users' | t }}</li>
              <li>{{ p.value.active_campaigns ?? '∞' }} {{ 'running campaigns' | t }}</li>
              <li>{{ p.value.monthly_credits | number }} {{ 'credits / month' | t }}</li>
              @for (f of p.value.features; track f) { <li class="text-slate-600">✓ {{ label(f) | t }}</li> }
            </ul>
            @if (p.key === b.plan_key) { <span class="badge self-start bg-indigo-100 text-indigo-800">{{ 'Current plan' | t }}</span> }
            @else if (canManage) { <button class="btn-ghost" (click)="change(p.key)">{{ 'Switch' | t }}</button> }
          </div>
        }
      </div>
      <p class="mt-2 text-xs text-slate-500">{{ 'No payment provider is connected yet: plan changes apply immediately and are invoiced manually.' | t }}</p>
      @if (error()) { <p class="mt-2 text-sm text-red-600">{{ error() | t }}</p> }

      <div class="mt-6 grid gap-5 lg:grid-cols-2">
        <section class="card">
          <h2 class="mb-3 font-semibold">{{ 'Usage this month' | t }}</h2>
          @for (u of b.usage_this_month; track u.kind) {
            <div class="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0"><span>{{ label(u.kind) | t }}</span><span class="tabular-nums">{{ u.units }} × → <b>{{ u.credits }}</b> {{ 'credits' | t }}</span></div>
          } @empty { <p class="text-sm text-slate-500">{{ 'No usage yet.' | t }}</p> }
          <h3 class="mt-4 mb-2 text-sm font-semibold">{{ 'Credit costs' | t }}</h3>
          @for (c of entries(b.costs); track c.key) {
            <div class="flex justify-between py-1 text-sm"><span>{{ label(c.key) | t }}</span><span>{{ c.value.credits }}</span></div>
          }
        </section>
        <section class="card">
          <h2 class="mb-3 font-semibold">{{ 'Recent credit activity' | t }}</h2>
          @for (tx of b.transactions; track tx.id) {
            <div class="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
              <span>{{ label(tx.reason) | t }} <span class="text-xs text-slate-400">{{ tx.created_at | date: 'short' }}</span></span>
              <span class="tabular-nums" [class.text-emerald-700]="tx.amount > 0">{{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }}</span>
            </div>
          }
        </section>
      </div>
    }
  `,
})
export class BillingPage implements OnInit {
  private api = inject(Api);
  private auth = inject(AuthService);
  b = signal<any>(null);
  error = signal('');
  canManage = this.auth.can('billing.manage');
  entries = (o: Record<string, any>) => Object.entries(o ?? {}).map(([key, value]) => ({ key, value: value as any }));
  label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  ngOnInit() { this.api.billing().subscribe(b => this.b.set(b)); }

  change(plan: string) {
    if (!confirm(`Switch to ${plan}?`)) return;
    this.api.changePlan(plan).subscribe({
      next: b => { this.b.set(b); this.auth.user.update(u => u && u.organization ? { ...u, organization: { ...u.organization, plan, credit_balance: b.credit_balance } } : u); },
      error: e => this.error.set(apiError(e)),
    });
  }
}
