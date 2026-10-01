export interface User {
  id: number;
  name: string;
  email: string;
  role: { key: string; name: string };
  organization: { id: number; name: string; plan: string; credit_balance: number } | null;
  permissions: string[];
  locale: 'en' | 'ur' | 'ar';
  two_factor_enabled: boolean;
}

export interface Location { id: number; parent_id: number | null; level: string; iso_code: string | null; name_en: string; name_ar?: string; parent?: Location | null }
export interface Industry { id: number; slug: string; name_en: string; parent_id: number | null }

export interface Keyword { id?: number; keyword: string; enabled: boolean; language: string; origin: 'generated' | 'custom' }

export interface Campaign {
  id: number;
  name: string;
  company_type: string;
  status: 'draft' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  target_results: number;
  filters: Record<string, unknown>;
  progress: Partial<Record<string, number>>;
  stats: Partial<Record<string, number>>;
  country?: Location;
  industry?: Industry | null;
  locations?: Location[];
  keywords?: Keyword[];
  runs?: { id: number; started_at: string; finished_at: string | null; new_companies: number }[];
  leads_count?: number;
  last_run_at: string | null;
  refresh_interval_days: number | null;
  next_refresh_at: string | null;
  created_at: string;
}

export interface Phone { id: number; original: string; normalized: string | null; phone_type: string | null }
export interface Email { id: number; email: string; type: string; status: string }

export interface Company {
  id: number;
  name_en: string;
  name_ar: string | null;
  website: string | null;
  address_en: string | null;
  rating: number | null;
  review_count: number | null;
  business_status: string | null;
  description_en: string | null;
  social_links: Record<string, string>;
  possible_needs: string[];
  enrichment_status: string;
  ai_summary: string | null;
  ai_analyzed_at: string | null;
  classification_confidence: string | null;
  products: string[];
  services: string[];
  industry?: Industry | null;
  location?: Location | null;
  phones?: Phone[];
  emails?: Email[];
  sources?: { id: number; source: string; keyword: string | null; discovered_at: string }[];
  leads?: Lead[];
}

export interface Activity { id: number; type: string; body: string | null; meta: Record<string, unknown>; created_at: string; user?: { name: string } | null }
export interface FollowUp { id: number; lead_id: number; due_at: string; type: string; priority: string; notes: string | null; completed_at: string | null; lead?: Lead }

export interface Lead {
  id: number;
  status: string;
  score: number | null;
  quality: string | null;
  assigned_to: number | null;
  next_follow_up_at: string | null;
  company: Company;
  campaign?: { id: number; name: string } | null;
  assignee?: { id: number; name: string } | null;
  activities?: Activity[];
  follow_ups?: FollowUp[];
  created_at: string;
}

export interface Page<T> { data: T[]; current_page: number; last_page: number; total: number }

export const PIPELINE = ['new', 'verified', 'qualified', 'assigned', 'contacted', 'follow_up', 'interested', 'meeting', 'proposal', 'won'];
export const OUTCOMES = ['not_interested', 'invalid', 'duplicate', 'closed'];

export const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function qualityClass(q: string | null): string {
  switch (q) {
    case 'Highly Qualified': return 'bg-emerald-100 text-emerald-800';
    case 'Qualified': return 'bg-sky-100 text-sky-800';
    case 'Needs Review': return 'bg-amber-100 text-amber-800';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export interface AppNotification {
  id: string;
  type: string;
  data: { kind: string; title: string; body: string | null; url: string | null; meta: Record<string, unknown> };
  read_at: string | null;
  created_at: string;
}

export interface RuleCondition { field: string; op: string; value?: unknown }
export interface RuleAction { type: string; params: Record<string, unknown> }
export interface AutomationRule {
  id?: number;
  name: string;
  trigger: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  enabled: boolean;
  priority: number;
  runs?: number;
}
