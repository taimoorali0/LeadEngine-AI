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

interface NavItem { path: string; label: string; icon: string; perm?: string }
interface NavGroup { title: string; items: NavItem[] }

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe, DatePipe],
  template: `
    <div class="min-h-screen bg-[#f7f8fc]">
      @if (menuOpen()) {
        <button class="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-[1px] md:hidden" (click)="menuOpen.set(false)" aria-label="Close menu"></button>
      }

      <aside class="fixed inset-y-0 start-0 z-40 flex w-[270px] flex-col overflow-hidden border-e border-white/5 bg-[#10172b] text-slate-300 shadow-2xl transition-transform md:translate-x-0"
             [class]="menuOpen() ? 'translate-x-0' : (i18n.dir() === 'rtl' ? 'translate-x-full' : '-translate-x-full')">
        <div class="flex h-20 items-center border-b border-white/5 px-5">
          <img src="/leadengine-logo.svg" alt="LeadEngine AI" class="h-11 w-auto max-w-[210px] brightness-0 invert" />
        </div>

        <div class="flex-1 overflow-y-auto px-3 pb-4 pt-3">
          @for (group of nav(); track group.title) {
            <div class="px-3 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{{ group.title | t }}</div>
            <nav class="space-y-1">
              @for (item of group.items; track item.path) {
                <a [routerLink]="item.path" routerLinkActive="bg-white/10 text-white shadow-sm"
                   (click)="menuOpen.set(false)"
                   class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition hover:bg-white/[0.07] hover:text-white">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-[15px] text-violet-300 group-hover:bg-violet-500/15">{{ item.icon }}</span>
                  <span>{{ item.label | t }}</span>
                </a>
              }
            </nav>
          }
        </div>

        <div class="border-t border-white/5 p-4">
          @if (!isPlatformAdmin()) {
            <a routerLink="/plan" class="mb-3 block rounded-2xl border border-violet-400/15 bg-violet-500/10 p-3 transition hover:bg-violet-500/15">
              <div class="flex items-center justify-between text-xs text-violet-200">
                <span>{{ 'Credits' | t }}</span>
                <span class="font-bold tabular-nums">{{ auth.user()?.organization?.credit_balance ?? 0 }}</span>
              </div>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div class="h-full w-[58%] rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"></div>
              </div>
              <div class="mt-2 text-[11px] text-slate-400">{{ 'Plan & usage' | t }}</div>
            </a>
          }

          <a routerLink="/account" class="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-700 text-sm font-bold text-white">
              {{ initials() }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">{{ auth.user()?.name }}</div>
              <div class="truncate text-[11px] text-slate-500">{{ auth.user()?.role?.name ?? '' | t }}</div>
            </div>
          </a>
        </div>
      </aside>

      <div class="min-w-0 md:ms-[270px]">
        <header class="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-xl md:px-6">
          <button class="btn-ghost !h-10 !w-10 !p-0 md:hidden" (click)="menuOpen.set(!menuOpen())" [attr.aria-label]="'Menu' | t">☰</button>

          <div class="relative hidden max-w-xl flex-1 md:block">
            <div class="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-400">⌕</div>
            <input class="input !ps-9 !shadow-none" [placeholder]="'Search leads, companies, campaigns…' | t" #q
                   (input)="search$.next(q.value)" (keydown.escape)="results.set(null)" />
            @if (results(); as r) {
              <div class="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                @for (c of r.companies; track c.id) {
                  <a [routerLink]="['/companies', c.id]" (click)="results.set(null); q.value=''" class="flex justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                    <span><b>{{ c.name_en }}</b> <span class="text-xs text-slate-500">{{ c.location?.name_en }} · {{ c.industry?.name_en }}</span></span>
                    @if (c.top_score !== null) { <span class="text-xs font-semibold text-violet-600">{{ 'Score' | t }} {{ c.top_score }}</span> }
                  </a>
                }
                @for (l of r.leads; track l.id) {
                  <a [routerLink]="['/leads', l.id]" (click)="results.set(null); q.value=''" class="block px-4 py-3 hover:bg-slate-50">{{ 'Lead' | t }} #{{ l.id }} — {{ l.company.name_en }}</a>
                }
                @if (!r.companies.length && !r.leads.length) { <div class="px-4 py-3 text-sm text-slate-500">{{ 'No matches' | t }}</div> }
              </div>
            }
          </div>

          <div class="ms-auto flex items-center gap-2">
            @if (!isPlatformAdmin()) {
              <a routerLink="/campaigns/new" class="btn-primary hidden sm:inline-flex">＋ {{ 'Find companies' | t }}</a>
            }

            <select class="input !w-auto !py-2" (change)="setLang($any($event.target).value)" [attr.aria-label]="'Language' | t">
              @for (l of langs; track l.code) { <option [value]="l.code" [selected]="l.code === i18n.lang()">{{ l.label }}</option> }
            </select>

            <div class="relative">
              <button class="btn-ghost relative !h-10 !w-10 !p-0" (click)="toggleBell()" [attr.aria-label]="'Notifications' | t">♢
                @if (unread() > 0) {
                  <span class="absolute -end-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{{ unread() > 99 ? '99+' : unread() }}</span>
                }
              </button>
              @if (bellOpen()) {
                <div class="absolute end-0 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm font-semibold">
                    {{ 'Notifications' | t }}
                    @if (unread()) { <button class="text-xs font-normal text-violet-700" (click)="readAll()">{{ 'Mark all read' | t }}</button> }
                  </div>
                  <div class="max-h-96 overflow-y-auto">
                    @for (n of notifications(); track n.id) {
                      <button class="block w-full border-b border-slate-50 px-4 py-3 text-start hover:bg-slate-50" [class.bg-violet-50]="!n.read_at" (click)="open(n)">
                        <div class="text-sm font-medium">{{ n.data.title }}</div>
                        @if (n.data.body) { <div class="mt-0.5 text-xs text-slate-500">{{ n.data.body }}</div> }
                        <div class="mt-1 text-[11px] text-slate-400">{{ n.created_at | date: 'short' }}</div>
                      </button>
                    } @empty { <p class="px-4 py-3 text-sm text-slate-500">{{ 'No notifications yet.' | t }}</p> }
                  </div>
                </div>
              }
            </div>

            <button class="btn-ghost hidden lg:inline-flex" (click)="logout()">{{ 'Log out' | t }}</button>
          </div>
        </header>

        <main class="mx-auto max-w-[1600px] p-4 md:p-6 lg:p-8"><router-outlet /></main>
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

  private readonly customerNav: NavGroup[] = [
    { title: 'Workspace', items: [
      { path: '/dashboard', label: 'Dashboard', icon: '⌂' },
      { path: '/calendar', label: 'Calendar', icon: '▣' },
    ] },
    { title: 'Sales', items: [
      { path: '/leads', label: 'Leads', icon: '◎' },
      { path: '/companies', label: 'Companies', icon: '▦' },
      { path: '/pipeline', label: 'CRM Pipeline', icon: '▥' },
      { path: '/follow-ups', label: 'Follow-Ups', icon: '↻' },
    ] },
    { title: 'Prospecting', items: [
      { path: '/campaigns', label: 'Campaigns', icon: '⌕' },
      { path: '/automation', label: 'Automation', icon: '⌁', perm: 'automation.manage' },
      { path: '/reports', label: 'Reports', icon: '◫', perm: 'reports.view' },
    ] },
    { title: 'Team', items: [
      { path: '/team', label: 'Users & Teams', icon: '♙', perm: 'users.manage' },
    ] },
    { title: 'Account', items: [
      { path: '/plan', label: 'Plan & Usage', icon: '◇' },
      { path: '/settings', label: 'Settings', icon: '⚙', perm: 'settings.manage' },
      { path: '/account', label: 'My Account', icon: '◉' },
    ] },
  ];

  private readonly platformNav: NavGroup[] = [
    { title: 'Platform', items: [
      { path: '/dashboard', label: 'Platform Dashboard', icon: '⌂' },
      { path: '/platform/billing', label: 'Billing Requests', icon: '◇' },
      { path: '/admin/costs', label: 'API & Cost Dashboard', icon: '◫' },
      { path: '/team', label: 'Users & Teams', icon: '♙' },
      { path: '/settings', label: 'Platform Settings', icon: '⚙' },
      { path: '/account', label: 'My Account', icon: '◉' },
    ] },
  ];

  protected isPlatformAdmin = computed(() => this.auth.user()?.role?.key === 'super_admin');
  protected initials = computed(() => (this.auth.user()?.name ?? 'LE').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase());

  protected nav = computed(() => {
    const groups = this.isPlatformAdmin() ? this.platformNav : this.customerNav;
    const ok = (i: NavItem) => !i.perm || this.auth.can(i.perm);
    return groups.map(g => ({ ...g, items: g.items.filter(ok) })).filter(g => g.items.length);
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
    const timer = setInterval(() => !this.realtime.connected() && this.loadNotifications(), 60_000);
    inject(DestroyRef).onDestroy(() => { stop(); clearInterval(timer); });
  }

  loadNotifications() {
    this.api.notifications().subscribe(r => { this.notifications.set(r.items); this.unread.set(r.unread); });
  }

  toggleBell() { this.bellOpen.set(!this.bellOpen()); }

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
