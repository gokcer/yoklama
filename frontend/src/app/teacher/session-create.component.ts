import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import type { CourseDto, ClassroomDto } from '../core/api.models';

@Component({
  selector: 'app-session-create',
  imports: [FormsModule],
  template: `
    <div class="container" style="max-width:600px">
      <h1>{{ msg.sessions.create }}</h1>
      <form (ngSubmit)="create()">
        <div class="form-group">
          <label>Ders</label>
          <select class="form-input" [(ngModel)]="courseId" name="courseId" required>
            @for (c of courses(); track c.id) { <option [ngValue]="c.id">{{ c.code }} — {{ c.name }}</option> }
          </select>
        </div>
        <div class="form-group">
          <label>Derslik</label>
          <select class="form-input" [(ngModel)]="classroomId" name="classroomId" (ngModelChange)="onClassroomChange()">
            <option [ngValue]="null">— Yok —</option>
            @for (c of classrooms(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select>
        </div>
        <div class="form-group">
          <label>{{ msg.sessions.title }}</label>
          <input class="form-input" [(ngModel)]="title" name="title" required maxlength="200" />
        </div>
        <div class="form-group">
          <label>{{ msg.sessions.duration }}</label>
          <input class="form-input" type="number" [(ngModel)]="duration" name="duration" min="1" max="240" />
        </div>

        <details class="mb-md">
          <summary style="cursor:pointer;font-weight:500">{{ msg.sessions.advanced }}</summary>
          <div style="padding-top:var(--space-md)">
            <div class="form-group">
              <label>{{ msg.sessions.refresh }}</label>
              <input class="form-input" type="number" [(ngModel)]="refreshMs" name="refreshMs" min="500" max="5000" />
            </div>
            <div class="form-group">
              <label>{{ msg.sessions.requiredScans }}</label>
              <input class="form-input" type="number" [(ngModel)]="requiredScans" name="requiredScans" min="2" max="6" />
            </div>
            <div class="form-group">
              <label>{{ msg.sessions.geoMode }}</label>
              <select class="form-input" [(ngModel)]="geoMode" name="geoMode">
                <option value="OFF">Kapalı</option><option value="FLAG" [disabled]="!hasGeo()">İşaretle</option>
              </select>
              @if (!hasGeo()) { <span class="text-sm text-secondary">Konum için koordinatları tanımlı bir derslik seçin.</span> }
            </div>
            <div class="form-group">
              <label>{{ msg.sessions.bleMode }}</label>
              <select class="form-input" [(ngModel)]="bleMode" name="bleMode">
                <option value="OFF">Kapalı</option><option value="OPTIONAL" [disabled]="!selectedClassroom()?.hasBleKey">İsteğe bağlı</option>
              </select>
              @if (!selectedClassroom()?.hasBleKey) { <span class="text-sm text-secondary">BLE için anahtarı üretilmiş bir derslik seçin.</span> }
            </div>
            <div class="form-group" style="flex-direction:row;gap:var(--space-sm);align-items:center">
              <input type="checkbox" [(ngModel)]="requireRoster" name="requireRoster" id="rr" />
              <label for="rr">{{ msg.sessions.requireRoster }}</label>
            </div>
            <div class="form-group" style="flex-direction:row;gap:var(--space-sm);align-items:center">
              <input type="checkbox" [(ngModel)]="frameCapture" name="frameCapture" id="fc" />
              <label for="fc">{{ msg.sessions.frameCapture }}</label>
            </div>
          </div>
        </details>

        @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
        <div class="flex-gap">
          <button class="btn btn-primary" type="submit" [disabled]="saving() || !courseId || !title.trim()">{{ msg.sessions.create }}</button>
          <button class="btn btn-outline" type="submit" (click)="openAfterCreate = true" [disabled]="saving() || !courseId || !title.trim()">Oluştur ve başlat</button>
        </div>
      </form>
    </div>
  `,
})
export class SessionCreateComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly msg = MSG;
  courses = signal<CourseDto[]>([]);
  error = signal('');
  saving = signal(false);
  classrooms = signal<ClassroomDto[]>([]);
  courseId: number | null = null;
  classroomId: number | null = null;
  title = '';
  duration = 10;
  refreshMs = 1000;
  requiredScans = 3;
  geoMode = 'OFF';
  bleMode = 'OFF';
  requireRoster = true;
  frameCapture = true;
  openAfterCreate = false;

  async ngOnInit() {
    try {
      const [c, cl] = await Promise.all([this.api.getCourses(), this.api.getClassrooms()]);
      this.courses.set(c);
      this.classrooms.set(cl);
      const qCourseId = Number(this.route.snapshot.queryParamMap.get('courseId'));
      this.courseId = c.some(x => x.id === qCourseId) ? qCourseId : (c[0]?.id ?? null);
      // A sensible default title: today's date (the teacher usually edits it to "Hafta N").
      this.title = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async create() {
    if (!this.courseId) return;
    const data: Record<string, unknown> = {
      courseId: this.courseId,
      title: this.title,
      durationMinutes: this.duration,
      refreshMs: this.refreshMs,
      requiredScans: this.requiredScans,
      geoMode: this.geoMode,
      bleMode: this.bleMode,
      requireRoster: this.requireRoster,
      frameCapture: this.frameCapture,
    };
    if (this.classroomId != null) data['classroomId'] = this.classroomId;
    this.error.set('');
    this.saving.set(true);
    try {
      const s = await this.api.createSession(data);
      // The session exists now; if opening fails the dashboard still offers "Başlat".
      if (this.openAfterCreate) await this.api.openSession(s.id).catch(() => undefined);
      this.router.navigate(['/t/sessions', s.id]);
    } catch (e) {
      // e.g. geoMode=FLAG without classroom coordinates; server details name the field.
      const details = (e as { details?: Record<string, string> }).details;
      const extra = details ? Object.values(details).join(' ') : '';
      this.error.set(`${errorMessage(e)} ${extra}`.trim());
    } finally {
      this.saving.set(false);
      this.openAfterCreate = false;
    }
  }

  selectedClassroom(): ClassroomDto | undefined {
    return this.classrooms().find(c => c.id === this.classroomId);
  }

  /** Same requirement as the server: coordinates and a radius. */
  hasGeo(): boolean {
    const c = this.selectedClassroom();
    return c?.latitude != null && c.longitude != null && c.radiusM != null;
  }

  /** Geo/BLE checks need the classroom to support them; fall back to OFF instead of a server error. */
  onClassroomChange() {
    const c = this.selectedClassroom();
    if (this.geoMode === 'FLAG' && !this.hasGeo()) this.geoMode = 'OFF';
    if (this.bleMode === 'OPTIONAL' && !c?.hasBleKey) this.bleMode = 'OFF';
  }
}
