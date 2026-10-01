import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';

@Component({
  selector: 'app-calendar',
  imports: [DatePipe, RouterLink, TPipe],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-violet-600">{{ 'Workspace' | t }}</div>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">{{ 'Calendar' | t }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ 'Follow-ups, calls and meetings in one place.' | t }}</p>
      </div>
      <a routerLink="/follow-ups" class="btn-ghost">{{ 'Open follow-ups' | t }}</a>
    </div>

    @if (items(); as rows) {
      <div class="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section class="card !p-0 overflow-hidden">
          <div class="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">
            @for (d of week; track d) { <div class="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">{{ d }}</div> }
          </div>
          <div class="grid min-h-[520px] grid-cols-7">
            @for (d of week; track d; let i = $index) {
              <div class="min-h-[150px] border-e border-t border-slate-100 p-3 last:border-e-0">
                <div class="mb-3 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                     [class]="i === todayIndex ? 'bg-violet-600 text-white' : 'text-slate-500'">{{ dayNumber(i) }}</div>
                @for (f of forDay(rows, i); track f.id) {
                  <a [routerLink]="['/leads', f.lead_id]" class="mb-2 block rounded-xl border border-violet-100 bg-violet-50 p-2 text-xs hover:border-violet-300">
                    <div class="font-semibold text-violet-900">{{ f.lead?.company?.name_en ?? ('Lead #' + f.lead_id) }}</div>
                    <div class="mt-1 text-violet-700">{{ f.due_at | date:'shortTime' }} · {{ f.type }}</div>
                  </a>
                }
              </div>
            }
          </div>
        </section>

        <aside class="card">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="section-title">{{ 'Upcoming' | t }}</h2>
            <span class="badge bg-violet-100 text-violet-700">{{ rows.length }}</span>
          </div>
          <div class="space-y-3">
            @for (f of rows.slice(0, 12); track f.id) {
              <a [routerLink]="['/leads', f.lead_id]" class="block rounded-xl border border-slate-100 p-3 transition hover:border-violet-200 hover:bg-violet-50/40">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm font-semibold text-slate-900">{{ f.lead?.company?.name_en ?? ('Lead #' + f.lead_id) }}</div>
                    <div class="mt-1 text-xs text-slate-500">{{ f.type }} · {{ f.priority }}</div>
                  </div>
                  <div class="text-end text-xs font-semibold text-violet-700">{{ f.due_at | date:'MMM d' }}<br>{{ f.due_at | date:'shortTime' }}</div>
                </div>
              </a>
            } @empty {
              <p class="text-sm text-slate-500">{{ 'No upcoming follow-ups.' | t }}</p>
            }
          </div>
        </aside>
      </div>
    }
  `,
})
export class CalendarPage {
  private api = inject(Api);
  protected items = toSignal(this.api.followUps(), { initialValue: [] as any[] });
  protected week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected todayIndex = (new Date().getDay() + 6) % 7;

  dayNumber(offset: number): number {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - this.todayIndex + offset);
    return monday.getDate();
  }

  forDay(rows: any[], offset: number): any[] {
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - this.todayIndex + offset);
    const end = new Date(monday);
    end.setDate(monday.getDate() + 1);
    return rows.filter(x => {
      const d = new Date(x.due_at);
      return d >= monday && d < end && !x.completed_at;
    }).slice(0, 4);
  }
}
