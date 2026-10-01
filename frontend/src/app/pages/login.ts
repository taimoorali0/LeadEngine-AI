import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="flex min-h-screen items-center justify-center px-4">
      <form class="card w-full max-w-sm space-y-4" (ngSubmit)="submit()">
        <h1 class="text-xl font-bold">LeadEngine <span class="text-indigo-600">AI</span></h1>
        <p class="text-sm text-slate-500">Sign in to your workspace</p>
        <div><label class="label" for="email">Email</label><input id="email" class="input" type="email" name="email" [(ngModel)]="email" required autocomplete="username" /></div>
        <div><label class="label" for="password">Password</label><input id="password" class="input" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" /></div>
        @if (error()) { <p class="text-sm text-red-600">{{ error() }}</p> }
        <button class="btn-primary w-full justify-center" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = '';
  password = '';
  busy = signal(false);
  error = signal('');

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigateByUrl('/dashboard');
    } catch (e) {
      const err = e as HttpErrorResponse;
      this.error.set(err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : err.error?.message ?? 'Sign-in failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
