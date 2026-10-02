import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SortHeader } from './sort-header';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { AuthService } from '../core/auth';
import { Lead, OUTCOMES, Page, PIPELINE, label, qualityClass } from '../core/models';

/** Lead result table (spec §24). */
@Component({
  selector: 'app-leads',
  imports: [TPipe, FormsModule, RouterLink, SortHeader, DatePipe],
  template: `
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold">{{ 'Leads' | t }}</h1>
      <span class="text-sm text-slate-500">{{ '{n} total' | t: { n: page()?.total ?? 0 } }}</span>
      @if (canExport) { <button class="btn-ghost ms-auto" (click)="export()">{{ 'Export CSV' | t }}</button> }
    </div>
    <div class="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <input class="input" [placeholder]="'Company name' | t" [(ngModel)]="f.q" (keydown.enter)="go({ page: 1 })" />
      <select class="input" [(ngModel)]="f.status" (ngModelChange)="go({ page: 1 })">
        <option value="">{{ 'All statuses' | t }}</option>
        @for (s of statuses; track s) { <option [value]="s">{{ label(s) | t }}</option> }
      </select>
      <select class="input" [(ngModel)]="f.quality" (ngModelChange)="go({ page: 1 })">
        <option value="">{{ 'All quality' | t }}</option>
        @for (q of qualities; track q) { <option [value]="q">{{ q | t }}</option> }
      </select>
      <input class="input" type="number" min="0" max="100" [placeholder]="'Min score' | t" [(ngModel)]="f.min_score" (keydown.enter)="go({ page: 1 })" />
      <button class="btn-primary justify-center" (click)="go({ page: 1 })">{{ 'Filter' | t }}</button>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="w-full">
        <thead class="border-b border-slate-200 bg-slate-50"><tr>
          <th appSort="company" label="Company" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="city" label="City" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="industry" label="Industry" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th class="th">{{ 'Phone' | t }}</th><th class="th">{{ 'Website' | t }}</th>
          <th appSort="score" label="Score" firstDir="desc" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="status" label="Status" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="agent" label="Agent" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="created_at" label="Added" firstDir="desc" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
        </tr></thead>
        <tbody>
          @for (l of page()?.data ?? []; track l.id) {
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="td"><a [routerLink]="['/leads', l.id]" class="font-medium text-indigo-700 hover:underline">{{ l.company.name_en }}</a></td>
              <td class="td">{{ l.company.location?.name_en ?? '—' }}</td>
              <td class="td">{{ l.company.industry?.name_en ?? '—' }}</td>
              <td class="td">{{ ($any(l).phones_count ? 'Yes' : 'No') | t }}</td>
              <td class="td">{{ (l.company.website ? 'Yes' : 'No') | t }}</td>
              <td class="td">
                @if (l.score !== null) { <span class="badge" [class]="qualityClass(l.quality)" [title]="l.quality | t">{{ l.score }}</span> } @else { — }
              </td>
              <td class="td">{{ label(l.status) | t }}</td>
              <td class="td">{{ l.assignee?.name ?? '—' }}</td>
              <td class="td whitespace-nowrap text-slate-500">{{ l.created_at | date: 'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td class="td text-slate-500" colspan="9">{{ 'No leads match.' | t }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if ((page()?.last_page ?? 1) > 1) {
      <div class="mt-4 flex items-center justify-end gap-2 text-sm">
        <button class="btn-ghost" [disabled]="page()!.current_page <= 1" (click)="go({ page: page()!.current_page - 1 })">{{ 'Previous' | t }}</button>
        <span>{{ 'Page {n} of {total}' | t: { n: page()!.current_page, total: page()!.last_page } }}</span>
        <button class="btn-ghost" [disabled]="page()!.current_page >= page()!.last_page" (click)="go({ page: page()!.current_page + 1 })">{{ 'Next' | t }}</button>
      </div>
    }
  `,
})
export class LeadsPage implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  protected campaignId = '';
  protected sort = 'created_at';
  protected dir: 'asc' | 'desc' = 'desc';
  private auth = inject(AuthService);
  protected page = signal<Page<Lead> | null>(null);
  protected f = { q: '', status: '', quality: '', min_score: null as number | null };
  protected statuses = [...PIPELINE, ...OUTCOMES];
  protected qualities = ['Highly Qualified', 'Qualified', 'Needs Review', 'Needs Enrichment'];
  protected label = label;
  protected qualityClass = qualityClass;
  protected canExport = ['leads.export_all', 'leads.export_team', 'leads.export_assigned'].some(p => this.auth.can(p));

  /** The address bar is the source of truth, so Back/Forward restore filters, sort and page. */
  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      this.f = { q: q.get('q') ?? '', status: q.get('status') ?? '', quality: q.get('quality') ?? '',
        min_score: q.get('min_score') ? Number(q.get('min_score')) : null };
      this.campaignId = q.get('campaign_id') ?? '';
      this.sort = q.get('sort') ?? 'created_at';
      this.dir = q.get('dir') === 'asc' ? 'asc' : 'desc';
      const page = Number(q.get('page') ?? 1) || 1;
      this.api.leads({ ...this.f, campaign_id: this.campaignId, page, sort: this.sort, dir: this.dir })
        .subscribe(r => this.page.set(r));
    });
  }

  go(change: { page?: number; sort?: string; dir?: 'asc' | 'desc' }) {
    const queryParams = {
      q: this.f.q || null, status: this.f.status || null, quality: this.f.quality || null,
      min_score: this.f.min_score ?? null, campaign_id: this.campaignId || null,
      sort: change.sort ?? this.sort, dir: change.dir ?? this.dir,
      page: change.page ?? (change.sort ? 1 : this.page()?.current_page ?? 1),
    };
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  export() {
    this.api.exportLeads({ ...this.f, campaign_id: this.campaignId, sort: this.sort, dir: this.dir }).subscribe(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
}
