import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { Bars } from './bars';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Reports (spec §57). */
@Component({
  selector: 'app-reports',
  imports: [FormsModule, DecimalPipe, TPipe, Bars],
  template: `
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <h1 class="me-auto text-2xl font-bold">{{ 'Reports' | t }}</h1>
      @for (p of presets; track p.days) {
        <button class="btn-ghost" [class.!border-indigo-500]="activeDays === p.days" (click)="preset(p.days)">{{ p.label | t }}</button>
      }
      <input class="input !w-auto" type="date" [(ngModel)]="from" (change)="activeDays = 0; load()" [attr.aria-label]="'From' | t" />
      <input class="input !w-auto" type="date" [(ngModel)]="to" (change)="activeDays = 0; load()" [attr.aria-label]="'To' | t" />
    </div>

    @if (r(); as r) {
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-5">
        @for (k of funnelKeys; track k.key) {
          <div class="card">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ k.label | t }}</div>
            <div class="mt-2 text-3xl font-bold tabular-nums">{{ r.funnel[k.key] | number }}</div>
            @if (k.rate && r.rates[k.rate] !== null) { <div class="text-xs text-slate-500">{{ r.rates[k.rate] }}% {{ k.rateLabel | t }}</div> }
          </div>
        }
      </div>

      <section class="card mt-5">
        <h2 class="mb-3 font-semibold">{{ 'New leads per day' | t }}</h2>
        <div class="flex h-40 items-end gap-0.5" role="img" [attr.aria-label]="'New leads per day' | t">
          @for (d of days(); track d.day) {
            <div class="group relative flex h-full flex-1 items-end">
              <div class="w-full rounded-t bg-indigo-500 group-hover:bg-indigo-600" [style.height.%]="(d.n / dayMax()) * 100" [style.min-height.px]="d.n ? 2 : 0"></div>
              <div class="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">{{ d.day }}: {{ d.n }}</div>
            </div>
          }
        </div>
        <div class="mt-1 flex justify-between text-xs text-slate-500"><span>{{ r.range.from }}</span><span>{{ r.range.to }}</span></div>
      </section>

      <div class="mt-5 grid gap-5 lg:grid-cols-2">
        <section class="card"><h2 class="mb-3 font-semibold">{{ 'Leads by city' | t }}</h2><app-bars [rows]="rows(r.by_city)" /></section>
        <section class="card"><h2 class="mb-3 font-semibold">{{ 'Leads by industry' | t }}</h2><app-bars [rows]="rows(r.by_industry)" /></section>
        <section class="card"><h2 class="mb-3 font-semibold">{{ 'Lead quality' | t }}</h2><app-bars [rows]="rows(r.by_quality)" /></section>
        <section class="card"><h2 class="mb-3 font-semibold">{{ 'Leads by source' | t }}</h2><app-bars [rows]="rows(r.by_source, true)" /></section>
      </div>

      <section class="card mt-5 overflow-x-auto p-0">
        <h2 class="px-5 pt-5 font-semibold">{{ 'Agent performance' | t }}</h2>
        <table class="mt-3 w-full">
          <thead class="border-y border-slate-200 bg-slate-50"><tr>
            <th class="th">{{ 'Agent' | t }}</th><th class="th text-end">{{ 'Assigned' | t }}</th><th class="th text-end">{{ 'Calls' | t }}</th>
            <th class="th text-end">{{ 'Contacted' | t }}</th><th class="th text-end">{{ 'Meetings' | t }}</th><th class="th text-end">{{ 'Won' | t }}</th><th class="th text-end">{{ 'Conversion' | t }}</th>
          </tr></thead>
          <tbody>
            @for (a of r.agents; track a.id) {
              <tr class="border-b border-slate-100">
                <td class="td font-medium">{{ a.name }}</td><td class="td text-end tabular-nums">{{ a.assigned }}</td><td class="td text-end tabular-nums">{{ a.calls }}</td>
                <td class="td text-end tabular-nums">{{ a.contacted }}</td><td class="td text-end tabular-nums">{{ a.meetings }}</td><td class="td text-end tabular-nums">{{ a.won }}</td>
                <td class="td text-end tabular-nums">{{ a.conversion_rate ?? '—' }}{{ a.conversion_rate !== null ? '%' : '' }}</td>
              </tr>
            } @empty { <tr><td class="td text-slate-500" colspan="7">{{ 'No data for this period.' | t }}</td></tr> }
          </tbody>
        </table>
      </section>

      <div class="mt-5 grid gap-5 lg:grid-cols-3">
        <section class="card text-sm">
          <h2 class="mb-3 font-semibold">{{ 'Follow-up performance' | t }}</h2>
          @for (k of fuKeys; track k) {
            <div class="flex justify-between border-b border-slate-100 py-2 last:border-0"><span>{{ label(k) | t }}</span><b class="tabular-nums">{{ r.follow_ups[k] }}</b></div>
          }
        </section>
        <section class="card overflow-x-auto p-0 lg:col-span-2">
          <h2 class="px-5 pt-5 font-semibold">{{ 'Campaign performance' | t }}</h2>
          <table class="mt-3 w-full">
            <thead class="border-y border-slate-200 bg-slate-50"><tr>
              <th class="th">{{ 'Campaign' | t }}</th><th class="th text-end">{{ 'Leads' | t }}</th><th class="th text-end">{{ 'Qualified' | t }}</th>
              <th class="th text-end">{{ 'Avg. score' | t }}</th><th class="th text-end">{{ 'Won' | t }}</th><th class="th text-end">{{ 'Cost (USD)' | t }}</th>
            </tr></thead>
            <tbody>
              @for (c of r.campaigns; track c.id) {
                <tr class="border-b border-slate-100">
                  <td class="td">{{ c.name }}</td><td class="td text-end tabular-nums">{{ c.leads }}</td><td class="td text-end tabular-nums">{{ c.qualified }}</td>
                  <td class="td text-end tabular-nums">{{ c.avg_score ?? '—' }}</td><td class="td text-end tabular-nums">{{ c.won }}</td><td class="td text-end tabular-nums">{{ +c.cost_usd | number: '1.2-2' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      </div>
      <p class="mt-4 text-sm text-slate-500">{{ 'New companies discovered' | t }}: <b>{{ r.new_companies | number }}</b></p>
    }
  `,
})
export class ReportsPage implements OnInit {
  private api = inject(Api);
  r = signal<any>(null);
  from = iso(new Date(Date.now() - 30 * 864e5));
  to = iso(new Date());
  activeDays = 30;
  presets = [{ days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' }, { days: 90, label: 'Last 90 days' }];
  funnelKeys = [
    { key: 'leads', label: 'Leads' }, { key: 'contacted', label: 'Contacted', rate: 'contact_rate', rateLabel: 'contact rate' },
    { key: 'interested', label: 'Interested', rate: 'interest_rate', rateLabel: 'of contacted' },
    { key: 'meetings', label: 'Meetings', rate: 'meeting_rate', rateLabel: 'of contacted' },
    { key: 'won', label: 'Won', rate: 'conversion_rate', rateLabel: 'conversion' },
  ];
  fuKeys = ['scheduled', 'completed', 'on_time', 'overdue'];
  label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  /** Fills gaps so every day in range has a bar. */
  days = computed(() => {
    const r = this.r();
    if (!r) return [];
    const byDay = new Map<string, number>(r.leads_by_day.map((d: any) => [d.day, +d.n]));
    const out: { day: string; n: number }[] = [];
    for (let d = new Date(r.range.from); iso(d) <= r.range.to; d = new Date(d.getTime() + 864e5)) out.push({ day: iso(d), n: byDay.get(iso(d)) ?? 0 });
    return out;
  });
  dayMax = computed(() => Math.max(1, ...this.days().map(d => d.n)));

  ngOnInit() { this.load(); }

  preset(days: number) {
    this.activeDays = days;
    this.from = iso(new Date(Date.now() - days * 864e5));
    this.to = iso(new Date());
    this.load();
  }

  load() { this.api.reports(this.from, this.to).subscribe(r => this.r.set(r)); }

  rows(list: any[], titleCase = false) {
    return (list ?? []).map(x => ({ label: titleCase ? this.label(x.label) : x.label, value: +x.n, note: x.avg_score != null ? `avg score ${x.avg_score}` : undefined }));
  }
}
