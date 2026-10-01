import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { Keyword, Location } from '../core/models';

/** Campaign Builder (spec §7-8): where + what + keywords + filters. */
@Component({
  selector: 'app-campaign-builder',
  imports: [TPipe, FormsModule],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'New campaign' | t }}</h1>
    <form class="grid gap-5 lg:grid-cols-3" (ngSubmit)="save()">
      <div class="space-y-5 lg:col-span-2">
        <section class="card space-y-4">
          <h2 class="font-semibold">{{ 'What are you looking for?' | t }}</h2>
          <div><label class="label" for="name">{{ 'Campaign name' | t }}</label>
            <input id="name" class="input" name="name" [(ngModel)]="name" required [placeholder]="'Lahore Paper Manufacturers' | t" /></div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div><label class="label" for="type">{{ 'Company type' | t }}</label>
              <input id="type" class="input" name="type" [(ngModel)]="companyType" required [placeholder]="'Paper Manufacturer' | t" (blur)="suggest()" /></div>
            <div><label class="label" for="industry">{{ 'Industry' | t }}</label>
              <select id="industry" class="input" name="industry" [(ngModel)]="industryId">
                <option [ngValue]="null">{{ '— Any —' | t }}</option>
                @for (i of industries(); track i.id) { <option [ngValue]="i.id">{{ i.name_en }}</option> }
              </select></div>
          </div>
        </section>

        <section class="card space-y-4">
          <h2 class="font-semibold">{{ 'Where?' | t }}</h2>
          <div class="grid gap-4 sm:grid-cols-3">
            <div><label class="label" for="country">{{ 'Country' | t }}</label>
              <select id="country" class="input" name="country" [(ngModel)]="countryId" (ngModelChange)="pickCountry($event)" required>
                <option [ngValue]="null" disabled>{{ 'Select…' | t }}</option>
                @for (c of countries(); track c.id) { <option [ngValue]="c.id">{{ c.name_en }}</option> }
              </select></div>
            @if (regions().length) {
              <div><label class="label" for="region">{{ 'Province / City' | t }}</label>
                <select id="region" class="input" name="region" [(ngModel)]="regionId" (ngModelChange)="pickRegion($event)">
                  <option [ngValue]="null">{{ 'All' | t }}</option>
                  @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name_en }}</option> }
                </select></div>
            }
            @if (cities().length) {
              <div><label class="label" for="city">{{ 'City' | t }}</label>
                <select id="city" class="input" name="city" [(ngModel)]="cityId" (ngModelChange)="pickCity($event)">
                  <option [ngValue]="null">{{ 'All' | t }}</option>
                  @for (r of cities(); track r.id) { <option [ngValue]="r.id">{{ r.name_en }}</option> }
                </select></div>
            }
          </div>
          @if (areas().length) {
            <div>
              <span class="label">{{ 'Areas' | t }} <span class="normal-case font-normal">{{ '(none selected = whole city)' | t }}</span></span>
              <div class="flex flex-wrap gap-2">
                @for (a of areas(); track a.id) {
                  <button type="button" class="badge border px-3 py-1" (click)="toggleArea(a.id)"
                          [class]="selectedAreas().has(a.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'">{{ a.name_en }}</button>
                }
              </div>
            </div>
          }
        </section>

        <section class="card space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ 'Search keywords' | t }}</h2>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1 text-sm"><input type="checkbox" name="ar" [(ngModel)]="arabic" (change)="suggest()" /> {{ 'Arabic' | t }}</label>
              <button type="button" class="btn-ghost" (click)="suggest()" [disabled]="!companyType">{{ 'Generate' | t }}</button>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (k of keywords(); track k.keyword) {
              <span class="badge flex items-center gap-2 border px-3 py-1" [class]="k.enabled ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-400 line-through'">
                <button type="button" (click)="toggleKeyword(k)" [attr.aria-label]="'Toggle ' + k.keyword">{{ k.keyword }}</button>
                <button type="button" class="text-slate-400 hover:text-red-600" (click)="removeKeyword(k)" aria-label="Remove">×</button>
              </span>
            } @empty { <p class="text-sm text-slate-500">{{ 'Enter a company type and click Generate.' | t }}</p> }
          </div>
          <div class="flex gap-2">
            <input class="input" name="custom" [(ngModel)]="custom" [placeholder]="'Add custom keyword' | t" (keydown.enter)="$event.preventDefault(); addKeyword()" />
            <button type="button" class="btn-ghost" (click)="addKeyword()">{{ 'Add' | t }}</button>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section class="card space-y-4">
          <h2 class="font-semibold">{{ 'Filters' | t }}</h2>
          <div><label class="label" for="target">{{ 'Target results' | t }}</label><input id="target" class="input" type="number" min="1" max="5000" name="target" [(ngModel)]="target" /></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="mhp" [(ngModel)]="mustHavePhone" /> {{ 'Must have phone' | t }}</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="mhw" [(ngModel)]="mustHaveWebsite" /> {{ 'Must have website' | t }}</label>
          <div><label class="label" for="rating">{{ 'Minimum rating' | t }}</label><input id="rating" class="input" type="number" step="0.1" min="0" max="5" name="rating" [(ngModel)]="minRating" /></div>
          <div><label class="label" for="refresh">{{ 'Auto-refresh' | t }}</label>
            <select id="refresh" class="input" name="refresh" [(ngModel)]="refreshDays">
              <option [ngValue]="null">{{ 'Off' | t }}</option>
              @for (d of [7, 14, 30, 90]; track d) { <option [ngValue]="d">{{ 'Every {n} days' | t: { n: d } }}</option> }
            </select></div>
          <div><label class="label" for="reviews">{{ 'Minimum reviews' | t }}</label><input id="reviews" class="input" type="number" min="0" name="reviews" [(ngModel)]="minReviews" /></div>
        </section>
        @if (error()) { <p class="text-sm text-red-600">{{ error() | t }}</p> }
        <div class="flex gap-2">
          <button class="btn-ghost flex-1 justify-center" type="submit" [disabled]="busy()">{{ 'Save draft' | t }}</button>
          <button class="btn-primary flex-1 justify-center" type="button" (click)="save(true)" [disabled]="busy()">{{ 'Save & run' | t }}</button>
        </div>
      </aside>
    </form>
  `,
})
export class CampaignBuilderPage {
  private api = inject(Api);
  private router = inject(Router);

  protected industries = toSignal(this.api.industries(), { initialValue: [] });
  protected countries = toSignal(this.api.locations(), { initialValue: [] });
  protected regions = signal<Location[]>([]);
  protected cities = signal<Location[]>([]);
  protected areas = signal<Location[]>([]);
  protected selectedAreas = signal(new Set<number>());
  protected keywords = signal<Keyword[]>([]);
  protected busy = signal(false);
  protected error = signal('');

  name = '';
  companyType = '';
  industryId: number | null = null;
  countryId: number | null = null;
  regionId: number | null = null;
  cityId: number | null = null;
  arabic = false;
  custom = '';
  target = 500;
  mustHavePhone = false;
  mustHaveWebsite = false;
  minRating: number | null = null;
  minReviews: number | null = null;
  refreshDays: number | null = null;

  pickCountry(id: number) {
    this.regionId = this.cityId = null;
    this.cities.set([]); this.areas.set([]); this.selectedAreas.set(new Set());
    this.arabic = this.countries().find(c => c.id === id)?.iso_code === 'SA' || this.arabic;
    this.api.locations(id).subscribe(r => this.regions.set(r));
  }

  pickRegion(id: number | null) {
    this.cityId = null;
    this.cities.set([]); this.areas.set([]); this.selectedAreas.set(new Set());
    if (!id) return;
    const region = this.regions().find(r => r.id === id);
    // Some countries go straight to cities (no province level).
    this.api.locations(id).subscribe(r => (region?.level === 'city' ? this.areas.set(r) : this.cities.set(r)));
  }

  pickCity(id: number | null) {
    this.areas.set([]); this.selectedAreas.set(new Set());
    if (id) this.api.locations(id).subscribe(r => this.areas.set(r));
  }

  toggleArea(id: number) {
    const s = new Set(this.selectedAreas());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selectedAreas.set(s);
  }

  suggest() {
    if (!this.companyType.trim()) return;
    this.api.suggestKeywords(this.companyType.trim(), this.arabic ? ['en', 'ar'] : ['en']).subscribe({
      next: words => {
        const custom = this.keywords().filter(k => k.origin === 'custom');
        const generated: Keyword[] = words.map(w => ({ keyword: w, enabled: true, origin: 'generated', language: /[؀-ۿ]/.test(w) ? 'ar' : 'en' }));
        this.keywords.set(dedupe([...generated, ...custom]));
      },
      error: () => this.keywords.set(dedupe([{ keyword: this.companyType.trim(), enabled: true, origin: 'custom', language: 'en' }, ...this.keywords()])),
    });
  }

  addKeyword() {
    const k = this.custom.trim();
    if (!k) return;
    this.keywords.set(dedupe([...this.keywords(), { keyword: k, enabled: true, origin: 'custom', language: /[؀-ۿ]/.test(k) ? 'ar' : 'en' }]));
    this.custom = '';
  }

  toggleKeyword(k: Keyword) { this.keywords.set(this.keywords().map(x => (x === k ? { ...x, enabled: !x.enabled } : x))); }
  removeKeyword(k: Keyword) { this.keywords.set(this.keywords().filter(x => x !== k)); }

  save(run = false) {
    this.error.set('');
    if (!this.name || !this.companyType || !this.countryId) {
      this.error.set('Name, company type and country are required.');
      return;
    }
    const locationIds = this.selectedAreas().size ? [...this.selectedAreas()] : [this.cityId ?? this.regionId].filter((x): x is number => !!x);
    this.busy.set(true);
    this.api.createCampaign({
      name: this.name,
      company_type: this.companyType,
      industry_id: this.industryId,
      country_id: this.countryId,
      location_ids: locationIds,
      target_results: this.target,
      refresh_interval_days: this.refreshDays,
      filters: {
        must_have_phone: this.mustHavePhone, must_have_website: this.mustHaveWebsite,
        min_rating: this.minRating, min_reviews: this.minReviews, languages: this.arabic ? ['en', 'ar'] : ['en'],
      },
      ...(this.keywords().length ? { keywords: this.keywords() } : {}),
    }).subscribe({
      next: c => {
        const go = () => this.router.navigate(['/campaigns', c.id]);
        run ? this.api.runCampaign(c.id).subscribe({ next: go, error: go }) : go();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Could not save campaign.'); },
    });
  }
}

function dedupe(list: Keyword[]): Keyword[] {
  const seen = new Set<string>();
  return list.filter(k => !seen.has(k.keyword.toLowerCase()) && !!seen.add(k.keyword.toLowerCase()));
}
