import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import type { CourseDto, SessionDto } from '../core/api.models';

@Component({
  selector: 'app-courses',
  imports: [RouterLink, FormsModule],
  template: `
    <div class="container">
      <div class="page-header">
        <h1>{{ msg.courses.title }}</h1>
        <button class="btn btn-primary" (click)="cancelForm(); showForm.set(true)">{{ msg.courses.create }}</button>
      </div>

      @if (showForm()) {
        <div class="card mb-md">
          <form (ngSubmit)="save()">
            <div class="form-group">
              <label>{{ msg.courses.code }}</label>
              <input class="form-input" [(ngModel)]="formCode" name="code" required maxlength="32" />
            </div>
            <div class="form-group">
              <label>{{ msg.courses.name }}</label>
              <input class="form-input" [(ngModel)]="formName" name="name" required maxlength="200" />
            </div>
            @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
            <div class="flex-gap">
              <button class="btn btn-primary" type="submit" [disabled]="!formCode.trim() || !formName.trim()">Kaydet</button>
              <button class="btn btn-outline" type="button" (click)="cancelForm()">İptal</button>
            </div>
          </form>
        </div>
      }

      @if (openSessions().length > 0) {
        <section class="card mb-md open-sessions" aria-labelledby="open-title">
          <h2 id="open-title">Açık yoklamalar</h2>
          @for (s of openSessions(); track s.id) {
            <a class="open-row" [routerLink]="['/t/sessions', s.id]">
              <span class="badge badge-success">Açık</span>
              <strong>{{ s.courseCode }}</strong> · {{ s.title }}
              <span class="text-mono text-sm">{{ s.code }}</span>
              <span class="text-sm text-secondary" style="margin-left:auto">{{ s.attendanceCount }} katılım</span>
            </a>
          }
        </section>
      }

      @if (courses().length === 0 && !showForm()) {
        <p class="text-secondary">{{ msg.courses.noData }}</p>
      }

      @if (error() && !showForm()) { <p class="form-error" role="alert">{{ error() }}</p> }

      @for (c of courses(); track c.id) {
        <div class="card mb-md course-card">
          <a [routerLink]="['/t/courses', c.id]" class="course-link">
            <strong>{{ c.code }}</strong> — {{ c.name }}
          </a>
          <span class="badge badge-info">{{ c.rosterCount }} {{ msg.courses.students }}</span>
          <button class="btn btn-outline btn-sm" (click)="edit(c)">Düzenle</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .course-card { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; transition: border-color 0.15s; }
    .course-card:hover { border-color: var(--c-primary); }
    .course-link { text-decoration: none; color: inherit; flex: 1; min-width: 160px; }
    .course-link:hover { text-decoration: none; }
    .open-sessions { border-color: var(--c-success); }
    .open-sessions h2 { font-size: 1rem; margin: 0 0 var(--space-sm); }
    .open-row { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; padding: var(--space-sm) 0; color: inherit; border-top: 1px solid var(--c-border); }
    .open-row:hover { text-decoration: none; color: var(--c-primary); }
  `],
})
export class CoursesComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly msg = MSG;
  courses = signal<CourseDto[]>([]);
  openSessions = signal<SessionDto[]>([]);
  error = signal('');
  showForm = signal(false);
  editId: number | null = null;
  formCode = '';
  formName = '';

  async ngOnInit() {
    try { await this.load(); } catch (e) { this.error.set(errorMessage(e)); }
  }

  async load() {
    const [courses, open] = await Promise.all([
      this.api.getCourses(),
      this.api.getSessions(undefined, 'OPEN').catch(() => [] as SessionDto[]),
    ]);
    this.courses.set(courses);
    this.openSessions.set(open);
  }

  edit(c: CourseDto) {
    this.editId = c.id;
    this.formCode = c.code;
    this.formName = c.name;
    this.error.set('');
    this.showForm.set(true);
  }

  cancelForm() {
    this.error.set('');
    this.showForm.set(false);
    this.editId = null;
    this.formCode = '';
    this.formName = '';
  }

  async save() {
    this.error.set('');
    const body = { code: this.formCode.trim(), name: this.formName.trim() };
    try {
      if (this.editId) await this.api.updateCourse(this.editId, body);
      else await this.api.createCourse(body);
      this.cancelForm();
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
