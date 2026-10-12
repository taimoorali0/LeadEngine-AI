import { HttpClient, HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, finalize, firstValueFrom, tap, throwError } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'le_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  readonly user = signal<User | null>(null);
  readonly loggedIn = computed(() => this.user() !== null);

  get token(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  /** Returns a 2FA challenge string when a second step is required. */
  async login(email: string, password: string): Promise<string | null> {
    const res = await firstValueFrom(this.http.post<{ token?: string; user?: User; two_factor_required?: boolean; challenge?: string }>(
      '/api/auth/login', { email, password }));
    if (res.two_factor_required) return res.challenge!;
    this.finish(res.token!, res.user!);
    return null;
  }

  async verifyTwoFactor(challenge: string, code: string, recovery: boolean): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ token: string; user: User }>('/api/auth/2fa/challenge',
      recovery ? { challenge, recovery_code: code } : { challenge, code }));
    this.finish(res.token, res.user);
  }

  private finish(token: string, user: User) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
    this.user.set(user);
  }

  /** Restores the session from a stored token; false if there is none or it expired. */
  async restore(): Promise<boolean> {
    if (this.user()) return true;
    if (!this.token) return false;
    try {
      this.user.set(await firstValueFrom(this.http.get<User>('/api/auth/me')));
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  /** Re-reads the profile so credits, plan and status stay current while the app is open. */
  refresh(): void {
    if (!this.token || !this.user()) return;
    this.http.get<User>('/api/auth/me').subscribe({ next: u => this.user.set(u), error: () => {} });
  }

  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post('/api/auth/logout', {})); } finally { this.clear(); }
  }

  private creditsPending = false;

  refreshCredits(): void {
    const organizationId = this.user()?.organization?.id;
    if (!organizationId || this.creditsPending) return;
    this.creditsPending = true;
    this.http.get<{organization_id: number; credit_balance: number; plan: string; credit_allowance: number; subscription_status: string}>('/api/billing/balance')
      .pipe(finalize(() => { this.creditsPending = false; }))
      .subscribe({
        next: balance => this.user.update(user => {
          if (!user?.organization || user.organization.id !== balance.organization_id) return user;
          return {...user, credit_allowance: balance.credit_allowance, organization: {...user.organization,
            credit_balance: balance.credit_balance, plan: balance.plan, subscription_status: balance.subscription_status}};
        }),
        error: () => { /* Keep the last known balance; the next poll retries. */ },
      });
  }

  clear(): void {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
    this.user.set(null);
  }

  can(permission: string): boolean {
    const perms = this.user()?.permissions ?? [];
    return perms.includes('*') || perms.includes(permission);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }) : req;
  return next(authed).pipe(
    tap(event => {
      if (event instanceof HttpResponse && req.url.startsWith('/api/') && !req.url.startsWith('/api/auth/') && ['POST','PUT','PATCH','DELETE'].includes(req.method)) auth.refreshCredits();
    }),
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.endsWith('/auth/login')) {
        auth.clear();
        router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};

export const authGuard: CanActivateFn = async () => {
  // Inject before awaiting: inject() is only valid synchronously.
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.restore()) || router.parseUrl('/login');
};
