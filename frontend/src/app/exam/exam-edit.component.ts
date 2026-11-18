import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../shared/errors';
import type { ExamDto, QuestionType } from '../core/api.models';
import {
  LETTERS, MAX_QUESTIONS, TYPE_LABELS, QuestionDraft, applyKey, bulkRows, buildRequest, destructiveChanges, fromDto,
  keyString, moveRow, newRow, topicsOf, totalPoints, validate, validChoiceCount,
} from './exam-edit.logic';

@Component({
  selector: 'app-exam-edit',
  imports: [RouterLink],
  template: `
    <div class="container">
      <nav class="breadcrumb" aria-label="Konum">
        <a routerLink="/t">Dersler</a> ›
        @if (courseIdValue(); as cid) { <a [routerLink]="['/t/courses', cid]">{{ courseLabel() || 'Ders' }}</a> › }
        @if (isEdit()) { <a [routerLink]="['/t/exams', id()]">{{ title() || 'Sınav' }}</a> › Düzenle } @else { Yeni sınav }
      </nav>
      <div class="page-header">
        <h1>{{ isEdit() ? 'Sınavı düzenle' : 'Yeni sınav' }}</h1>
        <div class="flex-gap">
          @if (isEdit()) { <button class="btn btn-outline text-danger" type="button" (click)="deleteExam()" [disabled]="busy()">Sınavı sil</button> }
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy() || !loaded()">{{ busy() ? 'Kaydediliyor…' : 'Kaydet' }}</button>
        </div>
      </div>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (problems().length > 0 && showProblems()) {
        <div class="card mb-md" role="alert">
          <strong class="text-danger">Lütfen düzeltin:</strong>
          <ul class="problems">@for (p of problems(); track $index) { <li>{{ p }}</li> }</ul>
        </div>
      }

      <div class="card mb-md meta">
        <div class="form-group">
          <label for="exam-title">Başlık</label>
          <input id="exam-title" class="form-input" maxlength="200" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="Örn. Vize" />
        </div>
        <div class="form-group">
          <label for="exam-date">Sınav tarihi</label>
          <input id="exam-date" class="form-input" type="date" [value]="examDate()" (input)="examDate.set($any($event.target).value)" />
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="panel-title">Toplu ekle</h2>
        <div class="bulk">
          <label>Adet
            <input class="form-input" type="number" min="1" [max]="maxQuestions" [value]="bulkCount()" (input)="bulkCount.set(+$any($event.target).value)" />
          </label>
          <label>Tür
            <select class="form-input" [value]="bulkType()" (change)="bulkType.set($any($event.target).value)">
              @for (t of types; track t) { <option [value]="t" [selected]="bulkType() === t">{{ labels[t] }}</option> }
            </select>
          </label>
          @if (bulkType() === 'CHOICE') {
            <label>Seçenek sayısı
              <select class="form-input" [value]="bulkChoices()" (change)="bulkChoices.set(+$any($event.target).value)">
                @for (n of choiceOptions; track n) { <option [value]="n" [selected]="bulkChoices() === n">{{ n }}</option> }
              </select>
            </label>
          }
          <label>Soru başı puan
            <input class="form-input" type="number" min="0" step="any" [value]="bulkPoints()" (input)="bulkPoints.set(+$any($event.target).value)" />
          </label>
          <label>Konu (isteğe bağlı)
            <input class="form-input" list="exam-topics" maxlength="120" [value]="bulkTopic()" (input)="bulkTopic.set($any($event.target).value)" />
          </label>
          <button class="btn btn-outline" type="button" (click)="addBulk()">Ekle</button>
        </div>
      </div>

      <div class="card mb-md">
        <h2 class="panel-title">Cevap anahtarı</h2>
        <label class="key-label" for="key-input">Harfleri sırayla yazın veya yapıştırın (örn. ABCDA…). Boşluk, rakam ve noktalama yok sayılır.</label>
        <div class="flex-gap" style="flex-wrap:wrap">
          <input id="key-input" class="form-input text-mono" style="flex:1;min-width:200px" autocomplete="off" spellcheck="false"
            [value]="keyInput()" (input)="keyInput.set($any($event.target).value)" placeholder="ABCDABCD…" />
          <button class="btn btn-outline" type="button" (click)="applyKeyInput()" [disabled]="keyPreview().letters === 0 || keyPreview().choiceTotal === 0">Uygula</button>
        </div>
        @if (keyInput().trim()) {
          <p class="text-sm" [class.text-danger]="keyPreview().letters !== keyPreview().choiceTotal || keyPreview().outOfRange.length > 0">
            {{ keyPreview().letters }} harf girildi, {{ keyPreview().choiceTotal }} seçenekli soru var.
            @if (keyPreview().letters < keyPreview().choiceTotal) { Kalan {{ keyPreview().choiceTotal - keyPreview().letters }} sorunun anahtarı değişmeyecek. }
            @if (keyPreview().extra > 0) { Fazla {{ keyPreview().extra }} harf yok sayılacak. }
            @if (keyPreview().outOfRange.length > 0) { Seçenek aralığı dışında kalan harf: soru {{ keyPreview().outOfRange.join(', ') }}. }
          </p>
        }
        @if (keyApplied()) { <p class="text-sm text-secondary" role="status">{{ keyApplied() }}</p> }
        <p class="text-sm text-secondary">Mevcut anahtar ({{ answeredKeys() }}/{{ choiceCount() }}):
          <code class="text-mono key-current">{{ currentKey() || '—' }}</code> <span>(· = girilmemiş)</span></p>
      </div>

      <div class="summary text-secondary" aria-live="polite">
        <strong>{{ rows().length }}</strong> soru · toplam <strong>{{ total() }}</strong> puan
        <button class="btn btn-outline btn-sm" type="button" (click)="addRow()" [disabled]="rows().length >= maxQuestions">+ Soru ekle</button>
        @if (rows().length > 0) { <button class="btn btn-outline btn-sm text-danger" type="button" (click)="clearRows()">Tümünü sil</button> }
      </div>
      <datalist id="exam-topics">@for (t of topics(); track t) { <option [value]="t"></option> }</datalist>

      @if (rows().length === 0) {
        <p class="text-secondary">Henüz soru yok. "Toplu ekle" veya "Soru ekle" ile başlayın.</p>
      } @else {
        <div class="q-table">
          <table>
            <thead>
              <tr><th>#</th><th>Tür</th><th>Konu</th><th>Puan</th><th>Seçenek</th><th>Doğru</th><th><span class="sr-only">İşlemler</span></th></tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.key; let i = $index) {
                <tr>
                  <td class="text-mono">{{ i + 1 }}</td>
                  <td>
                    <select class="form-input" [attr.aria-label]="'Soru ' + (i + 1) + ' türü'" (change)="setType(r.key, $any($event.target).value)">
                      @for (t of types; track t) { <option [value]="t" [selected]="r.type === t">{{ labels[t] }}</option> }
                    </select>
                  </td>
                  <td><input class="form-input" list="exam-topics" maxlength="120" [attr.aria-label]="'Soru ' + (i + 1) + ' konusu'" [value]="r.topic" (input)="patch(r.key, { topic: $any($event.target).value })" /></td>
                  <td><input class="form-input num" type="number" min="0" step="any" [attr.aria-label]="'Soru ' + (i + 1) + ' puanı'" [value]="r.maxPoints ?? ''" (input)="setPoints(r.key, $any($event.target).value)" /></td>
                  <td>
                    @if (r.type === 'CHOICE') {
                      <select class="form-input num" [attr.aria-label]="'Soru ' + (i + 1) + ' seçenek sayısı'" (change)="setChoiceCount(r.key, +$any($event.target).value)">
                        @for (n of choiceOptions; track n) { <option [value]="n" [selected]="r.choiceCount === n">{{ n }}</option> }
                      </select>
                    } @else { <span class="text-secondary">—</span> }
                  </td>
                  <td>
                    @if (r.type === 'CHOICE') {
                      <select class="form-input num" [attr.aria-label]="'Soru ' + (i + 1) + ' doğru cevabı'" (change)="patch(r.key, { correctChoice: $any($event.target).value || null })">
                        <option value="" [selected]="!r.correctChoice">—</option>
                        @for (l of lettersFor(r); track l) { <option [value]="l" [selected]="r.correctChoice === l">{{ l }}</option> }
                      </select>
                    } @else { <span class="text-secondary">—</span> }
                  </td>
                  <td class="actions">
                    <button class="btn-icon" type="button" (click)="toggleText(r.key)" [attr.aria-expanded]="expanded().has(r.key)" [attr.aria-label]="'Soru ' + (i + 1) + ' metnini ' + (expanded().has(r.key) ? 'gizle' : 'göster')" [title]="'Soru metni'">{{ r.text.trim() ? '✎' : '¶' }}</button>
                    <button class="btn-icon" type="button" (click)="move(i, -1)" [disabled]="i === 0" [attr.aria-label]="'Soru ' + (i + 1) + ' yukarı taşı'">↑</button>
                    <button class="btn-icon" type="button" (click)="move(i, 1)" [disabled]="i === rows().length - 1" [attr.aria-label]="'Soru ' + (i + 1) + ' aşağı taşı'">↓</button>
                    <button class="btn-icon text-danger" type="button" (click)="remove(r.key)" [attr.aria-label]="'Soru ' + (i + 1) + ' sil'">✕</button>
                  </td>
                </tr>
                @if (expanded().has(r.key)) {
                  <tr class="text-row">
                    <td></td>
                    <td colspan="6">
                      <textarea class="form-input" rows="2" maxlength="2000" [attr.aria-label]="'Soru ' + (i + 1) + ' metni'" placeholder="Soru metni (isteğe bağlı)" [value]="r.text" (input)="patch(r.key, { text: $any($event.target).value })"></textarea>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }

      <div class="flex-gap mt-md">
        <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy() || !loaded()">{{ busy() ? 'Kaydediliyor…' : 'Kaydet' }}</button>
        <a class="btn btn-outline" [routerLink]="isEdit() ? ['/t/exams', id()] : cancelLink()">Vazgeç</a>
      </div>
    </div>
  `,
  styles: [`
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .meta .form-group { margin: 0; }
    .panel-title { margin: 0 0 8px; font-size: 1rem; }
    .bulk { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .bulk label, .key-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.875rem; }
    .bulk .form-input { width: auto; min-width: 90px; }
    .key-label { margin-bottom: 6px; }
    .key-current { word-break: break-all; }
    .summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .problems { margin: 6px 0 0; padding-left: 20px; }
    .q-table { overflow-x: auto; border: 1px solid var(--c-border); border-radius: var(--radius-md); background: var(--c-surface); }
    .q-table table { min-width: 640px; }
    .q-table .form-input { padding: 6px 8px; }
    .q-table .num { width: 76px; }
    .q-table .actions { white-space: nowrap; text-align: right; }
    .text-row textarea { width: 100%; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `],
})
export class ExamEditComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly id = input<string>();
  readonly courseId = input<string>();

  readonly types: QuestionType[] = ['CHOICE', 'OPEN', 'FREE'];
  readonly labels = TYPE_LABELS;
  readonly choiceOptions = [2, 3, 4, 5, 6];
  readonly maxQuestions = MAX_QUESTIONS;

  readonly exam = signal<ExamDto | null>(null);
  readonly courseLabel = signal('');
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly showProblems = signal(false);

  readonly title = signal('');
  readonly examDate = signal('');
  readonly rows = signal<QuestionDraft[]>([]);
  readonly expanded = signal<ReadonlySet<number>>(new Set());

  readonly bulkCount = signal(25);
  readonly bulkType = signal<QuestionType>('CHOICE');
  readonly bulkChoices = signal(4);
  readonly bulkPoints = signal(4);
  readonly bulkTopic = signal('');

  readonly keyInput = signal('');
  readonly keyApplied = signal('');

  readonly isEdit = computed(() => !!this.id());
  readonly courseIdValue = computed(() => this.exam()?.courseId ?? this.courseId() ?? null);
  readonly total = computed(() => totalPoints(this.rows()));
  readonly topics = computed(() => topicsOf(this.rows()));
  readonly problems = computed(() => validate(this.title(), this.rows()));
  readonly keyPreview = computed(() => applyKey(this.rows(), this.keyInput()));
  readonly currentKey = computed(() => keyString(this.rows()));
  readonly choiceCount = computed(() => this.rows().filter(r => r.type === 'CHOICE').length);
  readonly answeredKeys = computed(() => this.rows().filter(r => r.type === 'CHOICE' && r.correctChoice).length);
  readonly cancelLink = computed(() => (this.courseIdValue() ? ['/t/courses', this.courseIdValue()] : ['/t']));

  async ngOnInit() {
    try {
      if (this.id()) {
        const e = await this.api.getExam(this.id()!);
        this.exam.set(e);
        this.title.set(e.title);
        this.examDate.set(e.examDate ?? '');
        this.rows.set(e.questions.map(fromDto));
        this.courseLabel.set(`${e.courseCode} — ${e.courseName}`);
      } else if (this.courseId()) {
        const c = await this.api.getCourse(this.courseId()!);
        this.courseLabel.set(`${c.code} — ${c.name}`);
      } else {
        this.error.set('Ders belirtilmedi. Sınavı bir ders sayfasından oluşturun.');
        return;
      }
      this.loaded.set(true);
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  lettersFor(r: QuestionDraft) { return LETTERS.slice(0, r.choiceCount); }

  patch(key: number, p: Partial<QuestionDraft>) {
    this.rows.update(rs => rs.map(r => (r.key === key ? { ...r, ...p } : r)));
  }

  setType(key: number, type: QuestionType) {
    this.patch(key, type === 'CHOICE' ? { type } : { type, correctChoice: null });
  }

  setPoints(key: number, raw: string) {
    const v = raw.trim() === '' ? null : Number(raw);
    this.patch(key, { maxPoints: v != null && Number.isFinite(v) ? v : null });
  }

  setChoiceCount(key: number, n: number) {
    const choiceCount = validChoiceCount(n);
    this.rows.update(rs => rs.map(r => {
      if (r.key !== key) return r;
      const ok = r.correctChoice != null && LETTERS.indexOf(r.correctChoice) < choiceCount;
      return { ...r, choiceCount, correctChoice: ok ? r.correctChoice : null };
    }));
  }

  toggleText(key: number) {
    this.expanded.update(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  addRow() {
    if (this.rows().length >= MAX_QUESTIONS) return;
    const last = this.rows().at(-1);
    this.rows.update(rs => [...rs, newRow(last ? { type: last.type, choiceCount: last.choiceCount, maxPoints: last.maxPoints, topic: last.topic } : {})]);
  }

  addBulk() {
    const room = MAX_QUESTIONS - this.rows().length;
    const added = bulkRows({
      count: Math.min(this.bulkCount(), room), type: this.bulkType(), choiceCount: this.bulkChoices(),
      points: this.bulkPoints(), topic: this.bulkTopic(),
    });
    if (added.length === 0) return;
    this.rows.update(rs => [...rs, ...added]);
  }

  move(i: number, d: -1 | 1) { this.rows.update(rs => moveRow(rs, i, d)); }
  remove(key: number) { this.rows.update(rs => rs.filter(r => r.key !== key)); }
  clearRows() { if (confirm('Tüm sorular listeden silinsin mi?')) this.rows.set([]); }

  applyKeyInput() {
    const r = applyKey(this.rows(), this.keyInput());
    this.rows.set(r.rows);
    this.keyApplied.set(`${r.applied} / ${r.choiceTotal} seçenekli soruya cevap anahtarı uygulandı.`);
  }

  async save() {
    this.error.set('');
    this.showProblems.set(true);
    if (this.problems().length > 0) return;
    const exam = this.exam();
    if (exam && exam.resultCount > 0) {
      const d = destructiveChanges(exam.questions, this.rows());
      if (d.removed + d.typeChanged > 0
        && !confirm(`${d.removed} soru silinecek, ${d.typeChanged} sorunun türü değişecek. Bu sorulara girilmiş cevaplar silinecek. Devam edilsin mi?`)) return;
    }
    this.busy.set(true);
    try {
      const req = buildRequest(this.title(), this.examDate(), this.rows());
      const saved = exam ? await this.api.updateExam(exam.id, req) : await this.api.createExam(this.courseId()!, req);
      await this.router.navigateByUrl(`/t/exams/${saved.id}`);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async deleteExam() {
    const exam = this.exam();
    if (!exam) return;
    const extra = exam.resultCount > 0 ? ` ${exam.resultCount} öğrencinin sonucu da silinecek.` : '';
    if (!confirm(`"${exam.title}" sınavı silinsin mi?${extra} Bu işlem geri alınamaz.`)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.deleteExam(exam.id);
      await this.router.navigateByUrl(`/t/courses/${exam.courseId}`);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
