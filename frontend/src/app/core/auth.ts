import { HttpClient, HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
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

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ token: string; user: User }>('/api/auth/login', { email, password }));
    localStorage.setItem(TOKEN_KEY, res.token);
    this.user.set(res.user);
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

  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post('/api/auth/logout', {})); } finally { this.clear(); }
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
