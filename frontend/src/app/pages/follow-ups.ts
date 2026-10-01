import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { FollowUp, label } from '../core/models';

@Component({
  selector: 'app-follow-ups',
  imports: [DatePipe, RouterLink],
  template: `
    <h1 class="mb-5 text-2xl font-bold">My follow-ups</h1>
    <div class="card divide-y divide-slate-100 p-0">
      @for (f of items(); track f.id) {
        <div class="flex flex-wrap items-center gap-3 px-5 py-3">
          <span class="w-44 text-sm" [class.text-red-600]="overdue(f)" [class.font-semibold]="overdue(f)">{{ f.due_at | date: 'EEE d MMM, h:mm a' }}</span>
          <span class="badge bg-slate-100">{{ label(f.type) }}</span>
          @if (f.priority === 'high' || f.priority === 'urgent') { <span class="badge bg-red-50 text-red-700">{{ label(f.priority) }}</span> }
          <a [routerLink]="['/leads', f.lead_id]" class="font-medium text-indigo-700 hover:underline">{{ f.lead?.company?.name_en }}</a>
          <span class="text-sm text-slate-500">{{ f.notes }}</span>
          <button class="btn-ghost ml-auto" (click)="done(f)">Done</button>
        </div>
      } @empty { <p class="px-5 py-4 text-sm text-slate-500">Nothing due. 🎉</p> }
    </div>
  `,
})
export class FollowUpsPage implements OnInit {
  private api = inject(Api);
  protected items = signal<FollowUp[]>([]);
  protected label = label;

  ngOnInit() { this.api.followUps().subscribe(r => this.items.set(r)); }

  overdue(f: FollowUp) { return new Date(f.due_at) < new Date(); }

  done(f: FollowUp) { this.api.completeFollowUp(f.id).subscribe(() => this.items.set(this.items().filter(x => x.id !== f.id))); }
}
