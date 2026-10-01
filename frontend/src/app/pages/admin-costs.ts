import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';

/** Super admin cost dashboard (spec §67). */
@Component({
  selector: 'app-admin-costs',
  imports: [DecimalPipe, TPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Cost Dashboard' | t }}</h1>
    @if (c(); as c) {
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="card"><div class="label">{{ 'Total cost this month' | t }}</div><div class="text-2xl font-bold tabular-nums">\${{ c.total_cost_usd | number: '1.2-2' }}</div></div>
        <div class="card"><div class="label">{{ 'Leads' | t }}</div><div class="text-2xl font-bold tabular-nums">{{ c.leads | number }}</div></div>
        <div class="card"><div class="label">{{ 'Cost per lead' | t }}</div><div class="text-2xl font-bold tabular-nums">{{ c.cost_per_lead !== null ? '$' + (c.cost_per_lead | number: '1.3-3') : '—' }}</div></div>
        <div class="card"><div class="label">{{ 'Cost per qualified lead' | t }}</div><div class="text-2xl font-bold tabular-nums">{{ c.cost_per_qualified_lead !== null ? '$' + (c.cost_per_qualified_lead | number: '1.3-3') : '—' }}</div></div>
      </div>
      <div class="mt-5 grid gap-5 lg:grid-cols-3">
        @for (sec of sections; track sec.key) {
          <section class="card overflow-x-auto">
            <h2 class="mb-3 font-semibold">{{ sec.title | t }}</h2>
            @for (row of c[sec.key]; track $index) {
              <div class="flex justify-between gap-2 border-b border-slate-100 py-1.5 text-sm last:border-0">
                <span class="truncate">{{ row[sec.labelKey] }}</span><span class="tabular-nums">\${{ +row.cost_usd | number: '1.2-2' }}</span>
              </div>
            } @empty { <p class="text-sm text-slate-500">{{ 'No usage yet.' | t }}</p> }
          </section>
        }
      </div>
    }
  `,
})
export class AdminCostsPage {
  c = toSignal(inject(Api).adminCosts());
  sections = [
    { key: 'by_kind', title: 'By service', labelKey: 'kind' },
    { key: 'by_organization', title: 'By organization', labelKey: 'name' },
    { key: 'by_campaign', title: 'Top campaigns', labelKey: 'name' },
  ];
}
