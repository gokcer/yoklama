import { Injectable, signal } from '@angular/core';

export interface ClockSync { offsetMs: number; rttMs: number; at: number; }

/**
 * Server clock estimate (02 §5). Never uses `Date.now()`: local time is
 * `performance.timeOrigin + performance.now()` plus the measured offset.
 */
@Injectable({ providedIn: 'root' })
export class ClockSyncService {
  private readonly current = signal<ClockSync | null>(null);
  readonly sync = this.current.asReadonly();

  async measure(samples = 8): Promise<ClockSync> {
    let best: ClockSync | null = null;
    for (let i = 0; i < samples; i++) {
      const t0 = performance.timeOrigin + performance.now();
      const res = await fetch('/api/public/time', { cache: 'no-store' });
      if (!res.ok) throw new Error(`time ${res.status}`);
      const { serverTime } = await res.json();
      const t1 = performance.timeOrigin + performance.now();
      if (typeof serverTime !== 'number') throw new Error('invalid time response');
      const s: ClockSync = { offsetMs: serverTime - (t0 + t1) / 2, rttMs: t1 - t0, at: t1 };
      if (!best || s.rttMs < best.rttMs) best = s;
    }
    this.current.set(best!);
    return best!;
  }

  /** Server-time "now" in epoch ms. */
  now(): number { return this.toServer(performance.now()); }

  /** Converts a value on the performance timeline (ms) to server epoch ms. */
  toServer(perfMs: number): number {
    const s = this.current();
    if (!s) throw new Error('clock not synced');
    return performance.timeOrigin + perfMs + s.offsetMs;
  }
}
