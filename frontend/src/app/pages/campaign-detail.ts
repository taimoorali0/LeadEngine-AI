import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { AuthService } from '../core/auth';
import { Campaign, label } from '../core/models';
import { Realtime } from '../core/realtime';
import { FormsModule } from '@angular/forms';

export function statusClass(s: string): string {
  return ({
    running: 'bg-sky-100 text-sky-800', queued: 'bg-sky-50 text-sky-700', completed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-700',
  } as Record<string, string>)[s] ?? 'bg-slate-100 text-slate-600';
}

/** Campaign detail with live progress (spec §31, §46). Polls while running. */
@Component({
  selector: 'app-campaign-detail',
  imports: [TPipe, RouterLink, DatePipe, DecimalPipe, FormsModule],
  template: `
    @if (c(); as c) {
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-bold">{{ c.name }}</h1>
        <span class="badge" [class]="statusClass(c.status)">{{ label(c.status) | t }}</span>
        @if (live()) { <span class="text-xs text-emerald-700">● {{ 'Live' | t }}</span> }
        @if (c.stats['error']) { <span class="text-sm text-red-600">{{ $any(c.stats['error']) | t }}</span> }
        <div class="ms-auto flex gap-2">
          <a class="btn-ghost" [routerLink]="['/leads']" [queryParams]="{ campaign_id: c.id }">{{ 'View leads' | t }} ({{ c.leads_count }})</a>
          @if (auth.can('campaigns.manage')) {
            <button class="btn-primary" (click)="run()" [disabled]="c.status === 'running' || c.status === 'queued'">
              {{ (c.runs?.length ? 'Re-run campaign' : 'Run campaign') | t }}</button>
          }
        </div>
      </div>
      @if (error()) { <p class="mb-4 text-sm text-red-600">{{ error() | t }}</p> }

      <div class="grid gap-5 lg:grid-cols-3">
        <section class="card lg:col-span-2">
          <h2 class="mb-4 font-semibold">{{ 'Progress' | t }}</h2>
          @for (stage of stages; track stage) {
            <div class="mb-3">
              <div class="mb-1 flex justify-between text-sm"><span>{{ label(stage) | t }}</span><span class="tabular-nums">{{ c.progress[stage] ?? 0 }}%</span></div>
              <div class="h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-indigo-500 transition-all" [style.width.%]="c.progress[stage] ?? 0"></div></div>
            </div>
          }
          <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            @for (s of statKeys; track s.key) {
              <div class="rounded-lg bg-slate-50 p-3">
                <div class="text-xs text-slate-500">{{ s.label | t }}</div>
                <div class="text-xl font-bold tabular-nums">{{ (c.stats[s.key] ?? 0) | number }}</div>
              </div>
            }
          </div>
        </section>

        <section class="card space-y-3 text-sm">
          <h2 class="font-semibold">{{ 'Setup' | t }}</h2>
          <div><span class="label">{{ 'Company type' | t }}</span>{{ c.company_type }}</div>
          <div><span class="label">{{ 'Industry' | t }}</span>{{ c.industry?.name_en ?? ('Any' | t) }}</div>
          <div><span class="label">{{ 'Location' | t }}</span>{{ c.country?.name_en }}@for (l of c.locations; track l.id) {, {{ l.name_en }}}</div>
          <div><span class="label">{{ 'Target' | t }}</span>{{ c.target_results }}</div>
          <div><label class="label" for="ri">{{ 'Auto-refresh' | t }}</label>
            <select id="ri" class="input" [ngModel]="c.refresh_interval_days" (ngModelChange)="setRefresh($event)" [disabled]="!auth.can('campaigns.manage')">
              <option [ngValue]="null">{{ 'Off' | t }}</option>
              @for (d of [7, 14, 30, 90]; track d) { <option [ngValue]="d">{{ 'Every {n} days' | t: { n: d } }}</option> }
            </select>
            @if (c.next_refresh_at) { <p class="mt-1 text-xs text-slate-500">{{ 'Next run' | t }}: {{ c.next_refresh_at | date: 'medium' }}</p> }
          </div>
          <div><span class="label">{{ 'Keywords' | t }}</span>
            <div class="flex flex-wrap gap-1">
              @for (k of c.keywords; track k.id) {
                <span class="badge" [class]="k.enabled ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400 line-through'">{{ k.keyword }}</span>
              }
            </div>
          </div>
        </section>
      </div>

      @if (c.runs?.length) {
        <section class="card mt-5">
          <h2 class="mb-3 font-semibold">{{ 'Run history' | t }}</h2>
          <table class="w-full">
            <thead><tr><th class="th">{{ 'Started' | t }}</th><th class="th">{{ 'Finished' | t }}</th><th class="th">{{ 'New businesses' | t }}</th></tr></thead>
            <tbody>
              @for (r of c.runs; track r.id) {
                <tr class="border-t border-slate-100">
                  <td class="td">{{ r.started_at | date: 'medium' }}</td>
                  <td class="td">{{ r.finished_at ? (r.finished_at | date: 'medium') : ('Running…' | t) }}</td>
                  <td class="td font-semibold">{{ r.new_companies }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    }
  `,
})
export class CampaignDetailPage implements OnInit {
  readonly id = input.required<string>();
  protected auth = inject(AuthService);
  private api = inject(Api);
  protected c = signal<Campaign | null>(null);
  protected error = signal('');
  protected label = label;
  protected statusClass = statusClass;
  protected stages = ['search', 'companies', 'enrichment', 'deduplication', 'scoring'];
  protected statKeys = [
    { key: 'queries', label: 'Queries' }, { key: 'found', label: 'Businesses found' },
    { key: 'duplicates', label: 'Duplicates merged' }, { key: 'saved', label: 'Leads saved' },
    { key: 'new_companies', label: 'New companies' }, { key: 'websites', label: 'With website' },
    { key: 'filtered_out', label: 'Filtered out' }, { key: 'failed_queries', label: 'Failed queries' },
  ];
  private timer?: ReturnType<typeof setTimeout>;
  private realtime = inject(Realtime);
  protected live = this.realtime.connected;

  constructor() {
    // Live progress over Reverb; polling only while the socket is down (spec §46-47).
    const stop = this.realtime.onOrganization<{ campaign: Partial<Campaign> }>('campaign.updated', e => {
      const cur = this.c();
      if (!cur || e.campaign.id !== cur.id) return;
      const finished = e.campaign.status !== cur.status && !['running', 'queued'].includes(e.campaign.status ?? '');
      this.c.set({ ...cur, ...e.campaign });
      if (finished) this.load();  // pick up run history and lead count
    });
    inject(DestroyRef).onDestroy(() => { clearTimeout(this.timer); stop(); });
  }

  ngOnInit() { this.load(); }

  private load() {
    clearTimeout(this.timer);
    this.api.campaign(+this.id()).subscribe(c => {
      this.c.set(c);
      const active = c.status === 'running' || c.status === 'queued';
      if (active) this.timer = setTimeout(() => this.load(), this.realtime.connected() ? 15000 : 3000);
    });
  }

  setRefresh(days: number | null) {
    this.api.updateCampaign(+this.id(), { refresh_interval_days: days }).subscribe({
      next: c => this.c.set(c),
      error: (e: HttpErrorResponse) => this.error.set(e.error?.message ?? 'Request failed.'),
    });
  }

  run() {
    this.error.set('');
    this.api.runCampaign(+this.id()).subscribe({
      next: c => { this.c.set(c); this.load(); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.message ?? 'Could not start campaign.'),
    });
  }
}
