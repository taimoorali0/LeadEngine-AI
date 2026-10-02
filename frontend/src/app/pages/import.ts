import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { ImportPreview } from '../core/models';
import { apiError } from './account';

const FIELD_LABELS: Record<string, string> = {
  name: 'Company name', phone: 'Phone', email: 'Email', website: 'Website', address: 'Address', city: 'City',
  category: 'Category', rating: 'Rating', reviews: 'Reviews', linkedin: 'LinkedIn page',
};

/** CSV import (Yellow Pages exports, purchased lists, spreadsheets): upload → check columns → import. */
@Component({
  selector: 'app-import',
  imports: [FormsModule, TPipe],
  template: `
    <div class="mb-6">
      <div class="text-sm font-semibold text-violet-600">{{ 'Prospecting' | t }}</div>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">{{ 'Import Companies' | t }}</h1>
      <p class="mt-1 text-sm text-slate-500">{{ 'Upload a CSV from a directory, a purchased list or a spreadsheet. Duplicates are merged and every company is scored and enriched.' | t }}</p>
    </div>

    @if (error()) { <p class="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{{ error() | t }}</p> }

    @if (!preview()) {
      <label class="card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 py-14 text-center hover:border-violet-400"
             (dragover)="$event.preventDefault()" (drop)="drop($event)">
        <span class="text-4xl">⇪</span>
        <span class="font-semibold text-slate-800">{{ (busy() ? 'Reading file…' : 'Choose a CSV file or drop it here') | t }}</span>
        <span class="text-xs text-slate-500">{{ 'CSV, up to 10 MB and 20,000 rows. In Excel: File → Save As → CSV UTF-8.' | t }}</span>
        <input type="file" accept=".csv,text/csv,.txt" class="hidden" (change)="pick($any($event.target).files?.[0])" [disabled]="busy()" />
      </label>
    } @else {
      @let p = preview()!;
      <div class="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section class="card overflow-x-auto">
          <h2 class="section-title">{{ 'Match your columns' | t }}</h2>
          <p class="muted mb-4">{{ '{n} rows in {file}. We matched the columns we recognised; check them below.' | t: { n: p.row_count, file: p.filename } }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            @for (f of p.fields; track f) {
              <div>
                <label class="label" [for]="'map-' + f">{{ fieldLabel(f) | t }} @if (f === 'name') { <span class="text-rose-600">*</span> }</label>
                <select class="input" [id]="'map-' + f" [(ngModel)]="mapping[f]">
                  <option [ngValue]="null">— {{ 'Not in file' | t }} —</option>
                  @for (h of p.headers; track $index) { <option [ngValue]="$index">{{ h || ('Column ' + ($index + 1)) }}</option> }
                </select>
              </div>
            }
          </div>

          <h3 class="mt-6 mb-2 text-sm font-semibold text-slate-700">{{ 'Preview' | t }}</h3>
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-200">
              @for (f of shownFields(); track f) { <th class="th">{{ fieldLabel(f) | t }}</th> }
            </tr></thead>
            <tbody>
              @for (row of p.sample; track $index) {
                <tr class="border-b border-slate-100">
                  @for (f of shownFields(); track f) { <td class="td max-w-56 truncate">{{ row[mapping[f]!] || '—' }}</td> }
                </tr>
              }
            </tbody>
          </table>
        </section>

        <aside class="card h-fit space-y-4">
          <div><label class="label" for="nm">{{ 'List name' | t }}</label><input id="nm" class="input" [(ngModel)]="name" /></div>
          <div><label class="label" for="ct">{{ 'Country' | t }}</label>
            <select id="ct" class="input" [(ngModel)]="countryId">
              @for (c of countries(); track c.id) { <option [ngValue]="c.id">{{ c.name_en }}</option> }
            </select>
            <p class="mt-1 text-xs text-slate-500">{{ 'Used to read phone numbers and match city names.' | t }}</p></div>
          <div><label class="label" for="in">{{ 'Industry' | t }} <span class="font-normal normal-case">({{ 'optional' | t }})</span></label>
            <select id="in" class="input" [(ngModel)]="industryId">
              <option [ngValue]="null">— {{ 'Any' | t }} —</option>
              @for (i of industries(); track i.id) { <option [ngValue]="i.id">{{ i.name_en }}</option> }
            </select></div>
          <button class="btn-primary w-full justify-center" (click)="start()" [disabled]="busy() || mapping['name'] === null || !countryId || !name.trim()">
            {{ (busy() ? 'Starting…' : 'Import {n} rows') | t: { n: p.row_count } }}</button>
          <button class="btn-ghost w-full justify-center" (click)="reset()">{{ 'Choose another file' | t }}</button>
          <p class="text-xs text-slate-500">{{ 'Importing uses no search credits. Website enrichment and AI analysis use credits as usual.' | t }}</p>
        </aside>
      </div>
    }
  `,
})
export class ImportPage {
  private api = inject(Api);
  private router = inject(Router);
  protected countries = toSignal(this.api.locations(), { initialValue: [] });
  protected industries = toSignal(this.api.industries(), { initialValue: [] });
  protected preview = signal<ImportPreview | null>(null);
  protected busy = signal(false);
  protected error = signal('');
  protected mapping: Record<string, number | null> = {};
  protected name = '';
  protected countryId: number | null = null;
  protected industryId: number | null = null;

  fieldLabel(f: string) { return FIELD_LABELS[f] ?? f; }
  shownFields() { return (this.preview()?.fields ?? []).filter(f => this.mapping[f] !== null && this.mapping[f] !== undefined); }

  drop(e: DragEvent) {
    e.preventDefault();
    this.pick(e.dataTransfer?.files?.[0]);
  }

  pick(file?: File) {
    if (!file) return;
    this.error.set('');
    this.busy.set(true);
    this.api.importPreview(file).subscribe({
      next: p => {
        this.mapping = Object.fromEntries(p.fields.map(f => [f, p.mapping[f] ?? null]));
        this.name = p.filename.replace(/\.(csv|txt)$/i, '');
        this.countryId ??= this.countries().find(c => c.iso_code === 'PK')?.id ?? this.countries()[0]?.id ?? null;
        this.preview.set(p);
        this.busy.set(false);
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(apiError(e, 'Could not read the file.')); },
    });
  }

  start() {
    const p = this.preview();
    if (!p || this.countryId === null) return;
    this.busy.set(true);
    this.error.set('');
    this.api.startImport({ upload_id: p.upload_id, name: this.name.trim(), country_id: this.countryId, industry_id: this.industryId, mapping: this.mapping })
      .subscribe({
        next: c => this.router.navigate(['/campaigns', c.id]),
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(apiError(e)); },
      });
  }

  reset() {
    this.preview.set(null);
    this.error.set('');
  }
}
