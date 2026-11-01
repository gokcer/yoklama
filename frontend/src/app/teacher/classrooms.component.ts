import { ChangeDetectorRef, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import type { ClassroomDto, BleKeyResult } from '../core/api.models';

@Component({
  selector: 'app-classrooms',
  imports: [FormsModule],
  template: `
    <div class="container">
      <div class="page-header">
        <h1>{{ msg.classrooms.title }}</h1>
        <button class="btn btn-primary" (click)="startCreate()">{{ msg.classrooms.create }}</button>
      </div>

      @if (showForm()) {
        <div class="card mb-md">
          <form (ngSubmit)="save()">
            <div class="form-group">
              <label>{{ msg.classrooms.name }}</label>
              <input class="form-input" [(ngModel)]="formName" name="name" required maxlength="100" />
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:var(--space-sm)">
              <div class="form-group">
                <label>{{ msg.classrooms.lat }}</label>
                <input class="form-input" type="number" step="any" [(ngModel)]="formLat" name="lat" />
              </div>
              <div class="form-group">
                <label>{{ msg.classrooms.lng }}</label>
                <input class="form-input" type="number" step="any" [(ngModel)]="formLng" name="lng" />
              </div>
              <div class="form-group">
                <label>{{ msg.classrooms.radius }}</label>
                <input class="form-input" type="number" [(ngModel)]="formRadius" name="radius" />
              </div>
            </div>
            <button class="btn btn-outline btn-sm mb-md" type="button" (click)="useMyLocation()" [disabled]="locating()">{{ locating() ? 'Konum alınıyor…' : msg.classrooms.useMyLocation }}</button>
            <div class="form-group">
              <label>{{ msg.classrooms.bleBeaconId }}</label>
              <input class="form-input" [(ngModel)]="formBleId" name="bleid" maxlength="16" pattern="[A-Za-z0-9_-]*" />
            </div>
            <div class="flex-gap">
              <button class="btn btn-primary" type="submit" [disabled]="!formName.trim()">Kaydet</button>
              <button class="btn btn-outline" type="button" (click)="cancelForm()">İptal</button>
            </div>
          </form>
        </div>
      }

      @if (bleKeyResult()) {
        <div class="card mb-md" style="background: var(--c-warning-light)">
          <strong>{{ msg.classrooms.bleKeyWarning }}</strong>
          <div class="text-mono mt-md" style="word-break:break-all">{{ bleKeyResult()!.keyHex }}</div>
          <div class="text-sm mt-md">firmware/ble-beacon/secrets.h:</div>
          <pre class="text-mono secrets">{{ secretsH(bleKeyResult()!) }}</pre>
          <div class="flex-gap">
            <button class="btn btn-sm btn-outline" (click)="copy(bleKeyResult()!.keyHex)">Anahtarı kopyala</button>
            <button class="btn btn-sm btn-outline" (click)="copy(secretsH(bleKeyResult()!))">secrets.h kopyala</button>
            <button class="btn btn-sm btn-outline" (click)="bleKeyResult.set(null)">Kapat</button>
            @if (copied()) { <span class="text-sm text-success" role="status">Kopyalandı</span> }
          </div>
        </div>
      }

      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }

      @if (classrooms().length === 0 && !showForm()) {
        <p class="text-secondary">{{ msg.classrooms.noData }}</p>
      }

      @for (c of classrooms(); track c.id) {
        <div class="card mb-md">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--space-sm)">
            <div>
              <strong>{{ c.name }}</strong>
              @if (c.latitude != null) {
                <span class="text-sm text-secondary"> ({{ c.latitude?.toFixed(4) }}, {{ c.longitude?.toFixed(4) }}@if (c.radiusM != null) { · {{ c.radiusM }} m })</span>
              }
              @if (c.bleBeaconId) { <span class="text-sm text-secondary"> · YKL-{{ c.bleBeaconId }}</span> }
              @if (c.hasBleKey) { <span class="badge badge-success">BLE</span> }
            </div>
            <div class="flex-gap" style="flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" (click)="generateBle(c)">{{ msg.classrooms.generateBleKey }}</button>
              <button class="btn btn-outline btn-sm" (click)="edit(c)">Düzenle</button>
              <button class="btn-icon text-danger" (click)="del(c)" aria-label="Dersliği sil">✕</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`.secrets { background: #fff; padding: 8px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; font-size: 0.8rem; }`],
})
export class ClassroomsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly msg = MSG;
  classrooms = signal<ClassroomDto[]>([]);
  showForm = signal(false);
  bleKeyResult = signal<BleKeyResult | null>(null);
  error = signal('');
  locating = signal(false);
  copied = signal(false);
  private readonly cdr = inject(ChangeDetectorRef);
  editId: number | null = null;
  formName = ''; formLat: number | null = null; formLng: number | null = null; formRadius: number | null = null; formBleId = '';

  async ngOnInit() { await this.run(() => this.load()); }
  async load() { this.classrooms.set(await this.api.getClassrooms()); }

  private async run(fn: () => Promise<void>) {
    this.error.set('');
    try { await fn(); } catch (e) { this.error.set(errorMessage(e)); }
  }

  startCreate() { this.error.set(''); this.editId = null; this.formName = ''; this.formLat = null; this.formLng = null; this.formRadius = null; this.formBleId = ''; this.showForm.set(true); }
  cancelForm() { this.showForm.set(false); }

  edit(c: ClassroomDto) {
    this.error.set('');
    this.editId = c.id; this.formName = c.name;
    this.formLat = c.latitude ?? null; this.formLng = c.longitude ?? null;
    this.formRadius = c.radiusM ?? null; this.formBleId = c.bleBeaconId ?? '';
    this.showForm.set(true);
  }

  save() { return this.run(() => this.doSave()); }

  private async doSave() {
    const data: Record<string, unknown> = { name: this.formName };
    if (this.formLat != null) data['latitude'] = this.formLat;
    if (this.formLng != null) data['longitude'] = this.formLng;
    if (this.formRadius != null) data['radiusM'] = this.formRadius;
    if (this.formBleId) data['bleBeaconId'] = this.formBleId;
    if (this.editId) { await this.api.updateClassroom(this.editId, data as never); }
    else { await this.api.createClassroom(data as never); }
    this.cancelForm(); await this.load();
  }

  del(c: ClassroomDto) {
    if (!confirm(`"${c.name}" dersliği silinsin mi?`)) return Promise.resolve();
    return this.run(async () => { await this.api.deleteClassroom(c.id); await this.load(); });
  }

  generateBle(c: ClassroomDto) {
    if (c.hasBleKey && !confirm('Yeni anahtar üretilirse beacon firmware\'i yeniden yüklenmelidir. Devam edilsin mi?')) {
      return Promise.resolve();
    }
    return this.run(async () => {
      this.bleKeyResult.set(await this.api.generateBleKey(c.id));
      await this.load();
    });
  }

  useMyLocation() {
    if (!navigator.geolocation) { this.error.set('Bu tarayıcı konum desteklemiyor.'); return; }
    this.error.set('');
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(p => {
      this.formLat = parseFloat(p.coords.latitude.toFixed(6));
      this.formLng = parseFloat(p.coords.longitude.toFixed(6));
      this.formRadius ??= 50;
      // Zoneless: a geolocation callback does not trigger change detection on its own.
      this.locating.set(false);
      this.cdr.markForCheck();
    }, () => {
      this.locating.set(false);
      this.error.set('Konum alınamadı.');
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  /** Lines for firmware/ble-beacon/secrets.h (08 §3.1). */
  secretsH(k: BleKeyResult): string {
    return `#pragma once\n#define BEACON_NAME "YKL-${k.beaconId ?? 'XXX'}"\n#define BLE_KEY_HEX "${k.keyHex}"`;
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text)
      .then(() => this.copied.set(true), () => this.error.set('Panoya kopyalanamadı.'));
    setTimeout(() => this.copied.set(false), 2000);
  }
}
