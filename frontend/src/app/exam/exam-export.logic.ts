import type { ExamDto, ExamResultDto, QuestionDto, RosterEntryDto } from '../core/api.models';

/** One selectable CSV column. Keys are stable across exams so a saved layout can be reused. */
export interface ExportColumn {
  key: string;
  label: string;
  /** Header written to the CSV. */
  header: string;
  group: 'student' | 'score' | 'question';
}

export type CsvSeparator = ';' | ',';

export interface ExportOptions {
  separator: CsvSeparator;
  includeHeader: boolean;
  /** Also write roster students that have no result (their score cells stay empty). */
  includeMissing: boolean;
}

export const DEFAULT_COLUMN_KEYS = ['studentNo', 'fullName', 'points'];
export const DEFAULT_OPTIONS: ExportOptions = { separator: ';', includeHeader: true, includeMissing: false };

const BASE_COLUMNS: ExportColumn[] = [
  { key: 'studentNo', label: 'Öğrenci No', header: 'OgrenciNo', group: 'student' },
  { key: 'fullName', label: 'Ad Soyad', header: 'AdSoyad', group: 'student' },
  { key: 'points', label: 'Not (toplam puan)', header: 'Not', group: 'score' },
  { key: 'grade100', label: "Not (100'lük / yüzde)", header: 'Not100', group: 'score' },
  { key: 'status', label: 'Durum', header: 'Durum', group: 'score' },
  { key: 'correct', label: 'Doğru sayısı', header: 'Dogru', group: 'score' },
  { key: 'wrong', label: 'Yanlış sayısı', header: 'Yanlis', group: 'score' },
  { key: 'blank', label: 'Boş sayısı', header: 'Bos', group: 'score' },
  { key: 'note', label: 'Açıklama', header: 'Aciklama', group: 'score' },
];

/** All columns available for an exam: base columns, then answer + points per question. */
export function availableColumns(exam: ExamDto): ExportColumn[] {
  const hasChoice = exam.questions.some(q => q.type === 'CHOICE');
  const cols = BASE_COLUMNS.filter(c => hasChoice || !['correct', 'wrong', 'blank'].includes(c.key));
  for (const q of sortedQuestions(exam)) {
    if (q.type !== 'FREE') {
      cols.push({ key: `q${q.position}a`, label: `S${q.position} cevap`, header: `S${q.position}`, group: 'question' });
    }
    cols.push({ key: `q${q.position}p`, label: `S${q.position} puan`, header: `S${q.position} Puan`, group: 'question' });
  }
  return cols;
}

/** Keeps saved keys that exist for this exam, in saved order; falls back to defaults when nothing survives. */
export function restoreSelection(saved: string[] | null, available: ExportColumn[]): string[] {
  const known = new Set(available.map(c => c.key));
  const kept = (saved ?? []).filter((k, i, arr) => known.has(k) && arr.indexOf(k) === i);
  return kept.length ? kept : DEFAULT_COLUMN_KEYS.filter(k => known.has(k));
}

/** Moves `key` to `index` in the selection, inserting it if absent. Does not mutate. */
export function placeColumn(selected: string[], key: string, index: number): string[] {
  const from = selected.indexOf(key);
  const next = selected.filter(k => k !== key);
  let at = index;
  if (from >= 0 && from < index) at--;
  at = Math.max(0, Math.min(next.length, at));
  next.splice(at, 0, key);
  return next;
}

interface ExportRow {
  studentNo: string;
  fullName: string;
  result: ExamResultDto | null;
}

function compareNo(a: string, b: string): number {
  return a.localeCompare(b, 'tr-TR', { numeric: true });
}

function sortedQuestions(exam: ExamDto): QuestionDto[] {
  return [...exam.questions].sort((a, b) => a.position - b.position);
}

/** Results (plus roster students without one, if asked), roster name preferred, sorted by student number. */
export function exportRows(roster: RosterEntryDto[], results: ExamResultDto[], includeMissing: boolean): ExportRow[] {
  const names = new Map(roster.map(r => [r.studentNo, r.fullName]));
  const rows = new Map<string, ExportRow>();
  if (includeMissing) for (const r of roster) rows.set(r.studentNo, { studentNo: r.studentNo, fullName: r.fullName, result: null });
  for (const res of results) {
    rows.set(res.studentNo, { studentNo: res.studentNo, fullName: names.get(res.studentNo) || res.fullName, result: res });
  }
  return [...rows.values()].sort((a, b) => compareNo(a.studentNo, b.studentNo));
}

function num(v: number | null | undefined, sep: CsvSeparator): string {
  if (v == null || Number.isNaN(v)) return '';
  const s = String(Math.round(v * 100) / 100);
  return sep === ';' ? s.replace('.', ',') : s;
}

/** Quotes when needed; text cells starting with a formula character are prefixed with ' (same rule as the server CSV). */
export function escapeCell(val: string, sep: CsvSeparator, text: boolean): string {
  if (!val) return '';
  let v = val;
  let quote = v.includes(sep) || v.includes('"') || v.includes('\n') || v.includes('\r');
  if (text && '=+-@\t\r'.includes(v.charAt(0))) { v = "'" + v; quote = true; }
  return quote ? '"' + v.replace(/"/g, '""') + '"' : v;
}

const STATUS_TEXT = { MISSING: 'Girilmedi', PARTIAL: 'Eksik', COMPLETE: 'Tamam' } as const;

function cell(key: string, row: ExportRow, exam: ExamDto, byPos: Map<number, QuestionDto>, sep: CsvSeparator): { v: string; text: boolean } {
  const res = row.result;
  const t = (v: string | null | undefined) => ({ v: v ?? '', text: true });
  const n = (v: number | null | undefined) => ({ v: num(v, sep), text: false });
  switch (key) {
    case 'studentNo': return t(row.studentNo);
    case 'fullName': return t(row.fullName);
    case 'status': return t(STATUS_TEXT[!res ? 'MISSING' : res.complete ? 'COMPLETE' : 'PARTIAL']);
    case 'note': return t(res?.note);
  }
  if (!res) return n(null);
  const pct = exam.totalPoints > 0 ? res.totalPoints / exam.totalPoints : null;
  switch (key) {
    case 'points': return n(res.totalPoints);
    case 'grade100': return n(pct == null ? null : pct * 100);
    case 'correct': case 'wrong': case 'blank': return n(choiceCount(key, res, exam));
  }
  const m = /^q(\d+)([ap])$/.exec(key);
  const q = m ? byPos.get(+m[1]) : undefined;
  if (!m || !q) return t('');
  const a = res.answers.find(x => x.questionId === q.id);
  return m[2] === 'a' ? t(q.type === 'FREE' ? '' : a?.answer) : n(a?.points);
}

function choiceCount(key: 'correct' | 'wrong' | 'blank', res: ExamResultDto, exam: ExamDto): number {
  let c = 0;
  for (const q of exam.questions) {
    if (q.type !== 'CHOICE') continue;
    const ans = res.answers.find(x => x.questionId === q.id)?.answer ?? null;
    if (key === 'blank') { if (!ans) c++; continue; }
    if (!ans || !q.correctChoice) continue;
    if ((ans === q.correctChoice) === (key === 'correct')) c++;
  }
  return c;
}

/** CSV text (UTF-8 BOM, CRLF) with exactly the selected columns in the selected order. */
export function buildCsv(
  exam: ExamDto, roster: RosterEntryDto[], results: ExamResultDto[], keys: string[], opts: ExportOptions,
): string {
  const cols = new Map(availableColumns(exam).map(c => [c.key, c]));
  const selected = keys.map(k => cols.get(k)).filter((c): c is ExportColumn => !!c);
  const byPos = new Map(exam.questions.map(q => [q.position, q]));
  const lines: string[] = [];
  if (opts.includeHeader) lines.push(selected.map(c => escapeCell(c.header, opts.separator, true)).join(opts.separator));
  for (const row of exportRows(roster, results, opts.includeMissing)) {
    lines.push(selected.map(c => {
      const { v, text } = cell(c.key, row, exam, byPos, opts.separator);
      return escapeCell(v, opts.separator, text);
    }).join(opts.separator));
  }
  return '﻿' + lines.map(l => l + '\r\n').join('');
}

/** Safe file name: notlar_<course>_<title>.csv */
export function exportFilename(exam: ExamDto): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `notlar_${slug(exam.courseCode) || 'ders'}_${slug(exam.title) || exam.id}.csv`;
}
