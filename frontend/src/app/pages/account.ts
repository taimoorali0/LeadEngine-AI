import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TPipe } from '../core/i18n/i18n';

export function apiError(e: HttpErrorResponse, fallback = 'Request failed.'): string {
  const errors = e.error?.errors as Record<string, string[]> | undefined;
  return errors ? Object.values(errors)[0][0] : e.error?.message ?? fallback;
}

@Component({
  selector: 'app-account',
  imports: [FormsModule, TPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold">{{ 'My Account' | t }}</h1>
    <div class="grid gap-5 lg:grid-cols-2">
      <section class="card space-y-4">
        <h2 class="font-semibold">{{ 'Profile' | t }}</h2>
        <div><label class="label" for="nm">{{ 'Name' | t }}</label><input id="nm" class="input" [(ngModel)]="name" /></div>
        <div><span class="label">{{ 'Email' | t }}</span><span dir="ltr">{{ auth.user()?.email }}</span></div>
        <button class="btn-primary" (click)="saveName()">{{ 'Save' | t }}</button>
        <hr class="border-slate-100" />
        <h2 class="font-semibold">{{ 'Change password' | t }}</h2>
        <input class="input" type="password" [placeholder]="'Current password' | t" [(ngModel)]="pw.current_password" autocomplete="current-password" />
        <input class="input" type="password" [placeholder]="'New password (min. 10 characters)' | t" [(ngModel)]="pw.password" autocomplete="new-password" />
        <input class="input" type="password" [placeholder]="'Confirm new password' | t" [(ngModel)]="pw.password_confirmation" autocomplete="new-password" />
        <button class="btn-primary" (click)="changePassword()" [disabled]="!pw.password">{{ 'Change password' | t }}</button>
        @if (msg()) { <p class="text-sm" [class.text-red-600]="isError()" [class.text-emerald-700]="!isError()">{{ msg() | t }}</p> }
      </section>

      <section class="card space-y-4">
        <h2 class="font-semibold">{{ 'Two-factor authentication' | t }}</h2>
        @if (auth.user()?.two_factor_enabled && !recoveryCodes().length) {
          <p class="text-sm text-emerald-700">✓ {{ 'Two-factor authentication is on.' | t }}</p>
          <input class="input" type="password" [placeholder]="'Password' | t" [(ngModel)]="disablePassword" />
          <button class="btn-ghost text-red-700" (click)="disable()" [disabled]="!disablePassword">{{ 'Turn off' | t }}</button>
        } @else if (recoveryCodes().length) {
          <p class="text-sm">{{ 'Save these recovery codes somewhere safe. Each can be used once if you lose your phone.' | t }}</p>
          <pre class="rounded-lg bg-slate-50 p-3 text-sm" dir="ltr">{{ recoveryCodes().join('\\n') }}</pre>
          <button class="btn-primary" (click)="recoveryCodes.set([])">{{ 'Done' | t }}</button>
        } @else if (setup(); as s) {
          <p class="text-sm">{{ 'Scan this QR code with Google Authenticator, Microsoft Authenticator or a similar app, then enter the 6-digit code.' | t }}</p>
          <div class="w-48" [innerHTML]="qr()"></div>
          <p class="text-xs text-slate-500" dir="ltr">{{ s.secret }}</p>
          <div class="flex gap-2">
            <input class="input" inputmode="numeric" autocomplete="one-time-code" [(ngModel)]="code" [placeholder]="'123456'" dir="ltr" />
            <button class="btn-primary" (click)="confirm()" [disabled]="!code">{{ 'Confirm' | t }}</button>
          </div>
        } @else {
          <p class="text-sm text-slate-600">{{ 'Add a second step at sign-in using an authenticator app.' | t }}</p>
          <button class="btn-primary" (click)="start()">{{ 'Turn on' | t }}</button>
        }
        @if (tfError()) { <p class="text-sm text-red-600">{{ tfError() | t }}</p> }
      </section>
    </div>
  `,
})
export class AccountPage {
  protected auth = inject(AuthService);
  private api = inject(Api);
  private sanitizer = inject(DomSanitizer);
  name = this.auth.user()?.name ?? '';
  pw = { current_password: '', password: '', password_confirmation: '' };
  code = '';
  disablePassword = '';
  msg = signal('');
  isError = signal(false);
  tfError = signal('');
  setup = signal<{ secret: string; qr_svg: string } | null>(null);
  qr = signal<SafeHtml>('');
  recoveryCodes = signal<string[]>([]);

  private done = (m: string, err = false) => { this.msg.set(m); this.isError.set(err); };

  saveName() {
    this.api.updateProfile({ name: this.name }).subscribe({ next: u => { this.auth.user.set(u); this.done('Saved.'); }, error: e => this.done(apiError(e), true) });
  }

  changePassword() {
    this.api.updateProfile(this.pw).subscribe({
      next: () => { this.pw = { current_password: '', password: '', password_confirmation: '' }; this.done('Password changed. Other sessions were signed out.'); },
      error: e => this.done(apiError(e), true),
    });
  }

  start() {
    this.tfError.set('');
    this.api.twoFactorSetup().subscribe({
      next: s => { this.setup.set(s); this.qr.set(this.sanitizer.bypassSecurityTrustHtml(s.qr_svg)); },
      error: e => this.tfError.set(apiError(e)),
    });
  }

  confirm() {
    this.api.twoFactorConfirm(this.code).subscribe({
      next: r => {
        this.recoveryCodes.set(r.recovery_codes);
        this.setup.set(null);
        this.code = '';
        this.auth.user.update(u => (u ? { ...u, two_factor_enabled: true } : u));
      },
      error: e => this.tfError.set(apiError(e)),
    });
  }

  disable() {
    this.api.twoFactorDisable(this.disablePassword).subscribe({
      next: () => { this.disablePassword = ''; this.auth.user.update(u => (u ? { ...u, two_factor_enabled: false } : u)); },
      error: e => this.tfError.set(apiError(e)),
    });
  }
}
