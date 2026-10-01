import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { I18n, LANGS, Lang, TPipe } from '../core/i18n/i18n';
import { AppNotification, Company } from '../core/models';
import { Realtime } from '../core/realtime';

interface NavItem { path: string; label: string; perm?: string }

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe, DatePipe],
  template: `
    <div class="flex min-h-screen">
      @if (menuOpen()) { <div class="fixed inset-0 z-20 bg-black/30 md:hidden" (click)="menuOpen.set(false)"></div> }
      <aside class="fixed inset-y-0 start-0 z-30 w-60 overflow-y-auto bg-slate-900 text-slate-300 transition md:translate-x-0"
             [class]="menuOpen() ? 'translate-x-0' : (i18n.dir() === 'rtl' ? 'translate-x-full' : '-translate-x-full')">
        <div class="px-5 py-5 text-lg font-bold text-white">LeadEngine <span class="text-indigo-400">AI</span></div>
        @for (group of nav(); track group.title) {
          <div class="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{{ group.title | t }}</div>
          <nav class="space-y-0.5 px-3">
            @for (item of group.items; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="bg-slate-800 text-white" (click)="menuOpen.set(false)"
                 class="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800 hover:text-white">{{ item.label | t }}</a>
            }
          </nav>
        }
        <div class="px-5 py-5 text-xs text-slate-500">
          {{ 'Credits' | t }}: <b class="text-slate-300 tabular-nums">{{ auth.user()?.organization?.credit_balance ?? 0 }}</b>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col md:ms-60">
        <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <button class="btn-ghost md:hidden" (click)="menuOpen.set(!menuOpen())" [attr.aria-label]="'Menu' | t">☰</button>
          <div class="relative min-w-0 max-w-xl flex-1">
            <input class="input" [placeholder]="'Search company, phone, email, website, lead ID…' | t" #q
                   (input)="search$.next(q.value)" (keydown.escape)="results.set(null)" />
            @if (results(); as r) {
              <div class="absolute mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                @for (c of r.companies; track c.id) {
                  <a [routerLink]="['/companies', c.id]" (click)="results.set(null); q.value=''" class="flex justify-between gap-2 px-4 py-2 hover:bg-slate-50">
                    <span><b>{{ c.name_en }}</b> <span class="text-xs text-slate-500">{{ c.location?.name_en }} · {{ c.industry?.name_en }}</span></span>
                    @if (c.top_score !== null) { <span class="text-xs font-semibold text-indigo-600">{{ 'Score' | t }} {{ c.top_score }}</span> }
                  </a>
                }
                @for (l of r.leads; track l.id) {
                  <a [routerLink]="['/leads', l.id]" (click)="results.set(null); q.value=''" class="block px-4 py-2 hover:bg-slate-50">{{ 'Lead' | t }} #{{ l.id }} — {{ l.company.name_en }}</a>
                }
                @if (!r.companies.length && !r.leads.length) { <div class="px-4 py-2 text-sm text-slate-500">{{ 'No matches' | t }}</div> }
              </div>
            }
          </div>

          <select class="input !w-auto" (change)="setLang($any($event.target).value)" [attr.aria-label]="'Language' | t">
            @for (l of langs; track l.code) { <option [value]="l.code" [selected]="l.code === i18n.lang()">{{ l.label }}</option> }
          </select>

          <div class="relative">
            <button class="btn-ghost relative" (click)="toggleBell()" [attr.aria-label]="'Notifications' | t">
              🔔
              @if (unread() > 0) {
                <span class="absolute -end-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{{ unread() > 99 ? '99+' : unread() }}</span>
              }
            </button>
            @if (bellOpen()) {
              <div class="absolute end-0 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm font-semibold">
                  {{ 'Notifications' | t }}
                  @if (unread()) { <button class="text-xs font-normal text-indigo-700" (click)="readAll()">{{ 'Mark all read' | t }}</button> }
                </div>
                <div class="max-h-96 overflow-y-auto">
                  @for (n of notifications(); track n.id) {
                    <button class="block w-full border-b border-slate-50 px-4 py-2 text-start hover:bg-slate-50" [class.bg-indigo-50]="!n.read_at" (click)="open(n)">
                      <div class="text-sm">{{ n.data.title }}</div>
                      @if (n.data.body) { <div class="text-xs text-slate-500">{{ n.data.body }}</div> }
                      <div class="text-[11px] text-slate-400">{{ n.created_at | date: 'short' }}</div>
                    </button>
                  } @empty { <p class="px-4 py-3 text-sm text-slate-500">{{ 'No notifications yet.' | t }}</p> }
                </div>
              </div>
            }
          </div>

          <a routerLink="/account" class="hidden text-end text-sm hover:text-indigo-700 sm:block">
            <div class="font-medium">{{ auth.user()?.name }}</div>
            <div class="text-xs text-slate-500">{{ auth.user()?.role?.name ?? '' | t }}</div>
          </a>
          <button class="btn-ghost" (click)="logout()">{{ 'Log out' | t }}</button>
        </header>
        <main class="p-4 md:p-6"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class Shell {
  protected auth = inject(AuthService);
  protected i18n = inject(I18n);
  private api = inject(Api);
  private router = inject(Router);
  private realtime = inject(Realtime);
  protected langs = LANGS;
  protected menuOpen = signal(false);
  protected bellOpen = signal(false);
  protected notifications = signal<AppNotification[]>([]);
  protected unread = signal(0);
  protected results = signal<{ companies: (Company & { top_score: number | null })[]; leads: any[] } | null>(null);
  protected search$ = new Subject<string>();

  private readonly allNav: { title: string; items: NavItem[] }[] = [
    { title: 'Sales', items: [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/leads', label: 'Leads' },
      { path: '/pipeline', label: 'CRM Pipeline' },
      { path: '/follow-ups', label: 'Follow-Ups' },
      { path: '/companies', label: 'Companies' },
    ] },
    { title: 'Prospecting', items: [
      { path: '/campaigns', label: 'Campaigns' },
      { path: '/automation', label: 'Automation', perm: 'automation.manage' },
      { path: '/reports', label: 'Reports', perm: 'reports.view' },
    ] },
    { title: 'Administration', items: [
      { path: '/team', label: 'Users & Teams', perm: 'users.manage' },
      { path: '/settings', label: 'Settings', perm: 'settings.manage' },
      { path: '/billing', label: 'Billing', perm: 'billing.manage' },
      { path: '/admin/costs', label: 'Cost Dashboard', perm: 'super_admin' },
      { path: '/account', label: 'My Account' },
    ] },
  ];

  protected nav = computed(() => {
    const u = this.auth.user();
    const ok = (i: NavItem) => !i.perm || (i.perm === 'super_admin' ? u?.role?.key === 'super_admin' : this.auth.can(i.perm));
    return this.allNav.map(g => ({ ...g, items: g.items.filter(ok) })).filter(g => g.items.length);
  });

  constructor() {
    const u = this.auth.user();
    if (u?.locale && u.locale !== this.i18n.lang() && !localStorage.getItem('le_lang')) this.i18n.set(u.locale);

    this.search$.pipe(
      debounceTime(250), distinctUntilChanged(),
      switchMap(q => (q.trim().length < 2 ? of(null) : this.api.search(q.trim()))),
      takeUntilDestroyed(),
    ).subscribe(r => this.results.set(r));

    this.loadNotifications();
    this.realtime.connect();
    const stop = this.realtime.onNotification(() => this.loadNotifications());
    // Fallback when the socket is unavailable.
    const timer = setInterval(() => !this.realtime.connected() && this.loadNotifications(), 60_000);
    inject(DestroyRef).onDestroy(() => { stop(); clearInterval(timer); });
  }

  loadNotifications() {
    this.api.notifications().subscribe(r => { this.notifications.set(r.items); this.unread.set(r.unread); });
  }

  toggleBell() {
    this.bellOpen.set(!this.bellOpen());
  }

  readAll() {
    this.api.markRead().subscribe(r => { this.unread.set(r.unread); this.loadNotifications(); });
  }

  open(n: AppNotification) {
    this.bellOpen.set(false);
    if (!n.read_at) this.api.markRead([n.id]).subscribe(r => { this.unread.set(r.unread); this.loadNotifications(); });
    if (n.data.url) this.router.navigateByUrl(n.data.url);
  }

  setLang(lang: Lang) {
    this.i18n.set(lang);
    this.api.updateProfile({ locale: lang }).subscribe({ error: () => {} });
  }

  async logout() {
    this.realtime.disconnect();
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
