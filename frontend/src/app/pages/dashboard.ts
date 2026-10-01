import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TPipe } from '../core/i18n/i18n';
import { PIPELINE, label } from '../core/models';

@Component({
  selector: 'app-dashboard',
  imports: [TPipe, DecimalPipe, RouterLink],
  template: `
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="text-sm font-semibold text-violet-600">{{ 'Overview' | t }}</div>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">{{ greeting() }}, {{ auth.user()?.name?.split(' ')?.[0] }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ 'Here is what is happening with your lead generation today.' | t }}</p>
      </div>
      @if (auth.user()?.role?.key !== 'super_admin') {
        <a routerLink="/campaigns/new" class="btn-primary">＋ {{ 'Find New Companies' | t }}</a>
      }
    </div>

    @if (stats(); as s) {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (t of topTiles; track t.key) {
          <div class="card relative overflow-hidden">
            <div class="absolute -end-8 -top-8 h-24 w-24 rounded-full bg-violet-100/70"></div>
            <div class="relative">
              <div class="flex items-center justify-between">
                <div class="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{{ t.label | t }}</div>
                <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">{{ t.icon }}</div>
              </div>
              <div class="mt-4 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">{{ s[t.key] | number }}</div>
              <div class="mt-1 text-xs text-slate-400">{{ t.hint | t }}</div>
            </div>
          </div>
        }
      </div>

      <div class="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <section class="card">
          <div class="mb-5 flex items-center justify-between">
            <div><h2 class="section-title">{{ 'Pipeline' | t }}</h2><p class="muted">{{ 'Lead movement across your active sales stages.' | t }}</p></div>
            <a routerLink="/pipeline" class="text-sm font-semibold text-violet-700 hover:text-violet-900">{{ 'View pipeline' | t }} →</a>
          </div>
          <div class="space-y-3">
            @for (st of pipeline; track st) {
              <div class="grid grid-cols-[110px_1fr_46px] items-center gap-3 text-sm">
                <span class="truncate text-slate-600">{{ label(st) | t }}</span>
                <div class="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500" [style.width.%]="pct(s['by_status']?.[st], s)"></div>
                </div>
                <span class="text-end font-semibold tabular-nums text-slate-900">{{ s['by_status']?.[st] ?? 0 }}</span>
              </div>
            }
          </div>
        </section>

        <section class="card">
          <div class="mb-5"><h2 class="section-title">{{ 'Lead quality' | t }}</h2><p class="muted">{{ 'Qualification mix across visible leads.' | t }}</p></div>
          <div class="space-y-3">
            @for (q of qualities; track q; let i = $index) {
              <div class="rounded-xl bg-slate-50 p-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-slate-700">{{ q | t }}</span>
                  <b class="text-lg tabular-nums text-slate-950">{{ s['by_quality']?.[q] ?? 0 }}</b>
                </div>
                <div class="mt-2 h-1.5 rounded-full bg-slate-200"><div class="h-full rounded-full bg-violet-500" [style.width.%]="qualityPct(s['by_quality']?.[q], s)"></div></div>
              </div>
            }
          </div>
        </section>
      </div>

      <div class="mt-5 grid gap-4 sm:grid-cols-3">
        <div class="card"><div class="label">{{ 'With phone' | t }}</div><div class="text-2xl font-bold text-slate-950">{{ s['with_phone'] | number }}</div><div class="mt-1 text-xs text-slate-500">{{ 'Reachable businesses' | t }}</div></div>
        <div class="card"><div class="label">{{ 'With website' | t }}</div><div class="text-2xl font-bold text-slate-950">{{ s['with_website'] | number }}</div><div class="mt-1 text-xs text-slate-500">{{ 'Ready for website enrichment' | t }}</div></div>
        <div class="card"><div class="label">{{ 'With email' | t }}</div><div class="text-2xl font-bold text-slate-950">{{ s['with_email'] | number }}</div><div class="mt-1 text-xs text-slate-500">{{ 'Published business emails' | t }}</div></div>
      </div>
    } @else {
      <div class="card text-sm text-slate-500">{{ 'Loading…' | t }}</div>
    }
  `,
})
export class DashboardPage {
  protected auth = inject(AuthService);
  protected stats = toSignal(inject(Api).dashboard());
  protected pipeline = PIPELINE;
  protected label = label;
  protected qualities = ['Highly Qualified', 'Qualified', 'Needs Review', 'Needs Enrichment'];
  protected topTiles = [
    { key: 'total_companies', label: 'Total companies', hint: 'Unique business records', icon: '▦' },
    { key: 'new_leads_today', label: 'New leads today', hint: 'Discovered today', icon: '◎' },
    { key: 'verified_leads', label: 'Verified leads', hint: 'Ready for sales action', icon: '✓' },
    { key: 'high_quality', label: 'High-quality leads', hint: 'Score 75 or higher', icon: '✦' },
  ];

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  pct(n: number | undefined, s: Record<string, any>): number {
    const max = Math.max(1, ...Object.values<number>(s['by_status'] ?? {}));
    return Math.max(3, ((n ?? 0) / max) * 100);
  }

  qualityPct(n: number | undefined, s: Record<string, any>): number {
    const total = Object.values<number>(s['by_quality'] ?? {}).reduce((a, b) => a + Number(b || 0), 0);
    return total ? Math.max(3, ((n ?? 0) / total) * 100) : 0;
  }
}
