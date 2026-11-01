import { describe, it, expect } from 'vitest';
import { slotAt, formatRemaining } from './slot';

describe('slotAt', () => {
  const epoch = 1_760_000_000_000;

  it('is -1 before the start', () => {
    expect(slotAt(epoch - 1, epoch, 1000)).toEqual({ seq: -1, ts: epoch, progress: 0 });
  });

  it('slot boundaries', () => {
    expect(slotAt(epoch, epoch, 1000)).toEqual({ seq: 0, ts: epoch, progress: 0 });
    expect(slotAt(epoch + 999, epoch, 1000).seq).toBe(0);
    expect(slotAt(epoch + 1000, epoch, 1000).seq).toBe(1);
    expect(slotAt(epoch + 7250, epoch, 1000)).toEqual({ seq: 7, ts: epoch + 7000, progress: 0.25 });
  });

  it('honours refreshMs', () => {
    const s = slotAt(epoch + 3 * 1500 + 750, epoch, 1500);
    expect(s.seq).toBe(3);
    expect(s.ts).toBe(epoch + 4500);
    expect(s.progress).toBeCloseTo(0.5);
  });
});

describe('formatRemaining', () => {
  it('formats m:ss and rounds up', () => {
    expect(formatRemaining(0, 125_000)).toBe('2:05');
    expect(formatRemaining(0, 500)).toBe('0:01');
    expect(formatRemaining(1000, 1000)).toBe('');
  });
});
