import { Component, inject, input, signal, viewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ClockSyncService } from '../core/clock-sync.service';
import { ScannerEngine, type ScanEvent } from '../scanner/scanner-engine';
import { sha256Hex } from '../scanner/camera';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import { getItem, setItem } from '../core/storage';
import type { ApiError, BleNonceResponse, PublicSessionDto, CompleteResponse } from '../core/api.models';

type FlowState = 'loading' | 'closed' | 'notFound' | 'enterNo' | 'intro' | 'scanning' | 'ble' | 'submitting' | 'done' | 'error';
type GeoResult = { state: string; lat?: number; lng?: number; accuracyM?: number };

/** Errors after which starting over cannot help. */
const TERMINAL = new Set(['ALREADY_CHECKED_IN', 'DEVICE_ALREADY_USED', 'SESSION_NOT_OPEN', 'SESSION_NOT_FOUND']);
/** Scan-POST errors that end the attempt (anything else is retried as a network problem). */
const SCAN_FATAL = new Set(['ATTEMPT_EXPIRED', 'ATTEMPT_NOT_FOUND', 'RATE_LIMITED', 'VALIDATION_ERROR', 'SESSION_NOT_OPEN']);
const GEO_MAX_MS = 10000;
const FRAME_WAIT_MS = 5000;

@Component({
  selector: 'app-checkin-flow',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="flow-container">
      <!-- Always in the DOM so the camera can be attached synchronously inside the tap (iOS). -->
      <div class="scan-view" [class.hidden]="state() !== 'scanning'">
        <video #videoEl playsinline muted autoplay></video>
        <div class="scan-overlay"><div class="scan-frame"></div></div>
        <div class="scan-bottom">
          <div class="scan-progress" aria-live="polite">{{ msg.student.scanProgress(validCount(), session()?.requiredScans ?? 0) }}</div>
          <div class="scan-dots" aria-hidden="true">
            @for (i of scanDots(); track i) {
              <span class="dot" [class.filled]="i < validCount()"></span>
            }
          </div>
          @if (preparing()) { <div class="scan-hint">{{ msg.student.preparing }}</div> }
          @if (scanner?.lastHint()) { <div class="scan-hint">{{ scanner!.lastHint() }}</div> }
          <button class="btn btn-outline btn-light" (click)="cancelScan()">{{ msg.student.cancel }}</button>
        </div>
      </div>

      @switch (state()) {
        @case ('loading') { <div class="center"><div class="spinner" role="status" aria-label="Yükleniyor"></div></div> }

        @case ('notFound') {
          <div class="center">
            <div class="card flow-card text-center">
              <h2>{{ msg.student.notFound }}</h2>
              <p class="text-sm text-secondary">{{ msg.student.notFoundHint }}</p>
              <a class="btn btn-primary btn-block" routerLink="/">{{ msg.student.enterOtherCode }}</a>
            </div>
          </div>
        }

        @case ('closed') {
          <div class="center">
            <div class="card flow-card text-center">
              @if (session(); as s) { <div class="text-sm text-secondary">{{ s.courseCode }} · {{ s.title }}</div> }
              <h2>{{ msg.student.closed }}</h2>
              <a class="btn btn-outline btn-block" routerLink="/">{{ msg.student.enterOtherCode }}</a>
            </div>
          </div>
        }

        @case ('enterNo') {
          <div class="center">
            <div class="card flow-card">
              <div class="text-sm text-secondary">{{ session()!.courseCode }} · {{ session()!.title }}</div>
              @if (session()!.courseName) { <div class="text-sm text-secondary">{{ session()!.courseName }}</div> }
              <h2>{{ msg.student.enterNo }}</h2>
              <form (ngSubmit)="startCheckin()">
                <div class="form-group">
                  <label for="sno" class="sr-only">{{ msg.roster.studentNo }}</label>
                  <input id="sno" class="form-input sno-input" [(ngModel)]="studentNo" name="sno"
                    inputmode="numeric" autocomplete="off" autofocus maxlength="32"
                    [class.invalid]="!!flowError()" [placeholder]="msg.roster.studentNo" />
                </div>
                @if (flowError()) { <p class="form-error" role="alert">{{ flowError() }}</p> }
                <button class="btn btn-primary btn-block" [disabled]="submitting()">{{ msg.student.continue }}</button>
              </form>
            </div>
          </div>
        }

        @case ('intro') {
          <div class="center">
            <div class="card flow-card">
              <h2>{{ msg.student.introTitle }}</h2>
              <p class="text-sm text-secondary">{{ studentNo }}@if (studentName()) { — {{ studentName() }} }</p>
              <p>{{ msg.student.introText(session()!.requiredScans) }}</p>
              @if (session()!.frameCapture && session()!.privacyNotice) {
                <p class="text-sm text-secondary"><strong>{{ msg.student.privacyNote }}:</strong> {{ session()!.privacyNotice }}</p>
              }
              @if (session()!.geoMode === 'FLAG') {
                <p class="text-sm text-secondary">{{ msg.student.locationPermission }}</p>
              }
              <button class="btn btn-primary btn-block" (click)="startScanning()">{{ msg.student.startCamera }}</button>
              <button class="btn btn-outline btn-block mt-sm" (click)="changeStudentNo()">{{ msg.student.changeNo }}</button>
            </div>
          </div>
        }

        @case ('ble') {
          <div class="center">
            <div class="card flow-card">
              <h2>{{ msg.student.bleTitle }}</h2>
              <p>{{ bleName() ? msg.student.bleDescNamed(bleName()!) : msg.student.bleDesc }}</p>
              <button class="btn btn-primary btn-block" (click)="doBle()" [disabled]="bleBusy()">{{ msg.student.bleVerify }}</button>
              <button class="btn btn-outline btn-block mt-sm" (click)="skipBle()" [disabled]="bleBusy()">{{ msg.student.bleSkip }}</button>
            </div>
          </div>
        }

        @case ('submitting') { <div class="center"><div class="spinner" role="status" aria-label="Kaydediliyor"></div><p>{{ msg.student.submitting }}</p></div> }

        @case ('done') {
          <div class="center">
            <div class="card flow-card text-center">
              <div class="done-icon" aria-hidden="true">✓</div>
              <h2>{{ msg.student.done }}</h2>
              @if (result(); as r) {
                <p>{{ r.studentNo }}@if (r.studentName) { — {{ r.studentName }} }</p>
                <p class="text-sm text-secondary">{{ formatTime(r.recordedAt) }}</p>
              }
              <p class="text-sm text-secondary">{{ msg.student.closeTab }}</p>
            </div>
          </div>
        }

        @case ('error') {
          <div class="center">
            <div class="card flow-card">
              <div class="error-icon" aria-hidden="true">!</div>
              <p class="text-danger" role="alert">{{ flowError() || msg.errors.generic }}</p>
              @if (canRetry()) {
                <button class="btn btn-primary btn-block" (click)="retry()">{{ msg.student.tryAgain }}</button>
              } @else {
                <a class="btn btn-outline btn-block" routerLink="/">{{ msg.student.backHome }}</a>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .flow-container { min-height: 100vh; min-height: 100dvh; background: var(--c-bg); }
    .center { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; min-height: 100dvh; padding: 16px; }
    .flow-card h2 { margin: 8px 0 16px; }
    .sno-input { font-size: 1.25rem; letter-spacing: 1px; min-height: 48px; }
    .error-icon { width: 56px; height: 56px; margin: 0 auto 8px; border-radius: 50%; background: var(--c-danger-light); color: var(--c-danger); font-size: 2rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .flow-card { width: 100%; max-width: 400px; }
    .btn-block { width: 100%; min-height: 48px; }
    .mt-sm { margin-top: var(--space-sm); }
    .text-center { text-align: center; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .spinner { width: 40px; height: 40px; border: 4px solid var(--c-border); border-top-color: var(--c-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .done-icon { width: 88px; height: 88px; margin: 0 auto 8px; border-radius: 50%; background: var(--c-success-light); color: var(--c-success); font-size: 3rem; display: flex; align-items: center; justify-content: center; }
    .hidden { display: none !important; }
    .scan-view { position: relative; width: 100%; height: 100vh; height: 100dvh; overflow: hidden; background: #000; }
    .scan-view video { width: 100%; height: 100%; object-fit: cover; }
    .scan-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
    .scan-frame { width: min(260px, 70vw); height: min(260px, 70vw); border: 3px solid rgba(255,255,255,0.7); border-radius: 12px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.4); }
    .scan-bottom { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: #fff; text-align: center; }
    .scan-progress { font-size: 1.25rem; font-weight: 600; }
    .scan-dots { display: flex; gap: 8px; justify-content: center; margin: 8px 0; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; }
    .dot.filled { background: #fff; }
    .dot { transition: background-color 0.2s; }
    .scan-hint { font-size: 0.875rem; margin-bottom: 8px; }
    .btn-light { color: #fff; border-color: rgba(255,255,255,0.7); min-height: 48px; }
  `],
})
export class CheckinFlowComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly clock = inject(ClockSyncService);
  readonly msg = MSG;
  readonly code = input.required<string>();
  readonly videoEl = viewChild.required<ElementRef<HTMLVideoElement>>('videoEl');

  readonly state = signal<FlowState>('loading');
  readonly session = signal<PublicSessionDto | null>(null);
  readonly flowError = signal('');
  readonly canRetry = signal(true);
  readonly submitting = signal(false);
  readonly preparing = signal(false);
  readonly result = signal<CompleteResponse | null>(null);
  readonly scanDots = signal<number[]>([]);
  readonly bleName = signal<string | null>(null);
  readonly bleBusy = signal(false);
  /** Distinct scans the server accepted; drives the progress dots so they never run ahead of the server. */
  readonly validCount = signal(0);
  readonly studentName = signal<string | null>(null);
  studentNo = '';
  scanner: ScannerEngine | null = null;

  private attemptId = '';
  private geoResult: GeoResult = { state: 'SKIPPED' };
  private geoWatchId: number | null = null;
  private geoTimer: ReturnType<typeof setTimeout> | null = null;
  private scanQueue: ScanEvent[] = [];
  private scanSending = false;
  private scanComplete = false;
  private cameraIdHash: string | null = null;
  private cameraLabel = '';
  private frameUpload: Promise<void> | null = null;
  private bleNonce: Promise<BleNonceResponse> | null = null;
  private bleNonceAt = 0;

  async ngOnInit() {
    try {
      const s = await this.api.getPublicSession(this.code());
      this.session.set(s);
      if (s.status === 'CLOSED') { this.state.set('closed'); return; }
      this.scanDots.set(Array.from({ length: s.requiredScans }, (_, i) => i));
      this.studentNo = getItem('yoklama_sno') ?? '';
      this.state.set('enterNo');
    } catch (e: unknown) {
      if ((e as ApiError)?.code === 'SESSION_NOT_FOUND') {
        this.state.set('notFound');
      } else {
        this.fail(errorMessage(e), true);
      }
    }
  }

  ngOnDestroy() {
    this.scanner?.stop();
    this.stopGeo();
  }

  async startCheckin() {
    const s = this.session()!;
    const no = this.studentNo.trim();
    if (!new RegExp(s.studentNoPattern).test(no)) {
      this.flowError.set(MSG.student.invalidStudentNo);
      return;
    }
    this.flowError.set('');
    this.submitting.set(true);
    try {
      const res = await this.api.startCheckin(s.code, no, {
        userAgent: navigator.userAgent,
        platform: navigator.platform ?? '',
        screenW: screen.width,
        screenH: screen.height,
      });
      this.attemptId = res.attemptId;
      this.studentNo = no;
      this.studentName.set(res.studentName ?? null);
      setItem('yoklama_sno', no);
      this.state.set('intro');
    } catch (e: unknown) {
      if ((e as ApiError)?.code === 'SESSION_NOT_OPEN') { this.state.set('closed'); return; }
      this.flowError.set(errorMessage(e));
    } finally {
      this.submitting.set(false);
    }
  }

  /** Click handler: camera → location → clock sync → sync report → scanning (06 §6). */
  async startScanning() {
    const s = this.session()!;
    this.resetScanState();
    const scanner = new ScannerEngine({
      sessionCode: s.code,
      target: s.requiredScans,
      frameCapture: s.frameCapture,
      clock: this.clock,
      onNewToken: (event) => this.onScanEvent(event),
      onFrame: s.frameCapture ? (blob, seq) => { this.frameUpload = this.uploadFrame(blob, seq); } : null,
    });
    this.scanner = scanner;

    // getUserMedia + play() must start inside the tap, before any network await.
    const cameraOpening = scanner.openCamera(this.videoEl().nativeElement);
    if (s.geoMode === 'FLAG') this.startGeo();
    this.preparing.set(true);
    this.state.set('scanning');

    if (!(await cameraOpening)) {
      this.stopGeo();
      this.fail(scanner.error(), true);
      return;
    }
    try {
      const sync = await this.clock.measure(8);
      try {
        await this.api.syncCheckin(this.attemptId, Math.round(sync.offsetMs), Math.round(sync.rttMs));
      } catch (e: unknown) {
        if (SCAN_FATAL.has((e as ApiError)?.code)) throw e;
      }
    } catch (e: unknown) {
      this.abortScan(errorMessage(e));
      return;
    }
    if (this.scanner !== scanner) return;   // cancelled meanwhile
    this.preparing.set(false);
    scanner.startDecoding();

    const cam = scanner.getCameraInfo();
    if (cam) {
      this.cameraLabel = cam.label;
      this.cameraIdHash = cam.deviceId ? await sha256Hex(cam.deviceId) : null;
    }
  }

  cancelScan() {
    this.scanner?.stop();
    this.scanner = null;
    this.stopGeo();
    this.resetScanState();
    this.preparing.set(false);
    this.state.set('enterNo');
  }

  changeStudentNo() {
    this.flowError.set('');
    this.state.set('enterNo');
  }

  private resetScanState() {
    this.validCount.set(0);
    this.scanQueue = [];
    this.scanSending = false;
    this.scanComplete = false;
    this.frameUpload = null;
    this.bleNonce = null;
  }

  private onScanEvent(event: ScanEvent) {
    this.scanQueue.push(event);
    void this.processScanQueue();
  }

  private async processScanQueue() {
    if (this.scanSending || this.scanComplete) return;
    const event = this.scanQueue.shift();
    if (!event) return;
    this.scanSending = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.api.scanCheckin(this.attemptId, {
          token: event.token,
          firstSeenServerMs: Math.round(event.firstSeenServerMs),
          frameTimeSource: event.frameTimeSource,
          frameW: event.frameW,
          frameH: event.frameH,
          corners: event.corners,
        });
        this.validCount.set(Math.min(res.distinctValid, res.required));
        if (res.complete && !this.scanComplete) {
          this.scanComplete = true;
          this.afterScansDone();
        }
        break;
      } catch (e: unknown) {
        if (SCAN_FATAL.has((e as ApiError)?.code)) {
          this.scanSending = false;
          this.abortScan(errorMessage(e));
          return;
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    this.scanSending = false;
    if (this.scanQueue.length > 0 && !this.scanComplete) void this.processScanQueue();
  }

  private abortScan(message: string) {
    this.scanComplete = true;
    this.scanner?.stop();
    this.stopGeo();
    this.preparing.set(false);
    this.fail(message, true);
  }

  private async uploadFrame(blob: Blob, seq: number): Promise<void> {
    try { await this.api.uploadFrame(this.attemptId, blob, seq); } catch { /* best-effort: NO_FRAME flag */ }
  }

  private afterScansDone() {
    this.scanner?.markDone();
    this.stopGeo();
    const s = this.session()!;
    const bt = typeof navigator !== 'undefined' ? (navigator as Navigator & { bluetooth?: unknown }).bluetooth : undefined;
    if (s.bleMode === 'OPTIONAL' && bt) {
      this.prefetchNonce();
      this.state.set('ble');
    } else {
      void this.doComplete();
    }
  }

  private prefetchNonce() {
    this.bleNonceAt = performance.now();
    this.bleNonce = this.api.bleNonce(this.attemptId);
    this.bleNonce.then(n => this.bleName.set(n.beaconName ?? null)).catch(() => { /* handled in doBle */ });
  }

  async doBle() {
    this.bleBusy.set(true);
    try {
      // The device chooser needs the user's tap, so ask for it before any further network round trip.
      const n = await this.bleNonce!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bt = (navigator as any).bluetooth;
      const dev = await bt.requestDevice({ filters: [{ services: [n.serviceUuid] }] });
      const gatt = await dev.gatt.connect();
      try {
        const nonce = performance.now() - this.bleNonceAt > n.expiresInMs - 10000
          ? await this.api.bleNonce(this.attemptId) : n;
        const svc = await gatt.getPrimaryService(nonce.serviceUuid);
        await (await svc.getCharacteristic(nonce.nonceCharUuid)).writeValueWithResponse(new TextEncoder().encode(nonce.nonce));
        const resp = new TextDecoder().decode(await (await svc.getCharacteristic(nonce.responseCharUuid)).readValue());
        await this.api.bleVerify(this.attemptId, resp.trim());
      } finally {
        gatt.disconnect();
      }
    } catch {
      // BLE is optional: any failure just continues without it (06 §6).
    }
    this.bleBusy.set(false);
    void this.doComplete();
  }

  skipBle() {
    void this.doComplete();
  }

  retry() {
    this.resetScanState();
    this.flowError.set('');
    this.state.set('enterNo');
  }

  formatTime(iso: string): string {
    try { return new Date(iso).toLocaleString('tr-TR'); } catch { return iso; }
  }

  private async doComplete() {
    this.state.set('submitting');
    try {
      if (this.frameUpload) {
        await Promise.race([this.frameUpload, new Promise(r => setTimeout(r, FRAME_WAIT_MS))]);
      }
      const sync2 = await this.clock.measure(8);
      const res = await this.api.completeCheckin(this.attemptId, {
        sync2: { offsetMs: Math.round(sync2.offsetMs), rttMs: Math.round(sync2.rttMs) },
        geo: this.geoResult,
        camera: { idHash: this.cameraIdHash, label: this.cameraLabel },
      });
      this.result.set(res);
      this.state.set('done');
    } catch (e: unknown) {
      this.fail(errorMessage(e), !TERMINAL.has((e as ApiError)?.code));
    }
  }

  private fail(message: string, canRetry: boolean) {
    this.flowError.set(message);
    this.canRetry.set(canRetry);
    this.state.set('error');
  }

  private startGeo() {
    // Until a position arrives, FLAG mode reports a timeout (06 §5.6).
    this.geoResult = { state: 'TIMEOUT' };
    let best: { lat: number; lng: number; accuracyM: number } | null = null;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.geoResult = { state: 'UNSUPPORTED' };
      return;
    }
    try {
      this.geoWatchId = navigator.geolocation.watchPosition(
        p => {
          if (!best || p.coords.accuracy < best.accuracyM) {
            best = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy };
            this.geoResult = { state: 'OK', ...best };
          }
        },
        err => {
          // A later timeout must not discard a position we already have.
          if (!best) this.geoResult = { state: err.code === err.PERMISSION_DENIED ? 'DENIED' : 'TIMEOUT' };
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: GEO_MAX_MS },
      );
      this.geoTimer = setTimeout(() => this.stopGeo(), GEO_MAX_MS);
    } catch {
      this.geoResult = { state: 'UNSUPPORTED' };
    }
  }

  private stopGeo() {
    if (this.geoWatchId != null) {
      navigator.geolocation.clearWatch(this.geoWatchId);
      this.geoWatchId = null;
    }
    if (this.geoTimer) { clearTimeout(this.geoTimer); this.geoTimer = null; }
  }
}
