import { describe, it, expect } from 'vitest';
import type { ExamDto, ExamResultDto } from '../core/api.models';
import { availableColumns, buildCsv, DEFAULT_OPTIONS, escapeCell, exportFilename, placeColumn, restoreSelection } from './exam-export.logic';

const exam: ExamDto = {
  id: 3, courseId: 1, courseCode: 'MAT101', courseName: 'Matematik', title: 'Vize Sınavı', examDate: null,
  totalPoints: 50, resultCount: 2, createdAt: '',
  questions: [
    { id: 11, position: 1, type: 'CHOICE', text: null, topic: null, maxPoints: 20, choiceCount: 4, correctChoice: 'B' },
    { id: 12, position: 2, type: 'CHOICE', text: null, topic: null, maxPoints: 20, choiceCount: 4, correctChoice: 'C' },
    { id: 13, position: 3, type: 'FREE', text: null, topic: null, maxPoints: 10, choiceCount: null, correctChoice: null },
  ],
};
const res = (no: string, name: string, answers: [number, string | null, number | null][], total: number, note: string | null = null): ExamResultDto => ({
  id: 1, studentNo: no, fullName: name, note, totalPoints: total, gradedCount: answers.length, complete: answers.length === 3, updatedAt: '',
  answers: answers.map(([questionId, answer, points]) => ({ questionId, answer, points })),
});
const results = [
  res('20', 'Bora', [[11, 'B', 20], [12, 'A', 0], [13, null, 7.5]], 27.5),
  res('3', 'yanlış ad', [[11, null, 0]], 0, '=cmd'),
];
const roster = [{ studentNo: '3', fullName: 'Ada; Yılmaz' }, { studentNo: '9', fullName: 'Cem' }];
const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').slice(0, -1);

describe('availableColumns', () => {
  it('skips answer column for FREE questions', () => {
    const keys = availableColumns(exam).map(c => c.key);
    expect(keys).toContain('q1a');
    expect(keys).toContain('q3p');
    expect(keys).not.toContain('q3a');
  });
  it('hides choice counters without choice questions', () => {
    const keys = availableColumns({ ...exam, questions: [exam.questions[2]] }).map(c => c.key);
    expect(keys).not.toContain('correct');
  });
});

describe('buildCsv', () => {
  it('writes only the selected columns in order (no, grade)', () => {
    const csv = buildCsv(exam, roster, results, ['studentNo', 'points'], DEFAULT_OPTIONS);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines(csv)).toEqual(['OgrenciNo;Not', '3;0', '20;27,5']);
  });
  it('respects reordering, header off, comma separator', () => {
    const csv = buildCsv(exam, roster, results, ['points', 'studentNo', 'grade100'], { separator: ',', includeHeader: false, includeMissing: false });
    expect(lines(csv)).toEqual(['0,3,0', '27.5,20,55']);
  });
  it('adds roster students without a result when asked, preferring roster names and quoting', () => {
    const csv = buildCsv(exam, roster, results, ['studentNo', 'fullName', 'status', 'points'], { ...DEFAULT_OPTIONS, includeMissing: true });
    expect(lines(csv)).toEqual(['OgrenciNo;AdSoyad;Durum;Not', '3;"Ada; Yılmaz";Eksik;0', '9;Cem;Girilmedi;', '20;Bora;Tamam;27,5']);
  });
  it('per-question answers/points, counters and formula-guarded notes', () => {
    const csv = buildCsv(exam, roster, results, ['studentNo', 'q1a', 'q2a', 'q3p', 'correct', 'wrong', 'blank', 'note'], DEFAULT_OPTIONS);
    expect(lines(csv)).toEqual([
      'OgrenciNo;S1;S2;S3 Puan;Dogru;Yanlis;Bos;Aciklama',
      `3;;;;0;0;2;"'=cmd"`,
      '20;B;A;7,5;1;1;0;',
    ]);
  });
  it('ignores unknown keys', () => {
    expect(lines(buildCsv(exam, [], results, ['nope', 'studentNo'], DEFAULT_OPTIONS))[0]).toBe('OgrenciNo');
  });
});

describe('placeColumn', () => {
  it('inserts new keys at index', () => expect(placeColumn(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']));
  it('moves down accounting for removal', () => expect(placeColumn(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'a', 'c']));
  it('moves up', () => expect(placeColumn(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']));
  it('clamps', () => expect(placeColumn(['a', 'b'], 'a', 99)).toEqual(['b', 'a']));
});

describe('restoreSelection', () => {
  const cols = availableColumns(exam);
  it('keeps known saved keys in order', () => expect(restoreSelection(['points', 'q9a', 'studentNo'], cols)).toEqual(['points', 'studentNo']));
  it('falls back to defaults', () => expect(restoreSelection(null, cols)).toEqual(['studentNo', 'fullName', 'points']));
});

describe('escapeCell / exportFilename', () => {
  it('does not guard numbers', () => expect(escapeCell('-1', ';', false)).toBe('-1'));
  it('quotes embedded quotes', () => expect(escapeCell('a"b', ';', true)).toBe('"a""b"'));
  it('builds an ascii file name', () => expect(exportFilename(exam)).toBe('notlar_MAT101_Vize-Sinavi.csv'));
});
