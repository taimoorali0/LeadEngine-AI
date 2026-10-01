import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { PIPELINE, label } from '../core/models';

@Component({
  selector: 'app-dashboard',
  imports: [TPipe, DecimalPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Dashboard' | t }}</h1>
    @if (stats(); as s) {
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        @for (t of tiles; track t.key) {
          <div class="card">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ t.label | t }}</div>
            <div class="mt-2 text-3xl font-bold tabular-nums">{{ s[t.key] | number }}</div>
          </div>
        }
      </div>
      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <div class="card">
          <h2 class="mb-4 font-semibold">{{ 'Pipeline' | t }}</h2>
          @for (st of pipeline; track st) {
            <div class="mb-2 flex items-center gap-3 text-sm">
              <span class="w-24 shrink-0 text-slate-600">{{ label(st) | t }}</span>
              <div class="h-2.5 flex-1 rounded-full bg-slate-100">
                <div class="h-2.5 rounded-full bg-indigo-500" [style.width.%]="pct(s['by_status']?.[st], s)"></div>
              </div>
              <span class="w-12 text-end tabular-nums">{{ s['by_status']?.[st] ?? 0 }}</span>
            </div>
          }
        </div>
        <div class="card">
          <h2 class="mb-4 font-semibold">{{ 'Lead quality' | t }}</h2>
          @for (q of qualities; track q) {
            <div class="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
              <span>{{ q | t }}</span><b class="tabular-nums">{{ s['by_quality']?.[q] ?? 0 }}</b>
            </div>
          }
        </div>
      </div>
    } @else {
      <p class="text-slate-500">{{ 'Loading…' | t }}</p>
    }
  `,
})
export class DashboardPage {
  protected stats = toSignal(inject(Api).dashboard());
  protected pipeline = PIPELINE;
  protected label = label;
  protected qualities = ['Highly Qualified', 'Qualified', 'Needs Review', 'Needs Enrichment'];
  protected tiles = [
    { key: 'total_companies', label: 'Total companies' },
    { key: 'new_leads_today', label: 'New leads today' },
    { key: 'verified_leads', label: 'Verified leads' },
    { key: 'high_quality', label: 'High-quality leads' },
    { key: 'with_phone', label: 'With phone' },
    { key: 'with_website', label: 'With website' },
    { key: 'with_email', label: 'With email' },
  ];

  pct(n: number | undefined, s: Record<string, any>): number {
    const max = Math.max(1, ...Object.values<number>(s['by_status'] ?? {}));
    return ((n ?? 0) / max) * 100;
  }
}
