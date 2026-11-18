import type { CourseStudentDto } from '../core/api.models';
import { sortByRateAsc } from './exam-detail.logic';

export { rateLevel, formatPercent, formatNumber, barWidth, formatExamDate } from './exam-detail.logic';

/** Student search on number or name, plus percent ascending with nulls last. */
export function filterStudents(students: CourseStudentDto[], query: string): CourseStudentDto[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const list = q
    ? students.filter(s => s.studentNo.toLocaleLowerCase('tr-TR').includes(q) || s.fullName.toLocaleLowerCase('tr-TR').includes(q))
    : students;
  return sortByRateAsc(list, s => s.percent);
}

/** One student number per line, for pasting into attendance/remedial lists. */
export function studentNumbersText(students: { studentNo: string }[]): string {
  return students.map(s => s.studentNo).join('\n');
}
