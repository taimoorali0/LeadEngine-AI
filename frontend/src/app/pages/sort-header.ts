import { Component, computed, input, output } from '@angular/core';
import { TPipe } from '../core/i18n/i18n';

/** Clickable table header: first click sorts by this column, the next one reverses it. */
@Component({
  selector: 'th[appSort]',
  imports: [TPipe],
  host: {
    class: 'th cursor-pointer select-none hover:text-slate-800',
    '[attr.aria-sort]': "active() ? (dir() === 'asc' ? 'ascending' : 'descending') : 'none'",
    '(click)': 'toggle()',
  },
  template: `
    <span class="inline-flex items-center gap-1">
      {{ label() | t }}
      <span class="text-[10px]" [class.text-violet-600]="active()" [class.opacity-30]="!active()" aria-hidden="true">
        {{ active() ? (dir() === 'asc' ? '▲' : '▼') : '↕' }}
      </span>
    </span>
  `,
})
export class SortHeader {
  readonly appSort = input.required<string>();
  readonly label = input.required<string>();
  readonly current = input<string>('');
  readonly dir = input<'asc' | 'desc'>('desc');
  /** Direction used when this column is first selected (text: asc, numbers/dates: desc). */
  readonly firstDir = input<'asc' | 'desc'>('asc');
  readonly sortChange = output<{ sort: string; dir: 'asc' | 'desc' }>();
  protected active = computed(() => this.current() === this.appSort());

  toggle() {
    const dir = this.active() ? (this.dir() === 'asc' ? 'desc' : 'asc') : this.firstDir();
    this.sortChange.emit({ sort: this.appSort(), dir });
  }
}
