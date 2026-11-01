export interface DecodeResult {
  text: string | null;
  corners: number[][] | null;
  w: number;
  h: number;
  frameServerMs: number;
  source: string;
}

export interface Decoder {
  readonly busy: boolean;
  decode(image: ImageData, frameServerMs: number, source: string): Promise<DecodeResult>;
  terminate(): void;
}

/** Talks to the zxing-wasm worker; one frame in flight at a time (frames are skipped while busy). */
export class DecoderClient implements Decoder {
  private readonly worker: Worker;
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (r: DecodeResult) => void; frameServerMs: number; source: string }>();
  busy = false;

  constructor() {
    this.worker = new Worker(new URL('./decoder.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      this.pending.delete(data.id);
      this.busy = false;
      p?.resolve(data.error ? this.empty(p) : (data as DecodeResult));
    };
    // A failed wasm load or a crashed worker must not leave the scanner stuck in "busy".
    this.worker.onerror = (ev) => {
      ev.preventDefault?.();
      this.failAll();
    };
    this.worker.onmessageerror = () => this.failAll();
  }

  decode(image: ImageData, frameServerMs: number, source: string): Promise<DecodeResult> {
    this.busy = true;
    const id = this.nextId++;
    return new Promise<DecodeResult>(resolve => {
      this.pending.set(id, { resolve, frameServerMs, source });
      this.worker.postMessage({ id, image, frameServerMs, source }, [image.data.buffer]);
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.failAll();
  }

  private failAll(): void {
    this.busy = false;
    for (const p of this.pending.values()) p.resolve(this.empty(p));
    this.pending.clear();
  }

  private empty(p: { frameServerMs: number; source: string }): DecodeResult {
    return { text: null, corners: null, w: 0, h: 0, frameServerMs: p.frameServerMs, source: p.source };
  }
}
