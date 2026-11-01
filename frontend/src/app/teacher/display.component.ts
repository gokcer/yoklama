import { Component, inject, input, signal, effect, OnInit, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ClockSyncService } from '../core/clock-sync.service';
import { SseService, type SseSubscription } from '../core/sse.service';
import { importHmacKey, signToken } from '../core/token-codec';
import { slotAt, formatRemaining } from '../core/slot';
import { errorMessage } from '../shared/errors';
import type { DisplayConfigDto, SessionSseEvent } from '../core/api.models';
import QRCode from 'qrcode';

interface Prepared { seq: number; ts: number; modules: boolean[][]; size: number; }

const QUIET_ZONE = 4;
const RESYNC_MS = 60000;

@Component({
  selector: 'app-display',
  template: `
    <div class="display-root">
      <div class="display-qr">
        <canvas #qrCanvas [class.blank]="state() !== 'running'" aria-label="Yoklama QR kodu"></canvas>
        <div class="progress-bar"><div class="progress-fill" [style.width.%]="state() === 'running' ? progress() * 100 : 0"></div></div>
      </div>
      <div class="display-panel">
        @if (cfg(); as c) {
          <div class="panel-course">{{ c.courseCode }}</div>
          <div class="panel-title">{{ c.title }}</div>
          <div class="panel-code" aria-label="Katılım kodu">{{ c.code }}</div>
          <div class="panel-url">{{ c.joinUrl }}</div>
          <canvas #joinQr class="panel-join-qr"></canvas>
          <div class="panel-count">{{ liveCount() }} katılım</div>
          @if (remainingText()) { <div class="panel-remaining">Kalan: {{ remainingText() }}</div> }
        }
        @if (state() === 'loading') { <div class="panel-status">Yükleniyor…</div> }
        @if (state() === 'starting') { <div class="panel-status">Başlıyor…</div> }
        @if (state() === 'closed') { <div class="panel-status">Yoklama kapandı.</div> }
        @if (error()) { <div class="panel-error" role="alert">{{ error() }}</div> }
        @if (!isFullscreen()) {
          <button class="btn btn-outline btn-sm" (click)="toggleFullscreen()">Tam ekran</button>
        }
      </div>
    </div>
    @if (showDebug()) {
      <div class="debug">offset={{ debugOffset() }} rtt={{ debugRtt() }} late={{ lateFrames() }} seq={{ shownSeq() }}</div>
    }
  `,
  styles: [`
    :host { display: block; width: 100vw; height: 100vh; overflow: hidden; background: #fff; color: #000; }
    .display-root { display: flex; height: 100%; }
    .display-qr { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; min-width: 0; }
    .display-qr canvas { image-rendering: pixelated; }
    canvas.blank { visibility: hidden; }
    .progress-bar { width: min(88vh, 62vw); height: 6px; background: #eee; margin-top: 8px; }
    .progress-fill { height: 100%; background: #000; }
    .display-panel { width: 280px; padding: 24px; display: flex; flex-direction: column; gap: 16px; border-left: 1px solid #e0e0e0; align-items: center; text-align: center; }
    .panel-course { font-size: 1.25rem; font-weight: 600; }
    .panel-title { color: #444; }
    .panel-code { font-size: 2.5rem; font-weight: 700; letter-spacing: 4px; font-family: ui-monospace, monospace; }
    .panel-url { font-size: 0.8rem; color: #444; word-break: break-all; }
    .panel-join-qr { width: 120px; height: 120px; }
    .panel-count { font-size: 1.5rem; font-weight: 600; }
    .panel-remaining, .panel-status { font-size: 1.1rem; color: #444; }
    .panel-error { color: #b00020; }
    .debug { position: fixed; bottom: 4px; left: 4px; font-size: 11px; color: #666; font-family: monospace; }
  `],
})
export class DisplayComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly clock = inject(ClockSyncService);
  private readonly sse = inject(SseService);
  readonly id = input.required<string>();
  readonly qrCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('qrCanvas');
  readonly joinQr = viewChild<ElementRef<HTMLCanvasElement>>('joinQr');

  readonly cfg = signal<DisplayConfigDto | null>(null);
  readonly state = signal<'loading' | 'starting' | 'running' | 'closed'>('loading');
  readonly error = signal('');
  readonly progress = signal(0);
  readonly liveCount = signal(0);
  readonly remainingText = signal('');
  readonly showDebug = signal(false);
  readonly isFullscreen = signal(false);
  readonly debugOffset = signal(0);
  readonly debugRtt = signal(0);
  readonly lateFrames = signal(0);
  readonly shownSeq = signal(-1);

  private key!: CryptoKey;
  private readonly prepared = new Map<number, Prepared>();
  private readonly preparing = new Set<number>();
  private closesAtMs = 0;
  private epochStartMs = 0;
  private refreshMs = 1000;
  private animId = 0;
  private destroyed = false;
  private sseSub: SseSubscription | null = null;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  constructor() {
    // The join QR canvas only exists once the config has rendered; draw it whenever both are there.
    effect(() => {
      const el = this.joinQr()?.nativeElement;
      const c = this.cfg();
      if (el && c) void QRCode.toCanvas(el, c.joinUrl, { width: 120, margin: 1, errorCorrectionLevel: 'M' }).catch(() => undefined);
    });
  }

  async ngOnInit() {
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('fullscreenchange', this.onFullscreen);

    try {
      const config = await this.api.displayConfig(+this.id());
      this.cfg.set(config);
      this.epochStartMs = config.epochStartMs;
      this.refreshMs = config.refreshMs;
      this.closesAtMs = new Date(config.closesAt).getTime();
      const raw = Uint8Array.from(atob(config.sessionKeyB64), c => c.charCodeAt(0));
      this.key = await importHmacKey(raw);
      await this.resync();
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
      this.state.set('closed');
      return;
    }
    if (this.destroyed) return;

    void this.refreshCount();
    this.sseSub = this.sse.connect(this.id(), {
      session: (data) => {
        const ev = data as SessionSseEvent;
        this.liveCount.set(ev.attendanceCount);
        if (ev.closesAt) this.closesAtMs = new Date(ev.closesAt).getTime();
        if (ev.status === 'CLOSED') this.closesAtMs = Math.min(this.closesAtMs, this.clock.now());
      },
      reconnect: () => { void this.refreshCount(); },
    });
    this.resyncTimer = setInterval(() => { void this.resync().catch(() => { /* keep the last offset */ }); }, RESYNC_MS);
    void this.acquireWakeLock();

    const first = Math.max(0, slotAt(this.clock.now(), this.epochStartMs, this.refreshMs).seq);
    await Promise.all([this.prepare(first), this.prepare(first + 1)]);
    if (!this.destroyed) this.tick();
  }

  ngOnDestroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animId);
    this.sseSub?.close();
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    void this.wakeLock?.release().catch(() => undefined);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  private async resync() {
    const s = await this.clock.measure(8);
    this.debugOffset.set(Math.round(s.offsetMs));
    this.debugRtt.set(Math.round(s.rttMs));
  }

  private async refreshCount() {
    try {
      this.liveCount.set((await this.api.getSession(+this.id())).attendanceCount);
    } catch { /* keep the SSE value */ }
  }

  private async acquireWakeLock() {
    try { this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* optional */ }
  }

  /** Signs the token for `seq` and builds its module matrix ahead of time (02 §4). */
  private async prepare(seq: number) {
    if (this.prepared.has(seq) || this.preparing.has(seq)) return;
    this.preparing.add(seq);
    try {
      const ts = this.epochStartMs + seq * this.refreshMs;
      const token = await signToken(this.key, this.cfg()!.code, seq, ts);
      const qr = QRCode.create(token, { errorCorrectionLevel: 'M' });
      const size = qr.modules.size;
      const modules: boolean[][] = [];
      for (let r = 0; r < size; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < size; c++) row.push(!!qr.modules.get(r, c));
        modules.push(row);
      }
      this.prepared.set(seq, { seq, ts, modules, size });
    } finally {
      this.preparing.delete(seq);
    }
  }

  /** Fire-and-forget preparation from the render loop; a failure is retried on the next frame. */
  private prepareSafe(seq: number) {
    this.prepare(seq).catch(e => this.error.set(errorMessage(e)));
  }

  private tick = () => {
    if (this.destroyed) return;
    this.animId = requestAnimationFrame(this.tick);
    const now = this.clock.now();
    this.remainingText.set(formatRemaining(now, this.closesAtMs));

    if (now >= this.closesAtMs) { this.setState('closed'); return; }
    const slot = slotAt(now, this.epochStartMs, this.refreshMs);
    if (slot.seq < 0) { this.setState('starting'); return; }

    if (slot.seq !== this.shownSeq()) {
      const p = this.prepared.get(slot.seq);
      if (p) {
        this.blit(p);
        this.shownSeq.set(slot.seq);
        for (const k of this.prepared.keys()) if (k < slot.seq) this.prepared.delete(k);
        this.prepareSafe(slot.seq + 1);
      } else {
        if (!this.preparing.has(slot.seq)) this.lateFrames.update(n => n + 1);
        this.prepareSafe(slot.seq);
      }
    }
    if (this.shownSeq() === slot.seq) this.setState('running');
    this.progress.set(slot.progress);
  };

  private setState(s: 'starting' | 'running' | 'closed') {
    if (this.state() !== s) this.state.set(s);
  }

  /** Draws modules with an integer number of device pixels each, so every module is the same size. */
  private blit(p: Prepared) {
    const canvas = this.qrCanvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const cssTarget = Math.min(window.innerHeight * 0.88, window.innerWidth * 0.62);
    const totalMods = p.size + QUIET_ZONE * 2;
    const scale = Math.max(1, Math.floor((cssTarget * dpr) / totalMods));
    const px = totalMods * scale;
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
      canvas.style.width = `${px / dpr}px`;
      canvas.style.height = `${px / dpr}px`;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < p.size; r++) {
      for (let c = 0; c < p.size; c++) {
        if (p.modules[r][c]) ctx.fillRect((c + QUIET_ZONE) * scale, (r + QUIET_ZONE) * scale, scale, scale);
      }
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'd') this.showDebug.update(v => !v);
    if (e.key === 'f') this.toggleFullscreen();
  };

  private onFullscreen = () => this.isFullscreen.set(!!document.fullscreenElement);

  private onVisibility = async () => {
    if (document.hidden) return;
    try { await this.resync(); } catch { /* keep the last offset */ }
    void this.acquireWakeLock();
    this.shownSeq.set(-1);   // force a redraw for the current slot
  };
}
