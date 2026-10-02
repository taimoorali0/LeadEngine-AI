import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../core/auth';
import { I18n, LANGS, TPipe } from '../core/i18n/i18n';

@Component({
  selector: 'app-login',
  imports: [FormsModule, TPipe],
  template: `
    <div class="flex min-h-screen bg-[#11182d]">
      <!-- Brand panel -->
      <div class="relative hidden w-[46%] flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div class="flex items-center gap-3">
          <img src="/leadengine-mark.png" alt="" class="h-11 w-11" />
          <span class="text-2xl font-extrabold tracking-tight">LeadEngine <span class="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">AI</span></span>
        </div>
        <div>
          <h1 class="text-[40px] font-bold leading-tight tracking-tight">{{ 'Find the right companies.' | t }}<br />
            <span class="text-slate-400">{{ 'Build better pipelines.' | t }}</span><br />
            <span class="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">{{ 'Convert more opportunities.' | t }}</span></h1>
          <p class="mt-5 max-w-md text-slate-400">{{ 'Discovery, enrichment, lead scoring and CRM in one place, for every industry and city.' | t }}</p>
        </div>
        <img src="/leadengine-mark.png" alt="" class="pointer-events-none absolute -bottom-24 -end-24 h-96 w-96 opacity-[0.07]" />
        <div class="text-xs text-slate-500">© LeadEngine AI</div>
      </div>

      <!-- Form panel -->
      <div class="flex flex-1 items-center justify-center bg-[#f4f5fa] px-4 py-10 lg:my-3 lg:me-3 lg:rounded-[28px]">
        <div class="w-full max-w-sm">
          <img src="/leadengine-logo.png" alt="LeadEngine AI" class="mx-auto mb-8 h-12 w-auto" />
          <div class="mb-4 flex justify-center gap-1">
            @for (l of langs; track l.code) {
            <button class="rounded-full px-3 py-1 text-sm" [class]="i18n.lang() === l.code ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:text-slate-800'" (click)="i18n.set(l.code)">{{ l.label }}</button>
          }
          </div>
          @if (!challenge()) {
          <form class="card space-y-4" (ngSubmit)="submit()">
            <p class="text-sm text-slate-500">{{ 'Sign in to your workspace' | t }}</p>
            <div><label class="label" for="email">{{ 'Email' | t }}</label><input id="email" class="input" type="email" name="email" [(ngModel)]="email" required autocomplete="username" dir="ltr" /></div>
            <div><label class="label" for="password">{{ 'Password' | t }}</label><input id="password" class="input" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" /></div>
            @if (error()) { <p class="text-sm text-red-600">{{ error() | t }}</p> }
            <button class="btn-primary w-full justify-center" [disabled]="busy()">{{ (busy() ? 'Signing in…' : 'Sign in') | t }}</button>
          </form>
        } @else {
          <form class="card space-y-4" (ngSubmit)="verify()">
            <h1 class="text-xl font-bold">{{ 'Two-factor authentication' | t }}</h1>
            <p class="text-sm text-slate-500">{{ (recovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.') | t }}</p>
            <input id="code" class="input text-center text-lg tracking-widest" name="code" [(ngModel)]="code" required autofocus dir="ltr"
                   [attr.inputmode]="recovery ? null : 'numeric'" [attr.autocomplete]="recovery ? 'off' : 'one-time-code'" />
            @if (error()) { <p class="text-sm text-red-600">{{ error() | t }}</p> }
            <button class="btn-primary w-full justify-center" [disabled]="busy() || !code">{{ 'Verify' | t }}</button>
            <div class="flex justify-between text-sm">
              <button type="button" class="text-indigo-700" (click)="recovery = !recovery; code = ''">{{ (recovery ? 'Use authenticator code' : 'Use a recovery code') | t }}</button>
              <button type="button" class="text-slate-500" (click)="challenge.set(null); error.set('')">{{ 'Back' | t }}</button>
            </div>
          </form>
        }
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  protected i18n = inject(I18n);
  protected langs = LANGS;
  email = '';
  password = '';
  code = '';
  recovery = false;
  busy = signal(false);
  error = signal('');
  challenge = signal<string | null>(null);

  async submit() {
    await this.attempt(async () => {
      const challenge = await this.auth.login(this.email, this.password);
      challenge ? this.challenge.set(challenge) : this.router.navigateByUrl('/dashboard');
    });
  }

  async verify() {
    await this.attempt(async () => {
      await this.auth.verifyTwoFactor(this.challenge()!, this.code, this.recovery);
      this.router.navigateByUrl('/dashboard');
    });
  }

  private async attempt(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      const err = e as HttpErrorResponse;
      this.error.set(err.status === 429 ? 'Too many attempts. Wait a minute and try again.'
        : err.error?.errors ? (Object.values(err.error.errors)[0] as string[])[0] : 'Sign-in failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
