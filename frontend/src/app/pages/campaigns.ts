import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { label } from '../core/models';
import { statusClass } from './campaign-detail';

@Component({
  selector: 'app-campaigns',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="mb-5 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Campaigns</h1>
      @if (auth.can('campaigns.manage')) { <a routerLink="/campaigns/new" class="btn-primary">+ New campaign</a> }
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="w-full">
        <thead class="border-b border-slate-200 bg-slate-50"><tr>
          <th class="th">Campaign</th><th class="th">Type</th><th class="th">Country</th><th class="th">Leads</th><th class="th">Status</th><th class="th">Last run</th>
        </tr></thead>
        <tbody>
          @for (c of page()?.data ?? []; track c.id) {
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="td"><a [routerLink]="['/campaigns', c.id]" class="font-medium text-indigo-700 hover:underline">{{ c.name }}</a></td>
              <td class="td">{{ c.company_type }}</td>
              <td class="td">{{ c.country?.name_en }}</td>
              <td class="td tabular-nums">{{ c.leads_count }}</td>
              <td class="td"><span class="badge" [class]="statusClass(c.status)">{{ label(c.status) }}</span></td>
              <td class="td text-slate-500">{{ c.last_run_at ? (c.last_run_at | date: 'medium') : '—' }}</td>
            </tr>
          } @empty {
            <tr><td class="td text-slate-500" colspan="6">No campaigns yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CampaignsPage {
  protected auth = inject(AuthService);
  protected page = toSignal(inject(Api).campaigns());
  protected label = label;
  protected statusClass = statusClass;
}
