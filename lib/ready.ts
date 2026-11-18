// v38: "Voor jou klaar" on the student dashboard (pure, unit-tested). Only what the student is ALLOWED to see
// reaches this function (RLS): published homework, own words, teacher-approved lesson reports.
export type ReadyInput = {
  students: {id: string}[];
  assignments: {id: string; student_id: string; title: string; published_at: string | null}[];
  submissions: {assignment_id: string}[];
  vocab: {student_id: string; status: string; due_at?: string | null; translation?: string | null}[];
  summaries: {student_id: string; id: string; lesson_date: string; final: unknown}[];
};
export type ReadyItem = {studentId: string; homework: {id: string; title: string}[]; dueWords: number; latest: {id: string; lesson_date: string; final: unknown} | null;
  /** v40: progress for the homework card (published = visible to the student, done = handed in) */
  homeworkPublished?: number; homeworkDone?: number};

export function readyFor(d: ReadyInput, now = Date.now()): ReadyItem[] {
  const done = new Set(d.submissions.map(s => s.assignment_id));
  return d.students.map(s => {
    const homework = d.assignments
      .filter(a => a.student_id === s.id && !!a.published_at && !done.has(a.id))
      .sort((a, b) => (a.published_at! < b.published_at! ? 1 : -1))
      .map(a => ({id: a.id, title: a.title}));
    // flashcards need a meaning on the back; mastered words wait for their next review date like the others
    const dueWords = d.vocab.filter(v => v.student_id === s.id && !!(v.translation || '').trim() && (!v.due_at || new Date(v.due_at).getTime() <= now)).length;
    const latest = d.summaries.filter(x => x.student_id === s.id).sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : -1))[0] || null;
    const published = d.assignments.filter(a => a.student_id === s.id && !!a.published_at);
    return {studentId: s.id, homework, dueWords, latest: latest ? {id: latest.id, lesson_date: latest.lesson_date, final: latest.final} : null,
      homeworkPublished: published.length, homeworkDone: published.filter(a => done.has(a.id)).length};
  });
}
export const hasReady = (r: ReadyItem) => r.homework.length > 0 || r.dueWords > 0 || !!r.latest;
