import { Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../shared/errors';
import type { CourseDto, CourseLearningDto, StudentLearningDto } from '../core/api.models';
import { barWidth, filterStudents, formatExamDate, formatNumber, formatPercent, rateLevel, studentNumbersText } from './course-learning.logic';
import { sortByRateAsc } from './exam-detail.logic';

@Component({
  selector: 'app-course-learning',
  imports: [RouterLink],
  template: `
    <div class="container-wide">
      <nav class="breadcrumb" aria-label="Konum">
        <a routerLink="/t">Dersler</a>
        @if (course(); as c) { › <a [routerLink]="['/t/courses', id()]">{{ c.code }}</a> }
        › Öğrenme durumu
      </nav>
      <div class="page-header"><h1>Öğrenme durumu@if (course(); as c) { — {{ c.name }} }</h1></div>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }

      @if (data(); as d) {
        <h2>Sınavlar</h2>
        @if (d.exams.length === 0) {
          <div class="card empty">
            <strong>Bu derste henüz sınav yok.</strong>
            <p class="text-secondary">Sınav oluşturup sonuçları girdikten sonra konu ve öğrenci bazında öğrenme durumu burada görünür.</p>
            <a class="btn btn-primary btn-sm" routerLink="/t/exams/new" [queryParams]="{ courseId: id() }">Yeni sınav</a>
          </div>
        } @else {
          <div class="exam-list">
            @for (e of d.exams; track e.id) {
              <a class="card exam-card" [routerLink]="['/t/exams', e.id]">
                <strong>{{ e.title }}</strong>
                <span class="text-sm text-secondary">{{ formatDate(e.examDate) }} · {{ e.resultCount }} sonuç</span>
                <span class="text-sm">Ortalama: {{ e.averagePoints === null ? '—' : fmt(e.averagePoints) + ' / ' + fmt(e.totalPoints) }}</span>
              </a>
            }
          </div>

          @if (d.topics.length === 0 && d.students.length === 0) {
            <p class="text-secondary hint">Henüz analiz edilecek sonuç yok. Konu analizi için sorulara konu eklemeyi unutmayın.</p>
          }

          <h2>Konular</h2>
          @if (d.topics.length === 0) {
            <p class="text-secondary hint">Konu analizi için sınav sorularına konu (kazanım) ekleyin.</p>
          } @else {
            <p class="text-sm text-secondary">Bir konuya tıklayarak o konuda zayıf (&lt;%50) öğrencileri görün; takviye dersi için numaraları kopyalayın.</p>
            <div class="topics">
              @for (t of topics(); track t.topic) {
                <div class="card topic">
                  <button class="topic-head" (click)="toggleTopic(t.topic)" [attr.aria-expanded]="openTopic() === t.topic">
                    <span class="caret" aria-hidden="true">{{ openTopic() === t.topic ? '▾' : '▸' }}</span>
                    <span class="topic-name">{{ t.topic }}</span>
                    <span class="rate" [attr.data-level]="level(t.successRate)">
                      <span class="bar"><span class="fill" [style.width.%]="bw(t.successRate)"></span></span>
                      <span class="rate-text">{{ pct(t.successRate) }}</span>
                    </span>
                    <span class="text-sm text-secondary meta">{{ t.questionCount }} soru · {{ t.weakStudents.length }} zayıf öğrenci</span>
                  </button>
                  @if (openTopic() === t.topic) {
                    <div class="topic-body">
                      @if (t.weakStudents.length === 0) {
                        <p class="text-secondary text-sm">Bu konuda zayıf öğrenci yok.</p>
                      } @else {
                        <div class="flex-gap" style="flex-wrap:wrap;margin-bottom:8px">
                          <button class="btn btn-outline btn-sm" (click)="copyNumbers(t.weakStudents)">Numaraları kopyala</button>
                          @if (copied() === t.topic) { <span class="text-success text-sm" role="status">{{ t.weakStudents.length }} numara kopyalandı</span> }
                        </div>
                        <div class="table-wrap">
                          <table>
                            <thead><tr><th>No</th><th>Ad Soyad</th><th class="num">Başarı</th></tr></thead>
                            <tbody>
                              @for (w of t.weakStudents; track w.studentNo) {
                                <tr>
                                  <td class="text-mono">{{ w.studentNo }}</td>
                                  <td><a [routerLink]="[]" [queryParams]="{ student: w.studentNo }" (click)="scrollToDetail()">{{ w.fullName || '—' }}</a></td>
                                  <td class="num"><span class="rate-text" [attr.data-level]="level(w.successRate)">{{ pct(w.successRate) }}</span></td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }

          <h2>Öğrenciler</h2>
          <input class="form-input search-input mb-md" type="search" placeholder="Numara veya ad ara" aria-label="Öğrenci ara"
            [value]="query()" (input)="query.set($any($event.target).value)" />
          <div class="table-wrap">
            <table>
              <thead><tr><th>No</th><th>Ad Soyad</th><th class="num">Sınav</th><th class="num">Yüzde</th><th>Zayıf konular</th><th></th></tr></thead>
              <tbody>
                @for (s of students(); track s.studentNo) {
                  <tr [class.selected]="student() === s.studentNo">
                    <td class="text-mono">{{ s.studentNo }}</td>
                    <td>{{ s.fullName }}</td>
                    <td class="num">{{ s.examCount }}</td>
                    <td class="num"><span class="rate-text" [attr.data-level]="level(s.percent)">{{ pct(s.percent) }}</span></td>
                    <td>
                      @for (t of s.weakTopics; track t) { <span class="badge badge-danger weak-badge">{{ t }}</span> }
                      @empty { <span class="text-secondary">—</span> }
                    </td>
                    <td class="num">
                      <button class="btn btn-outline btn-sm" (click)="select(s.studentNo)" [attr.aria-pressed]="student() === s.studentNo">Detay</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="text-secondary">Eşleşen öğrenci yok.</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (student()) {
            <section class="card detail" id="student-detail" aria-live="polite">
              <div class="page-header">
                <h2 style="margin:0">{{ detail()?.fullName || '' }} <span class="text-mono text-secondary">{{ student() }}</span></h2>
                <button class="btn btn-outline btn-sm" (click)="select(null)">Kapat</button>
              </div>
              @if (detailError()) { <p class="form-error" role="alert">{{ detailError() }}</p> }
              @if (detail(); as s) {
                <h3>Sınav geçmişi</h3>
                @if (s.exams.length === 0) { <p class="text-secondary text-sm">Bu öğrenci için sonuç yok.</p> }
                @else {
                  <div class="table-wrap">
                    <table>
                      <thead><tr><th>Sınav</th><th>Tarih</th><th class="num">Puan</th><th class="num">Yüzde</th></tr></thead>
                      <tbody>
                        @for (e of s.exams; track e.examId) {
                          <tr>
                            <td><a [routerLink]="['/t/exams', e.examId]">{{ e.title }}</a>@if (!e.complete) { <span class="badge badge-warning weak-badge">Eksik</span> }</td>
                            <td>{{ formatDate(e.examDate) }}</td>
                            <td class="num">{{ fmt(e.totalPoints) }} / {{ fmt(e.maxPoints) }}</td>
                            <td class="num"><span class="rate-text" [attr.data-level]="level(e.percent)">{{ pct(e.percent) }}</span></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                <h3>Konu başarıları</h3>
                @if (s.topics.length === 0) { <p class="text-secondary text-sm">Konu verisi yok.</p> }
                @else {
                  <div class="table-wrap">
                    <table>
                      <thead><tr><th>Konu</th><th>Başarı</th><th class="num">Soru</th><th class="num">Puan</th></tr></thead>
                      <tbody>
                        @for (t of studentTopics(); track t.topic) {
                          <tr [class.weak-row]="level(t.successRate) === 'danger'">
                            <td>{{ t.topic }}@if (level(t.successRate) === 'danger') { <span class="badge badge-danger weak-badge">Zayıf</span> }</td>
                            <td>
                              <span class="rate" [attr.data-level]="level(t.successRate)">
                                <span class="bar"><span class="fill" [style.width.%]="bw(t.successRate)"></span></span>
                                <span class="rate-text">{{ pct(t.successRate) }}</span>
                              </span>
                            </td>
                            <td class="num">{{ t.questionCount }}</td>
                            <td class="num">{{ fmt(t.earnedPoints) }} / {{ fmt(t.maxPoints) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                <h3>Kaçırılan sorular</h3>
                @if (s.missedQuestions.length === 0) { <p class="text-secondary text-sm">Kaçırılan soru yok.</p> }
                @else {
                  <div class="table-wrap">
                    <table>
                      <thead><tr><th>Sınav</th><th class="num">Soru</th><th>Konu</th><th>Metin</th><th>Cevap</th><th>Doğru</th><th class="num">Puan</th></tr></thead>
                      <tbody>
                        @for (m of s.missedQuestions; track m.examId + '-' + m.position) {
                          <tr>
                            <td>{{ m.examTitle }}</td>
                            <td class="num">{{ m.position }}</td>
                            <td>{{ m.topic ?? '—' }}</td>
                            <td class="qtext">{{ m.text ?? '—' }}</td>
                            <td>{{ m.answer ? m.answer : 'Boş' }}</td>
                            <td>{{ m.correctChoice ?? '—' }}</td>
                            <td class="num">{{ fmt(m.points) }} / {{ fmt(m.maxPoints) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              } @else if (!detailError()) {
                <p class="text-secondary">Yükleniyor…</p>
              }
            </section>
          }
        }
      } @else if (!error()) {
        <p class="text-secondary">Yükleniyor…</p>
      }
    </div>
  `,
  styles: [`
    .empty { text-align: center; }
    .hint { background: var(--c-warning-light); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); }
    .exam-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-md); }
    .exam-card { display: flex; flex-direction: column; gap: 4px; color: inherit; }
    .exam-card:hover { text-decoration: none; border-color: var(--c-primary); }
    .topics { display: flex; flex-direction: column; gap: var(--space-sm); }
    .topic { padding: 0; }
    .topic-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; width: 100%; background: none; border: none; padding: 12px var(--space-md); cursor: pointer; text-align: left; }
    .topic-name { font-weight: 600; flex: 1 1 140px; }
    .meta { flex: 1 1 100%; }
    @media (min-width: 720px) { .meta { flex: 0 0 auto; } }
    .topic-body { padding: 0 var(--space-md) var(--space-md); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--c-border); border-radius: var(--radius-md); background: var(--c-surface); margin-bottom: var(--space-md); }
    .table-wrap table { min-width: 480px; }
    .num { text-align: right; white-space: nowrap; }
    .qtext { max-width: 280px; min-width: 120px; overflow-wrap: anywhere; }
    .rate { display: inline-flex; align-items: center; gap: 8px; min-width: 150px; }
    .bar { display: inline-block; flex: 1; height: 10px; background: var(--c-border); border-radius: 999px; overflow: hidden; min-width: 70px; }
    .fill { display: block; height: 100%; border-radius: 999px; background: var(--c-text-secondary); }
    [data-level='danger'] .fill { background: var(--c-danger); }
    [data-level='warning'] .fill { background: var(--c-warning); }
    [data-level='success'] .fill { background: var(--c-success); }
    .rate-text { font-weight: 600; white-space: nowrap; min-width: 3em; }
    .rate-text[data-level='danger'], [data-level='danger'] .rate-text { color: var(--c-danger); }
    .rate-text[data-level='success'], [data-level='success'] .rate-text { color: var(--c-success); }
    .weak-row { background: var(--c-danger-light); }
    .weak-badge { margin-left: 4px; text-transform: none; }
    tr.selected { background: var(--c-primary-light); }
    .detail { margin-top: var(--space-lg); }
    .detail h3 { margin: var(--space-md) 0 var(--space-sm); font-size: 1rem; }
  `],
})
export class CourseLearningComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly student = input<string>();

  readonly course = signal<CourseDto | null>(null);
  readonly data = signal<CourseLearningDto | null>(null);
  readonly detail = signal<StudentLearningDto | null>(null);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly query = signal('');
  readonly openTopic = signal<string | null>(null);
  readonly copied = signal<string | null>(null);

  readonly topics = computed(() => sortByRateAsc(this.data()?.topics ?? [], t => t.successRate));
  readonly students = computed(() => filterStudents(this.data()?.students ?? [], this.query()));
  readonly studentTopics = computed(() => sortByRateAsc(this.detail()?.topics ?? [], t => t.successRate));

  readonly fmt = formatNumber;
  readonly pct = formatPercent;
  readonly bw = barWidth;
  readonly level = rateLevel;
  readonly formatDate = formatExamDate;

  private detailSeq = 0;

  constructor() {
    effect(() => {
      const no = this.student();
      if (no) void this.loadDetail(no); else { this.detail.set(null); this.detailError.set(''); }
    });
  }

  async ngOnInit() {
    try {
      const [course, data] = await Promise.all([this.api.getCourse(this.id()), this.api.getCourseLearning(this.id())]);
      this.course.set(course);
      this.data.set(data);
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  private async loadDetail(no: string) {
    const seq = ++this.detailSeq;
    this.detail.set(null);
    this.detailError.set('');
    try {
      const d = await this.api.getStudentLearning(this.id(), no);
      if (seq === this.detailSeq) this.detail.set(d);
    } catch (e) {
      if (seq === this.detailSeq) this.detailError.set(errorMessage(e));
    }
  }

  select(no: string | null) {
    const next = no && this.student() !== no ? no : null;
    void this.router.navigate([], { queryParams: { student: next }, queryParamsHandling: 'merge' });
    if (next) this.scrollToDetail();
  }

  scrollToDetail() {
    setTimeout(() => document.getElementById('student-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  toggleTopic(topic: string) {
    this.openTopic.update(cur => (cur === topic ? null : topic));
    this.copied.set(null);
  }

  async copyNumbers(students: { studentNo: string }[]) {
    const text = studentNumbersText(students);
    const topic = this.openTopic();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for insecure contexts / denied permission.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    this.copied.set(topic);
  }
}
