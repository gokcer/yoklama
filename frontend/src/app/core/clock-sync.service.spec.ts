import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClockSyncService } from './clock-sync.service';

describe('ClockSyncService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the sample with the lowest RTT', async () => {
    // Each fetch advances performance.now() by a different RTT; server time is local + 1000 at the midpoint.
    const rtts = [120, 40, 300, 80];
    let now = 10_000;
    let i = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('fetch', vi.fn(async () => {
      const rtt = rtts[i++];
      const mid = performance.timeOrigin + now + rtt / 2;
      now += rtt;
      return { ok: true, json: async () => ({ serverTime: mid + 1000 }) } as Response;
    }));

    const svc = new ClockSyncService();
    const best = await svc.measure(rtts.length);

    expect(best.rttMs).toBe(40);
    expect(best.offsetMs).toBeCloseTo(1000, 6);
    expect(svc.sync()).toEqual(best);
    expect(svc.toServer(5000)).toBeCloseTo(performance.timeOrigin + 5000 + 1000, 6);
    vi.unstubAllGlobals();
  });

  it('fails on an error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as Response));
    await expect(new ClockSyncService().measure(2)).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it('refuses to convert before the first sync', () => {
    expect(() => new ClockSyncService().now()).toThrow('clock not synced');
  });
});
