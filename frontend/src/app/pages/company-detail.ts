import { Component, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe, KeyValuePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TPipe } from '../core/i18n/i18n';
import { Activity, Company, label, qualityClass } from '../core/models';

/** Company 360° profile (spec §25). */
@Component({
  selector: 'app-company-detail',
  imports: [TPipe, DatePipe, KeyValuePipe, RouterLink],
  template: `
    @if (c(); as c) {
      <div class="mb-5">
        <h1 class="text-2xl font-bold">{{ c.name_en }} @if (c.name_ar) { <span class="text-slate-500" dir="rtl">· {{ c.name_ar }}</span> }</h1>
        <p class="text-sm text-slate-500">{{ c.location?.name_en }}@if (c.location?.parent) {, {{ c.location?.parent?.name_en }}} · {{ c.industry?.name_en ?? ('Unclassified' | t) }}</p>
      </div>
      <div class="grid gap-5 lg:grid-cols-3">
        <section class="card space-y-2 text-sm">
          <h2 class="mb-2 font-semibold">{{ 'Contact' | t }}</h2>
          @for (p of c.phones; track p.id) { <div>📞 {{ p.normalized ?? p.original }} <span class="text-xs text-slate-500">{{ p.phone_type }}</span></div> }
          @for (e of c.emails; track e.id) { <div>✉️ {{ e.email }} <span class="text-xs text-slate-500">{{ e.type }} · {{ e.status }}</span></div> }
          @if (c.website) { <div>🌐 <a class="text-indigo-700" [href]="c.website" target="_blank" rel="noopener">{{ c.website }}</a></div> }
          @if (c.address_en) { <div>📍 {{ c.address_en }}</div> }
          @if (c.rating) { <div>⭐ {{ c.rating }} ({{ c.review_count }} reviews) · {{ c.business_status }}</div> }
        </section>
        <section class="card space-y-3 text-sm">
          <h2 class="font-semibold">{{ 'Company' | t }}</h2>
          @if (c.ai_summary) {
            <div><span class="label">{{ 'AI summary' | t }} <span class="badge bg-amber-50 text-amber-800 normal-case">{{ 'AI-generated' | t }}</span></span>
              <p class="text-slate-700">{{ c.ai_summary }}</p></div>
          }
          @if (c.description_en) { <div><span class="label">{{ 'Website description' | t }}</span><p class="text-slate-700">{{ c.description_en }}</p></div> }
          @if (!c.ai_summary && !c.description_en) { <p class="text-slate-500">{{ 'No description yet. It is generated after website enrichment.' | t }}</p> }
          @if (c.classification_confidence) { <div class="text-xs text-slate-500">{{ 'Classification confidence' | t }}: {{ c.classification_confidence }}%</div> }
          @if (c.products.length) { <div><span class="label">{{ 'Products' | t }}</span>{{ c.products.join(', ') }}</div> }
          @if (c.services.length) { <div><span class="label">{{ 'Services' | t }}</span>{{ c.services.join(', ') }}</div> }
          @if (c.website && auth.can('companies.edit')) {
            <button class="btn-ghost" (click)="reanalyze()" [disabled]="queued()">{{ (queued() ? 'Queued' : 'Re-run enrichment & AI') | t }}</button>
          }
          <div><span class="label">{{ 'Online presence' | t }}</span>
            @for (s of c.social_links | keyvalue; track s.key) { <a class="me-3 text-indigo-700 capitalize" [href]="s.value" target="_blank" rel="noopener">{{ s.key }}</a> }
            @empty { — }
          </div>
          @if (c.possible_needs.length) {
            <div><span class="label">{{ 'Possible needs (AI indicator)' | t }}</span>
              @for (n of c.possible_needs; track n) { <span class="badge me-1 bg-amber-50 text-amber-800">{{ n }}</span> }</div>
          }
        </section>
        <section class="card text-sm">
          <h2 class="mb-2 font-semibold">{{ 'Leads' | t }}</h2>
          @for (l of c.leads; track l.id) {
            <a [routerLink]="['/leads', l.id]" class="flex justify-between border-b border-slate-100 py-2 last:border-0 hover:text-indigo-700">
              <span>{{ l.campaign?.name ?? 'Manual' }} · {{ label(l.status) | t }}</span>
              @if (l.score !== null) { <span class="badge" [class]="qualityClass(l.quality)">{{ l.score }}</span> }
            </a>
          } @empty { <p class="text-slate-500">{{ 'No visible leads.' | t }}</p> }
        </section>
      </div>
      <section class="card mt-5">
        <h2 class="mb-4 font-semibold">{{ 'Activity timeline' | t }}</h2>
        <ol class="space-y-2 text-sm">
          @for (e of timeline(); track $index) {
            <li class="flex gap-4"><span class="w-40 shrink-0 text-slate-500">{{ e.at | date: 'medium' }}</span><span>{{ e.text }}</span></li>
          }
        </ol>
      </section>
    }
  `,
})
export class CompanyDetailPage implements OnInit {
  readonly id = input.required<string>();
  private api = inject(Api);
  protected c = signal<Company | null>(null);
  protected auth = inject(AuthService);
  protected queued = signal(false);

  reanalyze() { this.api.analyzeCompany(+this.id()).subscribe(() => this.queued.set(true)); }
  protected timeline = signal<{ at: string; text: string }[]>([]);
  protected label = label;
  protected qualityClass = qualityClass;

  ngOnInit() {
    this.api.company(+this.id()).subscribe(c => {
      this.c.set(c);
      const events = [
        ...(c.sources ?? []).map(s => ({ at: s.discovered_at, text: `Discovered via ${label(s.source)}${s.keyword ? ` ("${s.keyword}")` : ''}` })),
        ...(c.leads ?? []).flatMap(l => (l.activities ?? []).map((a: Activity) => ({
          at: a.created_at, text: `${label(a.type)}${a.user ? ` by ${a.user.name}` : ''}${a.body ? `: ${a.body}` : ''}`,
        }))),
      ];
      this.timeline.set(events.sort((a, b) => b.at.localeCompare(a.at)));
    });
  }
}
