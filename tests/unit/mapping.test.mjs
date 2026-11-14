import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rowsToLegacyDb, snapshot, diffLegacyDb, parseKey, matchBackupStudents, mergeBackupLessons, progressOf} from '../../lib/classroomMapping.ts';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const students = [
  {id: A, name: 'Ana Silva', level: 'B1', goals: 'Examen', about: '', lesson_language: 'pt'},
  {id: B, name: 'Bram', level: null, goals: null, about: null, lesson_language: null},
];
const lessons = [
  {student_id: A, lesson_date: '2026-11-12', notes: 'Les 2', homework: 'hw2', words: [{nl: 'casa', uit: 'huis'}], sorted: null},
  {student_id: A, lesson_date: '2026-11-05', notes: 'Les 1', homework: '', words: [], sorted: null},
  {student_id: B, lesson_date: '2026-11-12', notes: 'B-les', homework: '', words: null, sorted: null},
  {student_id: 'unknown', lesson_date: '2026-11-12', notes: 'x', homework: '', words: [], sorted: null},
];

test('rows map to classroom db with per-student lessons, sorted by date', () => {
  const db = rowsToLegacyDb(students, lessons, B);
  assert.equal(db.sel, B);
  assert.deepEqual(db.lessons[A].map(l => l.date), ['2026-11-05', '2026-11-12']);
  assert.equal(db.lessons[B][0].notes, 'B-les');
  assert.equal(db.lessons[B][0].words.length, 0);
  assert.equal(db.students[1].level, 'A1', 'unknown level falls back to A1');
  assert.equal(db.lessons.unknown, undefined, 'lessons for unknown students are dropped');
});

test('selection falls back to first student when the requested one is not allowed', () => {
  assert.equal(rowsToLegacyDb(students, [], 'nope').sel, A);
  assert.equal(rowsToLegacyDb([], [], 'nope').sel, null);
});

test('diff is empty when nothing changed', () => {
  const db = rowsToLegacyDb(students, lessons, A);
  const d = diffLegacyDb(snapshot(db), db, new Set([A, B]));
  assert.equal(d.students.length, 0);
  assert.equal(d.lessons.length, 0);
});

test('diff only contains the changed lesson of the changed student', () => {
  const db = rowsToLegacyDb(students, lessons, A);
  const snap = snapshot(db);
  db.lessons[A][1].words.push({nl: 'mesa', uit: 'tafel'});
  db.lessons[B].push({date: '2026-11-14', notes: 'nieuw', words: [], hw: 'lees'});
  const d = diffLegacyDb(snap, db, new Set([A, B]));
  assert.equal(d.students.length, 0);
  assert.deepEqual(d.lessons.map(l => [l.student_id, l.lesson_date]), [[A, '2026-11-12'], [B, '2026-11-14']]);
  assert.equal(d.lessons[1].homework, 'lees');
});

test('student profile edits become a patch; ids not owned are never written', () => {
  const db = rowsToLegacyDb(students, lessons, A);
  const snap = snapshot(db);
  db.students[0].goal = 'C1 halen';
  db.students.push({id: 'invented', name: 'Hack', level: 'A1', goal: '', about: '', lessonLanguage: 'nl'});
  db.lessons.invented = [{date: '2026-11-14', notes: 'x', words: [], hw: ''}];
  const d = diffLegacyDb(snap, db, new Set([A, B]));
  assert.equal(d.students.length, 1);
  assert.equal(d.students[0].patch.goals, 'C1 halen');
  assert.equal(d.lessons.length, 0);
});

test('invalid lesson dates are ignored', () => {
  const db = rowsToLegacyDb(students, [], A);
  db.lessons[A].push({date: 'gisteren', notes: 'x', words: [], hw: ''});
  assert.equal(diffLegacyDb(snapshot(rowsToLegacyDb(students, [], A)), db, new Set([A])).lessons.length, 0);
});

test('storage keys are parsed', () => {
  assert.deepEqual(parseKey('notes'), {kind: 'notes'});
  assert.deepEqual(parseKey('canvas:' + A), {kind: 'canvas', studentId: A});
  assert.deepEqual(parseKey('board:algemeen'), {kind: 'board', studentId: null});
  assert.equal(parseKey('evil'), null);
});

test('backup students are matched by (first) name, ambiguous names are not matched', () => {
  const m = matchBackupStudents({notes: {students: [{id: 'x1', name: 'ana silva'}, {id: 'x2', name: 'Bram de Vries'}, {id: 'x3', name: 'Zoë'}]}},
    [{id: A, name: 'Ana Silva'}, {id: B, name: 'Bram'}, {id: 'c', name: 'Ana Costa'}]);
  assert.equal(m[0].newId, A);
  assert.equal(m[1].newId, B);
  assert.equal(m[2].newId, null);
});

test('merging backup lessons never overwrites an existing day', () => {
  const merged = mergeBackupLessons([{date: '2026-01-02', notes: 'nieuw', words: [], hw: ''}],
    [{date: '2026-01-02', notes: 'oud', words: [], hw: ''}, {date: '2025-12-01', notes: 'oud2', words: [], hw: ''}]);
  assert.deepEqual(merged.map(l => l.notes), ['oud2', 'nieuw']);
});

test('progress is derived from stored data only', () => {
  const p = progressOf([{lesson_date: '2026-11-12', words: [1, 2]}, {lesson_date: '2026-10-01', words: [3]}],
    [{published_at: 'x'}, {published_at: null}, {published_at: 'y'}], [{assignment_id: 'a'}, {assignment_id: 'a'}], new Date('2026-11-14T10:00:00Z'));
  assert.deepEqual(p, {lessons: 2, lessonsThisMonth: 1, words: 3, homeworkPublished: 2, homeworkDone: 1, lastLesson: '2026-11-12'});
});
