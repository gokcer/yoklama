import { describe, it, expect } from 'vitest';
import type { ExamResultDto, QuestionDto } from '../core/api.models';
import {
  buildRequest, buildStudentList, bubbleMark, clickBubble, emptyCell, emptySheet, entryFeedback, entryOrder, filterStudents, foldTr, formatPoints,
  groupRuns, invalidQuestions, keyLetter, lettersFor, nextStudent, parsePoints, pointsError, progress, reduceKey,
  rowMark, searchKey, sheetFromResult, sheetSignature, sheetSummary, sortQuestions, studentStatus, summarize, unenteredChoices, updateCell, upsertResult,
  type KeyOutcome, type Sheet,
} from './exam-entry.logic';

const choice = (id: number, position: number, choiceCount = 4, correctChoice: string | null = null, maxPoints = 4): QuestionDto =>
  ({ id, position, type: 'CHOICE', text: null, topic: null, maxPoints, choiceCount, correctChoice });
const open = (id: number, position: number, maxPoints = 10): QuestionDto =>
  ({ id, position, type: 'OPEN', text: null, topic: null, maxPoints, choiceCount: null, correctChoice: null });
const free = (id: number, position: number, maxPoints = 5): QuestionDto =>
  ({ id, position, type: 'FREE', text: null, topic: null, maxPoints, choiceCount: null, correctChoice: null });

const result = (studentNo: string, answers: ExamResultDto['answers'], extra: Partial<ExamResultDto> = {}): ExamResultDto => ({
  id: 1, studentNo, fullName: '', note: null, totalPoints: 0, gradedCount: 0, complete: false, updatedAt: '', answers, ...extra,
});

function press(qs: QuestionDto[], s: Sheet, key: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}): KeyOutcome {
  return reduceKey(qs, s, { key, ...mods });
}
function type(qs: QuestionDto[], s: Sheet, keys: string[]): Sheet {
  for (const k of keys) {
    const o = press(qs, s, k);
    if (o.handled) s = o.sheet;
  }
  return s;
}

describe('points', () => {
  it('parses Turkish and dotted decimals', () => {
    expect(parsePoints('')).toBeNull();
    expect(parsePoints('  ')).toBeNull();
    expect(parsePoints('3')).toBe(3);
    expect(parsePoints('2,5')).toBe(2.5);
    expect(parsePoints('0.25')).toBe(0.25);
    expect(parsePoints(',5')).toBe(0.5);
    expect(parsePoints('4,')).toBe(4);
    expect(parsePoints('-1')).toBe('invalid');
    expect(parsePoints('abc')).toBe('invalid');
    expect(parsePoints('1,2,3')).toBe('invalid');
  });

  it('formats with a comma', () => {
    expect(formatPoints(2.5)).toBe('2,5');
    expect(formatPoints(4)).toBe('4');
    expect(formatPoints(1 / 3)).toBe('0,33');
  });

  it('validates the range 0..maxPoints', () => {
    const q = open(1, 1, 10);
    expect(pointsError(q, '')).toBeNull();
    expect(pointsError(q, '0')).toBeNull();
    expect(pointsError(q, '10')).toBeNull();
    expect(pointsError(q, '10,5')).toContain('En fazla');
    expect(pointsError(q, 'x')).toBeTruthy();
    expect(pointsError(choice(2, 2), 'x')).toBeNull();
  });
});

describe('sheet construction', () => {
  it('sorts questions by position and limits letters to choiceCount', () => {
    expect(sortQuestions([choice(2, 2), choice(1, 1)]).map(q => q.id)).toEqual([1, 2]);
    expect(lettersFor(choice(1, 1, 5))).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(lettersFor(choice(1, 1, 6))).toHaveLength(6);
  });

  it('pre-fills from a result, distinguishing blanks from missing answers', () => {
    const qs = [choice(1, 1), choice(2, 2), choice(3, 3), open(4, 4), free(5, 5)];
    const s = sheetFromResult(qs, result('1', [
      { questionId: 1, answer: 'b', points: null },
      { questionId: 2, answer: null, points: null },
      { questionId: 4, answer: 'proof', points: 7.5 },
      { questionId: 5, answer: null, points: 3 },
    ]));
    expect(s.cells[0]).toMatchObject({ entered: true, answer: 'B' });
    expect(s.cells[1]).toMatchObject({ entered: true, answer: null });
    expect(s.cells[2]).toMatchObject({ entered: false, answer: null });
    expect(s.cells[3]).toMatchObject({ text: 'proof', points: '7,5' });
    expect(s.cells[4]).toMatchObject({ points: '3' });
    expect(s.active).toBe(2); // first not yet entered
    expect(progress(qs, s)).toEqual({ entered: 4, total: 5 });
    expect(unenteredChoices(qs, s)).toEqual([2]);
  });

  it('starts empty at question 1 without a result', () => {
    const qs = [choice(1, 1), choice(2, 2)];
    const s = sheetFromResult(qs, null);
    expect(s).toEqual(emptySheet(2));
    expect(progress(qs, s)).toEqual({ entered: 0, total: 2 });
  });

  it('activates question 1 when everything is entered', () => {
    const qs = [choice(1, 1)];
    expect(sheetFromResult(qs, result('1', [{ questionId: 1, answer: 'A', points: 0 }])).active).toBe(0);
  });
});

describe('keyboard reducer', () => {
  const qs = [choice(1, 1, 4), choice(2, 2, 2), choice(3, 3, 5)];

  it('a letter fills the active question and advances', () => {
    const o = press(qs, emptySheet(3), 'b');
    expect(o.handled).toBe(true);
    if (!o.handled) return;
    expect(o.sheet.cells[0]).toMatchObject({ entered: true, answer: 'B' });
    expect(o.sheet.active).toBe(1);
  });

  it('accepts upper case and shift', () => {
    const o = press(qs, emptySheet(3), 'D', { shiftKey: true });
    expect(o.handled && o.sheet.cells[0].answer).toBe('D');
  });

  it('rejects letters outside choiceCount with a cue and no change', () => {
    const s = { ...emptySheet(3), active: 1 }; // 2 choices
    const o = press(qs, s, 'c');
    expect(o).toEqual({ handled: true, sheet: s, rejected: 1 });
    expect(press(qs, s, 'z')).toEqual({ handled: true, sheet: s, rejected: 1 });
  });

  it('Turkish dotless/dotted i never maps to A–F', () => {
    expect(keyLetter('ı')).toBe('I');
    expect(keyLetter('i')).toBe('I');
    expect(keyLetter('İ')).toBeNull();
    expect(keyLetter('ş')).toBeNull();
    expect(keyLetter('Enter')).toBeNull();
    const o = press(qs, emptySheet(3), 'ı');
    expect(o.handled && o.rejected).toBe(0);
  });

  it('types a whole sheet and stays on the last question', () => {
    const s = type(qs, emptySheet(3), ['a', 'b', 'e']);
    expect(s.cells.map(c => c.answer)).toEqual(['A', 'B', 'E']);
    expect(s.active).toBe(2);
    const again = type(qs, s, ['c']);
    expect(again.cells[2].answer).toBe('C');
    expect(again.active).toBe(2);
  });

  it('Space and - mark an explicit blank and advance', () => {
    const s = type(qs, emptySheet(3), [' ', '-']);
    expect(s.cells[0]).toMatchObject({ entered: true, answer: null });
    expect(s.cells[1]).toMatchObject({ entered: true, answer: null });
    expect(s.cells[2].entered).toBe(false);
    expect(s.active).toBe(2);
  });

  it('Backspace goes back and clears the previous question', () => {
    const s = type(qs, emptySheet(3), ['a', 'b', 'Backspace']);
    expect(s.active).toBe(1);
    expect(s.cells[1]).toMatchObject({ entered: false, answer: null });
    expect(s.cells[0].answer).toBe('A');
    const first = type(qs, s, ['Backspace', 'Backspace']);
    expect(first.active).toBe(0);
    expect(first.cells[0].entered).toBe(false);
  });

  it('arrows move without changing answers and clamp at the ends', () => {
    let s = emptySheet(3);
    s = type(qs, s, ['ArrowLeft']);
    expect(s.active).toBe(0);
    s = type(qs, s, ['ArrowRight', 'ArrowDown']);
    expect(s.active).toBe(2);
    s = type(qs, s, ['ArrowDown']);
    expect(s.active).toBe(2);
    s = type(qs, s, ['ArrowUp']);
    expect(s.active).toBe(1);
    expect(s.cells.every(c => !c.entered)).toBe(true);
  });

  it('Tab/Shift+Tab move, but release focus at the ends', () => {
    const s = emptySheet(3);
    const t = press(qs, s, 'Tab');
    expect(t.handled && t.sheet.active).toBe(1);
    expect(press(qs, s, 'Tab', { shiftKey: true }).handled).toBe(false);
    expect(press(qs, { ...s, active: 2 }, 'Tab').handled).toBe(false);
    const st = press(qs, { ...s, active: 2 }, 'Tab', { shiftKey: true });
    expect(st.handled && st.sheet.active).toBe(1);
  });

  it('Enter advances, saves on the last question; Ctrl/⌘+Enter saves anywhere', () => {
    const s = emptySheet(3);
    const e = press(qs, s, 'Enter');
    expect(e.handled && e.sheet.active).toBe(1);
    expect(e.handled && e.save).toBeUndefined();
    expect(press(qs, { ...s, active: 2 }, 'Enter')).toMatchObject({ handled: true, save: true });
    expect(press(qs, s, 'Enter', { ctrlKey: true })).toMatchObject({ handled: true, save: true });
    expect(press(qs, s, 'Enter', { metaKey: true })).toMatchObject({ handled: true, save: true });
  });

  it('leaves browser shortcuts and unrelated keys alone', () => {
    const s = emptySheet(3);
    expect(press(qs, s, 'r', { ctrlKey: true }).handled).toBe(false);
    expect(press(qs, s, 'a', { metaKey: true }).handled).toBe(false);
    expect(press(qs, s, 'a', { altKey: true }).handled).toBe(false);
    expect(press(qs, s, 'F5').handled).toBe(false);
    expect(press(qs, s, '1').handled).toBe(false);
    expect(press([], s, 'a').handled).toBe(false);
  });

  it('letters are not handled on OPEN/FREE questions; navigation still is', () => {
    const mixed = [choice(1, 1), free(2, 2), open(3, 3)];
    const s = { ...emptySheet(3), active: 1 };
    expect(press(mixed, s, 'a').handled).toBe(false);
    const sp = press(mixed, updateCell(s, 1, { points: '3' }), ' ');
    expect(sp.handled && sp.sheet.cells[1].points).toBe('');
    expect(sp.handled && sp.sheet.active).toBe(2);
    const bs = press(mixed, updateCell(s, 0, { entered: true, answer: 'A' }), 'Backspace');
    expect(bs.handled && bs.sheet.active).toBe(0);
    expect(bs.handled && bs.sheet.cells[0].entered).toBe(false);
  });
});

describe('bubble clicks', () => {
  const qs = [choice(1, 1), choice(2, 2), open(3, 3)];

  it('selects and activates, toggling off the selected letter', () => {
    let s = clickBubble(qs, emptySheet(3), 1, 'C');
    expect(s.active).toBe(1);
    expect(s.cells[1]).toMatchObject({ entered: true, answer: 'C' });
    s = clickBubble(qs, s, 1, 'D');
    expect(s.cells[1].answer).toBe('D');
    s = clickBubble(qs, s, 1, 'D');
    expect(s.cells[1]).toMatchObject({ entered: false, answer: null });
  });

  it('ignores letters out of range and non-CHOICE questions', () => {
    const s = emptySheet(3);
    expect(clickBubble(qs, s, 0, 'E')).toBe(s);
    expect(clickBubble(qs, s, 2, 'A')).toBe(s);
  });
});

describe('validation, dirty signature and request', () => {
  const qs = [choice(1, 1), choice(2, 2), open(3, 3, 10), free(4, 4, 5)];

  it('finds invalid points', () => {
    let s = updateCell(emptySheet(4), 2, { points: '11' });
    s = updateCell(s, 3, { points: 'x' });
    expect(invalidQuestions(qs, s)).toEqual([2, 3]);
    expect(invalidQuestions(qs, updateCell(s, 2, { points: '9,5' }))).toEqual([3]);
  });

  it('signature reflects meaningful changes only', () => {
    const s = emptySheet(4);
    const base = sheetSignature(qs, s);
    expect(sheetSignature(qs, { ...s, active: 3 })).toBe(base);
    const blank = updateCell(s, 0, { entered: true, answer: null });
    expect(sheetSignature(qs, blank)).not.toBe(base);
    expect(sheetSignature(qs, updateCell(blank, 0, { answer: 'A' }))).not.toBe(sheetSignature(qs, blank));
    expect(sheetSignature(qs, updateCell(s, 2, { points: '2,0' }))).toBe(sheetSignature(qs, updateCell(s, 2, { points: '2' })));
    expect(sheetSignature(qs, updateCell(s, 3, { text: 'ignored for FREE' }))).toBe(base);
  });

  it('builds the complete answer set', () => {
    let s = updateCell(emptySheet(4), 0, { entered: true, answer: 'B' });
    s = updateCell(s, 2, { text: '  essay  ', points: '7,5' });
    s = updateCell(s, 3, { points: '' });
    expect(buildRequest(qs, s, '  Ali  ')).toEqual({
      fullName: 'Ali', note: null,
      answers: [
        { questionId: 1, answer: 'B', points: null },
        { questionId: 2, answer: null, points: null },  // not entered → blank
        { questionId: 3, answer: 'essay', points: 7.5 },
        { questionId: 4, answer: null, points: null },
      ],
    });
    expect(buildRequest(qs, s).fullName).toBeNull();
    expect(buildRequest(qs, s, '   ').fullName).toBeNull();
  });
});

describe('result summary and marks', () => {
  const qs = [choice(1, 1, 4, 'A'), choice(2, 2, 4, 'B'), choice(3, 3, 4, 'C'), choice(4, 4, 4, null), free(5, 5, 10), open(6, 6, 10)];

  it('counts correct / wrong / blank / pending key / ungraded', () => {
    const r = result('1', [
      { questionId: 1, answer: 'A', points: 4 },
      { questionId: 2, answer: 'C', points: 0 },
      { questionId: 3, answer: null, points: 0 },
      { questionId: 4, answer: 'D', points: null },
      { questionId: 5, answer: null, points: 6 },
    ], { totalPoints: 10 });
    expect(summarize(qs, 50, r)).toEqual({
      total: 10, max: 50, percent: 0.2, correct: 1, wrong: 1, blank: 1, pendingKey: 1, ungraded: 1, choiceCount: 4,
    });
  });

  it('percent is null for a zero total', () => {
    expect(summarize([], 0, result('1', [])).percent).toBeNull();
  });

  it('marks bubbles only when a key exists', () => {
    const cell = { entered: true, answer: 'C', points: '', text: '' };
    expect(bubbleMark(qs[2], cell, 'C')).toBe('correct');
    expect(bubbleMark(qs[1], cell, 'C')).toBe('wrong');
    expect(bubbleMark(qs[1], cell, 'B')).toBe('key');
    expect(bubbleMark(qs[1], cell, 'A')).toBeNull();
    expect(bubbleMark(qs[3], cell, 'C')).toBeNull();
    const blank = { ...cell, entered: false, answer: null };
    expect(bubbleMark(qs[1], blank, 'B')).toBe('key');
    expect(bubbleMark(qs[1], blank, 'A')).toBeNull();
    expect(bubbleMark(qs[3], blank, 'C')).toBeNull();
  });

  it('groups consecutive question kinds', () => {
    expect(groupRuns(qs)).toEqual([{ kind: 'choice', indices: [0, 1, 2, 3] }, { kind: 'score', indices: [4, 5] }]);
    expect(groupRuns([open(1, 1), choice(2, 2), free(3, 3)]).map(r => r.kind)).toEqual(['score', 'choice', 'score']);
  });
});

describe('students', () => {
  const roster = [
    { studentNo: '20210010', fullName: 'Işık Öztürk' },
    { studentNo: '20210002', fullName: 'Ali Veli' },
    { studentNo: '20210003', fullName: 'Can Şahin' },
  ];
  const results = [
    result('20210002', [], { complete: true, totalPoints: 80 }),
    result('20219999', [], { fullName: 'Misafir', complete: false }),
  ];

  it('merges roster, results and extras sorted by number', () => {
    const rows = buildStudentList(roster, results, [{ studentNo: '1', fullName: 'Ek' }, { studentNo: '20210003', fullName: 'X' }]);
    expect(rows.map(r => r.studentNo)).toEqual(['1', '20210002', '20210003', '20210010', '20219999']);
    expect(rows.find(r => r.studentNo === '20219999')).toMatchObject({ inRoster: false, fullName: 'Misafir' });
    expect(rows.find(r => r.studentNo === '20210003')).toMatchObject({ inRoster: true, fullName: 'Can Şahin' });
    expect(rows.map(studentStatus)).toEqual(['none', 'complete', 'none', 'none', 'partial']);
    expect(entryOrder(rows).map(r => r.studentNo)).toEqual(['1', '20210003', '20210010', '20210002', '20219999']);
  });

  it('sorts numerically when lengths differ', () => {
    const rows = buildStudentList([{ studentNo: '10', fullName: '' }, { studentNo: '9', fullName: '' }], []);
    expect(rows.map(r => r.studentNo)).toEqual(['9', '10']);
  });

  it('searches by number or Turkish-insensitive name', () => {
    const rows = buildStudentList(roster, results);
    expect(foldTr('IŞIK Öztürk')).toBe('isik ozturk');
    expect(filterStudents(rows, 'isik').map(r => r.studentNo)).toEqual(['20210010']);
    expect(filterStudents(rows, 'IŞIK').map(r => r.studentNo)).toEqual(['20210010']);
    expect(filterStudents(rows, 'şah').map(r => r.studentNo)).toEqual(['20210003']);
    expect(filterStudents(rows, '9999').map(r => r.studentNo)).toEqual(['20219999']);
    expect(filterStudents(rows, '  ')).toHaveLength(4);
  });

  it('picks the next roster student without a result, wrapping', () => {
    const rows = buildStudentList(roster, results);
    // order: 20210002 (done), 20210003, 20210010, 20219999 (not in roster)
    expect(nextStudent(rows, '20210002')?.studentNo).toBe('20210003');
    expect(nextStudent(rows, '20210003')?.studentNo).toBe('20210010');
    expect(nextStudent(rows, '20210010')?.studentNo).toBe('20210003');
    expect(nextStudent(rows, '20219999')?.studentNo).toBe('20210003');
    expect(nextStudent(rows, null)?.studentNo).toBe('20210003');
    expect(nextStudent(rows, 'unknown')?.studentNo).toBe('20210003');
  });

  it('returns null when every roster student has a result', () => {
    const rows = buildStudentList(roster, roster.map(r => result(r.studentNo, [])));
    expect(nextStudent(rows, '20210002')).toBeNull();
    expect(nextStudent([], null)).toBeNull();
  });

  it('upserts results in order', () => {
    const r = upsertResult(results, result('20210001', [], { totalPoints: 5 }));
    expect(r.map(x => x.studentNo)).toEqual(['20210001', '20210002', '20219999']);
    const replaced = upsertResult(r, result('20210002', [], { totalPoints: 1 }));
    expect(replaced).toHaveLength(3);
    expect(replaced.find(x => x.studentNo === '20210002')?.totalPoints).toBe(1);
  });
});

describe('entryFeedback', () => {
  const q = (correctChoice: string | null, type: 'CHOICE' | 'OPEN' = 'CHOICE') =>
    ({ id: 1, position: 1, type, text: null, topic: null, maxPoints: 1, choiceCount: 5, correctChoice }) as QuestionDto;
  const cell = (entered: boolean, answer: string | null) => ({ ...emptyCell(), entered, answer });

  it('returns ok for the key letter (case-insensitive key)', () => {
    expect(entryFeedback(q('c'), emptyCell(), cell(true, 'C'))).toBe('ok');
  });
  it('returns the key letter for a wrong letter or a blank', () => {
    expect(entryFeedback(q('B'), emptyCell(), cell(true, 'D'))).toBe('B');
    expect(entryFeedback(q('B'), emptyCell(), cell(true, null))).toBe('B');
  });
  it('stays silent without a key, on clearing, on unchanged entries and for non-choice questions', () => {
    expect(entryFeedback(q(null), emptyCell(), cell(true, 'A'))).toBeNull();
    expect(entryFeedback(q('A'), cell(true, 'A'), emptyCell())).toBeNull();
    expect(entryFeedback(q('A'), cell(true, 'B'), cell(true, 'B'))).toBeNull();
    expect(entryFeedback(q('A', 'OPEN'), emptyCell(), cell(true, 'A'))).toBeNull();
    expect(entryFeedback(undefined, emptyCell(), cell(true, 'A'))).toBeNull();
  });
  it('announces again when the answer changes', () => {
    expect(entryFeedback(q('A'), cell(true, 'B'), cell(true, 'A'))).toBe('ok');
  });
});

describe('live marking', () => {
  const qs = [
    { id: 1, position: 1, type: 'CHOICE', text: null, topic: null, maxPoints: 5, choiceCount: 4, correctChoice: 'B' },
    { id: 2, position: 2, type: 'CHOICE', text: null, topic: null, maxPoints: 5, choiceCount: 4, correctChoice: 'C' },
    { id: 3, position: 3, type: 'CHOICE', text: null, topic: null, maxPoints: 5, choiceCount: 4, correctChoice: null },
    { id: 4, position: 4, type: 'FREE', text: null, topic: null, maxPoints: 10, choiceCount: null, correctChoice: null },
  ] as QuestionDto[];
  const c = (entered: boolean, answer: string | null, points = '') => ({ ...emptyCell(), entered, answer, points });

  it('marks entered rows only, blank as wrong', () => {
    expect(rowMark(qs[0], c(true, 'B'))).toBe('correct');
    expect(rowMark(qs[0], c(true, 'A'))).toBe('wrong');
    expect(rowMark(qs[0], c(true, null))).toBe('wrong');
    expect(rowMark(qs[0], c(false, null))).toBeNull();
    expect(rowMark(qs[2], c(true, 'A'))).toBeNull();
    expect(rowMark(qs[3], c(false, null, '3'))).toBeNull();
  });

  it('summarizes the sheet like the server scores it', () => {
    const sheet: Sheet = { active: 0, cells: [c(true, 'B'), c(true, 'A'), c(true, 'D'), c(false, null, '7,5')] };
    const s = sheetSummary(qs, 25, sheet);
    expect(s.total).toBe(12.5);
    expect(s.correct).toBe(1);
    expect(s.wrong).toBe(1);
    expect(s.pendingKey).toBe(1);
    expect(s.ungraded).toBe(0);
    expect(s.percent).toBe(0.5);
  });
});

describe('searchKey', () => {
  const row = (studentNo: string) => ({ studentNo, fullName: '', inRoster: true, result: null });
  const rows = [row('100'), row('101'), row('102')];

  it('moves the highlight with arrows, clamped', () => {
    expect(searchKey('ArrowDown', -1, rows, '')).toEqual({ hl: 0 });
    expect(searchKey('ArrowDown', 2, rows, '')).toEqual({ hl: 2 });
    expect(searchKey('ArrowUp', 0, rows, '')).toEqual({ hl: 0 });
    expect(searchKey('ArrowUp', 2, rows, '')).toEqual({ hl: 1 });
    expect(searchKey('ArrowDown', -1, [], '')).toBeNull();
  });
  it('opens the highlighted row, a single match or an exact number on Enter', () => {
    expect(searchKey('Enter', 1, rows, '')).toEqual({ open: '101' });
    expect(searchKey('Enter', -1, [row('7')], '7')).toEqual({ open: '7' });
    expect(searchKey('Enter', -1, rows, ' 102 ')).toEqual({ open: '102' });
  });
  it('highlights the first row on Enter with several matches and nothing chosen', () => {
    expect(searchKey('Enter', -1, rows, '10')).toEqual({ hl: 0 });
    expect(searchKey('Enter', -1, [], 'x')).toBeNull();
    expect(searchKey('a', 0, rows, '')).toBeNull();
  });
});
