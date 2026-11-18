/**
 * Pure logic of the fast answer-entry tool (docs/11-EXAMS.md §4.2).
 * The component is a thin signal/DOM layer over these functions.
 */
import type { ExamAnswerDto, ExamResultDto, ExamResultRequest, QuestionDto, RosterEntryDto } from '../core/api.models';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Entry state of one question. `points` is the raw text of the points field (accepts `,` or `.`). */
export interface Cell {
  /** CHOICE: true once a letter or an explicit blank was entered. */
  entered: boolean;
  /** CHOICE: the letter, or null (blank when `entered`, not yet entered otherwise). */
  answer: string | null;
  /** OPEN/FREE: raw points text; '' = not graded. */
  points: string;
  /** OPEN: answer text. */
  text: string;
}

/** Cells are indexed like the questions array (sorted by position). */
export interface Sheet {
  cells: Cell[];
  active: number;
}

export const emptyCell = (): Cell => ({ entered: false, answer: null, points: '', text: '' });

export function sortQuestions(questions: readonly QuestionDto[]): QuestionDto[] {
  return [...questions].sort((a, b) => a.position - b.position);
}

export function lettersFor(q: QuestionDto): string[] {
  const n = Math.max(0, Math.min(LETTERS.length, q.choiceCount ?? 0));
  return LETTERS.slice(0, n);
}

/* ---------- points ---------- */

/** Formats points the Turkish way (`2,5`), at most two decimals. */
export function formatPoints(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** '' → null, a non-negative decimal (`,` or `.`) → number, anything else → 'invalid'. */
export function parsePoints(raw: string): number | null | 'invalid' {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+([.,]\d*)?$|^[.,]\d+$/.test(s)) return 'invalid';
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 'invalid';
}

/** Validation message for a points field, or null when valid (empty = not graded = valid). */
export function pointsError(q: QuestionDto, raw: string): string | null {
  if (q.type === 'CHOICE') return null;
  const p = parsePoints(raw);
  if (p === null) return null;
  if (p === 'invalid') return 'Geçerli bir sayı girin';
  if (p > q.maxPoints) return `En fazla ${formatPoints(q.maxPoints)} puan`;
  return null;
}

/* ---------- sheet construction ---------- */

export function emptySheet(questionCount: number): Sheet {
  return { cells: Array.from({ length: questionCount }, emptyCell), active: 0 };
}

/** Pre-fills the sheet from a saved result; the active question is the first one not yet entered. */
export function sheetFromResult(questions: readonly QuestionDto[], result: ExamResultDto | null | undefined): Sheet {
  const byId = new Map<number, ExamAnswerDto>();
  for (const a of result?.answers ?? []) byId.set(a.questionId, a);
  const cells = questions.map((q): Cell => {
    const a = byId.get(q.id);
    if (!a) return emptyCell();
    switch (q.type) {
      case 'CHOICE': return { ...emptyCell(), entered: true, answer: a.answer ? a.answer.toUpperCase() : null };
      case 'OPEN': return { ...emptyCell(), text: a.answer ?? '', points: a.points == null ? '' : formatPoints(a.points) };
      case 'FREE': return { ...emptyCell(), points: a.points == null ? '' : formatPoints(a.points) };
    }
  });
  const sheet: Sheet = { cells, active: 0 };
  const first = questions.findIndex((q, i) => !isEntered(q, cells[i]));
  return { ...sheet, active: first < 0 ? 0 : first };
}

/* ---------- progress / validation ---------- */

export function isEntered(q: QuestionDto, cell: Cell): boolean {
  switch (q.type) {
    case 'CHOICE': return cell.entered;
    case 'OPEN': return cell.points.trim() !== '' || cell.text.trim() !== '';
    case 'FREE': return cell.points.trim() !== '';
  }
}

export function progress(questions: readonly QuestionDto[], sheet: Sheet): { entered: number; total: number } {
  let entered = 0;
  questions.forEach((q, i) => { if (isEntered(q, sheet.cells[i])) entered++; });
  return { entered, total: questions.length };
}

/** Indices of CHOICE questions with neither a letter nor an explicit blank. */
export function unenteredChoices(questions: readonly QuestionDto[], sheet: Sheet): number[] {
  return questions.flatMap((q, i) => (q.type === 'CHOICE' && !sheet.cells[i].entered ? [i] : []));
}

/** Indices of OPEN/FREE questions whose points field is invalid or out of range. */
export function invalidQuestions(questions: readonly QuestionDto[], sheet: Sheet): number[] {
  return questions.flatMap((q, i) => (pointsError(q, sheet.cells[i].points) ? [i] : []));
}

/** Stable fingerprint of the user-visible entry state, for dirty tracking. */
export function sheetSignature(questions: readonly QuestionDto[], sheet: Sheet): string {
  return JSON.stringify(questions.map((q, i) => {
    const c = sheet.cells[i];
    if (q.type === 'CHOICE') return c.entered ? (c.answer ?? '-') : '';
    const p = parsePoints(c.points);
    return [p === 'invalid' ? c.points : p, q.type === 'OPEN' ? c.text.trim() : ''];
  }));
}

/* ---------- mutations (pure) ---------- */

export function setActive(sheet: Sheet, index: number): Sheet {
  const max = sheet.cells.length - 1;
  const active = Math.max(0, Math.min(max, index));
  return active === sheet.active ? sheet : { ...sheet, active };
}

export function updateCell(sheet: Sheet, index: number, patch: Partial<Cell>): Sheet {
  if (index < 0 || index >= sheet.cells.length) return sheet;
  const cells = sheet.cells.slice();
  cells[index] = { ...cells[index], ...patch };
  return { ...sheet, cells };
}

function clearCell(sheet: Sheet, index: number): Sheet {
  return updateCell(sheet, index, emptyCell());
}

/** Click on a bubble: selects the letter and activates the question; clicking the selected letter clears it. */
export function clickBubble(questions: readonly QuestionDto[], sheet: Sheet, index: number, letter: string): Sheet {
  const q = questions[index];
  if (!q || q.type !== 'CHOICE' || !lettersFor(q).includes(letter)) return sheet;
  const cell = sheet.cells[index];
  const next = cell.entered && cell.answer === letter
    ? clearCell(sheet, index)
    : updateCell(sheet, index, { entered: true, answer: letter });
  return { ...next, active: index };
}

/* ---------- keyboard contract (§4.2) ---------- */

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export type KeyOutcome =
  | { handled: false }
  | { handled: true; sheet: Sheet; save?: true; rejected?: number };

/** A single Latin letter A–Z from `event.key`, upper-cased (Turkish 'ı'/'i' become 'I'), else null. */
export function keyLetter(key: string): string | null {
  if (key.length !== 1) return null;
  const u = key.toUpperCase();
  return /^[A-Z]$/.test(u) ? u : null;
}

/**
 * Sheet-level key handling (focus on the sheet, not inside a text/points field).
 * Unhandled keys must keep their default browser behaviour.
 */
export function reduceKey(questions: readonly QuestionDto[], sheet: Sheet, e: KeyLike): KeyOutcome {
  const n = questions.length;
  if (n === 0) return { handled: false };
  const i = Math.max(0, Math.min(n - 1, sheet.active));
  const q = questions[i];
  const last = i === n - 1;
  const mod = !!(e.ctrlKey || e.metaKey);

  if (e.key === 'Enter') {
    if (mod) return { handled: true, sheet, save: true };
    if (e.altKey || e.shiftKey) return { handled: false };
    return last ? { handled: true, sheet, save: true } : { handled: true, sheet: setActive(sheet, i + 1) };
  }
  // Leave browser/OS shortcuts (Ctrl+R, ⌘+L, AltGr/Option characters …) alone.
  if (mod || e.altKey) return { handled: false };

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return { handled: true, sheet: setActive(sheet, i - 1) };
    case 'ArrowRight':
    case 'ArrowDown':
      return { handled: true, sheet: setActive(sheet, i + 1) };
    case 'Tab':
      // At the ends let Tab move focus out of the sheet (to the save button etc.).
      if (e.shiftKey) return i === 0 ? { handled: false } : { handled: true, sheet: setActive(sheet, i - 1) };
      return last ? { handled: false } : { handled: true, sheet: setActive(sheet, i + 1) };
    case 'Backspace': {
      const target = Math.max(0, i - 1);
      return { handled: true, sheet: setActive(clearCell(sheet, target), target) };
    }
    case ' ':
    case 'Spacebar':
    case '-': {
      const blank = q.type === 'CHOICE'
        ? updateCell(sheet, i, { entered: true, answer: null })
        : updateCell(sheet, i, { points: '' });
      return { handled: true, sheet: setActive(blank, i + 1) };
    }
  }

  const letter = keyLetter(e.key);
  if (letter === null || q.type !== 'CHOICE') return { handled: false };
  if (!lettersFor(q).includes(letter)) return { handled: true, sheet, rejected: i };
  return { handled: true, sheet: setActive(updateCell(sheet, i, { entered: true, answer: letter }), i + 1) };
}

/* ---------- save request ---------- */

/**
 * The student's complete answer set (§3.3). CHOICE: letter or null (blank; not-yet-entered is sent as blank),
 * points always null (server computes). OPEN: text + points. FREE: points only.
 * Callers validate first; an invalid points field is sent as null.
 */
export function buildRequest(questions: readonly QuestionDto[], sheet: Sheet, fullName?: string | null): ExamResultRequest {
  const answers = questions.map((q, i): ExamAnswerDto => {
    const c = sheet.cells[i];
    const p = parsePoints(c.points);
    const points = typeof p === 'number' ? p : null;
    switch (q.type) {
      case 'CHOICE': return { questionId: q.id, answer: c.entered ? c.answer : null, points: null };
      case 'OPEN': return { questionId: q.id, answer: c.text.trim() || null, points };
      case 'FREE': return { questionId: q.id, answer: null, points };
    }
  });
  return { fullName: fullName?.trim() || null, note: null, answers };
}

/* ---------- result summary ---------- */

export interface ResultSummary {
  total: number;
  max: number;
  /** 0..1, null when the exam total is 0. */
  percent: number | null;
  correct: number;
  wrong: number;
  blank: number;
  /** CHOICE questions without an answer key (their score is pending). */
  pendingKey: number;
  /** OPEN/FREE questions without points. */
  ungraded: number;
  choiceCount: number;
}

export function summarize(questions: readonly QuestionDto[], examTotal: number, result: ExamResultDto): ResultSummary {
  const byId = new Map(result.answers.map(a => [a.questionId, a]));
  const s: ResultSummary = {
    total: result.totalPoints, max: examTotal,
    percent: examTotal > 0 ? result.totalPoints / examTotal : null,
    correct: 0, wrong: 0, blank: 0, pendingKey: 0, ungraded: 0, choiceCount: 0,
  };
  for (const q of questions) {
    const a = byId.get(q.id);
    if (q.type !== 'CHOICE') {
      if (a?.points == null) s.ungraded++;
      continue;
    }
    s.choiceCount++;
    if (!q.correctChoice) s.pendingKey++;
    if (!a?.answer) { s.blank++; continue; }
    if (!q.correctChoice) continue;
    const right = a.points != null ? a.points > 0 : a.answer.toUpperCase() === q.correctChoice.toUpperCase();
    if (right) s.correct++; else s.wrong++;
  }
  return s;
}

export type BubbleMark = 'correct' | 'wrong' | 'key' | null;

/**
 * Right/wrong marking of one bubble against the answer key (null without a key).
 * The key bubble is outlined only once the question was entered, so untouched rows give no hints.
 */
export function bubbleMark(q: QuestionDto, cell: Cell, letter: string): BubbleMark {
  const key = q.correctChoice?.toUpperCase();
  if (q.type !== 'CHOICE' || !key || !cell.entered) return null;
  if (cell.answer === letter) return letter === key ? 'correct' : 'wrong';
  return letter === key ? 'key' : null;
}

/** Row state of an entered CHOICE question against the key: blank counts as wrong; null without key or entry. */
export function rowMark(q: QuestionDto, cell: Cell): 'correct' | 'wrong' | null {
  const key = q.correctChoice?.toUpperCase();
  if (q.type !== 'CHOICE' || !key || !cell.entered) return null;
  return cell.answer === key ? 'correct' : 'wrong';
}

/**
 * Live summary of the sheet as currently entered, scored like the server (ExamMath.choicePoints):
 * correct → maxPoints, wrong/blank → 0, no key → pending. Invalid points fields count as ungraded.
 */
export function sheetSummary(questions: readonly QuestionDto[], examTotal: number, sheet: Sheet): ResultSummary {
  const req = buildRequest(questions, sheet);
  let total = 0;
  const answers = req.answers.map((a, i): ExamAnswerDto => {
    const q = questions[i];
    let points = a.points;
    if (q.type === 'CHOICE') {
      const key = q.correctChoice?.toUpperCase();
      points = key ? (a.answer === key ? q.maxPoints : 0) : null;
    }
    if (points != null) total += points;
    return { ...a, points };
  });
  return summarize(questions, examTotal, { totalPoints: total, answers } as ExamResultDto);
}

/* ---------- question layout ---------- */

/** Consecutive CHOICE questions form a bubble block; OPEN/FREE questions form card blocks. */
export interface Run { kind: 'choice' | 'score'; indices: number[]; }

export function groupRuns(questions: readonly QuestionDto[]): Run[] {
  const runs: Run[] = [];
  questions.forEach((q, i) => {
    const kind = q.type === 'CHOICE' ? 'choice' : 'score';
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.kind === kind) lastRun.indices.push(i);
    else runs.push({ kind, indices: [i] });
  });
  return runs;
}

/* ---------- students ---------- */

export interface StudentRow {
  studentNo: string;
  fullName: string;
  inRoster: boolean;
  result: ExamResultDto | null;
}

export function compareStudentNo(a: string, b: string): number {
  return a.localeCompare(b, 'tr', { numeric: true });
}

/** Roster ∪ students with results ∪ manually added numbers, sorted by student number. */
export function buildStudentList(
  roster: readonly RosterEntryDto[],
  results: readonly ExamResultDto[],
  extras: readonly RosterEntryDto[] = [],
): StudentRow[] {
  const map = new Map<string, StudentRow>();
  for (const r of roster) map.set(r.studentNo, { studentNo: r.studentNo, fullName: r.fullName, inRoster: true, result: null });
  for (const res of results) {
    const row = map.get(res.studentNo);
    if (row) row.result = res;
    else map.set(res.studentNo, { studentNo: res.studentNo, fullName: res.fullName, inRoster: false, result: res });
  }
  for (const e of extras) {
    const row = map.get(e.studentNo);
    if (!row) map.set(e.studentNo, { studentNo: e.studentNo, fullName: e.fullName, inRoster: false, result: null });
    else if (!row.fullName && e.fullName) row.fullName = e.fullName;
  }
  return [...map.values()].sort((a, b) => compareStudentNo(a.studentNo, b.studentNo));
}

const TR_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Turkish-aware case and diacritic folding for search ("IŞIK", "ışık", "isik" all match). */
export function foldTr(s: string): string {
  return s.toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, ch => TR_FOLD[ch] ?? ch);
}

export function filterStudents(rows: readonly StudentRow[], query: string): StudentRow[] {
  const q = foldTr(query.trim());
  if (!q) return [...rows];
  return rows.filter(r => r.studentNo.includes(q) || foldTr(r.fullName).includes(q));
}

export type StudentStatus = 'none' | 'partial' | 'complete';

export function studentStatus(row: StudentRow): StudentStatus {
  if (!row.result) return 'none';
  return row.result.complete ? 'complete' : 'partial';
}

export const STATUS_LABEL: Record<StudentStatus, string> = { none: 'Girilmedi', partial: 'Eksik', complete: 'Tamam' };

/** Next roster student without a result after `currentNo` in list order (wrapping); null when none. */
export function nextStudent(rows: readonly StudentRow[], currentNo: string | null): StudentRow | null {
  const start = currentNo == null ? -1 : rows.findIndex(r => r.studentNo === currentNo);
  for (let k = 1; k <= rows.length; k++) {
    const r = rows[(start + k + rows.length) % rows.length];
    if (r.studentNo !== currentNo && r.inRoster && !r.result) return r;
  }
  return null;
}

/** Inserts or replaces a result, keeping the list sorted by student number. */
export function upsertResult(results: readonly ExamResultDto[], r: ExamResultDto): ExamResultDto[] {
  return [...results.filter(x => x.studentNo !== r.studentNo), r].sort((a, b) => compareStudentNo(a.studentNo, b.studentNo));
}

/* ---------- live answer-key feedback ---------- */

/** 'ok' = the entered letter matches the key; a letter = the correct choice to announce. */
export type EntryFeedback = 'ok' | (typeof LETTERS)[number];

/**
 * Feedback for a CHOICE entry that just changed `before` → `after`: null when the question has no key,
 * nothing new was entered (clearing, re-entering the same value) or the key is not a valid letter.
 * A blank entry counts as wrong.
 */
export function entryFeedback(q: QuestionDto | undefined, before: Cell, after: Cell): EntryFeedback | null {
  if (!q || q.type !== 'CHOICE' || !after.entered) return null;
  if (before.entered && before.answer === after.answer) return null;
  const key = q.correctChoice?.toUpperCase();
  if (!key || !(LETTERS as readonly string[]).includes(key)) return null;
  return after.answer === key ? 'ok' : (key as EntryFeedback);
}

/* ---------- student search box keyboard ---------- */

export type SearchOutcome = { hl: number } | { open: string } | null;

/**
 * Keys in the student search box. `hl` is the highlighted index in `rows` (-1 = none).
 * ↑/↓ move the highlight; Enter opens the highlighted row, the only row left, or an exact student number;
 * otherwise Enter highlights the first row. Other keys → null (default behaviour).
 */
export function searchKey(key: string, hl: number, rows: readonly StudentRow[], query: string): SearchOutcome {
  const n = rows.length;
  switch (key) {
    case 'ArrowDown': return n ? { hl: Math.min(n - 1, hl + 1) } : null;
    case 'ArrowUp': return n ? { hl: Math.max(0, hl - 1) } : null;
    case 'Enter': {
      if (hl >= 0 && hl < n) return { open: rows[hl].studentNo };
      if (n === 1) return { open: rows[0].studentNo };
      const exact = rows.find(r => r.studentNo === query.trim());
      if (exact) return { open: exact.studentNo };
      return n ? { hl: 0 } : null;
    }
    default: return null;
  }
}
