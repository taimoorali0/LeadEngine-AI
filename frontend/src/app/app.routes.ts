import { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then(m => m.LoginPage) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard').then(m => m.DashboardPage) },
      { path: 'campaigns', loadComponent: () => import('./pages/campaigns').then(m => m.CampaignsPage) },
      { path: 'campaigns/new', loadComponent: () => import('./pages/campaign-builder').then(m => m.CampaignBuilderPage) },
      { path: 'campaigns/:id', loadComponent: () => import('./pages/campaign-detail').then(m => m.CampaignDetailPage) },
      { path: 'leads', loadComponent: () => import('./pages/leads').then(m => m.LeadsPage) },
      { path: 'leads/:id', loadComponent: () => import('./pages/lead-detail').then(m => m.LeadDetailPage) },
      { path: 'pipeline', loadComponent: () => import('./pages/pipeline').then(m => m.PipelinePage) },
      { path: 'companies', loadComponent: () => import('./pages/companies').then(m => m.CompaniesPage) },
      { path: 'companies/:id', loadComponent: () => import('./pages/company-detail').then(m => m.CompanyDetailPage) },
      { path: 'follow-ups', loadComponent: () => import('./pages/follow-ups').then(m => m.FollowUpsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
