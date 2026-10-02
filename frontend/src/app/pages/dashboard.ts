import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ArrowDownRight, ArrowRight, ArrowUpRight, LucideAngularModule, Radar } from 'lucide-angular';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TPipe } from '../core/i18n/i18n';
import { PIPELINE, label } from '../core/models';

interface Tile { label: string; value: number; series: number[]; hint: string }

/** Dashboard in the reference layout: KPI tiles with 7-day bars, gauge, lists and highlight cards. */
@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, DatePipe, RouterLink, TPipe, LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="page-title">{{ greeting() | t }}, {{ auth.user()?.name?.split(' ')?.[0] }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ 'Here is what is happening with your lead generation today.' | t }}</p>
      </div>
    </div>

    @if (s(); as s) {
      <!-- KPI tiles: value, change vs previous 7 days, 7-day mini bars (one hue, today darkest). -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (t of tiles(); track t.label) {
          <div class="card flex items-end justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[13px] text-slate-500">{{ t.label | t }}</div>
              <div class="mt-1.5 text-[28px] font-bold leading-none tracking-tight text-slate-950 tabular-nums">{{ t.value | number }}</div>
              @let d = delta(t.series);
              <div class="mt-2 flex items-center gap-1 text-xs">
                @if (d !== null) {
                  <span class="inline-flex items-center gap-0.5 font-semibold" [class]="d >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                    <lucide-icon [img]="d >= 0 ? icons.up : icons.down" [size]="13" />{{ d >= 0 ? '+' : '' }}{{ d }}%
                  </span>
                  <span class="text-slate-400">{{ 'vs last week' | t }}</span>
                } @else { <span class="text-slate-400">{{ t.hint | t }}</span> }
              </div>
            </div>
            <div class="flex h-12 items-end gap-[3px]" role="img" [attr.aria-label]="(t.label | t) + ': ' + last7(t.series).join(', ')">
              @for (v of last7(t.series); track $index; let last = $last) {
                <div class="w-[7px] rounded-t-[3px]" [class]="last ? 'bg-brand-600' : 'bg-brand-200'"
                     [style.height.%]="barHeight(v, t.series)" [title]="v"></div>
              }
            </div>
          </div>
        }
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <!-- Gauge: share of leads that are qualified (score 75+). -->
        <section class="card text-center">
          <h2 class="section-title">{{ 'Qualification rate' | t }}</h2>
          <div class="mt-4 text-[44px] font-bold leading-none tracking-tight text-slate-950">{{ qualRate() }}<span class="text-2xl text-slate-400">%</span></div>
          <svg viewBox="0 0 200 110" class="mx-auto mt-3 w-52" role="img" [attr.aria-label]="qualRate() + '%'">
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" stroke-width="22" stroke-linecap="round" />
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#6d35f2" stroke-width="22" stroke-linecap="round"
                  pathLength="100" [attr.stroke-dasharray]="qualRate() + ' 100'" />
          </svg>
          <div class="mt-1 text-xs text-slate-500">{{ '{n} of {total} leads scored 75 or higher' | t: { n: s.high_quality, total: s.total_leads } }}</div>
        </section>

        <section class="card">
          <h2 class="section-title">{{ 'Lead quality' | t }}</h2>
          <div class="mt-4 text-[44px] font-bold leading-none tracking-tight text-slate-950">{{ s.total_leads | number }}</div>
          <div class="mt-1 text-xs text-slate-500">{{ 'leads in your workspace' | t }}</div>
          <div class="mt-5 space-y-3">
            @for (q of qualities; track q.key) {
              <div class="flex items-center gap-3 text-sm">
                <span class="h-2.5 w-2.5 rounded-full" [style.background]="q.color"></span>
                <span class="flex-1 text-slate-600">{{ q.key | t }}</span>
                <span class="font-semibold tabular-nums text-slate-900">{{ s.by_quality?.[q.key] ?? 0 }}</span>
              </div>
            }
          </div>
          <a routerLink="/leads" [queryParams]="{ sort: 'score', dir: 'desc' }" class="btn-ghost mt-5 w-full">{{ 'View leads' | t }}</a>
        </section>

        <section class="card">
          <h2 class="section-title">{{ 'Top locations' | t }}</h2>
          <p class="muted">{{ 'Where your leads are.' | t }}</p>
          <div class="mt-4 space-y-3.5">
            @for (l of s.top_locations; track l.name) {
              <div>
                <div class="mb-1 flex justify-between text-sm"><span class="text-slate-700">{{ l.name }}</span><span class="font-semibold tabular-nums text-slate-900">{{ l.total | number }}</span></div>
                <div class="h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-brand-500" [style.width.%]="(l.total / maxLocation()) * 100"></div></div>
              </div>
            } @empty { <p class="text-sm text-slate-500">{{ 'No data for this period.' | t }}</p> }
          </div>
        </section>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <!-- Dark highlight pill (reference: "Climate Change Index"). -->
        <a [routerLink]="isAdmin() ? '/platform/organizations' : '/campaigns/new'"
           class="group flex items-center gap-4 rounded-[28px] bg-[#11182d] p-5 text-white transition hover:bg-[#1a2340]">
          <svg viewBox="0 0 44 44" class="h-16 w-16 shrink-0 -rotate-90" role="img" [attr.aria-label]="creditPct() + '%'">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="5" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="#a16bff" stroke-width="5" stroke-linecap="round"
                    pathLength="100" [attr.stroke-dasharray]="creditPct() + ' 100'" />
          </svg>
          <div class="min-w-0 flex-1">
            <div class="font-semibold">{{ 'Find New Companies' | t }}</div>
            <div class="text-sm text-slate-400">{{ '{n} credits available' | t: { n: (auth.user()?.organization?.credit_balance ?? 0).toLocaleString() } }}</div>
          </div>
          <lucide-icon [img]="icons.radar" [size]="22" class="text-violet-300 transition group-hover:scale-110" />
        </a>

        <!-- Soft ring card (reference: "Water level"). -->
        <a routerLink="/follow-ups" class="flex items-center gap-4 rounded-[28px] bg-[#e9e6f8] p-5 transition hover:bg-[#e2ddf6]">
          <div class="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 44 44" class="h-16 w-16 -rotate-90">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(109,53,242,.15)" stroke-width="5" />
              <circle cx="22" cy="22" r="18" fill="none" stroke="#6d35f2" stroke-width="5" stroke-linecap="round"
                      pathLength="100" [attr.stroke-dasharray]="(s.follow_ups.overdue ? 100 : s.follow_ups.due_today ? 60 : 0) + ' 100'" />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-900">{{ s.follow_ups.due_today }}</span>
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-900">{{ 'Follow-ups due today' | t }}</div>
            <div class="text-sm" [class]="s.follow_ups.overdue ? 'text-rose-600' : 'text-slate-500'">
              {{ (s.follow_ups.overdue ? '{n} overdue' : 'Nothing overdue') | t: { n: s.follow_ups.overdue } }}</div>
          </div>
        </a>

        <!-- Brand gradient card (reference: community card). -->
        <section class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-500 to-fuchsia-500 p-5 text-white">
          <img src="/leadengine-mark.png" alt="" class="pointer-events-none absolute -bottom-6 -end-4 h-32 w-32 opacity-25" />
          <div class="flex items-center justify-between">
            <div class="font-semibold">{{ 'Upcoming follow-ups' | t }}</div>
            <a routerLink="/calendar" class="rounded-full bg-white/15 p-1.5 hover:bg-white/25" [attr.aria-label]="'Calendar' | t"><lucide-icon [img]="icons.arrow" [size]="15" class="rtl:-scale-x-100" /></a>
          </div>
          <div class="relative mt-3 space-y-2">
            @for (f of s.follow_ups.upcoming.slice(0, 3); track f.id) {
              <a [routerLink]="['/leads', f.lead_id]" class="flex items-center justify-between gap-3 rounded-xl bg-white/12 px-3 py-2 text-sm hover:bg-white/20">
                <span class="truncate">{{ f.lead?.company?.name_en }}</span>
                <span class="shrink-0 text-xs text-white/80">{{ label(f.type) | t }} · {{ f.due_at | date: 'EEE, h:mm a' }}</span>
              </a>
            } @empty { <p class="text-sm text-white/80">{{ 'No upcoming follow-ups.' | t }}</p> }
          </div>
        </section>
      </div>

      <section class="card mt-4">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">{{ 'Pipeline' | t }}</h2>
          <a routerLink="/pipeline" class="text-sm font-semibold text-brand-600 hover:text-brand-800">{{ 'View pipeline' | t }} →</a>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-10">
          @for (st of pipeline; track st) {
            <a [routerLink]="'/leads'" [queryParams]="{ status: st }" class="rounded-2xl bg-slate-50 p-3 transition hover:bg-brand-50">
              <div class="truncate text-xs text-slate-500">{{ label(st) | t }}</div>
              <div class="mt-1 text-xl font-bold tabular-nums text-slate-900">{{ s.by_status?.[st] ?? 0 }}</div>
            </a>
          }
        </div>
      </section>
    } @else {
      <div class="card text-sm text-slate-500">{{ 'Loading…' | t }}</div>
    }
  `,
})
export class DashboardPage {
  protected auth = inject(AuthService);
  protected s = toSignal(inject(Api).dashboard());
  protected pipeline = PIPELINE;
  protected label = label;
  protected icons = { up: ArrowUpRight, down: ArrowDownRight, arrow: ArrowRight, radar: Radar };
  /** Ordered light-to-dark within one hue; quality is ordinal. */
  protected qualities = [
    { key: 'Highly Qualified', color: '#4a1fad' }, { key: 'Qualified', color: '#6d35f2' },
    { key: 'Needs Review', color: '#a16bff' }, { key: 'Needs Enrichment', color: '#d9c9ff' },
  ];

  protected isAdmin = computed(() => this.auth.user()?.role?.key === 'super_admin');

  protected tiles = computed<Tile[]>(() => {
    const s = this.s();
    if (!s) return [];
    const t = s.trend as { created: number; qualified: number; worked: number }[];
    return [
      { label: 'Total leads', value: s.total_leads, series: t.map(d => d.created), hint: 'All leads' },
      { label: 'New this week', value: t.slice(7).reduce((a, d) => a + d.created, 0), series: t.map(d => d.created), hint: 'Last 7 days' },
      { label: 'Qualified leads', value: s.high_quality, series: t.map(d => d.qualified), hint: 'Score 75 or higher' },
      { label: 'Leads in progress', value: s.verified_leads, series: t.map(d => d.worked), hint: 'Being worked by sales' },
    ];
  });

  protected qualRate = computed(() => {
    const s = this.s();
    return s && s.total_leads ? Math.round((100 * s.high_quality) / s.total_leads) : 0;
  });

  protected maxLocation = computed(() => Math.max(1, ...((this.s()?.top_locations ?? []) as { total: number }[]).map(l => l.total)));

  protected creditPct = computed(() => {
    const u = this.auth.user();
    return Math.min(100, Math.round((100 * (u?.organization?.credit_balance ?? 0)) / (u?.credit_allowance || 1)));
  });

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  last7(series: number[]) { return series.slice(7); }

  barHeight(v: number, series: number[]) {
    const max = Math.max(1, ...series.slice(7));
    return Math.max(8, (v / max) * 100);
  }

  /** % change of this week's total vs the previous week; null when there is no baseline. */
  delta(series: number[]): number | null {
    const prev = series.slice(0, 7).reduce((a, b) => a + b, 0);
    const cur = series.slice(7).reduce((a, b) => a + b, 0);
    return prev ? Math.round(((cur - prev) / prev) * 100) : null;
  }
}
