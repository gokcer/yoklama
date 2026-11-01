import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerEngine, type ScanEvent } from './scanner-engine';
import { ClockSyncService } from '../core/clock-sync.service';
import type { Decoder, DecodeResult } from './decoder-client';

const T1 = 'Y1.ABC234.7.MGJ6K3CW.77B7SI2E54AA2';
const T3 = 'Y1.ABC234.0.MGJ6K3CW.SGERQ6UXA4VUK';
const OTHER = 'Y1.K7Q2ZP.ZZ.MGJ6K4IK.NNSGYSRVIIHIU';

function result(text: string | null, frameServerMs = 1000): DecodeResult {
  return { text, corners: [[1, 2], [3, 4], [5, 6], [7, 8]], w: 960, h: 540, frameServerMs, source: 'captureTime' };
}

const fakeDecoder: Decoder = { busy: false, decode: async () => result(null), terminate: () => undefined };

describe('ScannerEngine', () => {
  let events: ScanEvent[];
  let frames: number[];
  let engine: ScannerEngine;

  beforeEach(() => {
    // jsdom has no canvas backend.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    events = [];
    frames = [];
    engine = new ScannerEngine({
      sessionCode: 'ABC234', target: 3, frameCapture: true, clock: new ClockSyncService(),
      onNewToken: e => events.push(e), onFrame: (_b, seq) => frames.push(seq),
      decoderFactory: () => fakeDecoder,
    });
    engine.attach(document.createElement('video'));
    engine.state.set('scanning');
  });

  it('emits each new seq once with the frame time as firstSeenServerMs', () => {
    engine.handleResult(result(T1, 1_760_000_000_187));
    engine.handleResult(result(T1, 1_760_000_000_300));
    engine.handleResult(result(T3, 1_760_000_000_400));
    expect(events.map(e => e.seq)).toEqual([7, 0]);
    expect(events[0].firstSeenServerMs).toBe(1_760_000_000_187);
    expect(events[0]).toMatchObject({ token: T1, frameTimeSource: 'captureTime', frameW: 960, frameH: 540 });
    expect(engine.distinct()).toBe(2);
  });

  it('ignores tokens of another session and shows a hint', () => {
    engine.handleResult(result(OTHER));
    expect(events).toHaveLength(0);
    expect(engine.lastHint()).not.toBe('');
  });

  it('ignores empty or malformed results and results while not scanning', () => {
    engine.handleResult(result(null));
    engine.handleResult(result('hello'));
    engine.state.set('done');
    engine.handleResult(result(T1));
    expect(events).toHaveLength(0);
  });

  it('captures the frame only for the first new token', () => {
    const capture = vi.spyOn(engine as unknown as { captureFrame: (seq: number) => void }, 'captureFrame');
    engine.handleResult(result(T1));
    engine.handleResult(result(T3));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(7);
  });

  it('reaches the target count', () => {
    for (const t of [T1, T3, 'Y1.ABC234.1.MGJ6K3CW.AAAAAAAAAAAAA']) engine.handleResult(result(t));
    expect(engine.distinct()).toBe(3);
  });
});
