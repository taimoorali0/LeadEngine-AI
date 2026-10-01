import { Injectable, inject, signal } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { AuthService } from './auth';

(window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

/** Overridable at deploy time via window.__LEADENGINE__ (see index.html). */
const cfg = {
  reverbKey: 'leadengine-key',
  reverbHost: location.hostname,
  reverbPort: 8080,
  forceTLS: location.protocol === 'https:',
  ...((window as unknown as { __LEADENGINE__?: object }).__LEADENGINE__ ?? {}),
};

/** Laravel Reverb connection (spec §47). Pages fall back to polling when it is down. */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private auth = inject(AuthService);
  private echo?: Echo<'reverb'>;
  readonly connected = signal(false);

  connect() {
    const user = this.auth.user();
    if (this.echo || !user) return;
    try {
      this.echo = new Echo({
        broadcaster: 'reverb',
        key: cfg.reverbKey,
        wsHost: cfg.reverbHost,
        wsPort: cfg.reverbPort,
        wssPort: cfg.reverbPort,
        forceTLS: cfg.forceTLS,
        enabledTransports: ['ws', 'wss'],
        authEndpoint: '/api/broadcasting/auth',
        auth: { headers: { Authorization: `Bearer ${this.auth.token}`, Accept: 'application/json' } },
      });
      const conn = (this.echo.connector as unknown as { pusher: Pusher }).pusher.connection;
      conn.bind('state_change', (s: { current: string }) => this.connected.set(s.current === 'connected'));
    } catch {
      this.echo = undefined;
    }
  }

  disconnect() {
    this.echo?.disconnect();
    this.echo = undefined;
    this.connected.set(false);
  }

  /** Returns an unsubscribe function. */
  onOrganization<T>(event: string, cb: (payload: T) => void): () => void {
    const orgId = this.auth.user()?.organization?.id;
    if (!this.echo || !orgId) return () => {};
    const ch = this.echo.private(`organization.${orgId}`);
    ch.listen(`.${event}`, cb);
    return () => ch.stopListening(`.${event}`, cb);
  }

  onNotification(cb: (n: Record<string, unknown>) => void): () => void {
    const id = this.auth.user()?.id;
    if (!this.echo || !id) return () => {};
    const name = `App.Models.User.${id}`;
    this.echo.private(name).notification(cb);
    return () => this.echo?.leave(name);
  }
}
