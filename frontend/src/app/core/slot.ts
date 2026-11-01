/** Display timeline helpers (02 §4). Pure, so they can be unit-tested. */

export interface Slot {
  /** Slot index (= token seq); -1 before the start. */
  seq: number;
  /** Planned start of the slot (= token ts), epoch ms. */
  ts: number;
  /** 0..1 position inside the slot. */
  progress: number;
}

export function slotAt(nowMs: number, epochStartMs: number, refreshMs: number): Slot {
  if (nowMs < epochStartMs) return { seq: -1, ts: epochStartMs, progress: 0 };
  const seq = Math.floor((nowMs - epochStartMs) / refreshMs);
  const ts = epochStartMs + seq * refreshMs;
  return { seq, ts, progress: (nowMs - ts) / refreshMs };
}

/** `m:ss` remaining until `untilMs`, or '' when past. */
export function formatRemaining(nowMs: number, untilMs: number): string {
  const rem = untilMs - nowMs;
  if (rem <= 0) return '';
  const totalSec = Math.ceil(rem / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
