import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';
import { AR } from './ar';
import { UR } from './ur';

export type Lang = 'en' | 'ur' | 'ar';
const STORE_KEY = 'le_lang';
const DICTS: Record<Lang, Record<string, string>> = { en: {}, ur: UR, ar: AR };

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'اردو' },
  { code: 'ar', label: 'العربية' },
];

/**
 * Runtime translations (spec §39). Keys are the English strings themselves, so a
 * missing translation falls back to readable English. `{name}` placeholders are
 * filled from params.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.stored());
  readonly dir = computed(() => (this.lang() === 'en' ? 'ltr' : 'rtl'));

  constructor() {
    this.apply();
  }

  set(lang: Lang) {
    this.lang.set(lang);
    try { localStorage.setItem(STORE_KEY, lang); } catch { /* storage unavailable */ }
    this.apply();
  }

  t(key: string, params?: Record<string, string | number | null | undefined>): string {
    let s = DICTS[this.lang()][key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v ?? ''));
    return s;
  }

  /** Locale for Angular pipes: Western digits are kept for phone numbers and scores. */
  get locale(): string {
    return this.lang() === 'en' ? 'en-US' : this.lang() === 'ar' ? 'ar' : 'ur';
  }

  private stored(): Lang {
    try {
      const v = localStorage.getItem(STORE_KEY);
      return v === 'ur' || v === 'ar' ? v : 'en';
    } catch {
      return 'en';
    }
  }

  private apply() {
    document.documentElement.lang = this.lang();
    document.documentElement.dir = this.dir();
  }
}

@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private i18n = inject(I18n);

  transform(key: string | null | undefined, params?: Record<string, string | number | null | undefined>): string {
    return key ? this.i18n.t(key, params) : '';
  }
}
