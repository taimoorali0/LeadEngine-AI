import { Component, inject, OnInit, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { Lead, PIPELINE, label, qualityClass } from '../core/models';

/** Kanban CRM with drag-and-drop (spec §27). */
@Component({
  selector: 'app-pipeline',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, RouterLink],
  template: `
    <h1 class="mb-5 text-2xl font-bold">CRM Pipeline</h1>
    @if (error()) { <p class="mb-3 text-sm text-red-600">{{ error() }}</p> }
    <div class="flex gap-4 overflow-x-auto pb-4" cdkDropListGroup>
      @for (s of stages; track s) {
        <div class="w-64 shrink-0 rounded-xl bg-slate-100 p-3">
          <div class="mb-3 flex justify-between text-xs font-semibold uppercase tracking-wide text-slate-600">
            <span>{{ label(s) }}</span><span>{{ columns()[s]?.length ?? 0 }}</span>
          </div>
          <div class="min-h-24 space-y-2" cdkDropList [id]="s" [cdkDropListData]="columns()[s] ?? []"
               [cdkDropListDisabled]="!canMove" (cdkDropListDropped)="drop($event, s)">
            @for (l of columns()[s] ?? []; track l.id) {
              <div cdkDrag [cdkDragData]="l" class="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <a [routerLink]="['/leads', l.id]" class="block text-sm font-medium hover:text-indigo-700">{{ l.company.name_en }}</a>
                <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{{ l.assignee?.name ?? 'Unassigned' }}</span>
                  @if (l.score !== null) { <span class="badge" [class]="qualityClass(l.quality)">{{ l.score }}</span> }
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `.cdk-drag-preview { box-shadow: 0 8px 24px rgb(0 0 0 / .15); } .cdk-drag-placeholder { opacity: .3; }`,
})
export class PipelinePage implements OnInit {
  private api = inject(Api);
  protected stages = PIPELINE;
  protected columns = signal<Partial<Record<string, Lead[]>>>({});
  protected error = signal('');
  protected label = label;
  protected qualityClass = qualityClass;
  protected canMove = inject(AuthService).can('leads.update_status');

  ngOnInit() { this.api.board().subscribe(b => this.columns.set(b)); }

  drop(e: CdkDragDrop<Lead[]>, status: string) {
    const lead: Lead = e.item.data;
    const snapshot = structuredClone(this.columns());
    if (e.previousContainer === e.container) moveItemInArray(e.container.data, e.previousIndex, e.currentIndex);
    else transferArrayItem(e.previousContainer.data, e.container.data, e.previousIndex, e.currentIndex);
    this.columns.set({ ...this.columns() });
    this.error.set('');
    this.api.updateLead(lead.id, { status, pipeline_position: e.currentIndex }).subscribe({
      next: () => (lead.status = status),
      error: () => { this.columns.set(snapshot); this.error.set('Could not move lead.'); },
    });
  }
}
