import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { Company, Page } from '../core/models';

@Component({
  selector: 'app-companies',
  imports: [TPipe, FormsModule, RouterLink],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Companies' | t }}</h1>
    <div class="card mb-4 flex flex-wrap gap-3">
      <input class="input max-w-sm" [placeholder]="'Name or website' | t" [(ngModel)]="q" (keydown.enter)="load(1)" />
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="hasWebsite" (change)="load(1)" /> {{ 'Has website' | t }}</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="hasEmail" (change)="load(1)" /> {{ 'Has email' | t }}</label>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="w-full">
        <thead class="border-b border-slate-200 bg-slate-50"><tr>
          <th class="th">{{ 'Company' | t }}</th><th class="th">{{ 'City' | t }}</th><th class="th">{{ 'Industry' | t }}</th><th class="th">{{ 'Phones' | t }}</th><th class="th">{{ 'Emails' | t }}</th><th class="th">{{ 'Rating' | t }}</th><th class="th">{{ 'Enrichment' | t }}</th>
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
        <button class="btn-ghost" [disabled]="page()!.current_page <= 1" (click)="load(page()!.current_page - 1)">{{ 'Previous' | t }}</button>
        <span>{{ 'Page {n} of {total}' | t: { n: page()!.current_page, total: page()!.last_page } }}</span>
        <button class="btn-ghost" [disabled]="page()!.current_page >= page()!.last_page" (click)="load(page()!.current_page + 1)">{{ 'Next' | t }}</button>
      </div>
    }
  `,
})
export class CompaniesPage implements OnInit {
  private api = inject(Api);
  protected page = signal<Page<Company> | null>(null);
  q = '';
  hasWebsite = false;
  hasEmail = false;

  ngOnInit() { this.load(1); }

  load(p: number) {
    this.api.companies({ q: this.q, has_website: this.hasWebsite || null, has_email: this.hasEmail || null, page: p }).subscribe(r => this.page.set(r));
  }
}
