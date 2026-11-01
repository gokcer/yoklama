import { Component, inject, signal, computed, input, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import { ApiService } from '../core/api.service';
import { ClockSyncService } from '../core/clock-sync.service';
import { SseService, type SseSubscription } from '../core/sse.service';
import { formatRemaining } from '../core/slot';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import { FLAG_LABELS, FLAG_DESCRIPTIONS } from '../shared/flag-labels';
import type { SessionDto, AttendanceDto, AttemptDto, AttemptRejectedEvent, RosterEntryDto, SessionSseEvent } from '../core/api.models';

@Component({
  selector: 'app-session-dashboard',
  imports: [RouterLink, FormsModule],
  template: `
    <div class="container-wide">
      @if (session(); as s) {
        <nav class="breadcrumb" aria-label="Konum">
          <a routerLink="/t">{{ msg.nav.courses }}</a> ›
          <a [routerLink]="['/t/courses', s.courseId]">{{ s.courseCode }}</a> ›
          <span>{{ s.title }}</span>
        </nav>
      }
      @if (error()) {
        <div class="alert alert-error" role="alert">
          <span>{{ error() }}</span> <button class="btn-icon" (click)="error.set('')" aria-label="Kapat">✕</button>
        </div>
      }
      @if (info()) {
        <div class="alert alert-info" role="status">
          <span>{{ info() }}</span> <button class="btn-icon" (click)="info.set('')" aria-label="Kapat">✕</button>
        </div>
      }
      @if (session(); as s) {
        <div class="toolbar card-toolbar">
          <strong>{{ s.courseCode }}</strong> · {{ s.title }}
          <span class="badge" [class.badge-info]="s.status==='DRAFT'" [class.badge-success]="s.status==='OPEN'" [class.badge-warning]="s.status==='CLOSED'">{{ statusLabel(s.status) }}</span>
          @if (s.status === 'OPEN') { <span class="text-mono session-code" title="Katılım kodu">{{ s.code }}</span> }
          @if (remaining()) { <span class="text-sm">{{ msg.dashboard.remainingTime }}: {{ remaining() }}</span> }
          <span style="flex:1"></span>
          @if (s.status === 'DRAFT') { <button class="btn btn-primary btn-sm" (click)="act(openSession)">{{ msg.sessions.open }}</button> }
          @if (s.status === 'OPEN') {
            <button class="btn btn-outline btn-sm" (click)="act(extendSession)">{{ msg.sessions.extend }}</button>
            <button class="btn btn-danger btn-sm" (click)="act(closeSession)">{{ msg.sessions.close }}</button>
            <a class="btn btn-outline btn-sm" [href]="'/t/sessions/' + s.id + '/display'" target="_blank" rel="noopener">{{ msg.sessions.display }}</a>
            <button class="btn btn-outline btn-sm" (click)="showCalibration()">{{ msg.dashboard.calibration }}</button>
          }
          <a class="btn btn-outline btn-sm" [href]="'/api/sessions/' + s.id + '/export.csv'" download>{{ msg.dashboard.downloadCsv }}</a>
          @if (s.status === 'DRAFT') { <button class="btn btn-danger btn-sm" (click)="act(deleteSession)">{{ msg.sessions.delete }}</button> }
        </div>

        <div class="text-sm text-secondary" style="padding:var(--space-sm) var(--space-md);display:flex;gap:var(--space-md);flex-wrap:wrap;align-items:center">
          <span>{{ msg.dashboard.threshold }}: {{ s.effectiveLatencyThresholdMs }} ms · {{ s.thresholdSource === 'CALIBRATED' ? msg.dashboard.calibrated : msg.dashboard.defaultLabel }}</span>
          @if (s.status === 'OPEN' && s.joinUrl) {
            <span class="join-link">
              <span class="text-mono">{{ s.joinUrl }}</span>
              <button class="btn btn-outline btn-sm" (click)="copyJoinUrl(s.joinUrl)">{{ copied() ? 'Kopyalandı' : 'Bağlantıyı kopyala' }}</button>
            </span>
          }
          @if (s.thresholdSource === 'CALIBRATED' && attendances().length > 0) {
            <button class="btn btn-outline btn-sm" (click)="act(reevaluate)">Kalibrasyona göre yeniden değerlendir</button>
          }
        </div>

        <div class="counters">
          <button class="card counter" (click)="filter.set('accepted')" [class.counter-active]="filter() === 'accepted'">
            <div class="counter-value" style="color:var(--c-success)">{{ presentCount() }}</div>
            <div class="text-sm text-secondary">{{ msg.dashboard.attendance }}@if (roster().length > 0) { / {{ roster().length }} }</div>
          </button>
          <button class="card counter" (click)="filter.set('flagged')" [class.counter-active]="filter() === 'flagged'">
            <div class="counter-value" style="color:#e65100">{{ pendingCount() }}</div>
            <div class="text-sm text-secondary">{{ msg.dashboard.pending }}</div>
          </button>
          @if (roster().length > 0) {
            <button class="card counter" (click)="showAbsent.set(!showAbsent())" [class.counter-active]="showAbsent()" [attr.aria-expanded]="showAbsent()">
              <div class="counter-value">{{ absentCount() }}</div>
              <div class="text-sm text-secondary">{{ msg.dashboard.absent }}</div>
            </button>
          }
        </div>

        @if (showAbsent() && roster().length > 0) {
          <div class="card absent-list">
            <div class="flex-gap" style="justify-content:space-between">
              <strong>{{ msg.dashboard.absent }} ({{ absentList().length }})</strong>
              <button class="btn-icon" (click)="showAbsent.set(false)" aria-label="Kapat">✕</button>
            </div>
            @if (absentList().length === 0) {
              <p class="text-sm text-secondary">Listedeki herkes katıldı.</p>
            } @else {
              <ul>
                @for (r of absentList(); track r.studentNo) {
                  <li>
                    <span class="text-mono">{{ r.studentNo }}</span> {{ r.fullName }}
                    <button class="btn btn-outline btn-sm" (click)="openManual(r.studentNo)">{{ msg.dashboard.manualAdd }}</button>
                  </li>
                }
              </ul>
            }
          </div>
        }

        <div class="flex-gap" style="padding:0 var(--space-md);flex-wrap:wrap">
          @for (f of filters; track f.key) {
            <button class="btn btn-sm" [class.btn-primary]="filter()===f.key" [class.btn-outline]="filter()!==f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
          }
          <label for="att-search" class="sr-only">Ara</label>
          <input id="att-search" class="form-input search-input" type="search" placeholder="Numara veya ad ara"
            [value]="search()" (input)="search.set($any($event.target).value)" />
          <span style="flex:1"></span>
          <button class="btn btn-outline btn-sm" (click)="openManual('')">{{ msg.dashboard.manualAdd }}</button>
        </div>

        @if (showManual()) {
          <div class="dialog-backdrop" (click)="showManual.set(false)">
            <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="m-title" (click)="$event.stopPropagation()" (ngSubmit)="addManual()">
              <div class="dialog-title" id="m-title">{{ msg.dashboard.manualAdd }}</div>
              <div class="form-group">
                <label for="m-no">{{ msg.roster.studentNo }}</label>
                <input id="m-no" class="form-input" [(ngModel)]="manualNo" name="manualNo" inputmode="numeric" autocomplete="off" autofocus />
                @if (manualName(); as n) { <span class="text-sm text-secondary">{{ n }}</span> }
              </div>
              <div class="form-group">
                <label for="m-note">{{ msg.dashboard.note }}</label>
                <input id="m-note" class="form-input" [(ngModel)]="manualNote" name="manualNote" maxlength="500" />
              </div>
              @if (dialogError()) { <p class="form-error" role="alert">{{ dialogError() }}</p> }
              <div class="dialog-actions">
                <button class="btn btn-outline" type="button" (click)="showManual.set(false)">İptal</button>
                <button class="btn btn-primary" type="submit" [disabled]="busy()">Ekle</button>
              </div>
            </form>
          </div>
        }

        @if (calibrationQr()) {
          <div class="dialog-backdrop" (click)="calibrationQr.set('')">
            <div class="dialog" role="dialog" aria-modal="true" style="text-align:center" (click)="$event.stopPropagation()">
              <div class="dialog-title">{{ msg.dashboard.calibration }}</div>
              <p class="text-sm">Bu kodu telefonunuzla okutup kalibrasyon sayfasını açın:</p>
              <img [src]="calibrationQr()" alt="Kalibrasyon adresi QR kodu" width="240" height="240" />
              <p class="text-sm text-mono" style="word-break:break-all">{{ calibrationUrl() }}</p>
              <div class="dialog-actions">
                <a class="btn btn-outline" [routerLink]="['/t/sessions', s.id, 'calibrate']">Bu cihazda aç</a>
                <button class="btn btn-primary" (click)="calibrationQr.set('')">Kapat</button>
              </div>
            </div>
          </div>
        }

        @if (filtered().length === 0) {
          <p class="text-secondary" style="padding:var(--space-md)">{{ attendances().length === 0 ? msg.dashboard.noAttendance : 'Filtreye uyan kayıt yok.' }}</p>
        } @else {
          <div class="table-wrap">
            <table style="margin-top:var(--space-md)">
              <thead><tr>
                <th>No</th><th>Ad</th><th>Saat</th><th>Durum</th><th>Bayraklar</th><th>Gecikme</th><th>BLE</th><th></th>
              </tr></thead>
              <tbody>
                @for (a of filtered(); track a.id) {
                  <tr [class.highlight]="highlightId() === a.id" (click)="selectAtt(a)" tabindex="0" (keydown.enter)="selectAtt(a)" style="cursor:pointer">
                    <td class="text-mono">{{ a.studentNo }}</td>
                    <td>{{ a.fullName }}</td>
                    <td class="text-sm">{{ formatTime(a.createdAt) }}</td>
                    <td>
                      <span class="badge" [class.badge-success]="a.present" [class.badge-warning]="a.pending" [class.badge-danger]="a.teacherDecision==='REJECTED'">{{ decisionLabel(a) }}</span>
                    </td>
                    <td>
                      @for (f of a.flags; track f) { <span class="badge badge-warning" style="margin:1px" [title]="flagDesc(f)">{{ flagLabel(f) }}</span> }
                    </td>
                    <td [class.text-danger]="a.minLatencyMs != null && a.latencyThresholdMs != null && a.minLatencyMs > a.latencyThresholdMs">
                      {{ a.minLatencyMs != null ? a.minLatencyMs + ' ms' : '' }}
                    </td>
                    <td>@if (a.bleVerified) { <span title="BLE doğrulandı">✓</span> }</td>
                    <td class="row-actions">
                      @if (a.hasFrame) { <span title="Kamera karesi var" aria-label="Kamera karesi var">🖼</span> }
                      @if (a.pending) {
                        <button class="btn btn-sm btn-quick btn-quick-ok" (click)="quickDecide($event, a, 'APPROVED')" [attr.aria-label]="a.studentNo + ' onayla'" title="Onayla">✓</button>
                        <button class="btn btn-sm btn-quick btn-quick-no" (click)="quickDecide($event, a, 'REJECTED')" [attr.aria-label]="a.studentNo + ' reddet'" title="Reddet">✕</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (selectedAtt(); as a) {
          <div class="dialog-backdrop" (click)="selectedAtt.set(null)">
            <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="d-title" style="max-width:640px;max-height:90vh;overflow:auto" (click)="$event.stopPropagation()">
              <div class="flex-gap" style="justify-content:space-between;align-items:flex-start">
                <div class="dialog-title" id="d-title">{{ a.studentNo }}@if (a.fullName) { — {{ a.fullName }} }</div>
                <button class="btn-icon" (click)="selectedAtt.set(null)" aria-label="Kapat">✕</button>
              </div>
              <div class="mb-md"><span class="badge" [class.badge-success]="a.present" [class.badge-warning]="a.pending" [class.badge-danger]="a.teacherDecision==='REJECTED'">{{ decisionLabel(a) }}</span>
                <span class="text-sm text-secondary"> {{ formatTime(a.createdAt) }}</span></div>
              @if (a.hasFrame) { <img [src]="'/api/sessions/' + s.id + '/attendances/' + a.id + '/frame'" alt="Okutma anındaki kamera karesi" style="width:100%;border-radius:var(--radius-sm);margin-bottom:var(--space-md)" /> }
              <div class="text-sm detail-grid">
                <div>Gecikme: <strong>{{ a.minLatencyMs ?? '-' }} ms</strong></div>
                <div>Eşik: {{ a.latencyThresholdMs ?? '-' }} ms ({{ a.thresholdSource === 'CALIBRATED' ? msg.dashboard.calibrated : msg.dashboard.defaultLabel }})</div>
                <div>Alan oranı: {{ a.areaRatioMax != null ? a.areaRatioMax.toFixed(3) : '-' }}</div>
                <div>Alan eşiği: {{ a.areaThreshold != null ? a.areaThreshold.toFixed(2) : '-' }}</div>
                <div>Konum: {{ geoLabel(a.geoState) }} {{ a.geoDistanceM != null ? '(' + a.geoDistanceM.toFixed(0) + ' m)' : '' }}</div>
                <div>Konum doğruluğu: {{ a.geoAccuracyM != null ? a.geoAccuracyM.toFixed(0) + ' m' : '-' }}</div>
                <div>Saat RTT: {{ a.clockRttMs ?? '-' }} ms</div>
                <div>BLE: {{ a.bleVerified ? 'Doğrulandı' : 'Hayır' }}</div>
                <div>Kaynak: {{ a.source === 'MANUAL' ? 'Manuel' : 'Check-in' }}</div>
              </div>
              @for (f of a.flags; track f) {
                <div class="text-sm mt-md"><strong>{{ flagLabel(f) }}:</strong> {{ flagDesc(f) }}</div>
              }
              @if (a.userAgent) { <div class="text-sm text-secondary mt-md" style="word-break:break-all">{{ a.userAgent }}</div> }
              @if (a.cameraLabel) { <div class="text-sm text-secondary">Kamera: {{ a.cameraLabel }}</div> }

              <div class="form-group mt-md">
                <label for="d-note">{{ msg.dashboard.note }}</label>
                <input id="d-note" class="form-input" [(ngModel)]="detailNote" maxlength="500" />
              </div>
              @if (dialogError()) { <p class="form-error">{{ dialogError() }}</p> }
              <div class="flex-gap mt-md" style="flex-wrap:wrap">
                <button class="btn btn-primary btn-sm" (click)="decide(a.id, 'APPROVED')" [disabled]="busy()">{{ msg.dashboard.approve }}</button>
                <button class="btn btn-danger btn-sm" (click)="decide(a.id, 'REJECTED')" [disabled]="busy()">{{ msg.dashboard.reject }}</button>
                @if (a.teacherDecision !== 'NONE') {
                  <button class="btn btn-outline btn-sm" (click)="decide(a.id, 'NONE')" [disabled]="busy()">{{ msg.dashboard.clearDecision }}</button>
                }
                <span style="flex:1"></span>
                <button class="btn btn-outline btn-sm text-danger" (click)="deleteAtt(a.id)" [disabled]="busy()">{{ msg.dashboard.deleteRecord }}</button>
              </div>
            </div>
          </div>
        }

        <details class="mt-md" style="padding:0 var(--space-md)">
          <summary style="cursor:pointer;font-weight:500">{{ msg.dashboard.rejectedAttempts }} ({{ attempts().length }})</summary>
          @if (attempts().length === 0) {
            <p class="text-sm text-secondary">Yok</p>
          } @else {
            <table>
              <thead><tr><th>No</th><th>Sebep</th><th>Zaman</th></tr></thead>
              <tbody>
                @for (a of attempts(); track $index) {
                  <tr><td class="text-mono">{{ a.studentNo }}</td><td>{{ reasonLabel(a.resultCode) }}</td><td class="text-sm">{{ formatTime(a.createdAt) }}</td></tr>
                }
              </tbody>
            </table>
          }
        </details>
      }
    </div>
  `,
  styles: [`
    .highlight { animation: flash 1s ease-out; }
    @keyframes flash { from { background: var(--c-warning-light); } to { background: transparent; } }
    .card-toolbar { flex-wrap: wrap; gap: var(--space-sm); border: 1px solid var(--c-border); border-radius: var(--radius-md); }
    .session-code { font-size: 1.1rem; font-weight: 700; letter-spacing: 2px; background: var(--c-primary-light); color: var(--c-primary); padding: 2px 8px; border-radius: var(--radius-sm); }
    .join-link { display: inline-flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; min-width: 0; }
    .join-link .text-mono { word-break: break-all; }
    .counters { display: flex; gap: var(--space-md); padding: var(--space-md) 0; flex-wrap: wrap; }
    .counter { flex: 1; min-width: 120px; text-align: center; font: inherit; color: inherit; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
    .counter:hover { border-color: var(--c-primary); }
    .counter-active { border-color: var(--c-primary); box-shadow: 0 0 0 2px var(--c-primary-light); }
    .absent-list { margin-bottom: var(--space-md); }
    .absent-list ul { list-style: none; margin: var(--space-sm) 0 0; padding: 0; max-height: 260px; overflow: auto; }
    .absent-list li { display: flex; align-items: center; gap: var(--space-sm); padding: 4px 0; border-bottom: 1px solid var(--c-border); }
    .absent-list li button { margin-left: auto; }
    .row-actions { white-space: nowrap; }
    .btn-quick { padding: 2px 8px; margin-left: 4px; border: 1px solid var(--c-border); background: var(--c-surface); }
    .btn-quick-ok { color: var(--c-success); }
    .btn-quick-ok:hover { background: var(--c-success-light); }
    .btn-quick-no { color: var(--c-danger); }
    .btn-quick-no:hover { background: var(--c-danger-light); }
    .counter-value { font-size: 2rem; font-weight: 700; }
    .table-wrap { overflow-x: auto; }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-xs); }
  `],
})
export class SessionDashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly sse = inject(SseService);
  private readonly clock = inject(ClockSyncService);
  private readonly router = inject(Router);
  readonly msg = MSG;
  readonly id = input.required<string>();
  readonly session = signal<SessionDto | null>(null);
  readonly attendances = signal<AttendanceDto[]>([]);
  readonly attempts = signal<AttemptDto[]>([]);
  readonly roster = signal<RosterEntryDto[]>([]);
  readonly filter = signal('all');
  readonly selectedAtt = signal<AttendanceDto | null>(null);
  readonly highlightId = signal<number | null>(null);
  readonly showManual = signal(false);
  readonly calibrationQr = signal('');
  readonly calibrationUrl = signal('');
  readonly remaining = signal('');
  readonly error = signal('');
  readonly info = signal('');
  readonly dialogError = signal('');
  readonly search = signal('');
  readonly showAbsent = signal(false);
  readonly copied = signal(false);
  readonly busy = signal(false);
  manualNo = ''; manualNote = ''; detailNote = '';
  private sseSub: SseSubscription | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private clockReady = false;

  readonly filters = [
    { key: 'all', label: MSG.dashboard.all },
    { key: 'flagged', label: MSG.dashboard.flagged },
    { key: 'accepted', label: MSG.dashboard.accepted },
    { key: 'rejected', label: MSG.dashboard.rejected },
  ];

  readonly filtered = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLocaleLowerCase('tr-TR');
    return this.attendances().filter(a => {
      if (q && !a.studentNo.includes(q) && !(a.fullName ?? '').toLocaleLowerCase('tr-TR').includes(q)) return false;
      if (f === 'flagged') return a.pending;
      if (f === 'accepted') return a.present;
      if (f === 'rejected') return a.teacherDecision === 'REJECTED';
      return true;
    });
  });

  readonly presentCount = computed(() => this.attendances().filter(a => a.present).length);
  readonly pendingCount = computed(() => this.attendances().filter(a => a.pending).length);
  /** Roster students with no attendance record at all (same rule as the CSV's GELMEDI rows). */
  readonly absentList = computed(() => {
    const seen = new Set(this.attendances().map(a => a.studentNo));
    return this.roster().filter(r => !seen.has(r.studentNo));
  });
  readonly absentCount = computed(() => this.absentList().length);

  @HostListener('document:keydown.escape')
  closeDialogs() {
    this.showManual.set(false);
    this.calibrationQr.set('');
    this.selectedAtt.set(null);
  }

  async ngOnInit() {
    try {
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
      return;
    }
    this.connectSse();
    // Remaining time uses the server-synced clock, never Date.now().
    this.clock.measure(4).then(() => { this.clockReady = true; this.updateRemaining(); }).catch(() => undefined);
    this.timer = setInterval(() => this.updateRemaining(), 1000);
  }

  ngOnDestroy() {
    this.sseSub?.close();
    if (this.timer) clearInterval(this.timer);
  }

  async load() {
    const [s, a, att] = await Promise.all([
      this.api.getSession(+this.id()),
      this.api.getAttendances(+this.id()),
      this.api.getAttempts(+this.id()).catch(() => [] as AttemptDto[]),
    ]);
    this.session.set(s);
    this.attendances.set(a);
    this.attempts.set(att);
    this.api.getRoster(s.courseId).then(r => this.roster.set(r)).catch(() => undefined);
  }

  connectSse() {
    this.sseSub = this.sse.connect(this.id(), {
      attendance: (data) => {
        const d = data as AttendanceDto;
        let isNew = false;
        this.attendances.update(list => {
          const idx = list.findIndex(a => a.id === d.id);
          if (idx >= 0) { const copy = [...list]; copy[idx] = d; return copy; }
          isNew = true;
          return [d, ...list];
        });
        if (this.selectedAtt()?.id === d.id) this.selectedAtt.set(d);
        if (isNew) {
          this.highlightId.set(d.id);
          setTimeout(() => { if (this.highlightId() === d.id) this.highlightId.set(null); }, 1500);
        }
      },
      'attendance-deleted': (data) => {
        const { id } = data as { id: number };
        this.attendances.update(list => list.filter(a => a.id !== id));
        if (this.selectedAtt()?.id === id) this.selectedAtt.set(null);
      },
      session: (data) => {
        const ev = data as SessionSseEvent;
        this.session.update(s => s ? { ...s, status: ev.status, closesAt: ev.closesAt ?? s.closesAt,
          attendanceCount: ev.attendanceCount, flaggedPendingCount: ev.flaggedPendingCount } : s);
      },
      'attempt-rejected': (data) => {
        const ev = data as AttemptRejectedEvent;
        this.attempts.update(list => [{ studentNo: ev.studentNo, resultCode: ev.code, createdAt: ev.at }, ...list]);
      },
      reconnect: () => { this.load().catch(() => undefined); },
    });
  }

  /** Runs a toolbar action and reports failures in the banner. */
  async act(fn: () => Promise<void>) {
    this.error.set('');
    try { await fn.call(this); } catch (e) { this.error.set(errorMessage(e)); }
  }

  async openSession() { this.session.set(await this.api.openSession(+this.id())); }
  async extendSession() { this.session.set(await this.api.extendSession(+this.id(), 5)); }
  async closeSession() {
    if (!confirm('Yoklamayı şimdi kapatmak istediğinize emin misiniz?')) return;
    this.session.set(await this.api.closeSession(+this.id()));
  }
  async deleteSession() {
    if (!confirm('Bu oturumu silmek istediğinize emin misiniz?')) return;
    const courseId = this.session()!.courseId;
    await this.api.deleteSession(+this.id());
    this.router.navigate(['/t/courses', courseId]);
  }
  async reevaluate() {
    const r = await this.api.reevaluate(+this.id());
    await this.load();
    this.info.set(`${r.updated} kayıt yeniden değerlendirildi.`);
  }

  copyJoinUrl(url: string) {
    navigator.clipboard?.writeText(url).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }, () => this.error.set('Panoya kopyalanamadı.'));
  }

  openManual(studentNo: string) {
    this.dialogError.set('');
    this.manualNo = studentNo;
    this.manualNote = '';
    this.showManual.set(true);
  }

  /** Roster name for the number typed in the manual-add dialog, as a confirmation. */
  manualName(): string | null {
    const no = this.manualNo.trim();
    return no ? this.roster().find(r => r.studentNo === no)?.fullName ?? null : null;
  }

  geoLabel(state: string) {
    const labels: Record<string, string> = {
      OFF: 'Kapalı', OK: 'Uygun', OUTSIDE: 'Alan dışı', LOW_ACCURACY: 'Doğruluk düşük', UNAVAILABLE: 'Alınamadı',
    };
    return labels[state] ?? state;
  }

  async showCalibration() {
    const url = `${window.location.origin}/t/sessions/${this.id()}/calibrate`;
    this.calibrationUrl.set(url);
    try {
      this.calibrationQr.set(await QRCode.toDataURL(url, { width: 240, margin: 2, errorCorrectionLevel: 'M' }));
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async addManual() {
    this.dialogError.set('');
    if (!this.manualNo.trim()) { this.dialogError.set(MSG.student.invalidStudentNo); return; }
    this.busy.set(true);
    try {
      const created = await this.api.manualAttendance(+this.id(), this.manualNo.trim(), this.manualNote || undefined);
      this.manualNo = ''; this.manualNote = ''; this.showManual.set(false);
      this.upsert(created);
    } catch (e) {
      this.dialogError.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Inserts or replaces a record; SSE may deliver the same one, so this must be idempotent. */
  private upsert(d: AttendanceDto) {
    this.attendances.update(list => {
      const idx = list.findIndex(a => a.id === d.id);
      if (idx < 0) return [d, ...list];
      const copy = [...list];
      copy[idx] = d;
      return copy;
    });
  }

  async quickDecide(ev: Event, a: AttendanceDto, decision: string) {
    ev.stopPropagation();
    this.error.set('');
    try {
      this.upsert(await this.api.decideAttendance(+this.id(), a.id, decision, a.teacherNote ?? undefined));
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  selectAtt(a: AttendanceDto) { this.dialogError.set(''); this.selectedAtt.set(a); this.detailNote = a.teacherNote ?? ''; }

  async decide(attId: number, decision: string) {
    this.dialogError.set('');
    this.busy.set(true);
    try {
      const result = await this.api.decideAttendance(+this.id(), attId, decision, this.detailNote || undefined);
      this.upsert(result);
      this.selectedAtt.set(result);
    } catch (e) {
      this.dialogError.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async deleteAtt(attId: number) {
    if (!confirm('Bu yoklama kaydı ve kamera karesi silinecek. Emin misiniz?')) return;
    try {
      await this.api.deleteAttendance(+this.id(), attId);
      this.attendances.update(list => list.filter(a => a.id !== attId));
      this.selectedAtt.set(null);
    } catch (e) { this.dialogError.set(errorMessage(e)); }
  }

  statusLabel(s: string) { return (MSG.sessions.status as Record<string, string>)[s] ?? s; }
  flagLabel(f: string) { return FLAG_LABELS[f] ?? f; }
  flagDesc(f: string) { return FLAG_DESCRIPTIONS[f] ?? ''; }

  reasonLabel(code: string) {
    const labels: Record<string, string> = {
      NOT_ENOUGH_SCANS: 'Yetersiz tarama', ATTEMPT_EXPIRED: 'Süre doldu', SESSION_NOT_OPEN: 'Yoklama kapalı',
      ALREADY_CHECKED_IN: 'Numara zaten kayıtlı', DEVICE_ALREADY_USED: 'Cihaz zaten kullanıldı',
    };
    return labels[code] ?? code;
  }

  decisionLabel(a: AttendanceDto) {
    if (a.teacherDecision === 'APPROVED') return a.source === 'MANUAL' ? 'Manuel' : 'Onaylandı';
    if (a.teacherDecision === 'REJECTED') return 'Reddedildi';
    if (a.status === 'ACCEPTED') return 'Kabul';
    if (a.status === 'FLAGGED') return 'Şüpheli';
    return a.status;
  }

  formatTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  }

  updateRemaining() {
    const s = this.session();
    if (!this.clockReady || !s?.closesAt || s.status !== 'OPEN') { this.remaining.set(''); return; }
    this.remaining.set(formatRemaining(this.clock.now(), new Date(s.closesAt).getTime()) || '0:00');
  }
}
