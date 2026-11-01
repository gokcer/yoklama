import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { MSG } from '../shared/messages';
import { errorMessage } from '../shared/errors';
import { AuthService } from '../core/auth.service';
import type { TeacherDto } from '../core/api.models';

@Component({
  selector: 'app-admin-teachers',
  imports: [FormsModule],
  template: `
    <div class="container">
      <div class="page-header">
        <h1>{{ msg.admin.title }}</h1>
        <button class="btn btn-primary" (click)="cancelForm(); showForm.set(true)">{{ msg.admin.create }}</button>
      </div>

      @if (showForm()) {
        <div class="card mb-md">
          <form (ngSubmit)="save()">
            <div class="form-group"><label>{{ msg.admin.username }}</label><input class="form-input" [(ngModel)]="formUser" name="u" required [disabled]="!!editId" autocomplete="off" /></div>
            <div class="form-group"><label>{{ msg.admin.displayName }}</label><input class="form-input" [(ngModel)]="formDisplay" name="d" required /></div>
            <div class="form-group"><label>{{ msg.admin.password }}</label><input class="form-input" type="password" [(ngModel)]="formPass" name="p" [required]="!editId" minlength="8" autocomplete="new-password" [placeholder]="editId ? 'Değiştirmek için doldurun' : 'En az 8 karakter'" /></div>
            <div class="form-group"><label>{{ msg.admin.role }}</label>
              <select class="form-input" [(ngModel)]="formRole" name="r" [disabled]="!!editId">
                <option value="TEACHER">{{ roleLabel('TEACHER') }}</option><option value="ADMIN">{{ roleLabel('ADMIN') }}</option>
              </select>
            </div>
            @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
            <div class="flex-gap">
              <button class="btn btn-primary" type="submit">Kaydet</button>
              <button class="btn btn-outline" type="button" (click)="cancelForm()">İptal</button>
            </div>
          </form>
        </div>
      }

      @if (teachers().length === 0 && !showForm()) {
        <p class="text-secondary">{{ msg.admin.noData }}</p>
      }

      @if (error() && !showForm()) { <p class="form-error" role="alert">{{ error() }}</p> }
      <div style="overflow-x:auto"><table>
        <thead><tr><th>{{ msg.admin.username }}</th><th>{{ msg.admin.displayName }}</th><th>{{ msg.admin.role }}</th><th>{{ msg.admin.enabled }}</th><th></th></tr></thead>
        <tbody>
          @for (t of teachers(); track t.id) {
            <tr>
              <td>{{ t.username }}</td>
              <td>{{ t.displayName }}</td>
              <td><span class="badge badge-info">{{ roleLabel(t.role) }}</span></td>
              <td><span class="badge" [class.badge-success]="t.enabled" [class.badge-danger]="!t.enabled">{{ t.enabled ? 'Evet' : 'Hayır' }}</span></td>
              <td class="flex-gap">
                <button class="btn btn-outline btn-sm" (click)="edit(t)">Düzenle</button>
                <button class="btn btn-outline btn-sm" (click)="toggleEnabled(t)" [disabled]="t.id === auth.user()?.id">{{ t.enabled ? 'Devre dışı' : 'Etkinleştir' }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table></div>
    </div>
  `,
})
export class AdminTeachersComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly msg = MSG;
  readonly auth = inject(AuthService);
  teachers = signal<TeacherDto[]>([]);
  error = signal('');
  showForm = signal(false);
  editId: number | null = null;
  formUser = ''; formDisplay = ''; formPass = ''; formRole = 'TEACHER';

  async ngOnInit() {
    try { await this.load(); } catch (e) { this.error.set(errorMessage(e)); }
  }
  async load() { this.teachers.set(await this.api.getTeachers()); }

  cancelForm() { this.error.set(''); this.showForm.set(false); this.editId = null; this.formUser = ''; this.formDisplay = ''; this.formPass = ''; this.formRole = 'TEACHER'; }

  roleLabel(r: string) { return r === 'ADMIN' ? 'Yönetici' : r === 'TEACHER' ? 'Öğretim üyesi' : r; }

  edit(t: TeacherDto) {
    this.error.set('');
    this.editId = t.id; this.formUser = t.username; this.formDisplay = t.displayName; this.formRole = t.role; this.formPass = '';
    this.showForm.set(true);
  }

  async save() {
    this.error.set('');
    try {
      if (this.editId) {
        const data: Record<string, unknown> = { displayName: this.formDisplay };
        if (this.formPass) data['password'] = this.formPass;
        await this.api.updateTeacher(this.editId, data as never);
      } else {
        await this.api.createTeacher({ username: this.formUser.trim(), password: this.formPass, displayName: this.formDisplay, role: this.formRole });
      }
      this.cancelForm(); await this.load();
    } catch (e) {
      const details = (e as { details?: Record<string, string> }).details;
      this.error.set(`${errorMessage(e)} ${details ? Object.values(details).join(' ') : ''}`.trim());
    }
  }

  async toggleEnabled(t: TeacherDto) {
    this.error.set('');
    try {
      await this.api.updateTeacher(t.id, { enabled: !t.enabled });
      await this.load();
    } catch (e) { this.error.set(errorMessage(e)); }
  }
}
