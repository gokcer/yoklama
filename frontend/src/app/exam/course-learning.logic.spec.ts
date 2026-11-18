import { describe, it, expect } from 'vitest';
import type { CourseStudentDto } from '../core/api.models';
import { filterStudents, studentNumbersText } from './course-learning.logic';

const s = (no: string, name: string, percent: number | null): CourseStudentDto =>
  ({ studentNo: no, fullName: name, examCount: 1, percent, weakTopics: [] });

describe('filterStudents', () => {
  const list = [s('1', 'Ayşe', 0.9), s('2', 'IŞIK', null), s('3', 'Can', 0.2)];
  it('sorts ascending with nulls last', () => expect(filterStudents(list, '').map(x => x.studentNo)).toEqual(['3', '1', '2']));
  it('searches tr-TR case-insensitively', () => {
    expect(filterStudents(list, 'ışık').map(x => x.studentNo)).toEqual(['2']);
    expect(filterStudents(list, '3').map(x => x.studentNo)).toEqual(['3']);
  });
});

describe('studentNumbersText', () => {
  it('one number per line', () => expect(studentNumbersText([{ studentNo: '1' }, { studentNo: '2' }])).toBe('1\n2'));
});
