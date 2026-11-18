import {
  Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, effect, inject, input, signal,
  untracked, viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../shared/errors';
import type { ExamDto, ExamResultDto, QuestionDto, RosterEntryDto } from '../core/api.models';
import {
  STATUS_LABEL, type Cell, type ResultSummary, type Sheet, type StudentRow,
  bubbleMark, buildRequest, buildStudentList, clickBubble, emptySheet, filterStudents, formatPoints, groupRuns,
  invalidQuestions, lettersFor, nextStudent, pointsError, progress, reduceKey, setActive, sheetFromResult,
  sheetSignature, sortQuestions, studentStatus, summarize, unenteredChoices, updateCell, upsertResult,
} from './exam-entry.logic';

const NUM = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 });
const TYPE_LABEL: Record<string, string> = { CHOICE: 'Seçenekli', OPEN: 'Açık uçlu', FREE: 'Serbest' };
const UNSAVED = 'Kaydedilmemiş değişiklikler var. Kaydetmeden devam edilsin mi?';

/** Fast answer-entry tool (docs/11-EXAMS.md §4.2). State logic lives in exam-entry.logic.ts. */
@Component({
  selector: 'app-exam-entry',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="container-wide" (keydown)="onHostKey($event)">
      <nav class="breadcrumb" aria-label="Konum">
        <a [href]="'/t/exams/' + id()" (click)="leave($event, '/t/exams/' + id())">{{ exam()?.title ?? 'Sınav' }}</a> › Cevap girişi
      </nav>
      <div class="page-header">
        <h1>Cevap girişi</h1>
        @if (exam(); as e) { <span class="text-secondary text-sm">{{ e.courseCode }} · {{ e.title }} · {{ questions().length }} soru · {{ num(e.totalPoints) }} puan</span> }
      </div>
      @if (error()) {
        <div class="alert alert-error" role="alert"><span>{{ error() }}</span><button class="btn-icon" (click)="error.set('')" aria-label="Kapat">✕</button></div>
      }

      @if (!loaded()) {
        @if (!error()) { <p class="text-secondary">Yükleniyor…</p> }
      } @else if (questions().length === 0) {
        <div class="card">
          <p>Bu sınavda henüz soru yok.</p>
          <a class="btn btn-primary btn-sm" [href]="'/t/exams/' + id() + '/edit'" (click)="leave($event, '/t/exams/' + id() + '/edit')">Soruları tanımla</a>
        </div>
      } @else {
        <div class="layout">
          <aside class="students" [class.open]="listOpen()" aria-label="Öğrenciler">
            <button type="button" class="btn btn-outline btn-sm list-toggle" (click)="listOpen.set(!listOpen())" [attr.aria-expanded]="listOpen()">
              <span>Öğrenciler · {{ doneCount() }}/{{ rows().length }} girildi</span><span aria-hidden="true">{{ listOpen() ? '▴' : '▾' }}</span>
            </button>
            <div class="students-body">
              <input class="form-input search" type="search" placeholder="Numara veya ad ara" aria-label="Öğrenci ara"
                [value]="search()" (input)="search.set($any($event.target).value)" (keydown.enter)="pickFirstMatch($event)" />
              <ul class="student-list">
                @for (r of filteredRows(); track r.studentNo) {
                  <li>
                    <button type="button" class="student" [class.selected]="r.studentNo === current()" (click)="selectStudent(r.studentNo)"
                      [attr.aria-current]="r.studentNo === current() ? 'true' : null">
                      <span class="sno text-mono">{{ r.studentNo }}</span>
                      <span class="sname">{{ r.fullName || '—' }}@if (!r.inRoster) { <span class="text-secondary" title="Ders listesinde yok"> *</span> }</span>
                      <span class="badge" [class.badge-warning]="status(r) === 'partial'" [class.badge-success]="status(r) === 'complete'"
                        [class.badge-none]="status(r) === 'none'">{{ statusLabel(r) }}@if (r.result) { · {{ num(r.result.totalPoints) }} }</span>
                    </button>
                  </li>
                } @empty {
                  <li class="text-secondary text-sm empty">Eşleşen öğrenci yok</li>
                }
              </ul>
              <form class="manual" (submit)="addManual($event)">
                <span class="text-sm manual-title">Listede olmayan öğrenci</span>
                <input class="form-input" name="mno" placeholder="Öğrenci no" inputmode="numeric" autocomplete="off" aria-label="Öğrenci no"
                  [value]="manualNo()" (input)="manualNo.set($any($event.target).value)" />
                <input class="form-input" name="mname" placeholder="Ad soyad (isteğe bağlı)" autocomplete="off" aria-label="Ad soyad"
                  [value]="manualName()" (input)="manualName.set($any($event.target).value)" />
                <button class="btn btn-outline btn-sm" type="submit" [disabled]="!manualNo().trim()">Seç</button>
              </form>
            </div>
          </aside>

          <section class="main">
            @if (currentRow(); as row) {
              <div class="student-bar">
                <div class="who">
                  <strong class="text-mono">{{ row.studentNo }}</strong>
                  <span>{{ row.fullName }}</span>
                  @if (!row.inRoster) { <span class="badge badge-warning">Listede yok</span> }
                </div>
                <div class="prog text-sm" aria-live="polite">
                  <strong>{{ prog().entered }}/{{ prog().total }}</strong> girildi
                  @if (dirty()) { <span class="badge badge-warning">Kaydedilmedi</span> }
                </div>
                <div class="flex-gap">
                  @if (row.result) {
                    <button type="button" class="btn btn-outline btn-sm text-danger" (click)="deleteResult()" [disabled]="saving()">Sonucu sil</button>
                  }
                  <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="saving()">{{ saving() ? 'Kaydediliyor…' : 'Kaydet' }}</button>
                </div>
              </div>

              @if (shownResult(); as s) {
                <div class="result card" role="status">
                  <div class="result-score">
                    <span class="big">{{ num(s.total) }}</span><span class="text-secondary"> / {{ num(s.max) }}</span>
                    @if (s.percent !== null) { <span class="pct">{{ pct(s.percent) }}</span> }
                  </div>
                  @if (s.choiceCount > 0) {
                    <div class="counts">
                      @if (s.pendingKey < s.choiceCount) {
                        <span class="text-success">Doğru <b>{{ s.correct }}</b></span>
                        <span class="text-danger">Yanlış <b>{{ s.wrong }}</b></span>
                      }
                      <span>Boş <b>{{ s.blank }}</b></span>
                    </div>
                  }
                  @if (s.pendingKey > 0) {
                    <p class="text-sm note">{{ s.pendingKey }} seçenekli sorunun cevap anahtarı yok; bu soruların puanı anahtar girilince hesaplanacak.</p>
                  }
                  @if (s.ungraded > 0) { <p class="text-sm note">{{ s.ungraded }} açık uçlu/serbest soru puanlanmadı.</p> }
                  <div class="result-actions">
                    @if (nextRow(); as n) {
                      <button #nextBtn type="button" class="btn btn-primary" (click)="selectStudent(n.studentNo)">
                        Sonraki öğrenci: {{ n.studentNo }} {{ n.fullName }} →
                      </button>
                    } @else {
                      <span class="text-sm text-secondary">Sonucu girilmemiş başka liste öğrencisi kalmadı.</span>
                    }
                  </div>
                </div>
              }

              <div class="active-info text-sm" aria-live="polite">
                @if (activeQuestion(); as q) {
                  <strong>Soru {{ q.position }}</strong>
                  <span class="text-secondary"> · {{ typeLabel(q) }} · {{ num(q.maxPoints) }} p</span>
                  @if (q.topic) { <span class="topic">{{ q.topic }}</span> }
                  @if (q.text) { <span class="qtext text-secondary">{{ q.text }}</span> }
                }
              </div>

              <p class="hint text-sm" aria-label="Klavye kısayolları">
                <kbd>A</kbd>–<kbd>F</kbd> işaretle · <kbd>Boşluk</kbd>/<kbd>-</kbd> boş · <kbd>⌫</kbd> geri dön ve sil ·
                <kbd>←</kbd><kbd>→</kbd>/<kbd>Tab</kbd> gezin · <kbd>Enter</kbd> son soruda kaydet · <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> kaydet
                @if (!sheetFocused() && activeQuestion()?.type === 'CHOICE') { <span class="focus-tip">· yazmak için kağıda tıklayın</span> }
              </p>

              <div #sheetBox class="sheet" tabindex="0" role="group" aria-label="Cevap kağıdı"
                (keydown)="onSheetKey($event)" (focus)="sheetFocused.set(true)" (blur)="sheetFocused.set(false)">
                @for (run of runs(); track $index) {
                  @if (run.kind === 'choice') {
                    <div class="bubble-block">
                      @for (i of run.indices; track i) {
                        @let q = questions()[i];
                        @let c = sheet().cells[i];
                        <div class="qrow" [id]="'q-' + i" [class.active]="i === sheet().active" [class.done]="c.entered"
                          [class.cue]="cue() === i" [attr.title]="questionTitle(q)" (click)="activate(i)">
                          <span class="qno">{{ q.position }}</span>
                          @for (L of letters(q); track L) {
                            @let m = marks() ? mark(q, c, L) : null;
                            <button type="button" class="bubble" tabindex="-1"
                              [class.on]="c.entered && c.answer === L" [class.correct]="m === 'correct'" [class.wrong]="m === 'wrong'" [class.key]="m === 'key'"
                              [attr.aria-label]="'Soru ' + q.position + ' ' + L" [attr.aria-pressed]="c.entered && c.answer === L"
                              (mousedown)="$event.preventDefault()" (click)="onBubble($event, i, L)">{{ L }}</button>
                          }
                          <span class="blank-mark" [class.show]="c.entered && !c.answer" title="Boş bırakıldı">–</span>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="score-block">
                      @for (i of run.indices; track i) {
                        @let q = questions()[i];
                        @let c = sheet().cells[i];
                        @let err = pointsErr(q, c);
                        <div class="score-card" [id]="'q-' + i" [class.active]="i === sheet().active" (click)="onCardClick($event, i)">
                          <div class="score-head">
                            <span class="qno">{{ q.position }}</span>
                            <span class="badge badge-info">{{ typeLabel(q) }}</span>
                            @if (q.topic) { <span class="topic">{{ q.topic }}</span> }
                            @if (q.text) { <span class="qtext text-secondary text-sm">{{ q.text }}</span> }
                          </div>
                          <div class="score-inputs">
                            <input class="form-input pts" [id]="'pts-' + i" type="text" inputmode="decimal" autocomplete="off"
                              [class.invalid]="!!err" [value]="c.points" [attr.aria-label]="'Soru ' + q.position + ' puanı'"
                              [attr.aria-invalid]="!!err" (input)="onPoints(i, $any($event.target).value)"
                              (focus)="activate(i, false)" (keydown)="onPointsKey($event, i)" />
                            <span class="text-secondary">/ {{ num(q.maxPoints) }}</span>
                            <button type="button" class="btn btn-outline btn-sm" (mousedown)="$event.preventDefault()" (click)="quickPoints(i, q.maxPoints)">Tam</button>
                            <button type="button" class="btn btn-outline btn-sm" (mousedown)="$event.preventDefault()" (click)="quickPoints(i, 0)">0</button>
                          </div>
                          @if (err) { <span class="form-error">{{ err }}</span> }
                          @if (q.type === 'OPEN') {
                            <textarea class="form-input answer" rows="2" placeholder="Cevap (isteğe bağlı)" [attr.aria-label]="'Soru ' + q.position + ' cevabı'"
                              [value]="c.text" (input)="onText(i, $any($event.target).value)" (focus)="activate(i, false)"></textarea>
                          }
                        </div>
                      }
                    </div>
                  }
                }
              </div>
            } @else {
              <div class="card pick">
                <p>Cevaplarını girmek için listeden bir öğrenci seçin.</p>
                @if (nextRow(); as n) {
                  <button #startBtn type="button" class="btn btn-primary" (click)="selectStudent(n.studentNo)">Başla: {{ n.studentNo }} {{ n.fullName }} →</button>
                }
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: var(--space-md); align-items: start; }
    .students { position: sticky; top: var(--space-sm); background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: var(--radius-md); padding: var(--space-sm); min-width: 0; }
    .list-toggle { display: none; width: 100%; justify-content: space-between; }
    .students-body { display: flex; flex-direction: column; gap: var(--space-sm); }
    .search { padding: 6px 10px; font-size: 0.875rem; }
    .student-list { list-style: none; margin: 0; padding: 0; max-height: calc(100vh - 300px); min-height: 120px; overflow: auto; }
    .student { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px; align-items: center; width: 100%;
      padding: 6px 8px; border: none; border-radius: var(--radius-sm); background: transparent; text-align: left; cursor: pointer; font-size: 0.85rem; }
    .student:hover { background: var(--c-primary-light); }
    .student.selected { background: var(--c-primary); color: #fff; }
    .student.selected .text-secondary { color: inherit; }
    .sname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge { text-transform: none; white-space: nowrap; }
    .badge-none { background: var(--c-bg); color: var(--c-text-secondary); border: 1px solid var(--c-border); }
    .empty { padding: 6px 8px; }
    .manual { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--c-border); padding-top: var(--space-sm); }
    .manual .form-input { padding: 6px 10px; font-size: 0.875rem; }
    .manual-title { font-weight: 500; }

    .main { min-width: 0; }
    .student-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md); background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-md); }
    .who { display: flex; flex-wrap: wrap; gap: var(--space-sm); align-items: center; min-width: 0; }
    .prog { display: flex; gap: var(--space-sm); align-items: center; }

    .result { margin-top: var(--space-sm); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm) var(--space-lg); padding: var(--space-md); }
    .result-score .big { font-size: 1.75rem; font-weight: 700; }
    .result-score .pct { margin-left: var(--space-sm); font-weight: 600; color: var(--c-primary); }
    .counts { display: flex; gap: var(--space-md); }
    .note { margin: 0; flex-basis: 100%; color: var(--c-text-secondary); }
    .result-actions { flex-basis: 100%; }

    .active-info { margin-top: var(--space-sm); min-height: 1.5em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .topic { display: inline-block; margin-left: var(--space-sm); padding: 0 6px; border-radius: var(--radius-sm);
      background: var(--c-primary-light); color: var(--c-primary); font-size: 0.75rem; }
    .qtext { margin-left: var(--space-sm); }
    .hint { margin: 4px 0 var(--space-sm); color: var(--c-text-secondary); line-height: 1.8; }
    kbd { font-family: var(--font-mono); font-size: 0.75rem; padding: 0 4px; border: 1px solid var(--c-border);
      border-bottom-width: 2px; border-radius: 3px; background: var(--c-surface); }
    .focus-tip { color: var(--c-warning); font-weight: 600; filter: brightness(0.8); }

    .sheet { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-md); padding: var(--space-sm); outline: none; }
    .sheet:focus { border-color: var(--c-primary); box-shadow: 0 0 0 2px var(--c-primary-light); }
    .bubble-block { columns: 12.5rem; column-gap: var(--space-lg); padding: 2px 0; }
    .bubble-block + .score-block, .score-block + .bubble-block { margin-top: var(--space-sm); }
    .qrow { display: flex; align-items: center; gap: 3px; padding: 2px 6px; margin-bottom: 2px; border: 1px solid transparent;
      border-radius: 999px; break-inside: avoid; cursor: pointer; }
    .qrow.active { background: var(--c-primary-light); border-color: var(--c-primary); }
    .qno { min-width: 2em; margin-right: 4px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;
      font-size: 0.8rem; color: var(--c-text-secondary); }
    .qrow.done .qno { color: var(--c-text); }
    .qrow.active .qno { color: var(--c-primary); }
    .bubble { width: 26px; height: 26px; padding: 0; border: 1.5px solid #9e9e9e; border-radius: 50%; background: var(--c-surface);
      color: var(--c-text-secondary); font-size: 0.72rem; font-weight: 600; cursor: pointer; display: inline-flex;
      align-items: center; justify-content: center; flex: none; }
    .bubble:hover { border-color: var(--c-primary); }
    .bubble.on { background: var(--c-text); border-color: var(--c-text); color: #fff; }
    .bubble.on.correct { background: var(--c-success); border-color: var(--c-success); }
    .bubble.on.wrong { background: var(--c-danger); border-color: var(--c-danger); }
    .bubble.key { border: 2px solid var(--c-success); color: var(--c-success); }
    .blank-mark { visibility: hidden; width: 14px; text-align: center; font-weight: 700; color: var(--c-text-secondary); }
    .blank-mark.show { visibility: visible; }
    .qrow.cue { animation: cue 0.3s; border-color: var(--c-danger); }
    @keyframes cue { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
    @media (pointer: coarse) { .bubble { width: 32px; height: 32px; } .bubble-block { columns: 15rem; } }

    .score-block { display: flex; flex-direction: column; gap: var(--space-sm); }
    .score-card { display: flex; flex-direction: column; gap: 6px; padding: var(--space-sm); border: 1px solid var(--c-border); border-radius: var(--radius-md); }
    .score-card.active { border-color: var(--c-primary); background: var(--c-primary-light); }
    .score-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--space-sm); min-width: 0; }
    .score-head .topic, .score-head .qtext { margin-left: 0; }
    .score-inputs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
    .pts { width: 6em; padding: 6px 8px; text-align: right; }
    .answer { width: 100%; padding: 6px 8px; font-size: 0.875rem; resize: vertical; }
    .pick { text-align: center; }

    @media (max-width: 760px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .students { position: static; }
      .list-toggle { display: flex; }
      .students-body { display: none; margin-top: var(--space-sm); }
      .students.open .students-body { display: flex; }
      .student-list { max-height: 50vh; }
    }
  `],
})
export class ExamEntryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly id = input.required<string>();
  /** `?student=` query param (component input binding). */
  readonly student = input<string>();

  private readonly sheetEl = viewChild<ElementRef<HTMLElement>>('sheetBox');
  private readonly nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');
  private readonly startBtn = viewChild<ElementRef<HTMLButtonElement>>('startBtn');

  readonly exam = signal<ExamDto | null>(null);
  readonly results = signal<ExamResultDto[]>([]);
  readonly roster = signal<RosterEntryDto[]>([]);
  /** Students added via the "not in roster" form (or a URL number nobody knows yet). */
  readonly extras = signal<RosterEntryDto[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly search = signal('');
  readonly manualNo = signal('');
  readonly manualName = signal('');
  readonly listOpen = signal(true);
  readonly sheetFocused = signal(false);
  readonly cue = signal<number | null>(null);

  readonly current = signal<string | null>(null);
  readonly sheet = signal<Sheet>(emptySheet(0));
  private readonly baseline = signal('');
  private readonly saved = signal<{ studentNo: string; summary: ResultSummary } | null>(null);

  readonly questions = computed(() => sortQuestions(this.exam()?.questions ?? []));
  readonly runs = computed(() => groupRuns(this.questions()));
  readonly rows = computed(() => buildStudentList(this.roster(), this.results(), this.extras()));
  readonly filteredRows = computed(() => filterStudents(this.rows(), this.search()));
  readonly doneCount = computed(() => this.rows().filter(r => r.result).length);
  readonly currentRow = computed(() => this.rows().find(r => r.studentNo === this.current()) ?? null);
  readonly nextRow = computed(() => nextStudent(this.rows(), this.current()));
  readonly prog = computed(() => progress(this.questions(), this.sheet()));
  readonly activeQuestion = computed(() => this.questions()[this.sheet().active] ?? null);
  readonly dirty = computed(() => this.current() !== null && sheetSignature(this.questions(), this.sheet()) !== this.baseline());
  /** Right/wrong marks only on a saved, unchanged result (no key hints while typing). */
  readonly marks = computed(() => !!this.currentRow()?.result && !this.dirty());
  readonly shownResult = computed(() => {
    const s = this.saved();
    return s && s.studentNo === this.current() && !this.dirty() ? s.summary : null;
  });

  private cueTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.cueTimer));
    // URL → selection (initial load, back/forward). In-page selection sets `current` first, so this is a no-op then.
    effect(() => {
      const no = this.student()?.trim() || null;
      if (!this.loaded()) return;
      untracked(() => this.applyUrlStudent(no));
    });
  }

  async ngOnInit() {
    try {
      const [exam, results] = await Promise.all([this.api.getExam(this.id()), this.api.getExamResults(this.id())]);
      this.exam.set(exam);
      this.results.set(results);
      try {
        this.roster.set(await this.api.getRoster(exam.courseId));
      } catch (e) {
        this.error.set(errorMessage(e));
      }
      this.loaded.set(true);
      if (!this.student()) this.afterRender(() => this.startBtn()?.nativeElement.focus());
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  /* ---------- template helpers ---------- */

  num(n: number) { return NUM.format(n); }
  pct(n: number) { return PCT.format(n); }
  letters(q: QuestionDto) { return lettersFor(q); }
  mark(q: QuestionDto, c: Cell, letter: string) { return bubbleMark(q, c, letter); }
  pointsErr(q: QuestionDto, c: Cell) { return pointsError(q, c.points); }
  typeLabel(q: QuestionDto) { return TYPE_LABEL[q.type] ?? q.type; }
  status(r: StudentRow) { return studentStatus(r); }
  statusLabel(r: StudentRow) { return STATUS_LABEL[studentStatus(r)]; }
  questionTitle(q: QuestionDto) {
    return [q.topic, q.text].filter(Boolean).join(' — ') || null;
  }

  /* ---------- student selection ---------- */

  selectStudent(no: string) {
    if (no === this.current()) { this.focusActive(); return; }
    if (this.dirty() && !confirm(UNSAVED)) return;
    this.open(no);
    this.syncUrl(no, false);
  }

  pickFirstMatch(e: Event) {
    e.preventDefault();
    const first = this.filteredRows()[0];
    if (first) this.selectStudent(first.studentNo);
  }

  addManual(e: Event) {
    e.preventDefault();
    const no = this.manualNo().trim();
    if (!no) return;
    const name = this.manualName().trim();
    this.extras.update(xs => {
      const rest = xs.filter(x => x.studentNo !== no);
      const prev = xs.find(x => x.studentNo === no);
      return [...rest, { studentNo: no, fullName: name || prev?.fullName || '' }];
    });
    this.manualNo.set('');
    this.manualName.set('');
    this.selectStudent(no);
  }

  private applyUrlStudent(no: string | null) {
    if (no === this.current()) return;
    if (this.dirty() && !confirm(UNSAVED)) { this.syncUrl(this.current(), true); return; }
    this.open(no);
  }

  private open(no: string | null) {
    const qs = this.questions();
    if (no !== null && !this.rows().some(r => r.studentNo === no)) {
      this.extras.update(xs => [...xs, { studentNo: no, fullName: '' }]);
    }
    const row = no === null ? null : this.rows().find(r => r.studentNo === no) ?? null;
    const s = sheetFromResult(qs, row?.result);
    this.current.set(no);
    this.sheet.set(s);
    this.baseline.set(sheetSignature(qs, s));
    this.saved.set(null);
    this.error.set('');
    if (no !== null) {
      this.listOpen.set(false);
      this.focusActive();
    }
  }

  private syncUrl(no: string | null, replaceUrl: boolean) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { student: no }, queryParamsHandling: 'merge', replaceUrl });
  }

  /* ---------- sheet interaction ---------- */

  onSheetKey(e: KeyboardEvent) {
    // Only sheet-level keys: inputs, textareas and buttons inside the sheet keep their own behaviour.
    if (e.target !== this.sheetEl()?.nativeElement || e.isComposing) return;
    const o = reduceKey(this.questions(), this.sheet(), e);
    if (!o.handled) return;
    e.preventDefault();
    this.sheet.set(o.sheet);
    if (o.rejected !== undefined) this.flashCue(o.rejected);
    if (o.save) { void this.save(); return; }
    this.focusActive();
  }

  /** Ctrl/⌘+Enter anywhere on the page saves (events the sheet/fields already handled are skipped). */
  onHostKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || this.current() === null) return;
    e.preventDefault();
    void this.save();
  }

  activate(i: number, focus = true) {
    this.sheet.update(s => setActive(s, i));
    if (focus) this.focusActive();
  }

  onBubble(e: MouseEvent, i: number, letter: string) {
    e.stopPropagation();
    this.sheet.update(s => clickBubble(this.questions(), s, i, letter));
    this.focusActive();
  }

  onCardClick(e: MouseEvent, i: number) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, button')) return;
    this.activate(i);
  }

  onPoints(i: number, value: string) {
    this.sheet.update(s => updateCell(s, i, { points: value }));
  }

  onText(i: number, value: string) {
    this.sheet.update(s => updateCell(s, i, { text: value }));
  }

  onPointsKey(e: KeyboardEvent, i: number) {
    if (e.isComposing || e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !mod && !e.shiftKey) {
      e.preventDefault();
      if (i >= this.questions().length - 1) void this.save();
      else this.activate(i + 1);
    } else if (!mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.activate(i + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.sheetEl()?.nativeElement.focus({ preventScroll: true });
    }
  }

  quickPoints(i: number, value: number) {
    this.sheet.update(s => updateCell(s, i, { points: formatPoints(value) }));
    this.activate(i < this.questions().length - 1 ? i + 1 : i);
  }

  private flashCue(i: number) {
    clearTimeout(this.cueTimer);
    this.cue.set(i);
    this.cueTimer = setTimeout(() => this.cue.set(null), 350);
  }

  /** Focuses the sheet (CHOICE) or the points field (OPEN/FREE) of the active question and scrolls it into view. */
  private focusActive() {
    this.afterRender(() => {
      const i = this.sheet().active;
      const q = this.questions()[i];
      if (!q) return;
      const root = this.host.nativeElement;
      if (q.type === 'CHOICE') {
        this.sheetEl()?.nativeElement.focus({ preventScroll: true });
      } else {
        const inp = root.querySelector<HTMLInputElement>(`#pts-${i}`);
        if (inp && document.activeElement !== inp) { inp.focus({ preventScroll: true }); inp.select(); }
      }
      root.querySelector(`#q-${i}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  private afterRender(fn: () => void) {
    afterNextRender(fn, { injector: this.injector });
  }

  /* ---------- save / delete ---------- */

  async save() {
    const no = this.current();
    const exam = this.exam();
    if (no === null || !exam || this.saving()) return;
    const qs = this.questions();
    const invalid = invalidQuestions(qs, this.sheet());
    if (invalid.length > 0) {
      this.error.set(`Geçersiz puan: ${invalid.map(i => qs[i].position).join(', ')}. soru`);
      this.activate(invalid[0]);
      return;
    }
    const missing = unenteredChoices(qs, this.sheet());
    if (missing.length > 0) {
      const list = missing.slice(0, 15).map(i => qs[i].position).join(', ') + (missing.length > 15 ? '…' : '');
      if (!confirm(`${missing.length} seçenekli soru girilmedi (${list}). Bu sorular boş olarak kaydedilsin mi?`)) {
        this.activate(missing[0]);
        return;
      }
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const req = buildRequest(qs, this.sheet(), this.currentRow()?.fullName);
      const res = await this.api.saveExamResult(exam.id, no, req);
      this.results.update(rs => upsertResult(rs, res));
      if (this.current() !== no) return;   // switched away (e.g. browser back) while saving
      const s: Sheet = { ...sheetFromResult(qs, res), active: this.sheet().active };
      this.sheet.set(s);
      this.baseline.set(sheetSignature(qs, s));
      this.saved.set({ studentNo: no, summary: summarize(qs, exam.totalPoints, res) });
      this.afterRender(() => {
        const btn = this.nextBtn()?.nativeElement;
        if (btn) btn.focus(); else this.sheetEl()?.nativeElement.focus({ preventScroll: true });
      });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  async deleteResult() {
    const no = this.current();
    const exam = this.exam();
    if (no === null || !exam || !this.currentRow()?.result) return;
    if (!confirm(`${no} numaralı öğrencinin bu sınavdaki sonucu silinsin mi? Bu işlem geri alınamaz.`)) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.deleteExamResult(exam.id, no);
      // Keep a non-roster student listed (and selected) after their only trace, the result, is gone.
      const row = this.currentRow();
      if (row && !row.inRoster && !this.extras().some(x => x.studentNo === no)) {
        this.extras.update(xs => [...xs, { studentNo: no, fullName: row.fullName }]);
      }
      this.results.update(rs => rs.filter(r => r.studentNo !== no));
      if (this.current() === no) {
        const s = emptySheet(this.questions().length);
        this.sheet.set(s);
        this.baseline.set(sheetSignature(this.questions(), s));
        this.saved.set(null);
        this.focusActive();
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /* ---------- leaving ---------- */

  leave(e: MouseEvent, url: string) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;   // new tab/window: keep this page
    e.preventDefault();
    if (this.dirty() && !confirm(UNSAVED)) return;
    void this.router.navigateByUrl(url);
  }

  onBeforeUnload(e: BeforeUnloadEvent) {
    if (!this.dirty()) return;
    e.preventDefault();
    e.returnValue = '';
  }
}
