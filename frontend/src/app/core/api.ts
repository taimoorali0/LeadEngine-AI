import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Activity, AppNotification, AutomationRule, Contact, ImportPreview, Campaign, Company, FollowUp, Industry, Keyword, Lead, Location, Page } from './models';

type Params = Record<string, string | number | boolean | null | undefined>;

function params(p: Params = {}): HttpParams {
  let hp = new HttpParams();
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== '') hp = hp.set(k, String(v));
  return hp;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  dashboard() { return this.http.get<any>('/api/dashboard'); }
  search(q: string) { return this.http.get<{ companies: (Company & { top_score: number | null })[]; leads: Lead[] }>('/api/search', { params: params({ q }) }); }

  locations(parentId?: number) { return this.http.get<Location[]>('/api/locations', { params: params({ parent_id: parentId }) }); }
  industries() { return this.http.get<Industry[]>('/api/industries'); }
  taxonomy(sectorId?: number) { return this.http.get<any>('/api/taxonomy', { params: params({ sector_id: sectorId }) }); }
  users() { return this.http.get<{ id: number; name: string }[]>('/api/users'); }

  campaigns() { return this.http.get<Page<Campaign>>('/api/campaigns'); }
  campaign(id: number) { return this.http.get<Campaign>(`/api/campaigns/${id}`); }
  createCampaign(body: unknown) { return this.http.post<Campaign>('/api/campaigns', body); }
  updateCampaign(id: number, body: unknown) { return this.http.put<Campaign>(`/api/campaigns/${id}`, body); }
  runCampaign(id: number) { return this.http.post<Campaign>(`/api/campaigns/${id}/run`, {}); }
  suggestKeywords(company_type: string, languages: string[]) { return this.http.post<string[]>('/api/keywords/suggest', { company_type, languages }); }
  previewCampaign(body: unknown) { return this.http.post<any>('/api/campaigns/preview', body); }

  leads(p: Params) { return this.http.get<Page<Lead>>('/api/leads', { params: params(p) }); }
  board() { return this.http.get<Partial<Record<string, Lead[]>>>('/api/leads/board'); }
  lead(id: number) { return this.http.get<Lead>(`/api/leads/${id}`); }
  updateLead(id: number, body: { status?: string; assigned_to?: number | null; pipeline_position?: number }) { return this.http.patch<Lead>(`/api/leads/${id}`, body); }
  addNote(id: number, body: { type: string; body: string; outcome?: string }) { return this.http.post<Activity>(`/api/leads/${id}/notes`, body); }
  addFollowUp(id: number, body: { due_at: string; type: string; priority: string; notes?: string }) { return this.http.post<FollowUp>(`/api/leads/${id}/follow-ups`, body); }
  followUps() { return this.http.get<FollowUp[]>('/api/follow-ups'); }
  completeFollowUp(id: number) { return this.http.post<FollowUp>(`/api/follow-ups/${id}/complete`, {}); }
  exportLeads(p: Params) { return this.http.get('/api/leads/export', { params: params(p), responseType: 'blob' }); }

  brief(id: number) { return this.http.get<any>(`/api/leads/${id}/brief`); }
  analyzeCompany(id: number) { return this.http.post(`/api/companies/${id}/analyze`, {}); }

  notifications() { return this.http.get<{ unread: number; items: AppNotification[] }>('/api/notifications'); }
  markRead(ids?: string[]) { return this.http.post<{ unread: number }>('/api/notifications/read', ids ? { ids } : {}); }

  updateProfile(body: Record<string, unknown>) { return this.http.put<any>('/api/auth/me', body); }
  twoFactorSetup() { return this.http.post<{ secret: string; qr_svg: string }>('/api/auth/2fa/setup', {}); }
  twoFactorConfirm(code: string) { return this.http.post<{ recovery_codes: string[] }>('/api/auth/2fa/confirm', { code }); }
  twoFactorDisable(password: string) { return this.http.post('/api/auth/2fa/disable', { password }); }

  teamMembers() { return this.http.get<any[]>('/api/users'); }
  roles() { return this.http.get<any[]>('/api/roles'); }
  createUser(body: unknown) { return this.http.post<any>('/api/users', body); }
  updateUser(id: number, body: unknown) { return this.http.put<any>(`/api/users/${id}`, body); }
  resetUser2fa(id: number) { return this.http.post(`/api/users/${id}/reset-2fa`, {}); }
  teams() { return this.http.get<any[]>('/api/teams'); }
  saveTeam(body: { id?: number; name: string; leader_id: number | null; member_ids: number[] }) {
    return body.id ? this.http.put<any>(`/api/teams/${body.id}`, body) : this.http.post<any>('/api/teams', body);
  }
  deleteTeam(id: number) { return this.http.delete(`/api/teams/${id}`); }

  settings() { return this.http.get<{ organization: { name: string }; settings: any }>('/api/settings'); }
  saveSettings(body: unknown) { return this.http.put<{ organization: { name: string }; settings: any }>('/api/settings', body); }
  automations() { return this.http.get<{ rules: AutomationRule[]; schema: { triggers: string[]; fields: string[]; operators: string[]; actions: string[] } }>('/api/automations'); }
  saveAutomation(r: Partial<AutomationRule>) {
    return r.id ? this.http.put<AutomationRule>(`/api/automations/${r.id}`, r) : this.http.post<AutomationRule>('/api/automations', r);
  }
  deleteAutomation(id: number) { return this.http.delete(`/api/automations/${id}`); }

  reports(from: string, to: string) { return this.http.get<any>('/api/reports', { params: params({ from, to }) }); }
  billing() { return this.http.get<any>('/api/billing'); }
  submitBillingRequest(body: FormData) { return this.http.post<any>('/api/billing/requests', body); }
  adminBillingRequests(status?: string) { return this.http.get<any>('/api/admin/billing/requests', { params: params({ status }) }); }
  reviewBillingRequest(id: number, body: { status: string; admin_note?: string }) {
    return this.http.patch<any>(`/api/admin/billing/requests/${id}`, body);
  }
  billingProof(id: number) { return this.http.get(`/api/admin/billing/requests/${id}/proof`, { responseType: 'blob' }); }
  adminCosts() { return this.http.get<any>('/api/admin/costs'); }
  adminOrganizations(p: Params = {}) { return this.http.get<any>('/api/admin/organizations', { params: params(p) }); }
  createAdminOrganization(body: unknown) { return this.http.post<any>('/api/admin/organizations', body); }
  resetAdminUserPassword(id: number, password: string) { return this.http.post<any>(`/api/admin/users/${id}/password`, { password }); }
  updateAdminOrganization(id: number, body: unknown) { return this.http.patch<any>(`/api/admin/organizations/${id}`, body); }

  addContact(companyId: number, body: Partial<Contact>) { return this.http.post<Contact>(`/api/companies/${companyId}/contacts`, body); }
  updateContact(id: number, body: Partial<Contact>) { return this.http.patch<Contact>(`/api/contacts/${id}`, body); }
  deleteContact(id: number) { return this.http.delete(`/api/contacts/${id}`); }
  importPreview(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportPreview>('/api/imports/preview', fd);
  }
  startImport(body: { upload_id: string; name: string; country_id: number; industry_id?: number | null; mapping: Record<string, number | null> }) {
    return this.http.post<Campaign>('/api/imports', body);
  }

  companies(p: Params) { return this.http.get<Page<Company>>('/api/companies', { params: params(p) }); }
  company(id: number) { return this.http.get<Company>(`/api/companies/${id}`); }
}

export type { Keyword };
