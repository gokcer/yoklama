import type { ExamResultDto, RosterEntryDto } from '../core/api.models';

export type ResultStatus = 'MISSING' | 'PARTIAL' | 'COMPLETE';
export type ResultFilter = 'ALL' | ResultStatus;
export type RateLevel = 'danger' | 'warning' | 'success' | 'none';

export interface ResultRow {
  studentNo: string;
  fullName: string;
  /** null when no result has been entered. */
  totalPoints: number | null;
  percent: number | null;
  status: ResultStatus;
}

export const STATUS_LABELS: Record<ResultStatus, string> = {
  MISSING: 'Girilmedi', PARTIAL: 'Eksik', COMPLETE: 'Tamam',
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  CHOICE: 'Seçenekli', OPEN: 'Açık uçlu', FREE: 'Serbest',
};

/** Colour level for a success rate in 0..1 (<50% danger, 50-75% warning, >=75% success). */
export function rateLevel(rate: number | null | undefined): RateLevel {
  if (rate == null || Number.isNaN(rate)) return 'none';
  if (rate < 0.5) return 'danger';
  if (rate < 0.75) return 'warning';
  return 'success';
}

/** Whole-number percent text for a 0..1 rate, or an em dash. */
export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '—';
  return '%' + Math.round(rate * 100).toLocaleString('tr-TR');
}

/** tr-TR number with at most 2 decimals, or an em dash. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/** Bar width in whole percent, clamped to 0..100. */
export function barWidth(rate: number | null | undefined): number {
  if (rate == null || Number.isNaN(rate)) return 0;
  return Math.max(0, Math.min(100, Math.round(rate * 100)));
}

function compareNo(a: string, b: string): number {
  return a.localeCompare(b, 'tr-TR', { numeric: true });
}

/** Roster union students with results, sorted by student number. */
export function mergeRows(roster: RosterEntryDto[], results: ExamResultDto[], examTotal: number): ResultRow[] {
  const byNo = new Map<string, ResultRow>();
  for (const r of roster) {
    byNo.set(r.studentNo, { studentNo: r.studentNo, fullName: r.fullName, totalPoints: null, percent: null, status: 'MISSING' });
  }
  for (const res of results) {
    const existing = byNo.get(res.studentNo);
    byNo.set(res.studentNo, {
      studentNo: res.studentNo,
      fullName: existing?.fullName || res.fullName,
      totalPoints: res.totalPoints,
      percent: examTotal > 0 ? res.totalPoints / examTotal : null,
      status: res.complete ? 'COMPLETE' : 'PARTIAL',
    });
  }
  return [...byNo.values()].sort((a, b) => compareNo(a.studentNo, b.studentNo));
}

export function statusCounts(rows: ResultRow[]): Record<ResultFilter, number> {
  const c: Record<ResultFilter, number> = { ALL: rows.length, MISSING: 0, PARTIAL: 0, COMPLETE: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

export function filterRows(rows: ResultRow[], filter: ResultFilter, query: string): ResultRow[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  return rows.filter(r =>
    (filter === 'ALL' || r.status === filter)
    && (!q || r.studentNo.toLocaleLowerCase('tr-TR').includes(q) || r.fullName.toLocaleLowerCase('tr-TR').includes(q)));
}

export interface ChoiceBar { key: string; label: string; count: number; width: number; correct: boolean; }

/** Per-choice distribution bars: letters sorted, blanks ("") last as "Boş". */
export function choiceBars(counts: Record<string, number> | null, correct: string | null): ChoiceBar[] {
  if (!counts) return [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const keys = Object.keys(counts).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return keys.map(k => ({
    key: k,
    label: k === '' ? 'Boş' : k,
    count: counts[k],
    width: total > 0 ? Math.round((counts[k] / total) * 100) : 0,
    correct: k !== '' && k === correct,
  }));
}

/** Ascending by success rate, null rates last. Does not mutate. */
export function sortByRateAsc<T>(items: T[], rate: (t: T) => number | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const x = rate(a), y = rate(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x - y;
  });
}

export function formatExamDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('tr-TR', { dateStyle: 'medium' });
}
