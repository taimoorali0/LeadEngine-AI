import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n/i18n';
import { AutomationRule, OUTCOMES, PIPELINE, label } from '../core/models';
import { apiError } from './account';

const BLANK: AutomationRule = { name: '', trigger: 'lead_scored', conditions: [], actions: [{ type: 'assign_auto', params: {} }], enabled: true, priority: 100 };

/** WHEN … AND … THEN … rule builder (spec §62). */
@Component({
  selector: 'app-automation',
  imports: [FormsModule, TPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'Automation' | t }}</h1>
    @if (error()) { <p class="mb-3 text-sm text-red-600">{{ error() | t }}</p> }
    <div class="grid gap-5 lg:grid-cols-5">
      <section class="space-y-3 lg:col-span-2">
        @for (r of rules(); track r.id) {
          <div class="card !p-4">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="font-medium">{{ r.name }}</div>
                <div class="text-xs text-slate-500">{{ 'WHEN' | t }} {{ label(r.trigger) | t }} · {{ r.conditions.length }} {{ 'conditions' | t }} · {{ r.actions.length }} {{ 'actions' | t }} · {{ 'ran' | t }} {{ r.runs }}×</div>
              </div>
              <label class="flex items-center gap-1 text-xs"><input type="checkbox" [checked]="r.enabled" (change)="toggle(r)" /> {{ 'On' | t }}</label>
            </div>
            <div class="mt-2 flex gap-3 text-sm">
              <button class="text-indigo-700" (click)="edit(r)">{{ 'Edit' | t }}</button>
              <button class="text-red-600" (click)="remove(r)">{{ 'Delete' | t }}</button>
            </div>
          </div>
        } @empty { <p class="card text-sm text-slate-500">{{ 'No rules yet. Create one on the right.' | t }}</p> }
      </section>

      <section class="card space-y-4 lg:col-span-3">
        <h2 class="font-semibold">{{ (draft.id ? 'Edit rule' : 'New rule') | t }}</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <input class="input sm:col-span-2" [placeholder]="'Rule name' | t" [(ngModel)]="draft.name" />
          <input class="input" type="number" min="0" [(ngModel)]="draft.priority" [title]="'Priority (lower runs first)' | t" />
        </div>

        <div>
          <span class="label">{{ 'WHEN' | t }}</span>
          <select class="input" [(ngModel)]="draft.trigger">
            @for (t of schema().triggers; track t) { <option [value]="t">{{ label(t) | t }}</option> }
          </select>
        </div>

        <div class="space-y-2">
          <span class="label">{{ 'AND (all must match)' | t }}</span>
          @for (c of draft.conditions; track $index) {
            <div class="flex flex-wrap gap-2">
              <select class="input !w-auto" [(ngModel)]="c.field">@for (f of schema().fields; track f) { <option [value]="f">{{ label(f) | t }}</option> }</select>
              <select class="input !w-auto" [(ngModel)]="c.op">@for (o of schema().operators; track o) { <option [value]="o">{{ ops[o] | t }}</option> }</select>
              @if (c.op !== 'empty' && c.op !== 'not_empty') {
                @if (c.field === 'status' || c.field === 'previous_status') {
                  <select class="input !w-auto" [(ngModel)]="c.value">@for (s of statuses; track s) { <option [value]="s">{{ label(s) | t }}</option> }</select>
                } @else if (c.field === 'quality') {
                  <select class="input !w-auto" [(ngModel)]="c.value">@for (q of qualities; track q) { <option [value]="q">{{ q | t }}</option> }</select>
                } @else if (c.field.startsWith('has_') || c.field === 'assigned') {
                  <select class="input !w-auto" [(ngModel)]="c.value"><option [ngValue]="true">{{ 'Yes' | t }}</option><option [ngValue]="false">{{ 'No' | t }}</option></select>
                } @else {
                  <input class="input !w-28" type="number" [(ngModel)]="c.value" />
                }
              }
              <button class="text-red-600" (click)="draft.conditions.splice($index, 1)" [attr.aria-label]="'Remove' | t">×</button>
            </div>
          }
          <button class="btn-ghost" (click)="draft.conditions.push({ field: 'score', op: 'gte', value: 80 })">+ {{ 'Condition' | t }}</button>
        </div>

        <div class="space-y-2">
          <span class="label">{{ 'THEN' | t }}</span>
          @for (a of draft.actions; track $index) {
            <div class="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
              <select class="input !w-auto" [(ngModel)]="a.type" (ngModelChange)="a.params = {}">@for (x of schema().actions; track x) { <option [value]="x">{{ label(x) | t }}</option> }</select>
              @switch (a.type) {
                @case ('assign_user') {
                  <select class="input !w-auto" [(ngModel)]="a.params['user_id']">@for (u of users(); track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }</select>
                }
                @case ('assign_team') {
                  <select class="input !w-auto" [(ngModel)]="a.params['team_id']">@for (tm of teams(); track tm.id) { <option [ngValue]="tm.id">{{ tm.name }}</option> }</select>
                }
                @case ('set_status') {
                  <select class="input !w-auto" [(ngModel)]="a.params['status']">@for (s of statuses; track s) { <option [value]="s">{{ label(s) | t }}</option> }</select>
                }
                @case ('create_follow_up') {
                  <span class="text-sm">{{ 'in' | t }}</span><input class="input !w-20" type="number" min="0" [(ngModel)]="a.params['days']" /><span class="text-sm">{{ 'days' | t }}</span>
                  <select class="input !w-auto" [(ngModel)]="a.params['type']">@for (x of fuTypes; track x) { <option [value]="x">{{ label(x) | t }}</option> }</select>
                }
                @case ('notify') {
                  <select class="input !w-auto" [(ngModel)]="a.params['user_id']"><option [ngValue]="undefined">{{ 'Assigned agent' | t }}</option>@for (u of users(); track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }</select>
                  <input class="input !w-56" [placeholder]="'Message' | t" [(ngModel)]="a.params['message']" />
                }
              }
              <button class="text-red-600" (click)="draft.actions.splice($index, 1)" [attr.aria-label]="'Remove' | t">×</button>
            </div>
          }
          <button class="btn-ghost" (click)="draft.actions.push({ type: 'notify', params: {} })">+ {{ 'Action' | t }}</button>
        </div>

        <div class="flex gap-2">
          <button class="btn-primary" (click)="save()" [disabled]="!draft.name || !draft.actions.length">{{ 'Save rule' | t }}</button>
          @if (draft.id) { <button class="btn-ghost" (click)="reset()">{{ 'Cancel' | t }}</button> }
        </div>
        <p class="text-xs text-slate-500">{{ '“Lead created” and “Lead scored” rules run once per lead. “Status changed” rules run on every change.' | t }}</p>
      </section>
    </div>
  `,
})
export class AutomationPage implements OnInit {
  private api = inject(Api);
  rules = signal<AutomationRule[]>([]);
  schema = signal<{ triggers: string[]; fields: string[]; operators: string[]; actions: string[] }>({ triggers: [], fields: [], operators: [], actions: [] });
  users = signal<any[]>([]);
  teams = signal<any[]>([]);
  error = signal('');
  draft: AutomationRule = structuredClone(BLANK);
  statuses = [...PIPELINE, ...OUTCOMES];
  qualities = ['Highly Qualified', 'Qualified', 'Needs Review', 'Needs Enrichment'];
  fuTypes = ['call', 'email', 'meeting', 'whatsapp', 'task'];
  ops: Record<string, string> = { eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is one of', empty: 'is empty', not_empty: 'is not empty' };
  label = label;

  ngOnInit() {
    this.load();
    this.api.teamMembers().subscribe(u => this.users.set(u));
    this.api.teams().subscribe(t => this.teams.set(t));
  }

  load() { this.api.automations().subscribe(r => { this.rules.set(r.rules); this.schema.set(r.schema); }); }
  edit(r: AutomationRule) { this.draft = structuredClone(r); }
  reset() { this.draft = structuredClone(BLANK); }

  private fail = (e: any) => this.error.set(apiError(e));

  save() {
    this.error.set('');
    this.api.saveAutomation(this.draft).subscribe({ next: () => { this.reset(); this.load(); }, error: this.fail });
  }

  toggle(r: AutomationRule) { this.api.saveAutomation({ id: r.id, enabled: !r.enabled }).subscribe({ next: () => this.load(), error: this.fail }); }
  remove(r: AutomationRule) { if (confirm(`Delete rule "${r.name}"?`)) this.api.deleteAutomation(r.id!).subscribe({ next: () => this.load(), error: this.fail }); }
}
