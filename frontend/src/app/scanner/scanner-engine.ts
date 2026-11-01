import { signal } from '@angular/core';
import { ClockSyncService } from '../core/clock-sync.service';
import { parseToken } from '../core/token-codec';
import { MSG } from '../shared/messages';
import { DecoderClient, type Decoder, type DecodeResult } from './decoder-client';
import { FrameLoop } from './frame-loop';
import { openCamera, stopCamera, cameraErrorMessage, type CameraInfo } from './camera';

export interface ScanEvent {
  token: string;
  seq: number;
  firstSeenServerMs: number;
  frameTimeSource: string;
  frameW: number;
  frameH: number;
  corners: number[][] | null;
}

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'done' | 'error';

export interface ScannerOptions {
  sessionCode: string;
  /** Distinct tokens to collect (requiredScans for check-in, 5 for calibration). */
  target: number;
  frameCapture: boolean;
  clock: ClockSyncService;
  onNewToken: (event: ScanEvent) => void;
  onFrame?: ((blob: Blob, seq: number) => void) | null;
  decoderFactory?: () => Decoder;
}

/**
 * Camera + frame loop + worker decoding (06 §5.5). Use {@link openCamera} inside the user's tap,
 * then {@link startDecoding} once the clock is synced.
 */
export class ScannerEngine {
  static readonly HINT_AFTER_MS = 15000;

  readonly state = signal<ScannerState>('idle');
  readonly distinct = signal(0);
  readonly lastHint = signal('');
  readonly error = signal('');

  private decoder: Decoder | null = null;
  private loop: FrameLoop | null = null;
  private camera: CameraInfo | null = null;
  private readonly seenSeqs = new Set<number>();
  private lastNewAt = 0;
  private hintTimer: ReturnType<typeof setInterval> | null = null;
  private frameCanvas: HTMLCanvasElement | null = null;
  private frameTaken = false;

  constructor(private readonly opts: ScannerOptions) {}

  /** Opens the camera and starts the preview. On failure sets `error` and returns false. */
  async openCamera(video: HTMLVideoElement): Promise<boolean> {
    this.state.set('starting');
    try {
      this.camera = await openCamera();
      video.srcObject = this.camera.stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      this.attach(video);
      return true;
    } catch (e: unknown) {
      this.stop();
      this.error.set(cameraErrorMessage(e));
      this.state.set('error');
      return false;
    }
  }

  /** Starts decoding; the clock must already be synced. */
  startDecoding(): void {
    if (this.state() === 'error' || !this.loop) return;
    this.loop.start();
    this.state.set('scanning');
    this.lastNewAt = performance.now();
    this.hintTimer = setInterval(() => {
      if (performance.now() - this.lastNewAt > ScannerEngine.HINT_AFTER_MS) this.lastHint.set(MSG.student.qrHint);
    }, 5000);
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (await this.openCamera(video)) this.startDecoding();
  }

  stop(): void {
    this.loop?.stop();
    this.decoder?.terminate();
    if (this.camera) stopCamera(this.camera.stream);
    if (this.hintTimer) clearInterval(this.hintTimer);
    this.hintTimer = null;
    this.camera = null;
    this.loop = null;
    this.decoder = null;
  }

  getCameraInfo() { return this.camera; }

  markDone(): void {
    this.state.set('done');
    this.stop();
  }

  /** Visible for tests: wires the decoder and frame loop without a camera. */
  attach(video: HTMLVideoElement): void {
    this.decoder = this.opts.decoderFactory ? this.opts.decoderFactory() : new DecoderClient();
    this.loop = new FrameLoop({ video, clock: this.opts.clock, decoder: this.decoder, onResult: r => this.handleResult(r) });
    this.frameCanvas = this.loop.canvas;
  }

  /** Visible for tests: processes one decoder result. */
  handleResult(result: DecodeResult): void {
    if (this.state() !== 'scanning' || !result.text) return;

    const parsed = parseToken(result.text);
    if (!parsed) return;
    if (parsed.code !== this.opts.sessionCode) {
      this.lastHint.set(MSG.student.otherSessionQr);
      return;
    }
    if (this.seenSeqs.has(parsed.seq)) return;

    this.seenSeqs.add(parsed.seq);
    this.distinct.set(this.seenSeqs.size);
    this.lastNewAt = performance.now();
    this.lastHint.set('');
    try { navigator.vibrate?.(30); } catch { /* ignore */ }

    // Snapshot before anything else can redraw the decode canvas.
    if (!this.frameTaken && this.opts.frameCapture && this.opts.onFrame && this.frameCanvas) {
      this.frameTaken = true;
      this.captureFrame(parsed.seq);
    }

    this.opts.onNewToken({
      token: result.text,
      seq: parsed.seq,
      firstSeenServerMs: result.frameServerMs,
      frameTimeSource: result.source,
      frameW: result.w,
      frameH: result.h,
      corners: result.corners,
    });
  }

  private captureFrame(seq: number): void {
    const src = this.frameCanvas;
    if (!src || !this.opts.onFrame || !src.width || !src.height) return;
    const scaled = document.createElement('canvas');
    const sw = Math.min(640, src.width);
    const sh = Math.round(src.height * (sw / src.width));
    scaled.width = sw;
    scaled.height = sh;
    const ctx = scaled.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, sw, sh);
    scaled.toBlob(blob => {
      if (blob && this.opts.onFrame) this.opts.onFrame(blob, seq);
    }, 'image/jpeg', 0.6);
  }
}
