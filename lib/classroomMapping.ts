// Pure, dependency-free mapping between the live classroom's (legacy v16)
// in-memory data model and the Supabase tables. Unit-tested in tests/unit.
// Keep this file free of imports so Node can run it directly in tests.

export type LegacyWord = {nl: string; uit?: string};
export type LegacyLesson = {date: string; notes: string; words: LegacyWord[]; hw: string; sorted?: unknown};
export type LegacyStudent = {id: string; name: string; level: string; goal: string; about: string; lessonLanguage: string};
export type LegacyDb = {students: LegacyStudent[]; lessons: Record<string, LegacyLesson[]>; sel: string | null};

export type StudentRow = {id: string; name: string; level: string | null; goals: string | null; about: string | null; lesson_language: string | null};
export type LessonRow = {student_id: string; lesson_date: string; notes: string; homework: string; words: LegacyWord[] | null; sorted: unknown};
export type StudentPatch = {id: string; patch: {name?: string; level?: string; goals?: string; about?: string; lesson_language?: string}};

const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function toLegacyStudent(r: StudentRow): LegacyStudent {
  return {
    id: r.id,
    name: r.name,
    level: LEVELS.includes(r.level || '') ? (r.level as string) : 'A1',
    goal: r.goals || '',
    about: r.about || '',
    lessonLanguage: r.lesson_language || 'nl',
  };
}

export function toLegacyLesson(r: LessonRow): LegacyLesson {
  const l: LegacyLesson = {
    date: r.lesson_date,
    notes: r.notes || '',
    words: Array.isArray(r.words) ? r.words.filter(w => w && typeof w.nl === 'string').map(w => ({nl: w.nl, uit: w.uit || ''})) : [],
    hw: r.homework || '',
  };
  if (r.sorted) l.sorted = r.sorted;
  return l;
}

export function rowsToLegacyDb(students: StudentRow[], lessons: LessonRow[], sel: string | null): LegacyDb {
  const db: LegacyDb = {students: students.map(toLegacyStudent), lessons: {}, sel: null};
  for (const s of db.students) db.lessons[s.id] = [];
  for (const l of lessons) if (db.lessons[l.student_id]) db.lessons[l.student_id].push(toLegacyLesson(l));
  for (const id of Object.keys(db.lessons)) db.lessons[id].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  db.sel = sel && db.students.some(s => s.id === sel) ? sel : (db.students[0]?.id ?? null);
  return db;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A JSON fingerprint per student and per lesson; used to detect what changed. */
export function snapshot(db: LegacyDb): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const s of db.students || []) {
    snap['s:' + s.id] = JSON.stringify([s.name, s.level, s.goal || '', s.about || '', s.lessonLanguage || 'nl']);
    for (const l of (db.lessons || {})[s.id] || []) {
      snap['l:' + s.id + ':' + l.date] = JSON.stringify([l.notes || '', l.hw || '', l.words || [], l.sorted ?? null]);
    }
  }
  return snap;
}

/**
 * Compute the minimal set of Supabase writes needed to go from `prev` to `next`.
 * Only students in `allowedIds` (the teacher's own Supabase students) are written,
 * so data can never be written for a student id the classroom invented.
 */
export function diffLegacyDb(prev: Record<string, string>, next: LegacyDb, allowedIds: Set<string>): {students: StudentPatch[]; lessons: LessonRow[]} {
  const out = {students: [] as StudentPatch[], lessons: [] as LessonRow[]};
  for (const s of next.students || []) {
    if (!allowedIds.has(s.id)) continue;
    const sk = 's:' + s.id;
    const sv = JSON.stringify([s.name, s.level, s.goal || '', s.about || '', s.lessonLanguage || 'nl']);
    if (prev[sk] !== sv) {
      const name = String(s.name || '').trim().slice(0, 120);
      out.students.push({id: s.id, patch: {
        ...(name ? {name} : {}),
        level: String(s.level || '').slice(0, 4),
        goals: String(s.goal || '').slice(0, 4000),
        about: String(s.about || '').slice(0, 8000),
        lesson_language: String(s.lessonLanguage || 'nl').slice(0, 5),
      }});
    }
    for (const l of (next.lessons || {})[s.id] || []) {
      if (!l || !ISO_DAY.test(l.date)) continue;
      const lk = 'l:' + s.id + ':' + l.date;
      const lv = JSON.stringify([l.notes || '', l.hw || '', l.words || [], l.sorted ?? null]);
      if (prev[lk] === lv) continue;
      out.lessons.push({
        student_id: s.id,
        lesson_date: l.date,
        notes: String(l.notes || '').slice(0, 50000),
        homework: String(l.hw || '').slice(0, 20000),
        words: (Array.isArray(l.words) ? l.words : []).slice(0, 500).map(w => ({nl: String(w.nl || '').slice(0, 200), uit: String(w.uit || '').slice(0, 300)})),
        sorted: l.sorted ?? null,
      });
    }
  }
  return out;
}

/** Parse a classroom storage key ("notes", "canvas:<id>", "board:<id>"). */
export function parseKey(key: string): {kind: 'notes'} | {kind: 'canvas' | 'board'; studentId: string | null} | null {
  if (key === 'notes') return {kind: 'notes'};
  const m = /^(canvas|board):(.+)$/.exec(key);
  if (!m) return null;
  const id = m[2] === 'algemeen' ? null : m[2];
  return {kind: m[1] as 'canvas' | 'board', studentId: id};
}

export type BackupMatch = {oldId: string; oldName: string; newId: string | null; newName: string | null};

/** Match students from an old classroom backup (v15/v16 JSON) to Supabase students by name. */
export function matchBackupStudents(backup: {notes?: {students?: {id: string; name: string}[]}; students?: {id: string; name: string}[]}, current: {id: string; name: string}[]): BackupMatch[] {
  const notes = backup.notes || backup;
  const old = Array.isArray(notes.students) ? notes.students : [];
  const norm = (x: string) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return old.map(o => {
    const exact = current.filter(c => norm(c.name) === norm(o.name));
    const first = exact.length === 1 ? exact[0] : current.filter(c => norm(c.name).split(' ')[0] === norm(o.name).split(' ')[0]);
    const hit = Array.isArray(first) ? (first.length === 1 ? first[0] : null) : first;
    return {oldId: o.id, oldName: o.name, newId: hit ? hit.id : null, newName: hit ? hit.name : null};
  });
}

/** Merge old backup lessons into existing lessons: never overwrite an existing day. */
export function mergeBackupLessons(existing: LegacyLesson[], incoming: LegacyLesson[]): LegacyLesson[] {
  const days = new Set(existing.map(l => l.date));
  const added = (incoming || []).filter(l => l && ISO_DAY.test(l.date) && !days.has(l.date));
  return existing.concat(added).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Progress figures for a student, derived from stored data only (no invented metrics). */
export function progressOf(lessons: {lesson_date: string; words?: unknown}[], assignments: {published_at: string | null}[] = [], submissions: {assignment_id: string}[] = [], now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const words = lessons.reduce((n, l) => n + (Array.isArray(l.words) ? l.words.length : 0), 0);
  const published = assignments.filter(a => a.published_at).length;
  const done = new Set(submissions.map(s => s.assignment_id)).size;
  const sorted = lessons.map(l => l.lesson_date).sort();
  return {
    lessons: lessons.length,
    lessonsThisMonth: lessons.filter(l => l.lesson_date.startsWith(month)).length,
    words,
    homeworkPublished: published,
    homeworkDone: Math.min(done, published),
    lastLesson: sorted.length ? sorted[sorted.length - 1] : null,
  };
}
