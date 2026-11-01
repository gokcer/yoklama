import { ClockSyncService } from '../core/clock-sync.service';
import type { Decoder, DecodeResult } from './decoder-client';

const hasRVFC = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback: (cb: (now: number, meta: { captureTime?: number }) => void) => number;
};

export interface FrameLoopOptions {
  video: HTMLVideoElement;
  clock: ClockSyncService;
  decoder: Decoder;
  onResult: (result: DecodeResult) => void;
  maxWidth?: number;
}

/** Frame timing per 02 §6: capture time (or callback time) converted to server ms, decoded in a worker. */
export class FrameLoop {
  private running = false;
  private lastTime = -1;
  private readonly work: HTMLCanvasElement;
  private readonly wctx: CanvasRenderingContext2D;
  /** The decode canvas; it is not redrawn while a decode is in flight, so it still holds that frame. */
  readonly canvas: HTMLCanvasElement;

  constructor(private readonly opts: FrameLoopOptions) {
    this.work = document.createElement('canvas');
    this.wctx = this.work.getContext('2d', { willReadFrequently: true })!;
    this.canvas = this.work;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
  }

  private schedule() {
    if (!this.running) return;
    if (hasRVFC) {
      (this.opts.video as RvfcVideo).requestVideoFrameCallback((now, meta) => this.onFrame(now, meta));
    } else {
      requestAnimationFrame(t => {
        if (this.opts.video.currentTime !== this.lastTime) {
          this.lastTime = this.opts.video.currentTime;
          this.onFrame(t);
        } else {
          this.schedule();
        }
      });
    }
  }

  private async onFrame(now: number, meta?: { captureTime?: number }) {
    if (!this.running) return;
    this.schedule();
    const video = this.opts.video;
    if (this.opts.decoder.busy || !video.videoWidth || !video.videoHeight) return;

    const hasCapture = !!meta && typeof meta.captureTime === 'number' && meta.captureTime > 0;
    const perfT = hasCapture ? meta!.captureTime! : now;
    const source = hasCapture ? 'captureTime' : (hasRVFC ? 'callback' : 'raf');
    const frameServerMs = this.opts.clock.toServer(perfT);

    const maxW = this.opts.maxWidth ?? 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    this.work.width = Math.round(video.videoWidth * scale);
    this.work.height = Math.round(video.videoHeight * scale);
    try {
      this.wctx.drawImage(video, 0, 0, this.work.width, this.work.height);
      const image = this.wctx.getImageData(0, 0, this.work.width, this.work.height);
      const result = await this.opts.decoder.decode(image, frameServerMs, source);
      if (this.running) this.opts.onResult(result);
    } catch {
      // A single bad frame (e.g. video resized mid-draw) is simply skipped.
    }
  }
}
