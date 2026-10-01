import { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { Shell } from './layout/shell';

const page = (load: () => Promise<any>) => ({ loadComponent: load });

export const routes: Routes = [
  { path: 'login', ...page(() => import('./pages/login').then(m => m.LoginPage)) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', ...page(() => import('./pages/dashboard').then(m => m.DashboardPage)) },
      { path: 'campaigns', ...page(() => import('./pages/campaigns').then(m => m.CampaignsPage)) },
      { path: 'campaigns/new', ...page(() => import('./pages/campaign-builder').then(m => m.CampaignBuilderPage)) },
      { path: 'campaigns/:id', ...page(() => import('./pages/campaign-detail').then(m => m.CampaignDetailPage)) },
      { path: 'leads', ...page(() => import('./pages/leads').then(m => m.LeadsPage)) },
      { path: 'leads/:id', ...page(() => import('./pages/lead-detail').then(m => m.LeadDetailPage)) },
      { path: 'pipeline', ...page(() => import('./pages/pipeline').then(m => m.PipelinePage)) },
      { path: 'companies', ...page(() => import('./pages/companies').then(m => m.CompaniesPage)) },
      { path: 'companies/:id', ...page(() => import('./pages/company-detail').then(m => m.CompanyDetailPage)) },
      { path: 'follow-ups', ...page(() => import('./pages/follow-ups').then(m => m.FollowUpsPage)) },
      { path: 'reports', ...page(() => import('./pages/reports').then(m => m.ReportsPage)) },
      { path: 'automation', ...page(() => import('./pages/automation').then(m => m.AutomationPage)) },
      { path: 'team', ...page(() => import('./pages/team').then(m => m.TeamPage)) },
      { path: 'settings', ...page(() => import('./pages/settings').then(m => m.SettingsPage)) },
      { path: 'billing', ...page(() => import('./pages/billing').then(m => m.BillingPage)) },
      { path: 'admin/costs', ...page(() => import('./pages/admin-costs').then(m => m.AdminCostsPage)) },
      { path: 'account', ...page(() => import('./pages/account').then(m => m.AccountPage)) },
    ],
  },
  { path: '**', redirectTo: '' },
];
