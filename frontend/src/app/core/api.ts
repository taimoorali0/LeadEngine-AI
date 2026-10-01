import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Activity, Campaign, Company, FollowUp, Industry, Keyword, Lead, Location, Page } from './models';

type Params = Record<string, string | number | boolean | null | undefined>;

function params(p: Params = {}): HttpParams {
  let hp = new HttpParams();
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== '') hp = hp.set(k, String(v));
  return hp;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  dashboard() { return this.http.get<Record<string, any>>('/api/dashboard'); }
  search(q: string) { return this.http.get<{ companies: (Company & { top_score: number | null })[]; leads: Lead[] }>('/api/search', { params: params({ q }) }); }

  locations(parentId?: number) { return this.http.get<Location[]>('/api/locations', { params: params({ parent_id: parentId }) }); }
  industries() { return this.http.get<Industry[]>('/api/industries'); }
  users() { return this.http.get<{ id: number; name: string }[]>('/api/users'); }

  campaigns() { return this.http.get<Page<Campaign>>('/api/campaigns'); }
  campaign(id: number) { return this.http.get<Campaign>(`/api/campaigns/${id}`); }
  createCampaign(body: unknown) { return this.http.post<Campaign>('/api/campaigns', body); }
  updateCampaign(id: number, body: unknown) { return this.http.put<Campaign>(`/api/campaigns/${id}`, body); }
  runCampaign(id: number) { return this.http.post<Campaign>(`/api/campaigns/${id}/run`, {}); }
  suggestKeywords(company_type: string, languages: string[]) { return this.http.post<string[]>('/api/keywords/suggest', { company_type, languages }); }

  leads(p: Params) { return this.http.get<Page<Lead>>('/api/leads', { params: params(p) }); }
  board() { return this.http.get<Partial<Record<string, Lead[]>>>('/api/leads/board'); }
  lead(id: number) { return this.http.get<Lead>(`/api/leads/${id}`); }
  updateLead(id: number, body: { status?: string; assigned_to?: number | null; pipeline_position?: number }) { return this.http.patch<Lead>(`/api/leads/${id}`, body); }
  addNote(id: number, body: { type: string; body: string; outcome?: string }) { return this.http.post<Activity>(`/api/leads/${id}/notes`, body); }
  addFollowUp(id: number, body: { due_at: string; type: string; priority: string; notes?: string }) { return this.http.post<FollowUp>(`/api/leads/${id}/follow-ups`, body); }
  followUps() { return this.http.get<FollowUp[]>('/api/follow-ups'); }
  completeFollowUp(id: number) { return this.http.post<FollowUp>(`/api/follow-ups/${id}/complete`, {}); }
  exportLeads(p: Params) { return this.http.get('/api/leads/export', { params: params(p), responseType: 'blob' }); }

  companies(p: Params) { return this.http.get<Page<Company>>('/api/companies', { params: params(p) }); }
  company(id: number) { return this.http.get<Company>(`/api/companies/${id}`); }
}

export type { Keyword };
