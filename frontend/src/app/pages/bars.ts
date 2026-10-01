import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TPipe } from '../core/i18n/i18n';

/**
 * Horizontal single-series bar list: one hue, direct value labels, a native
 * tooltip per bar, zero baseline. Doubles as its own table view.
 */
@Component({
  selector: 'app-bars',
  imports: [DecimalPipe, TPipe],
  template: `
    @for (r of rows(); track r.label) {
      <div class="group flex items-center gap-3 py-1 text-sm" [title]="r.label + ': ' + r.value + (r.note ? ' · ' + r.note : '')">
        <span class="w-32 shrink-0 truncate text-slate-600">{{ r.label | t }}</span>
        <div class="h-3 flex-1 rounded-e bg-slate-100">
          <div class="h-3 rounded-e bg-indigo-500 transition-all group-hover:bg-indigo-600" [style.width.%]="(r.value / max()) * 100"></div>
        </div>
        <span class="w-16 text-end tabular-nums text-slate-800">{{ r.value | number }}</span>
      </div>
    } @empty { <p class="text-sm text-slate-500">{{ 'No data for this period.' | t }}</p> }
  `,
})
export class Bars {
  readonly rows = input<{ label: string; value: number; note?: string }[]>([]);
  protected max = computed(() => Math.max(1, ...this.rows().map(r => r.value)));
}
