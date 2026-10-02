import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { I18n, LANGS, Lang, TPipe } from '../core/i18n/i18n';
import { AppNotification, Company } from '../core/models';
import { Realtime } from '../core/realtime';
import {
  ArrowLeft, ArrowRight, Bell, Building2, CalendarDays, ChartNoAxesCombined, CircleUser, Columns3, CreditCard, Gauge,
  Languages, LayoutDashboard, LogOut, LucideAngularModule, LucideIconData, Menu, PhoneCall, Plus, Radar, Receipt,
  Search, Settings, ShieldCheck, Upload, UserRoundSearch, Users, Workflow,
} from 'lucide-angular';

interface NavItem { path: string; label: string; icon: LucideIconData; perm?: string }
interface NavGroup { title: string; items: NavItem[] }

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe, DatePipe, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-[#11182d] text-slate-300">
      @if (menuOpen()) {
        <button class="fixed inset-0 z-30 bg-slate-950/50 md:hidden" (click)="menuOpen.set(false)" [attr.aria-label]="'Close menu' | t"></button>
      }

      <!-- Sidebar sits directly on the dark frame (reference layout). -->
      <aside class="fixed inset-y-0 start-0 z-40 flex w-[264px] flex-col bg-[#11182d] transition-transform md:translate-x-0"
             [class]="menuOpen() ? 'translate-x-0' : (i18n.dir() === 'rtl' ? 'translate-x-full' : '-translate-x-full')">
        <a routerLink="/dashboard" class="flex items-center gap-2.5 px-6 pb-5 pt-7" (click)="menuOpen.set(false)">
          <img src="/leadengine-mark.png" alt="" class="h-9 w-9 object-contain" />
          <span class="text-[19px] font-extrabold tracking-tight text-white">LeadEngine <span class="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">AI</span></span>
        </a>
        <div class="mx-6 border-t border-white/[0.07]"></div>

        <div class="flex-1 overflow-y-auto px-4 pb-4">
          @for (group of nav(); track group.title) {
            <div class="px-3 pb-2 pt-6 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{ group.title | t }}</div>
            <nav class="space-y-1">
              @for (item of group.items; track item.path) {
                <a [routerLink]="item.path" routerLinkActive="!bg-white/[0.08] !text-white [&_.ico]:!bg-violet-500 [&_.ico]:!text-white"
                   [routerLinkActiveOptions]="{ exact: item.path === '/dashboard' }" (click)="menuOpen.set(false)"
                   class="flex items-center gap-3 rounded-full py-1.5 pe-4 ps-1.5 text-[13.5px] font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
                  <span class="ico flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-300 transition">
                    <lucide-icon [img]="item.icon" [size]="16" [strokeWidth]="1.9" />
                  </span>
                  <span class="truncate">{{ item.label | t }}</span>
                </a>
              }
            </nav>
          }
        </div>

        <div class="px-4 pb-6">
          @if (!isPlatformAdmin()) {
            <a routerLink="/plan" (click)="menuOpen.set(false)" class="mb-4 block rounded-2xl bg-white/[0.05] p-3.5 transition hover:bg-white/[0.08]">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400">{{ 'Credits' | t }}</span>
                <span class="font-bold tabular-nums text-white">{{ (auth.user()?.organization?.credit_balance ?? 0).toLocaleString() }}</span>
              </div>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div class="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" [style.width.%]="creditPct()"></div>
              </div>
            </a>
          }
          <div class="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{ 'User account' | t }}</div>
          <a routerLink="/account" (click)="menuOpen.set(false)" class="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/[0.05]">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white">{{ initials() }}</div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">{{ auth.user()?.name }}</div>
              <div class="truncate text-[11.5px] text-slate-500">{{ auth.user()?.role?.name ?? '' | t }}</div>
            </div>
          </a>
        </div>
      </aside>

      <!-- Content: a large rounded light panel inset from the frame. -->
      <div class="min-w-0 md:ms-[264px] md:p-3 md:ps-0">
        <div class="min-h-screen bg-[#f4f5fa] text-slate-800 md:min-h-[calc(100vh-1.5rem)] md:rounded-[28px]">
          <header class="sticky top-0 z-20 flex h-[76px] items-center gap-2 rounded-t-[28px] bg-[#f4f5fa]/90 px-4 backdrop-blur-xl md:px-7">
            <button class="icon-btn md:hidden" (click)="menuOpen.set(!menuOpen())" [attr.aria-label]="'Menu' | t"><lucide-icon [img]="icons.Menu" [size]="18" /></button>
            <button class="icon-btn" (click)="location.back()" [title]="'Back' | t" [attr.aria-label]="'Back' | t"><lucide-icon [img]="i18n.dir() === 'rtl' ? icons.ArrowRight : icons.ArrowLeft" [size]="17" /></button>
            <button class="icon-btn" (click)="location.forward()" [title]="'Forward' | t" [attr.aria-label]="'Forward' | t"><lucide-icon [img]="i18n.dir() === 'rtl' ? icons.ArrowLeft : icons.ArrowRight" [size]="17" /></button>

            <div class="relative ms-1 hidden max-w-md flex-1 md:block">
              <span class="pointer-events-none absolute inset-y-0 start-4 flex items-center text-slate-400"><lucide-icon [img]="icons.Search" [size]="16" /></span>
              <input class="input !rounded-full !border-transparent !bg-white !ps-11" [placeholder]="'Search leads, companies, campaigns…' | t" #q
                     (input)="search$.next(q.value)" (keydown.escape)="results.set(null)" />
              @if (results(); as r) {
                <div class="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
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
              @if (!isPlatformAdmin() && isOperational()) {
                <a routerLink="/campaigns/new" class="btn-dark hidden sm:inline-flex"><lucide-icon [img]="icons.Plus" [size]="16" />{{ 'Find companies' | t }}</a>
              }
              <label class="relative hidden sm:block">
                <span class="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-slate-500"><lucide-icon [img]="icons.Languages" [size]="16" /></span>
                <select class="input !w-auto !rounded-full !border-transparent !bg-white !py-2 !ps-10" (change)="setLang($any($event.target).value)" [attr.aria-label]="'Language' | t">
                  @for (l of langs; track l.code) { <option [value]="l.code" [selected]="l.code === i18n.lang()">{{ l.label }}</option> }
                </select>
              </label>
              <div class="relative">
                <button class="icon-btn relative" (click)="toggleBell()" [attr.aria-label]="'Notifications' | t">
                  <lucide-icon [img]="icons.Bell" [size]="17" />
                  @if (unread() > 0) {
                    <span class="absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{{ unread() > 99 ? '99+' : unread() }}</span>
                  }
                </button>
                @if (bellOpen()) {
                  <div class="absolute end-0 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
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
              <button class="icon-btn" (click)="logout()" [title]="'Log out' | t" [attr.aria-label]="'Log out' | t"><lucide-icon [img]="icons.LogOut" [size]="17" /></button>
            </div>
          </header>

          <main class="mx-auto max-w-[1600px] px-4 pb-8 pt-2 md:px-7">
            @if (!isPlatformAdmin() && !isOperational()) {
              <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div><b>{{ subscriptionTitle() }}</b> — {{ auth.user()?.organization?.suspension_reason || ('Your account is in read-only mode. Submit a renewal or reactivation request to continue campaigns and exports.' | t) }}</div>
                <a routerLink="/plan" class="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">{{ 'Open Plan & Usage' | t }}</a>
              </div>
            }
            <router-outlet />
          </main>
        </div>
      </div>
    </div>
  `,
})
export class Shell {
  protected auth = inject(AuthService);
  protected i18n = inject(I18n);
  private api = inject(Api);
  private router = inject(Router);
  protected location = inject(Location);
  private realtime = inject(Realtime);
  protected langs = LANGS;
  /** Sidebar credit bar: balance against the plan's monthly allowance. */
  protected creditPct = computed(() => {
    const u = this.auth.user();
    const allowance = u?.credit_allowance || 1;
    return Math.max(2, Math.min(100, Math.round(100 * (u?.organization?.credit_balance ?? 0) / allowance)));
  });
  protected icons = { ArrowLeft, ArrowRight, Bell, Languages, LogOut, Menu, Plus, Search };
  protected menuOpen = signal(false);
  protected bellOpen = signal(false);
  protected notifications = signal<AppNotification[]>([]);
  protected unread = signal(0);
  protected results = signal<{ companies: (Company & { top_score: number | null })[]; leads: any[] } | null>(null);
  protected search$ = new Subject<string>();

  private readonly customerNav: NavGroup[] = [
    { title: 'Workspace', items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/calendar', label: 'Calendar', icon: CalendarDays },
    ] },
    { title: 'Sales', items: [
      { path: '/leads', label: 'Leads', icon: UserRoundSearch },
      { path: '/companies', label: 'Companies', icon: Building2 },
      { path: '/pipeline', label: 'CRM Pipeline', icon: Columns3 },
      { path: '/follow-ups', label: 'Follow-Ups', icon: PhoneCall },
    ] },
    { title: 'Prospecting', items: [
      { path: '/campaigns', label: 'Campaigns', icon: Radar },
      { path: '/import', label: 'Import Companies', icon: Upload, perm: 'campaigns.manage' },
      { path: '/automation', label: 'Automation', icon: Workflow, perm: 'automation.manage' },
      { path: '/reports', label: 'Reports', icon: ChartNoAxesCombined, perm: 'reports.view' },
    ] },
    { title: 'Team', items: [
      { path: '/team', label: 'Users & Teams', icon: Users, perm: 'users.manage' },
    ] },
    { title: 'Account', items: [
      { path: '/plan', label: 'Plan & Usage', icon: CreditCard },
      { path: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
      { path: '/account', label: 'My Account', icon: CircleUser },
    ] },
  ];

  private readonly platformNav: NavGroup[] = [
    { title: 'Platform', items: [
      { path: '/dashboard', label: 'Platform Dashboard', icon: LayoutDashboard },
      { path: '/platform/organizations', label: 'Organizations', icon: ShieldCheck },
      { path: '/platform/billing', label: 'Billing Requests', icon: Receipt },
      { path: '/admin/costs', label: 'API & Cost Dashboard', icon: Gauge },
      { path: '/team', label: 'Users & Teams', icon: Users },
      { path: '/settings', label: 'Platform Settings', icon: Settings },
      { path: '/account', label: 'My Account', icon: CircleUser },
    ] },
  ];

  protected isPlatformAdmin = computed(() => this.auth.user()?.role?.key === 'super_admin');
  protected isOperational = computed(() => ['active', 'trialing'].includes(this.auth.user()?.organization?.subscription_status ?? 'active'));
  protected subscriptionTitle = computed(() => {
    const s = this.auth.user()?.organization?.subscription_status ?? 'active';
    return s === 'suspended' ? 'Account suspended' : s === 'expired' ? 'Subscription expired' : s === 'past_due' ? 'Subscription past due' : 'Subscription inactive';
  });
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
