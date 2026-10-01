import { Component, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { Lead, OUTCOMES, PIPELINE, label, qualityClass } from '../core/models';

@Component({
  selector: 'app-lead-detail',
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    @if (lead(); as l) {
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-bold">{{ l.company.name_en }}</h1>
        @if (l.score !== null) { <span class="badge" [class]="qualityClass(l.quality)">{{ l.score }} · {{ l.quality }}</span> }
        <a class="ml-auto text-sm text-indigo-700 hover:underline" [routerLink]="['/companies', l.company.id]">Company profile →</a>
      </div>
      @if (error()) { <p class="mb-3 text-sm text-red-600">{{ error() }}</p> }
      <div class="grid gap-5 lg:grid-cols-3">
        <div class="space-y-5">
          <section class="card space-y-3 text-sm">
            <div><label class="label" for="st">Status</label>
              <select id="st" class="input" [ngModel]="l.status" (ngModelChange)="update({ status: $event })" [disabled]="!auth.can('leads.update_status')">
                @for (s of statuses; track s) { <option [value]="s">{{ label(s) }}</option> }
              </select></div>
            <div><label class="label" for="ag">Assigned agent</label>
              <select id="ag" class="input" [ngModel]="l.assigned_to" (ngModelChange)="update({ assigned_to: $event })" [disabled]="!auth.can('leads.assign')">
                <option [ngValue]="null">Unassigned</option>
                @for (u of users(); track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }
              </select></div>
            <div><span class="label">Campaign</span>{{ l.campaign?.name ?? '—' }}</div>
            <div><span class="label">Next follow-up</span>{{ l.next_follow_up_at ? (l.next_follow_up_at | date: 'medium') : '—' }}</div>
          </section>
          <section class="card space-y-2 text-sm">
            <h2 class="font-semibold">Contact</h2>
            @for (p of l.company.phones; track p.id) { <div>📞 <a class="text-indigo-700" [href]="'tel:' + (p.normalized ?? p.original)">{{ p.normalized ?? p.original }}</a></div> }
            @for (e of l.company.emails; track e.id) { <div>✉️ <a class="text-indigo-700" [href]="'mailto:' + e.email">{{ e.email }}</a> <span class="text-xs text-slate-500">{{ e.type }} · {{ e.status }}</span></div> }
            @if (l.company.website) { <div>🌐 <a class="text-indigo-700" [href]="l.company.website" target="_blank" rel="noopener">{{ l.company.website }}</a></div> }
          </section>
          @if (auth.can('follow_ups.create')) {
            <section class="card space-y-3">
              <h2 class="font-semibold">Schedule follow-up</h2>
              <input class="input" type="datetime-local" [(ngModel)]="fu.due_at" />
              <div class="grid grid-cols-2 gap-2">
                <select class="input" [(ngModel)]="fu.type">@for (t of fuTypes; track t) { <option [value]="t">{{ label(t) }}</option> }</select>
                <select class="input" [(ngModel)]="fu.priority">@for (p of priorities; track p) { <option [value]="p">{{ label(p) }}</option> }</select>
              </div>
              <input class="input" placeholder="Notes" [(ngModel)]="fu.notes" />
              <button class="btn-primary w-full justify-center" (click)="addFollowUp()" [disabled]="!fu.due_at">Schedule</button>
            </section>
          }
        </div>

        <div class="space-y-5 lg:col-span-2">
          @if (auth.can('notes.create')) {
            <section class="card space-y-3">
              <div class="flex gap-2">
                @for (t of noteTypes; track t) {
                  <button class="btn-ghost" [class.!bg-indigo-50]="note.type === t" [class.!border-indigo-400]="note.type === t" (click)="note.type = t">{{ label(t) }}</button>
                }
              </div>
              <textarea class="input" rows="3" placeholder="What happened?" [(ngModel)]="note.body"></textarea>
              <div class="flex gap-2">
                <input class="input" placeholder="Outcome (optional)" [(ngModel)]="note.outcome" />
                <button class="btn-primary" (click)="addNote()" [disabled]="!note.body.trim()">Save</button>
              </div>
            </section>
          }
          <section class="card">
            <h2 class="mb-4 font-semibold">Activity timeline</h2>
            <ol class="relative space-y-4 border-l border-slate-200 pl-5">
              @for (a of l.activities; track a.id) {
                <li>
                  <div class="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-indigo-400"></div>
                  <div class="text-xs text-slate-500">{{ a.created_at | date: 'medium' }} · {{ a.user?.name ?? 'System' }}</div>
                  <div class="text-sm"><b>{{ label(a.type) }}</b>
                    @if (a.meta['from'] !== undefined && a.type === 'status_changed') { — {{ label($any(a.meta['from'])) }} → {{ label($any(a.meta['to'])) }} }
                    @if (a.meta['outcome']) { — {{ a.meta['outcome'] }} }
                  </div>
                  @if (a.body) { <p class="mt-1 whitespace-pre-line text-sm text-slate-700">{{ a.body }}</p> }
                </li>
              } @empty { <li class="text-sm text-slate-500">No activity yet.</li> }
            </ol>
          </section>
        </div>
      </div>
    }
  `,
})
export class LeadDetailPage implements OnInit {
  readonly id = input.required<string>();
  protected auth = inject(AuthService);
  private api = inject(Api);
  protected lead = signal<Lead | null>(null);
  protected error = signal('');
  protected users = toSignal(this.api.users(), { initialValue: [] });
  protected statuses = [...PIPELINE, ...OUTCOMES];
  protected noteTypes = ['note', 'call', 'email', 'meeting', 'whatsapp'];
  protected fuTypes = ['call', 'email', 'meeting', 'whatsapp', 'task'];
  protected priorities = ['low', 'normal', 'high', 'urgent'];
  protected note = { type: 'call', body: '', outcome: '' };
  protected fu = { due_at: '', type: 'call', priority: 'normal', notes: '' };
  protected label = label;
  protected qualityClass = qualityClass;

  ngOnInit() { this.load(); }

  load() { this.api.lead(+this.id()).subscribe(l => this.lead.set(l)); }

  private fail = (e: HttpErrorResponse) => this.error.set(e.error?.message ?? 'Request failed.');

  update(body: { status?: string; assigned_to?: number | null }) {
    this.error.set('');
    this.api.updateLead(+this.id(), body).subscribe({ next: () => this.load(), error: this.fail });
  }

  addNote() {
    this.api.addNote(+this.id(), { type: this.note.type, body: this.note.body, outcome: this.note.outcome || undefined }).subscribe({
      next: () => { this.note.body = ''; this.note.outcome = ''; this.load(); }, error: this.fail,
    });
  }

  addFollowUp() {
    this.api.addFollowUp(+this.id(), { ...this.fu, due_at: new Date(this.fu.due_at).toISOString() }).subscribe({
      next: () => { this.fu = { due_at: '', type: 'call', priority: 'normal', notes: '' }; this.load(); }, error: this.fail,
    });
  }
}
