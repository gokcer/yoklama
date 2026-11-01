import { Component, inject, signal, computed, input, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import type { CourseDto, RosterEntryDto, RosterImportResult, SessionDto } from '../core/api.models';

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink, FormsModule],
  template: `
    <div class="container">
      <nav class="breadcrumb" aria-label="Konum"><a routerLink="/t">{{ msg.nav.courses }}</a> › {{ course()?.code }}</nav>
      <div class="page-header">
        <h1>{{ course() ? course()!.code + ' — ' + course()!.name : msg.courses.title }}</h1>
        <div class="flex-gap">
          <a class="btn btn-primary" [routerLink]="['/t/sessions/new']" [queryParams]="{ courseId: id() }">{{ msg.sessions.create }}</a>
          <button class="btn btn-outline text-danger" (click)="deleteCourse()" [disabled]="sessions().length > 0"
            [title]="sessions().length > 0 ? 'Oturumu olan ders silinemez' : 'Dersi sil'">Sil</button>
        </div>
      </div>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }

      <h2>{{ msg.courses.roster }} ({{ roster().length }})</h2>
      <div class="flex-gap mb-md" style="flex-wrap:wrap">
        <label class="btn btn-outline btn-sm" tabindex="0" (keydown.enter)="fileInput.click()" (keydown.space)="fileInput.click()">
          {{ msg.roster.import }}
          <input #fileInput type="file" accept=".csv,.txt,text/csv" (change)="onFileChange($event)" hidden />
        </label>
        <select class="form-input" [(ngModel)]="importMode" style="width:auto" aria-label="İçe aktarma modu">
          <option value="REPLACE">{{ msg.roster.importReplace }}</option>
          <option value="MERGE">{{ msg.roster.importMerge }}</option>
        </select>
      </div>
      <p class="text-sm text-secondary">CSV: <code>ogrenciNo;adSoyad</code> (başlık satırı isteğe bağlı, ayırıcı <code>;</code> veya <code>,</code>)</p>

      @if (importResult(); as r) {
        <div class="card mb-md text-sm">
          <strong>{{ msg.roster.importResult }}:</strong>
          {{ r.imported }} {{ msg.roster.imported }}, {{ r.skipped }} {{ msg.roster.skipped }}, {{ r.errors.length }} {{ msg.roster.errors }}
          @if (r.errors.length > 0) {
            <ul class="import-errors">
              @for (e of r.errors.slice(0, 50); track $index) { <li>Satır {{ e.line }}: {{ e.message }}</li> }
            </ul>
          }
        </div>
      }

      <div class="card mb-md">
        <form (ngSubmit)="addStudent()" class="flex-gap" style="flex-wrap:wrap">
          <input class="form-input" [(ngModel)]="newStudentNo" name="sno" [placeholder]="msg.roster.studentNo" inputmode="numeric" style="width:140px" />
          <input class="form-input" [(ngModel)]="newFullName" name="fname" [placeholder]="msg.roster.fullName" style="flex:1;min-width:140px" />
          <button class="btn btn-primary btn-sm" type="submit" [disabled]="!newStudentNo.trim() || !newFullName.trim()">{{ msg.roster.addStudent }}</button>
        </form>
      </div>

      @if (roster().length === 0) {
        <p class="text-secondary">{{ msg.roster.noData }}</p>
      } @else {
        @if (roster().length > 10) {
          <input class="form-input search-input mb-md" type="search" placeholder="Numara veya ad ara" aria-label="Öğrenci ara"
            [value]="rosterSearch()" (input)="rosterSearch.set($any($event.target).value)" />
        }
        <div class="roster-table">
          <table>
            <thead><tr><th>{{ msg.roster.studentNo }}</th><th>{{ msg.roster.fullName }}</th><th></th></tr></thead>
            <tbody>
              @for (r of filteredRoster(); track r.studentNo) {
                <tr>
                  <td class="text-mono">{{ r.studentNo }}</td>
                  <td>{{ r.fullName }}</td>
                  <td style="text-align:right"><button class="btn-icon text-danger" (click)="deleteStudent(r)" [attr.aria-label]="r.studentNo + ' öğrencisini sil'">✕</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <h2 class="mt-md">{{ msg.courses.sessions }} ({{ sessions().length }})</h2>
      @if (sessions().length === 0) {
        <p class="text-secondary">{{ msg.sessions.noData }}</p>
      }
      @for (s of sessions(); track s.id) {
        <a class="card mb-md session-card" [routerLink]="['/t/sessions', s.id]">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div>
              <strong>{{ s.title }}</strong>
              <span class="badge" [class.badge-info]="s.status === 'DRAFT'" [class.badge-success]="s.status === 'OPEN'" [class.badge-warning]="s.status === 'CLOSED'">{{ statusLabel(s.status) }}</span>
              <div class="text-sm text-secondary">{{ formatDate(s.openedAt ?? s.createdAt) }}@if (s.classroomName) { · {{ s.classroomName }} }</div>
            </div>
            <div class="text-sm text-secondary" style="text-align:right">
              {{ s.attendanceCount }} katılım
              @if (s.flaggedPendingCount > 0) { <div><span class="badge badge-warning">{{ s.flaggedPendingCount }} inceleme</span></div> }
            </div>
          </div>
        </a>
      }
    </div>
  `,
  styles: [`
    .session-card { display: block; text-decoration: none; color: inherit; transition: border-color 0.15s; }
    .session-card:hover { text-decoration: none; border-color: var(--c-primary); }
    .roster-table { overflow: auto; max-height: 480px; border: 1px solid var(--c-border); border-radius: var(--radius-md); background: var(--c-surface); }
    .roster-table thead th { position: sticky; top: 0; background: var(--c-surface); }
    .import-errors { margin: 8px 0 0; padding-left: 20px; max-height: 200px; overflow: auto; }
  `],
})
export class CourseDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly msg = MSG;
  readonly id = input.required<string>();
  readonly course = signal<CourseDto | null>(null);
  readonly roster = signal<RosterEntryDto[]>([]);
  readonly sessions = signal<SessionDto[]>([]);
  readonly importResult = signal<RosterImportResult | null>(null);
  readonly error = signal('');
  readonly rosterSearch = signal('');
  readonly filteredRoster = computed(() => {
    const q = this.rosterSearch().trim().toLocaleLowerCase('tr-TR');
    if (!q) return this.roster();
    return this.roster().filter(r => r.studentNo.includes(q) || r.fullName.toLocaleLowerCase('tr-TR').includes(q));
  });
  importMode = 'REPLACE';
  newStudentNo = '';
  newFullName = '';

  async ngOnInit() { await this.run(() => this.load()); }

  async load() {
    const [c, r, s] = await Promise.all([
      this.api.getCourse(this.id()),
      this.api.getRoster(+this.id()),
      this.api.getSessions(this.id()),
    ]);
    this.course.set(c);
    this.roster.set(r);
    this.sessions.set(s);
  }

  private async run(fn: () => Promise<void>) {
    this.error.set('');
    try { await fn(); } catch (e) { this.error.set(errorMessage(e)); }
  }

  async onFileChange(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';   // allow re-selecting the same file
    if (!file) return;
    if (this.importMode === 'REPLACE' && this.roster().length > 0
        && !confirm('Mevcut öğrenci listesi silinip dosyadaki liste yüklenecek. Devam edilsin mi?')) return;
    await this.run(async () => {
      this.importResult.set(await this.api.importRoster(+this.id(), file, this.importMode));
      await this.load();
    });
  }

  addStudent() {
    return this.run(async () => {
      await this.api.addRosterEntry(+this.id(), { studentNo: this.newStudentNo.trim(), fullName: this.newFullName.trim() });
      this.newStudentNo = '';
      this.newFullName = '';
      this.roster.set(await this.api.getRoster(+this.id()));
    });
  }

  deleteStudent(r: RosterEntryDto) {
    if (!confirm(`${r.studentNo} — ${r.fullName} listeden çıkarılsın mı?`)) return Promise.resolve();
    return this.run(async () => {
      await this.api.deleteRosterEntry(+this.id(), r.studentNo);
      this.roster.set(await this.api.getRoster(+this.id()));
    });
  }

  deleteCourse() {
    if (!confirm(this.msg.courses.deleteConfirm)) return Promise.resolve();
    return this.run(async () => {
      await this.api.deleteCourse(+this.id());
      this.router.navigateByUrl('/t');
    });
  }

  statusLabel(s: string) { return (MSG.sessions.status as Record<string, string>)[s] ?? s; }

  formatDate(iso: string) {
    try { return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
  }
}
