// v57: smart task list (pure, unit-tested). Automatic tasks are DERIVED from existing data every time — so they close
// by themselves when the underlying thing is done, and can never be duplicated (one stable key per thing). Only the
// user's "done / hide" for an automatic task is stored (task_dismissals). Manual tasks are rows in public.tasks.
import {dayKey, addDays, weekStart} from './lessons.ts';

export type TaskRole = 'teacher' | 'student';
export type Priority = 'high' | 'normal' | 'low';
export type Task = {
  key: string; source: 'auto' | 'manual'; role: TaskRole; title: string; arg?: string; detail?: string; priority: Priority;
  due: string | null; href?: string; action?: string; done: boolean; id?: string; studentId?: string | null;
};
export type TaskFilter = 'all' | 'today' | 'week' | 'done';

export type TeacherInput = {
  students: {id: string; name: string; archived_at?: string | null; user_id?: string | null}[];
  upcomingLessons: {student_id: string; starts_at: string; status: string}[];          // next 14 days
  submissions: {id: string; assignment_id: string; title: string; student_id: string; submitted_at: string; feedback_published_at: string | null}[];
  failedReports: {id: string; student_id: string; lesson_date: string}[];
};
export type StudentInput = {
  assignments: {id: string; title: string; student_id: string; due_at: string | null; published_at: string | null}[];
  submittedAssignmentIds: string[];
  nextLessons: {id: string; student_id: string; starts_at: string; ends_at: string; status: string; teacher_name?: string | null}[];
  pendingConsents: {id: string; student_id: string; lesson_date: string | null}[];      // recordings waiting for my AI consent
};
export type ManualRow = {id: string; title: string; notes: string | null; priority: Priority; due_at: string | null; role: TaskRole; student_id: string | null; done_at: string | null};

const DAY = 86400e3;
const enc = encodeURIComponent;

export function teacherTasks(d: TeacherInput, now: number, tz: string): Task[] {
  const out: Task[] = [];
  const name = (sid: string) => d.students.find(s => s.id === sid)?.name || 'leerling';
  for (const s of d.submissions) {
    if (s.feedback_published_at) continue;                                              // feedback given → task closed
    const waited = now - Date.parse(s.submitted_at);
    out.push({key: 'review:' + s.id, source: 'auto', role: 'teacher', title: 'Huiswerk nakijken: {0}', arg: s.title, detail: name(s.student_id),
      priority: waited > 2 * DAY ? 'high' : 'normal', due: new Date(Date.parse(s.submitted_at) + 3 * DAY).toISOString(),
      href: `/leerlingen?student=${enc(s.student_id)}&tab=huiswerk`, action: 'Nakijken', done: false, studentId: s.student_id});
  }
  for (const a of d.failedReports) out.push({key: 'report:' + a.id, source: 'auto', role: 'teacher', title: 'AI-lesverslag mislukt', detail: `${name(a.student_id)} · ${a.lesson_date}`,
    priority: 'normal', due: null, href: `/leerlingen?student=${enc(a.student_id)}&tab=analyses`, action: 'Bekijken', done: false, studentId: a.student_id});
  // active students (with an account) without a planned lesson in the next 14 days — once per week
  const planned = new Set(d.upcomingLessons.filter(l => l.status !== 'cancelled').map(l => l.student_id));
  const wk = weekStart(dayKey(now, tz));
  for (const s of d.students) {
    if (s.archived_at || planned.has(s.id) || !s.user_id) continue;
    out.push({key: `plan:${s.id}:${wk}`, source: 'auto', role: 'teacher', title: 'Les inplannen met {0}', arg: s.name, detail: 'Geen les in de komende 2 weken',
      priority: 'low', due: null, href: '/agenda?nieuw=1', action: 'Inplannen', done: false, studentId: s.id});
  }
  return out;
}

export function studentTasks(d: StudentInput, now: number): Task[] {
  const out: Task[] = [], done = new Set(d.submittedAssignmentIds);
  for (const a of d.assignments) {
    if (!a.published_at || done.has(a.id)) continue;                                     // handed in → task closed
    const due = a.due_at, left = due ? Date.parse(due) - now : Infinity;
    out.push({key: 'hw:' + a.id, source: 'auto', role: 'student', title: 'Huiswerk maken: {0}', arg: a.title, priority: left < DAY ? 'high' : left < 3 * DAY ? 'normal' : 'low',
      due, href: `/mijn-profiel?student=${enc(a.student_id)}&tab=huiswerk`, action: 'Maken', done: false, studentId: a.student_id});
  }
  for (const l of d.nextLessons) {
    if (l.status === 'cancelled' || Date.parse(l.ends_at) <= now || Date.parse(l.starts_at) - now > DAY) continue;
    out.push({key: 'lesson:' + l.id, source: 'auto', role: 'student', title: l.teacher_name ? 'Les volgen bij {0}' : 'Les volgen', arg: l.teacher_name || undefined, priority: 'high', due: l.starts_at,
      href: `/klaslokaal/live?student=${enc(l.student_id)}&lesson=${enc(l.id)}&als=leerling`, action: 'Naar het klaslokaal', done: false, studentId: l.student_id});
  }
  for (const r of d.pendingConsents) out.push({key: 'consent:' + r.id, source: 'auto', role: 'student', title: 'Toestemming voor AI-lesverslag', detail: r.lesson_date || undefined,
    priority: 'normal', due: null, href: `/mijn-profiel?student=${enc(r.student_id)}&tab=lessen`, action: 'Bekijken', done: false, studentId: r.student_id});
  return out;
}

export function manualTasks(rows: ManualRow[]): Task[] {
  return rows.map(r => ({key: 'manual:' + r.id, id: r.id, source: 'manual' as const, role: r.role, title: r.title, detail: r.notes || undefined, priority: r.priority,
    due: r.due_at, done: !!r.done_at, studentId: r.student_id}));
}

/** Merge, drop duplicates (first key wins), mark dismissed automatic tasks as done. */
export function combine(lists: Task[][], dismissed: Iterable<string>): Task[] {
  const dis = new Set(dismissed), seen = new Map<string, Task>();
  for (const t of lists.flat()) if (!seen.has(t.key)) seen.set(t.key, t.source === 'auto' && dis.has(t.key) ? {...t, done: true} : t);
  return [...seen.values()];
}

const RANK: Record<Priority, number> = {high: 0, normal: 1, low: 2};
export function sortTasks(list: Task[]) {
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || RANK[a.priority] - RANK[b.priority]
    || (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity) || a.title.localeCompare(b.title));
}

/** Vandaag = overdue or due today (in the user's zone), plus high priority without a date; Deze week = due before next Monday. */
export function filterTasks(list: Task[], f: TaskFilter, now: number, tz: string) {
  if (f === 'done') return list.filter(t => t.done);
  const open = list.filter(t => !t.done);
  if (f === 'all') return open;
  const today = dayKey(now, tz), end = f === 'today' ? today : addDays(weekStart(today), 6);
  return open.filter(t => t.due ? dayKey(t.due, tz) <= end : t.priority === 'high');
}
export const badgeCount = (list: Task[], now: number, tz: string) => filterTasks(list, 'today', now, tz).length;
export const isOverdue = (t: Task, now: number) => !t.done && !!t.due && Date.parse(t.due) < now && !t.key.startsWith('lesson:');
