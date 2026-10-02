import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { Keyword, Location } from '../core/models';

@Component({
  selector: 'app-campaign-builder',
  imports: [TPipe, FormsModule],
  template: `
    <div class="mx-auto max-w-6xl">
      <div class="mb-7">
        <div class="text-sm font-semibold text-violet-600">{{ 'Prospecting' | t }}</div>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950">{{ 'Find New Companies' | t }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ 'Tell LeadEngine who you want, where you want them, and how deep to search.' | t }}</p>
      </div>

      <div class="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div class="space-y-5">
          <section class="card">
            <div class="mb-5 flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-700">1</div>
              <div><h2 class="section-title">{{ 'What businesses do you want to find?' | t }}</h2><p class="muted">{{ 'Use a simple phrase such as Clothing Brands, Solar Companies, Hospitals or Paper Manufacturers.' | t }}</p></div>
            </div>

            <div class="relative">
              <input class="input !py-4 !text-base" [(ngModel)]="companyType" name="companyType"
                     [placeholder]="'e.g. Clothing Brands' | t" (blur)="suggest()" />
              <div class="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-violet-500">✦</div>
            </div>

            @if (taxonomy(); as tx) {
              <div class="mt-4">
                <div class="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{{ 'Popular business types' | t }}</div>
                <div class="flex flex-wrap gap-2">
                  @for (bt of tx.business_types.slice(0, 14); track bt.id) {
                    <button type="button" class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                            (click)="chooseBusinessType(bt.name)">{{ bt.name }}</button>
                  }
                </div>
              </div>
            }

            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label class="label">{{ 'Campaign objective' | t }}</label>
                <select class="input" [(ngModel)]="objective" name="objective">
                  <option value="find_customers">Find potential customers</option>
                  <option value="sell_services">Sell my services</option>
                  <option value="find_suppliers">Find suppliers</option>
                  <option value="find_manufacturers">Find manufacturers</option>
                  <option value="find_distributors">Find distributors / retailers</option>
                  <option value="market_research">Market research</option>
                </select>
              </div>
              <div>
                <label class="label">{{ 'Campaign name' | t }} <span class="normal-case font-normal text-slate-400">({{ 'optional' | t }})</span></label>
                <input class="input" [(ngModel)]="name" name="name" [placeholder]="autoName()" />
              </div>
            </div>
          </section>

          <section class="card">
            <div class="mb-5 flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-700">2</div>
              <div><h2 class="section-title">{{ 'Where?' | t }}</h2><p class="muted">{{ 'Search a whole city, selected areas, or the wider country.' | t }}</p></div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div>
                <label class="label">{{ 'Country' | t }}</label>
                <select class="input" [(ngModel)]="countryId" name="country" (ngModelChange)="pickCountry($event)" required>
                  <option [ngValue]="null" disabled>{{ 'Select country…' | t }}</option>
                  @for (c of countries(); track c.id) { <option [ngValue]="c.id">{{ c.name_en }}</option> }
                </select>
              </div>

              @if (regions().length) {
                <div>
                  <label class="label">{{ 'Province / Region' | t }}</label>
                  <select class="input" [(ngModel)]="regionId" name="region" (ngModelChange)="pickRegion($event)">
                    <option [ngValue]="null">{{ 'All regions' | t }}</option>
                    @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name_en }}</option> }
                  </select>
                </div>
              }

              @if (cities().length) {
                <div>
                  <label class="label">{{ 'City' | t }}</label>
                  <select class="input" [(ngModel)]="cityId" name="city" (ngModelChange)="pickCity($event)">
                    <option [ngValue]="null">{{ 'Whole region' | t }}</option>
                    @for (r of cities(); track r.id) { <option [ngValue]="r.id">{{ r.name_en }}</option> }
                  </select>
                </div>
              }
            </div>

            @if (cityId) {
              <div class="mt-5">
                <label class="label">{{ 'Coverage' | t }}</label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <button type="button" (click)="chooseWholeCity()"
                          class="rounded-2xl border p-4 text-start transition"
                          [class]="coverageMode === 'whole_city' ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 hover:border-slate-300'">
                    <div class="font-semibold text-slate-900">◎ {{ 'Whole City' | t }}</div>
                    <div class="mt-1 text-xs text-slate-500">{{ 'LeadEngine covers the city automatically.' | t }}</div>
                  </button>
                  <button type="button" (click)="coverageMode='selected_areas'"
                          class="rounded-2xl border p-4 text-start transition"
                          [class]="coverageMode === 'selected_areas' ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 hover:border-slate-300'">
                    <div class="font-semibold text-slate-900">⌖ {{ 'Selected Areas' | t }}</div>
                    <div class="mt-1 text-xs text-slate-500">{{ 'Choose neighborhoods or industrial zones.' | t }}</div>
                  </button>
                </div>
              </div>
            }

            @if (coverageMode === 'selected_areas' && areas().length) {
              <div class="mt-4 rounded-2xl bg-slate-50 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <div><div class="font-semibold text-slate-900">{{ 'Select areas' | t }}</div><div class="text-xs text-slate-500">{{ selectedAreas().size }} {{ 'selected' | t }}</div></div>
                  <button type="button" class="text-xs font-semibold text-violet-700" (click)="clearAreas()">{{ 'Clear' | t }}</button>
                </div>
                <div class="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  @for (a of areas(); track a.id) {
                    <button type="button" class="rounded-full border px-3 py-1.5 text-xs font-semibold transition" (click)="toggleArea(a.id)"
                            [class]="selectedAreas().has(a.id) ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'">{{ a.name_en }}</button>
                  }
                </div>
              </div>
            }
          </section>

          <section class="card">
            <div class="mb-5 flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-700">3</div>
              <div><h2 class="section-title">{{ 'Search depth' | t }}</h2><p class="muted">{{ 'Choose the balance between speed, coverage and credits.' | t }}</p></div>
            </div>

            <div class="grid gap-3 md:grid-cols-3">
              @for (d of depths; track d.key) {
                <button type="button" (click)="searchDepth=d.key"
                        class="rounded-2xl border p-4 text-start transition"
                        [class]="searchDepth === d.key ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 hover:border-slate-300'">
                  <div class="flex items-center justify-between"><span class="font-semibold text-slate-900">{{ d.label }}</span>@if(d.key==='standard'){<span class="badge bg-emerald-100 text-emerald-700">Recommended</span>}</div>
                  <div class="mt-1 text-xs text-slate-500">{{ d.description }}</div>
                </button>
              }
            </div>

            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <div><label class="label">{{ 'Target companies' | t }}</label><input class="input" type="number" min="10" max="5000" [(ngModel)]="target" name="target" /></div>
              <div><label class="label">{{ 'Language expansion' | t }}</label><label class="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm"><input type="checkbox" [(ngModel)]="arabic" name="arabic" /> Include Arabic search aliases</label></div>
            </div>

            <details class="mt-5 rounded-2xl border border-slate-200 p-4">
              <summary class="cursor-pointer font-semibold text-slate-800">{{ 'Advanced filters' | t }}</summary>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="mustHavePhone" name="mhp" /> {{ 'Must have phone' | t }}</label>
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="mustHaveWebsite" name="mhw" /> {{ 'Must have website' | t }}</label>
                <div><label class="label">{{ 'Minimum rating' | t }}</label><input class="input" type="number" step="0.1" min="0" max="5" [(ngModel)]="minRating" name="rating" /></div>
                <div><label class="label">{{ 'Minimum reviews' | t }}</label><input class="input" type="number" min="0" [(ngModel)]="minReviews" name="reviews" /></div>
                <div class="md:col-span-2"><label class="label">{{ 'Exclude keywords' | t }}</label><input class="input" [(ngModel)]="exclusions" name="exclusions" placeholder="Tailor, dry cleaner, second hand..." /></div>
              </div>
            </details>
          </section>

          @if (error()) { <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{{ error() | t }}</div> }
        </div>

        <aside class="space-y-5 xl:sticky xl:top-28 xl:self-start">
          <section class="card">
            <div class="flex items-center justify-between"><h2 class="section-title">{{ 'Campaign Preview' | t }}</h2><span class="text-violet-600">✦</span></div>

            @if (preview(); as p) {
              <div class="mt-4 space-y-3">
                <div class="rounded-xl bg-violet-50 p-3"><div class="label !mb-0">Target</div><div class="mt-1 font-semibold text-violet-950">{{ companyType }}</div></div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="card-soft"><div class="text-xs text-slate-500">Keywords</div><div class="mt-1 text-xl font-bold">{{ p.keyword_count }}</div></div>
                  <div class="card-soft"><div class="text-xs text-slate-500">Search areas</div><div class="mt-1 text-xl font-bold">{{ p.area_count }}</div></div>
                  <div class="card-soft"><div class="text-xs text-slate-500">Est. queries</div><div class="mt-1 text-xl font-bold">{{ p.estimated_queries }}</div></div>
                  <div class="card-soft"><div class="text-xs text-slate-500">Search credits</div><div class="mt-1 text-xl font-bold text-violet-700">{{ p.estimated_search_credits }}</div></div>
                </div>
                <div class="rounded-xl border border-slate-200 p-3"><div class="text-xs text-slate-500">Estimated companies</div><div class="mt-1 text-lg font-bold">{{ p.estimated_companies_low }}–{{ p.estimated_companies_high }}</div></div>
                <div><div class="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Generated searches</div><div class="flex flex-wrap gap-1.5">@for(k of p.keywords.slice(0,10); track k){<span class="badge bg-slate-100 text-slate-600">{{ k }}</span>}</div></div>
              </div>
            } @else {
              <div class="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center">
                <div class="text-2xl">⌕</div><div class="mt-2 text-sm font-semibold text-slate-700">{{ 'Ready to estimate coverage?' | t }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ 'Complete the target and location, then preview before spending credits.' | t }}</div>
              </div>
            }

            <button class="btn-ghost mt-4 w-full" type="button" (click)="makePreview()" [disabled]="!canPreview() || busy()">{{ 'Preview Campaign' | t }}</button>
            <button class="btn-primary mt-2 w-full" type="button" (click)="save(true)" [disabled]="!canPreview() || busy()">{{ busy() ? ('Starting…' | t) : ('Start Campaign' | t) }}</button>
            <button class="mt-2 w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-800" type="button" (click)="save(false)" [disabled]="!canPreview() || busy()">{{ 'Save as Draft' | t }}</button>
          </section>
        </aside>
      </div>
    </div>
  `,
})
export class CampaignBuilderPage {
  private api = inject(Api);
  private router = inject(Router);

  protected countries = toSignal(this.api.locations(), { initialValue: [] });
  protected taxonomy = toSignal(this.api.taxonomy(), { initialValue: { sectors: [], business_types: [], services: [] } });
  protected regions = signal<Location[]>([]);
  protected cities = signal<Location[]>([]);
  protected areas = signal<Location[]>([]);
  protected selectedAreas = signal(new Set<number>());
  protected keywords = signal<Keyword[]>([]);
  protected preview = signal<any | null>(null);
  protected busy = signal(false);
  protected error = signal('');

  name = '';
  companyType = '';
  countryId: number | null = null;
  regionId: number | null = null;
  cityId: number | null = null;
  coverageMode = 'whole_city';
  objective = 'find_customers';
  searchDepth = 'standard';
  arabic = false;
  target = 500;
  mustHavePhone = false;
  mustHaveWebsite = false;
  minRating: number | null = null;
  minReviews: number | null = null;
  exclusions = '';

  protected depths = [
    { key: 'quick', label: 'Quick', description: 'Fastest search with fewer keyword variants.' },
    { key: 'standard', label: 'Standard', description: 'Balanced coverage for most campaigns.' },
    { key: 'deep', label: 'Deep', description: 'Expands city areas for maximum local coverage.' },
  ];

  // Plain methods: these read ngModel fields (not signals), so computed() would never update.
  protected canPreview() { return !!this.companyType.trim() && !!this.countryId; }
  protected autoName() {
    const city = this.cities().find(x => x.id === this.cityId)?.name_en;
    const country = this.countries().find(x => x.id === this.countryId)?.name_en;
    return [this.companyType || 'Campaign', city || country].filter(Boolean).join(' — ');
  }

  chooseBusinessType(name: string) { this.companyType = name; this.preview.set(null); this.suggest(); }

  pickCountry(id: number) {
    this.regionId = this.cityId = null;
    this.regions.set([]); this.cities.set([]); this.areas.set([]); this.selectedAreas.set(new Set()); this.preview.set(null);
    const country = this.countries().find(c => c.id === id);
    this.arabic = country?.iso_code === 'SA' || country?.iso_code === 'AE' || this.arabic;
    this.api.locations(id).subscribe(children => {
      if (children.length && children.every(x => x.level === 'city')) this.cities.set(children);
      else this.regions.set(children);
    });
  }

  pickRegion(id: number | null) {
    this.cityId = null; this.cities.set([]); this.areas.set([]); this.selectedAreas.set(new Set()); this.preview.set(null);
    if (!id) return;
    this.api.locations(id).subscribe(children => {
      if (children.length && children.every(x => x.level === 'area')) this.areas.set(children);
      else this.cities.set(children);
    });
  }

  pickCity(id: number | null) {
    this.areas.set([]); this.selectedAreas.set(new Set()); this.coverageMode = 'whole_city'; this.preview.set(null);
    if (id) this.api.locations(id).subscribe(r => this.areas.set(r));
  }

  chooseWholeCity() {
    this.coverageMode = 'whole_city';
    this.clearAreas();
  }

  clearAreas() {
    this.selectedAreas.set(new Set<number>());
    this.preview.set(null);
  }

  toggleArea(id: number) {
    const s = new Set(this.selectedAreas());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selectedAreas.set(s);
    this.preview.set(null);
  }

  suggest() {
    if (!this.companyType.trim()) return;
    this.api.suggestKeywords(this.companyType.trim(), this.arabic ? ['en','ar'] : ['en']).subscribe({
      next: words => this.keywords.set(words.map(w => ({ keyword:w, enabled:true, origin:'generated', language:/[؀-ۿ]/.test(w)?'ar':'en' }))),
      error: () => this.keywords.set([{ keyword:this.companyType.trim(), enabled:true, origin:'custom', language:'en' }]),
    });
  }

  locationIds(): number[] {
    if (this.coverageMode === 'selected_areas' && this.selectedAreas().size) return [...this.selectedAreas()];
    return [this.cityId ?? this.regionId].filter((x): x is number => !!x);
  }

  makePreview() {
    if (!this.canPreview()) return;
    this.error.set(''); this.busy.set(true);
    this.api.previewCampaign({
      company_type: this.companyType.trim(), country_id: this.countryId, location_ids: this.locationIds(),
      target_results: this.target, languages: this.arabic ? ['en','ar'] : ['en'], search_depth: this.searchDepth,
    }).subscribe({
      next: p => {
        this.busy.set(false); this.preview.set(p);
        this.keywords.set(p.keywords.map((w:string) => ({ keyword:w, enabled:true, origin:'generated', language:/[؀-ۿ]/.test(w)?'ar':'en' })));
      },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Could not preview campaign.'); },
    });
  }

  save(run = false) {
    this.error.set('');
    if (!this.companyType.trim() || !this.countryId) { this.error.set('Business target and country are required.'); return; }
    this.busy.set(true);
    const campaignName = this.name.trim() || this.autoName();
    this.api.createCampaign({
      name: campaignName, company_type: this.companyType.trim(), country_id: this.countryId,
      location_ids: this.locationIds(), target_results: this.target,
      filters: {
        must_have_phone: this.mustHavePhone, must_have_website: this.mustHaveWebsite,
        min_rating: this.minRating, min_reviews: this.minReviews,
        languages: this.arabic ? ['en','ar'] : ['en'], objective: this.objective,
        search_depth: this.searchDepth, coverage_mode: this.coverageMode,
        exclusions: this.exclusions.split(',').map(x => x.trim()).filter(Boolean),
      },
      ...(this.keywords().length ? { keywords: this.keywords() } : {}),
    }).subscribe({
      next: c => {
        const go = () => this.router.navigate(['/campaigns', c.id]);
        run ? this.api.runCampaign(c.id).subscribe({ next: go, error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Campaign saved but could not start.'); } }) : go();
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Could not save campaign.'); },
    });
  }
}
