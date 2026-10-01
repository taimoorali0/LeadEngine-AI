import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { Lead, OUTCOMES, Page, PIPELINE, label, qualityClass } from '../core/models';

/** Lead result table (spec §24). */
@Component({
  selector: 'app-leads',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold">Leads</h1>
      <span class="text-sm text-slate-500">{{ page()?.total ?? 0 }} total</span>
      @if (canExport) { <button class="btn-ghost ml-auto" (click)="export()">Export CSV</button> }
    </div>
    <div class="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <input class="input" placeholder="Company name" [(ngModel)]="f.q" (keydown.enter)="load(1)" />
      <select class="input" [(ngModel)]="f.status" (ngModelChange)="load(1)">
        <option value="">All statuses</option>
        @for (s of statuses; track s) { <option [value]="s">{{ label(s) }}</option> }
      </select>
      <select class="input" [(ngModel)]="f.quality" (ngModelChange)="load(1)">
        <option value="">All quality</option>
        @for (q of qualities; track q) { <option [value]="q">{{ q }}</option> }
      </select>
      <input class="input" type="number" min="0" max="100" placeholder="Min score" [(ngModel)]="f.min_score" (keydown.enter)="load(1)" />
      <button class="btn-primary justify-center" (click)="load(1)">Filter</button>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="w-full">
        <thead class="border-b border-slate-200 bg-slate-50"><tr>
          <th class="th">Company</th><th class="th">City</th><th class="th">Industry</th><th class="th">Phone</th><th class="th">Website</th>
          <th class="th">Score</th><th class="th">Status</th><th class="th">Agent</th>
        </tr></thead>
        <tbody>
          @for (l of page()?.data ?? []; track l.id) {
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="td"><a [routerLink]="['/leads', l.id]" class="font-medium text-indigo-700 hover:underline">{{ l.company.name_en }}</a></td>
              <td class="td">{{ l.company.location?.name_en ?? '—' }}</td>
              <td class="td">{{ l.company.industry?.name_en ?? '—' }}</td>
              <td class="td">{{ $any(l).phones_count ? 'Yes' : 'No' }}</td>
              <td class="td">{{ l.company.website ? 'Yes' : 'No' }}</td>
              <td class="td">
                @if (l.score !== null) { <span class="badge" [class]="qualityClass(l.quality)" [title]="l.quality">{{ l.score }}</span> } @else { — }
              </td>
              <td class="td">{{ label(l.status) }}</td>
              <td class="td">{{ l.assignee?.name ?? '—' }}</td>
            </tr>
          } @empty {
            <tr><td class="td text-slate-500" colspan="8">No leads match.</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if ((page()?.last_page ?? 1) > 1) {
      <div class="mt-4 flex items-center justify-end gap-2 text-sm">
        <button class="btn-ghost" [disabled]="page()!.current_page <= 1" (click)="load(page()!.current_page - 1)">Previous</button>
        <span>Page {{ page()!.current_page }} of {{ page()!.last_page }}</span>
        <button class="btn-ghost" [disabled]="page()!.current_page >= page()!.last_page" (click)="load(page()!.current_page + 1)">Next</button>
      </div>
    }
  `,
})
export class LeadsPage implements OnInit {
  readonly campaign_id = input<string>();
  private api = inject(Api);
  private auth = inject(AuthService);
  protected page = signal<Page<Lead> | null>(null);
  protected f = { q: '', status: '', quality: '', min_score: null as number | null };
  protected statuses = [...PIPELINE, ...OUTCOMES];
  protected qualities = ['Highly Qualified', 'Qualified', 'Needs Review', 'Needs Enrichment'];
  protected label = label;
  protected qualityClass = qualityClass;
  protected canExport = ['leads.export_all', 'leads.export_team', 'leads.export_assigned'].some(p => this.auth.can(p));

  ngOnInit() { this.load(1); }

  load(p: number) {
    this.api.leads({ ...this.f, campaign_id: this.campaign_id(), page: p, sort: 'score' }).subscribe(r => this.page.set(r));
  }

  export() {
    this.api.exportLeads({ ...this.f, campaign_id: this.campaign_id() }).subscribe(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
}
