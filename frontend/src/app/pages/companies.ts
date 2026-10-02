import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SortHeader } from './sort-header';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { Company, Page } from '../core/models';

@Component({
  selector: 'app-companies',
  imports: [TPipe, FormsModule, RouterLink, SortHeader],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Companies' | t }}</h1>
    <div class="card mb-4 flex flex-wrap gap-3">
      <input class="input max-w-sm" [placeholder]="'Name or website' | t" [(ngModel)]="q" (keydown.enter)="go({ page: 1 })" />
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="hasWebsite" (change)="go({ page: 1 })" /> {{ 'Has website' | t }}</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="hasEmail" (change)="go({ page: 1 })" /> {{ 'Has email' | t }}</label>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="w-full">
        <thead class="border-b border-slate-200 bg-slate-50"><tr>
          <th appSort="name" label="Company" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="city" label="City" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="industry" label="Industry" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="phones" label="Phones" firstDir="desc" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="emails" label="Emails" firstDir="desc" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th appSort="rating" label="Rating" firstDir="desc" [current]="sort" [dir]="dir" (sortChange)="go($event)"></th>
          <th class="th">{{ 'Enrichment' | t }}</th>
        </tr></thead>
        <tbody>
          @for (c of page()?.data ?? []; track c.id) {
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="td"><a [routerLink]="['/companies', c.id]" class="font-medium text-indigo-700 hover:underline">{{ c.name_en }}</a></td>
              <td class="td">{{ c.location?.name_en ?? '—' }}</td>
              <td class="td">{{ c.industry?.name_en ?? '—' }}</td>
              <td class="td tabular-nums">{{ $any(c).phones_count }}</td>
              <td class="td tabular-nums">{{ $any(c).emails_count }}</td>
              <td class="td">{{ c.rating ?? '—' }}@if (c.review_count) { <span class="text-xs text-slate-500"> ({{ c.review_count }})</span> }</td>
              <td class="td">{{ c.enrichment_status }}</td>
            </tr>
          } @empty { <tr><td class="td text-slate-500" colspan="7">{{ 'No companies.' | t }}</td></tr> }
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
export class CompaniesPage implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  protected sort = 'name';
  protected dir: 'asc' | 'desc' = 'asc';
  protected page = signal<Page<Company> | null>(null);
  q = '';
  hasWebsite = false;
  hasEmail = false;

  /** State lives in the address bar so Back/Forward restore it. */
  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      this.q = q.get('q') ?? '';
      this.hasWebsite = q.get('has_website') === '1';
      this.hasEmail = q.get('has_email') === '1';
      this.sort = q.get('sort') ?? 'name';
      this.dir = q.get('dir') === 'desc' ? 'desc' : 'asc';
      this.api.companies({ q: this.q, has_website: this.hasWebsite || null, has_email: this.hasEmail || null,
        sort: this.sort, dir: this.dir, page: Number(q.get('page') ?? 1) || 1 }).subscribe(r => this.page.set(r));
    });
  }

  go(change: { page?: number; sort?: string; dir?: 'asc' | 'desc' }) {
    this.router.navigate([], { relativeTo: this.route, queryParams: {
      q: this.q || null, has_website: this.hasWebsite ? 1 : null, has_email: this.hasEmail ? 1 : null,
      sort: change.sort ?? this.sort, dir: change.dir ?? this.dir,
      page: change.page ?? (change.sort ? 1 : this.page()?.current_page ?? 1),
    } });
  }
}
