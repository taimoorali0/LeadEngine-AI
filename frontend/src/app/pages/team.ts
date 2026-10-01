import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TPipe } from '../core/i18n/i18n';
import { apiError } from './account';

@Component({
  selector: 'app-team',
  imports: [FormsModule, TPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Users & Teams' | t }}</h1>
    @if (error()) { <p class="mb-3 text-sm text-red-600">{{ error() | t }}</p> }
    <div class="grid gap-5 xl:grid-cols-3">
      <section class="card overflow-x-auto p-0 xl:col-span-2">
        <table class="w-full">
          <thead class="border-b border-slate-200 bg-slate-50"><tr>
            <th class="th">{{ 'Name' | t }}</th><th class="th">{{ 'Role' | t }}</th><th class="th">{{ 'Daily limit' | t }}</th>
            <th class="th">2FA</th><th class="th">{{ 'Active' | t }}</th><th class="th"></th>
          </tr></thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr class="border-b border-slate-100">
                <td class="td"><div class="font-medium">{{ u.name }}</div><div class="text-xs text-slate-500" dir="ltr">{{ u.email }}</div></td>
                <td class="td">
                  <select class="input" [ngModel]="u.role_id" (ngModelChange)="save(u, { role_id: $event })" [disabled]="u.id === me">
                    @for (r of roles(); track r.id) { <option [ngValue]="r.id">{{ r.name | t }}</option> }
                  </select>
                </td>
                <td class="td"><input class="input w-24" type="number" min="1" [ngModel]="u.daily_lead_limit" (change)="save(u, { daily_lead_limit: +$any($event.target).value || null })" /></td>
                <td class="td">
                  {{ u.two_factor_enabled ? '✓' : '—' }}
                  @if (u.two_factor_enabled && u.id !== me) { <button class="ms-2 text-xs text-indigo-700" (click)="reset2fa(u)">{{ 'Reset' | t }}</button> }
                </td>
                <td class="td"><input type="checkbox" [checked]="u.is_active" [disabled]="u.id === me" (change)="save(u, { is_active: $any($event.target).checked })" /></td>
                <td class="td text-xs text-slate-500">{{ teamNames(u) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <div class="space-y-5">
        <section class="card space-y-3">
          <h2 class="font-semibold">{{ 'Add user' | t }}</h2>
          <input class="input" [placeholder]="'Name' | t" [(ngModel)]="nu.name" />
          <input class="input" type="email" [placeholder]="'Email' | t" [(ngModel)]="nu.email" dir="ltr" />
          <input class="input" type="password" [placeholder]="'Temporary password (min. 10 characters)' | t" [(ngModel)]="nu.password" autocomplete="new-password" />
          <select class="input" [(ngModel)]="nu.role_id">
            <option [ngValue]="null" disabled>{{ 'Role' | t }}…</option>
            @for (r of roles(); track r.id) { <option [ngValue]="r.id">{{ r.name | t }}</option> }
          </select>
          <button class="btn-primary w-full justify-center" (click)="create()" [disabled]="!nu.name || !nu.email || !nu.role_id">{{ 'Add user' | t }}</button>
        </section>

        <section class="card space-y-3">
          <h2 class="font-semibold">{{ 'Teams' | t }}</h2>
          @for (tm of teams(); track tm.id) {
            <div class="rounded-lg border border-slate-200 p-3 text-sm">
              <div class="flex justify-between"><b>{{ tm.name }}</b>
                <span class="space-x-2"><button class="text-indigo-700" (click)="edit(tm)">{{ 'Edit' | t }}</button>
                <button class="text-red-600" (click)="removeTeam(tm)">{{ 'Delete' | t }}</button></span></div>
              <div class="text-xs text-slate-500">{{ 'Leader' | t }}: {{ tm.leader?.name ?? '—' }} · {{ tm.members.length }} {{ 'members' | t }}</div>
            </div>
          }
          <div class="space-y-2 border-t border-slate-100 pt-3">
            <input class="input" [placeholder]="'Team name' | t" [(ngModel)]="team.name" />
            <select class="input" [(ngModel)]="team.leader_id">
              <option [ngValue]="null">{{ 'Leader' | t }}: —</option>
              @for (u of users(); track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }
            </select>
            <div class="max-h-40 space-y-1 overflow-y-auto text-sm">
              @for (u of users(); track u.id) {
                <label class="flex items-center gap-2"><input type="checkbox" [checked]="team.member_ids.includes(u.id)" (change)="toggleMember(u.id)" /> {{ u.name }}</label>
              }
            </div>
            <div class="flex gap-2">
              <button class="btn-primary flex-1 justify-center" (click)="saveTeam()" [disabled]="!team.name">{{ (team.id ? 'Update team' : 'Create team') | t }}</button>
              @if (team.id) { <button class="btn-ghost" (click)="resetTeam()">{{ 'Cancel' | t }}</button> }
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class TeamPage implements OnInit {
  private api = inject(Api);
  protected me = inject(AuthService).user()?.id;
  users = signal<any[]>([]);
  roles = signal<any[]>([]);
  teams = signal<any[]>([]);
  error = signal('');
  nu = { name: '', email: '', password: '', role_id: null as number | null };
  team = { id: undefined as number | undefined, name: '', leader_id: null as number | null, member_ids: [] as number[] };

  ngOnInit() {
    this.load();
    this.api.roles().subscribe(r => this.roles.set(r));
  }

  load() {
    this.api.teamMembers().subscribe(u => this.users.set(u));
    this.api.teams().subscribe(t => this.teams.set(t));
  }

  teamNames(u: any) { return (u.teams ?? []).map((x: any) => x.name).join(', '); }

  private fail = (e: any) => { this.error.set(apiError(e)); this.load(); };

  save(u: any, patch: Record<string, unknown>) {
    this.error.set('');
    this.api.updateUser(u.id, patch).subscribe({ next: () => this.load(), error: this.fail });
  }

  reset2fa(u: any) { this.api.resetUser2fa(u.id).subscribe({ next: () => this.load(), error: this.fail }); }

  create() {
    this.error.set('');
    this.api.createUser(this.nu).subscribe({
      next: () => { this.nu = { name: '', email: '', password: '', role_id: null }; this.load(); },
      error: this.fail,
    });
  }

  edit(t: any) { this.team = { id: t.id, name: t.name, leader_id: t.leader_id, member_ids: t.members.map((m: any) => m.id) }; }
  resetTeam() { this.team = { id: undefined, name: '', leader_id: null, member_ids: [] }; }
  toggleMember(id: number) {
    const s = new Set(this.team.member_ids);
    s.has(id) ? s.delete(id) : s.add(id);
    this.team.member_ids = [...s];
  }
  saveTeam() { this.api.saveTeam(this.team).subscribe({ next: () => { this.resetTeam(); this.load(); }, error: this.fail }); }
  removeTeam(t: any) { if (confirm(`Delete team ${t.name}?`)) this.api.deleteTeam(t.id).subscribe({ next: () => this.load(), error: this.fail }); }
}
