import { describe, it, expect } from 'vitest';
import type { ExamResultDto } from '../core/api.models';
import { barWidth, choiceBars, filterRows, formatNumber, formatPercent, mergeRows, rateLevel, sortByRateAsc, statusCounts } from './exam-detail.logic';

const res = (no: string, total: number, complete: boolean, name = 'X'): ExamResultDto =>
  ({ id: 1, studentNo: no, fullName: name, note: null, totalPoints: total, gradedCount: 1, complete, updatedAt: '', answers: [] });

describe('mergeRows', () => {
  const rows = mergeRows(
    [{ studentNo: '20', fullName: 'Bora' }, { studentNo: '3', fullName: 'Ada' }],
    [res('3', 50, true, 'ignored'), res('100', 10, false, 'Dışarıdan')],
    100);
  it('unions and sorts numerically', () => expect(rows.map(r => r.studentNo)).toEqual(['3', '20', '100']));
  it('computes status and percent', () => {
    expect(rows[0]).toMatchObject({ fullName: 'Ada', percent: 0.5, status: 'COMPLETE' });
    expect(rows[1]).toMatchObject({ totalPoints: null, status: 'MISSING' });
    expect(rows[2]).toMatchObject({ status: 'PARTIAL', fullName: 'Dışarıdan' });
  });
  it('percent is null when exam total is 0', () => expect(mergeRows([], [res('1', 0, true)], 0)[0].percent).toBeNull());
  it('counts and filters', () => {
    expect(statusCounts(rows)).toEqual({ ALL: 3, MISSING: 1, PARTIAL: 1, COMPLETE: 1 });
    expect(filterRows(rows, 'MISSING', '').map(r => r.studentNo)).toEqual(['20']);
    expect(filterRows(rows, 'ALL', 'ada').map(r => r.studentNo)).toEqual(['3']);
    expect(filterRows(rows, 'ALL', '10').map(r => r.studentNo)).toEqual(['100']);
  });
});

describe('formatting', () => {
  it('rate level thresholds', () => {
    expect(rateLevel(null)).toBe('none');
    expect(rateLevel(0.49)).toBe('danger');
    expect(rateLevel(0.5)).toBe('warning');
    expect(rateLevel(0.75)).toBe('success');
  });
  it('percent and number', () => {
    expect(formatPercent(0.666)).toBe('%67');
    expect(formatPercent(null)).toBe('—');
    expect(formatNumber(61.5)).toBe('61,5');
    expect(formatNumber(1 / 3)).toBe('0,33');
    expect(formatNumber(undefined)).toBe('—');
  });
  it('barWidth clamps', () => {
    expect(barWidth(1.4)).toBe(100);
    expect(barWidth(-1)).toBe(0);
    expect(barWidth(null)).toBe(0);
  });
});

describe('choiceBars', () => {
  it('orders letters, blanks last, flags correct', () => {
    const bars = choiceBars({ '': 1, B: 3, A: 0 }, 'B');
    expect(bars.map(b => b.label)).toEqual(['A', 'B', 'Boş']);
    expect(bars[1]).toMatchObject({ correct: true, width: 75 });
    expect(bars[2].correct).toBe(false);
  });
  it('null counts give no bars', () => expect(choiceBars(null, null)).toEqual([]));
});

describe('sortByRateAsc', () => {
  it('nulls last, no mutation', () => {
    const src = [{ r: 0.9 }, { r: null }, { r: 0.1 }];
    expect(sortByRateAsc(src, x => x.r).map(x => x.r)).toEqual([0.1, 0.9, null]);
    expect(src[0].r).toBe(0.9);
  });
});
