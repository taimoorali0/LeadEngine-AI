import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { Company } from '../core/models';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen">
      <aside class="fixed inset-y-0 left-0 z-30 w-60 -translate-x-full bg-slate-900 text-slate-300 transition md:translate-x-0"
             [class.translate-x-0]="menuOpen()">
        <div class="px-5 py-5 text-lg font-bold text-white">LeadEngine <span class="text-indigo-400">AI</span></div>
        <nav class="space-y-1 px-3">
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="bg-slate-800 text-white" (click)="menuOpen.set(false)"
               class="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800 hover:text-white">{{ item.label }}</a>
          }
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col md:ml-60">
        <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button class="btn-ghost md:hidden" (click)="menuOpen.set(!menuOpen())" aria-label="Menu">☰</button>
          <div class="relative max-w-xl flex-1">
            <input class="input" placeholder="Search company, phone, email, website, lead ID…" #q
                   (input)="search$.next(q.value)" (keydown.escape)="results.set(null)" />
            @if (results(); as r) {
              <div class="absolute mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                @for (c of r.companies; track c.id) {
                  <a [routerLink]="['/companies', c.id]" (click)="results.set(null); q.value=''" class="flex justify-between px-4 py-2 hover:bg-slate-50">
                    <span><b>{{ c.name_en }}</b> <span class="text-xs text-slate-500">{{ c.location?.name_en }} · {{ c.industry?.name_en }}</span></span>
                    @if (c.top_score !== null) { <span class="text-xs font-semibold text-indigo-600">Score {{ c.top_score }}</span> }
                  </a>
                }
                @for (l of r.leads; track l.id) {
                  <a [routerLink]="['/leads', l.id]" (click)="results.set(null); q.value=''" class="block px-4 py-2 hover:bg-slate-50">Lead #{{ l.id }} — {{ l.company.name_en }}</a>
                }
                @if (!r.companies.length && !r.leads.length) { <div class="px-4 py-2 text-sm text-slate-500">No matches</div> }
              </div>
            }
          </div>
          <div class="ml-auto hidden text-right text-sm sm:block">
            <div class="font-medium">{{ auth.user()?.name }}</div>
            <div class="text-xs text-slate-500">{{ auth.user()?.role?.name }}</div>
          </div>
          <button class="btn-ghost" (click)="logout()">Log out</button>
        </header>
        <main class="p-4 md:p-6"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class Shell {
  protected auth = inject(AuthService);
  private api = inject(Api);
  private router = inject(Router);
  protected menuOpen = signal(false);
  protected results = signal<{ companies: (Company & { top_score: number | null })[]; leads: any[] } | null>(null);
  protected search$ = new Subject<string>();
  protected nav = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/campaigns', label: 'Campaigns' },
    { path: '/leads', label: 'Leads' },
    { path: '/pipeline', label: 'CRM Pipeline' },
    { path: '/companies', label: 'Companies' },
    { path: '/follow-ups', label: 'Follow-Ups' },
  ];

  constructor() {
    this.search$.pipe(
      debounceTime(250), distinctUntilChanged(),
      switchMap(q => (q.trim().length < 2 ? of(null) : this.api.search(q.trim()))),
      takeUntilDestroyed(),
    ).subscribe(r => this.results.set(r));
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
