import { Component, inject, input, signal, viewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ClockSyncService } from '../core/clock-sync.service';
import { ScannerEngine, type ScanEvent } from '../scanner/scanner-engine';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import type { CalibrationRunDto, SessionDto } from '../core/api.models';

const CALIBRATION_TOKENS = 5;
const LABELS: Record<string, string> = { FRONT: 'Ön', MIDDLE: 'Orta', BACK: 'Arka', OTHER: 'Diğer' };

@Component({
  selector: 'app-calibrate',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="container" style="max-width:600px">
      <h1>{{ msg.dashboard.calibration }}</h1>
      <p class="text-sm text-secondary">Display açıkken sınıfın önünden, ortasından ve arkasından birer tur okutun.</p>

      @if (session(); as s) {
        <div class="mb-md text-sm">
          {{ msg.dashboard.threshold }}: <strong>{{ s.effectiveLatencyThresholdMs }} ms</strong> ·
          {{ s.thresholdSource === 'CALIBRATED' ? msg.dashboard.calibrated : msg.dashboard.defaultLabel }}
          @if (s.baselineLatencyMs != null) { · baseline {{ s.baselineLatencyMs }} ms }
        </div>
        @if (s.status !== 'OPEN') {
          <p class="form-error">Kalibrasyon yalnızca açık bir oturumda yapılabilir.</p>
        }
      }
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }

      @for (r of runs(); track r.id) {
        <div class="card mb-md">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
              <strong>{{ labelOf(r.label) }}</strong>
              <span class="text-sm text-secondary"> — gecikme: {{ r.minLatencyMs }} ms, alan: {{ (r.maxAreaRatio * 100).toFixed(1) }}%</span>
            </div>
            <button class="btn-icon text-danger" (click)="deleteRun(r.id)" aria-label="Turu sil">✕</button>
          </div>
        </div>
      }

      <div [class.hidden]="phase() !== 'scanning'" style="position:relative">
        <video #videoEl playsinline muted autoplay style="width:100%;border-radius:var(--radius-md);background:#000"></video>
        <div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#fff;font-weight:600;font-size:1.25rem;text-shadow:0 1px 3px rgba(0,0,0,0.5)">
          {{ scanner?.distinct() ?? 0 }} / {{ target }}
        </div>
        <button class="btn btn-outline btn-sm mt-md" (click)="cancelRun()">İptal</button>
      </div>

      @if (phase() === 'select' && session()?.status === 'OPEN') {
        <div class="card">
          <div class="form-group">
            <label for="cal-label">Konum</label>
            <select id="cal-label" class="form-input" [(ngModel)]="label">
              <option value="FRONT">Ön</option>
              <option value="MIDDLE">Orta</option>
              <option value="BACK">Arka</option>
              <option value="OTHER">Diğer</option>
            </select>
          </div>
          <button class="btn btn-primary" (click)="startRun()">Turu başlat</button>
        </div>
      }

      @if (phase() === 'sending') { <p>Gönderiliyor…</p> }

      @if (phase() === 'result' && lastResult(); as r) {
        <div class="card mb-md">
          <strong>Sonuç:</strong> gecikme {{ r.minLatencyMs }} ms, alan {{ (r.maxAreaRatio * 100).toFixed(1) }}%
          <p class="text-sm text-secondary">{{ r.validScanCount }} geçerli tarama</p>
        </div>
        <button class="btn btn-outline" (click)="phase.set('select')">Yeni tur</button>
      }

      <div class="mt-md flex-gap">
        @if (runs().length > 0) {
          <button class="btn btn-outline btn-sm" (click)="reevaluate()">Kalibrasyona göre yeniden değerlendir</button>
        }
        <a class="btn btn-outline btn-sm" [routerLink]="['/t/sessions', id()]">Panele dön</a>
      </div>
      @if (info()) { <p class="text-sm text-secondary">{{ info() }}</p> }
    </div>
  `,
  styles: [`.hidden { display: none; }`],
})
export class CalibrateComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly clock = inject(ClockSyncService);
  readonly msg = MSG;
  readonly target = CALIBRATION_TOKENS;
  readonly id = input.required<string>();
  readonly videoEl = viewChild.required<ElementRef<HTMLVideoElement>>('videoEl');

  readonly session = signal<SessionDto | null>(null);
  readonly runs = signal<CalibrationRunDto[]>([]);
  readonly phase = signal<'select' | 'scanning' | 'sending' | 'result'>('select');
  readonly lastResult = signal<CalibrationRunDto | null>(null);
  readonly error = signal('');
  readonly info = signal('');
  label = 'FRONT';
  scanner: ScannerEngine | null = null;
  private scans: ScanEvent[] = [];
  private finishing = false;

  async ngOnInit() {
    try { await this.load(); } catch (e) { this.error.set(errorMessage(e)); }
  }

  ngOnDestroy() { this.scanner?.stop(); }

  async load() {
    const [s, r] = await Promise.all([this.api.getSession(+this.id()), this.api.getCalibrationRuns(+this.id())]);
    this.session.set(s);
    this.runs.set(r);
  }

  labelOf(l: string) { return LABELS[l] ?? l; }

  async startRun() {
    this.error.set('');
    this.info.set('');
    this.scans = [];
    this.finishing = false;
    const scanner = new ScannerEngine({
      sessionCode: this.session()!.code,
      target: CALIBRATION_TOKENS,
      frameCapture: false,
      clock: this.clock,
      onNewToken: (event) => {
        this.scans.push(event);
        if (this.scans.length >= CALIBRATION_TOKENS) void this.finishRun();
      },
    });
    this.scanner = scanner;
    const opening = scanner.openCamera(this.videoEl().nativeElement);   // inside the tap
    this.phase.set('scanning');
    if (!(await opening)) {
      this.error.set(scanner.error());
      this.phase.set('select');
      return;
    }
    try {
      await this.clock.measure(8);
    } catch (e) {
      scanner.stop();
      this.error.set(errorMessage(e));
      this.phase.set('select');
      return;
    }
    if (this.scanner === scanner) scanner.startDecoding();
  }

  cancelRun() {
    this.scanner?.stop();
    this.scanner = null;
    this.phase.set('select');
  }

  private async finishRun() {
    if (this.finishing) return;
    this.finishing = true;
    this.scanner?.markDone();
    this.phase.set('sending');
    const sync = this.clock.sync()!;
    try {
      const result = await this.api.createCalibrationRun(+this.id(), {
        label: this.label,
        sync: { offsetMs: Math.round(sync.offsetMs), rttMs: Math.round(sync.rttMs) },
        scans: this.scans.map(s => ({
          token: s.token,
          firstSeenServerMs: Math.round(s.firstSeenServerMs),
          frameTimeSource: s.frameTimeSource,
          frameW: s.frameW,
          frameH: s.frameH,
          corners: s.corners,
        })),
      });
      this.lastResult.set(result);
      this.phase.set('result');
      await this.load();
    } catch (e: unknown) {
      this.error.set(errorMessage(e));
      this.phase.set('select');
    }
  }

  async deleteRun(runId: number) {
    try {
      await this.api.deleteCalibrationRun(+this.id(), runId);
      await this.load();
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async reevaluate() {
    try {
      const r = await this.api.reevaluate(+this.id());
      this.info.set(`${r.updated} kayıt güncellendi.`);
      await this.load();
    } catch (e) { this.error.set(errorMessage(e)); }
  }
}
