import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { apiError } from './account';

/** Organization settings: scoring weights, auto-assignment, AI (spec §23, §28). */
@Component({
  selector: 'app-settings',
  imports: [FormsModule, TPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Settings' | t }}</h1>
    @if (s(); as s) {
      <div class="grid gap-5 lg:grid-cols-2">
        <section class="card space-y-4">
          <h2 class="font-semibold">{{ 'Organization' | t }}</h2>
          <div><label class="label" for="org">{{ 'Company name' | t }}</label><input id="org" class="input" [(ngModel)]="orgName" /></div>
          <div><label class="label" for="loc">{{ 'Default language' | t }}</label>
            <select id="loc" class="input" [(ngModel)]="s.default_locale">
              <option value="en">English</option><option value="ur">اردو</option><option value="ar">العربية</option>
            </select></div>
          <h2 class="pt-2 font-semibold">{{ 'AI analysis' | t }}</h2>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="s.ai.enabled" /> {{ 'Summarize and classify enriched companies' | t }}</label>
          <div><label class="label" for="off">{{ 'What does your company sell? (one per line)' | t }}</label>
            <textarea id="off" class="input" rows="4" [(ngModel)]="offerings" [placeholder]="'Industrial automation&#10;Electrical maintenance'"></textarea>
            <p class="mt-1 text-xs text-slate-500">{{ 'Used to suggest possible needs. These are research hints, not facts.' | t }}</p></div>
        </section>

        <section class="card space-y-3">
          <h2 class="font-semibold">{{ 'Lead scoring' | t }}</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            @for (k of weightKeys; track k.key) {
              <div><label class="label" [for]="k.key">{{ k.label | t }}</label><input [id]="k.key" class="input" type="number" min="0" max="100" [(ngModel)]="s.scoring_rules[k.key]" /></div>
            }
            <div><label class="label" for="rt">{{ 'Rating threshold' | t }}</label><input id="rt" class="input" type="number" step="0.1" min="0" max="5" [(ngModel)]="s.scoring_rules.rating_threshold" /></div>
          </div>
          <p class="text-xs" [class.text-amber-700]="total() !== 100" [class.text-slate-500]="total() === 100">{{ 'Maximum score' | t }}: {{ total() }} ({{ 'capped at 100' | t }})</p>
          <h3 class="pt-2 text-sm font-semibold">{{ 'Quality bands (minimum score)' | t }}</h3>
          @for (b of s.scoring_rules.bands; track $index) {
            <div class="flex items-center gap-2"><input class="input w-24" type="number" min="0" max="100" [(ngModel)]="b[0]" /><span class="text-sm">{{ b[1] | t }}</span></div>
          }
        </section>

        <section class="card space-y-3 lg:col-span-2">
          <h2 class="font-semibold">{{ 'Automatic assignment' | t }}</h2>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="s.assignment.enabled" /> {{ 'Assign new leads automatically' | t }}</label>
          <div class="grid gap-3 sm:grid-cols-3">
            <div><label class="label" for="m">{{ 'Method' | t }}</label>
              <select id="m" class="input" [(ngModel)]="s.assignment.method">
                <option value="round_robin">{{ 'Round robin' | t }}</option>
                <option value="weighted">{{ 'Weighted' | t }}</option>
                <option value="territory">{{ 'Territory' | t }}</option>
              </select></div>
            <div><label class="label" for="ms">{{ 'Minimum score' | t }}</label><input id="ms" class="input" type="number" min="0" max="100" [(ngModel)]="s.assignment.min_score" /></div>
            <div><span class="label">{{ 'Eligible roles' | t }}</span>
              @for (r of roleKeys; track r.key) {
                <label class="me-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" [checked]="s.assignment.role_keys.includes(r.key)" (change)="toggleRole(r.key)" /> {{ r.label | t }}</label>
              }</div>
          </div>
          @if (s.assignment.method === 'weighted') {
            <p class="text-sm text-slate-600">{{ 'Higher weight = more leads. Default 1.' | t }}</p>
            <div class="grid gap-2 sm:grid-cols-3">
              @for (u of users(); track u.id) {
                <label class="flex items-center gap-2 text-sm"><input class="input w-20" type="number" min="0.1" step="0.1" [ngModel]="s.assignment.weights[u.id] ?? 1" (ngModelChange)="s.assignment.weights[u.id] = $event" /> {{ u.name }}</label>
              }
            </div>
          }
          @if (s.assignment.method === 'territory') {
            <p class="text-sm text-slate-600">{{ 'Each territory sends leads from its cities and industries to its agents.' | t }}</p>
            @for (tr of s.assignment.territories; track $index) {
              <div class="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
                <select class="input" multiple [(ngModel)]="tr.location_ids" [attr.aria-label]="'Cities' | t">
                  @for (c of cities(); track c.id) { <option [ngValue]="c.id">{{ c.name_en }}</option> }
                </select>
                <select class="input" multiple [(ngModel)]="tr.industry_ids" [attr.aria-label]="'Industries' | t">
                  @for (i of industries(); track i.id) { <option [ngValue]="i.id">{{ i.name_en }}</option> }
                </select>
                <select class="input" multiple [(ngModel)]="tr.user_ids" [attr.aria-label]="'Agents' | t">
                  @for (u of users(); track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }
                </select>
                <button class="btn-ghost text-red-600" (click)="s.assignment.territories.splice($index, 1)">{{ 'Remove' | t }}</button>
              </div>
            }
            <button class="btn-ghost" (click)="s.assignment.territories.push({ location_ids: [], industry_ids: [], user_ids: [] })">+ {{ 'Add territory' | t }}</button>
          }
        </section>
      </div>
      <div class="mt-5 flex items-center gap-3">
        <button class="btn-primary" (click)="save()">{{ 'Save settings' | t }}</button>
        @if (msg()) { <span class="text-sm" [class.text-red-600]="isError()" [class.text-emerald-700]="!isError()">{{ msg() | t }}</span> }
      </div>
    }
  `,
})
export class SettingsPage implements OnInit {
  private api = inject(Api);
  s = signal<any>(null);
  users = signal<any[]>([]);
  industries = signal<any[]>([]);
  cities = signal<any[]>([]);
  orgName = '';
  offerings = '';
  msg = signal('');
  isError = signal(false);
  weightKeys = [
    { key: 'phone', label: 'Phone available' }, { key: 'website', label: 'Website available' }, { key: 'email', label: 'Public email available' },
    { key: 'business_active', label: 'Business active' }, { key: 'industry_match', label: 'Correct industry' }, { key: 'location_match', label: 'Correct location' },
    { key: 'rating_above_threshold', label: 'Rating above threshold' }, { key: 'online_presence', label: 'Strong online presence' },
    { key: 'profile_complete', label: 'Complete company profile' },
  ];
  roleKeys = [{ key: 'agent', label: 'Sales Agent' }, { key: 'team_leader', label: 'Team Leader' }, { key: 'sales_manager', label: 'Sales Manager' }];

  ngOnInit() {
    this.api.settings().subscribe(r => {
      r.settings.assignment.weights = Array.isArray(r.settings.assignment.weights) ? {} : r.settings.assignment.weights;
      this.s.set(r.settings);
      this.orgName = r.organization.name;
      this.offerings = (r.settings.ai.offerings ?? []).join('\n');
    });
    this.api.teamMembers().subscribe(u => this.users.set(u));
    this.api.industries().subscribe(i => this.industries.set(i));
    // Cities across all seeded countries (two levels down from each country).
    this.api.locations().subscribe(countries => countries.forEach(c => this.api.locations(c.id).subscribe(regions => {
      regions.forEach(r => r.level === 'city' ? this.cities.update(x => [...x, r])
        : this.api.locations(r.id).subscribe(cs => this.cities.update(x => [...x, ...cs])));
    })));
  }

  total() {
    const r = this.s()?.scoring_rules ?? {};
    return this.weightKeys.reduce((sum, k) => sum + (+r[k.key] || 0), 0);
  }

  toggleRole(key: string) {
    const a = this.s().assignment;
    a.role_keys = a.role_keys.includes(key) ? a.role_keys.filter((k: string) => k !== key) : [...a.role_keys, key];
  }

  save() {
    const settings = structuredClone(this.s());
    settings.ai.offerings = this.offerings.split('\n').map((x: string) => x.trim()).filter(Boolean);
    this.api.saveSettings({ name: this.orgName, settings }).subscribe({
      next: () => { this.msg.set('Saved.'); this.isError.set(false); },
      error: e => { this.msg.set(apiError(e)); this.isError.set(true); },
    });
  }
}
