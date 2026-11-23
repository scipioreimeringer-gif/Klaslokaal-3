// v57: the central agenda — one list of everything one account is involved in, whatever the role (pure, unit-tested).
//   teach    = a lesson I give (lessons.teacher_id = me)
//   learn    = a lesson I follow (my learner profile: students.user_id = me) and do NOT give myself
//   personal = my own appointment (personal_events.owner_id = me)
// A lesson appears ONCE: the same lesson id from several queries/profiles is merged; if I am both its teacher and
// its learner (own test profile) it counts as "teach". Only my own involvement is used — an admin sees no others.
import type {Lesson} from './lessons.ts';

export type AgendaKind = 'teach' | 'learn' | 'personal';
export type PersonalEvent = {id: string; title: string; notes: string | null; starts_at: string; ends_at: string; timezone: string; blocks_lessons: boolean};
export type AgendaItem =
  | {key: string; kind: 'teach' | 'learn'; starts_at: string; ends_at: string; lesson: Lesson}
  | {key: string; kind: 'personal'; starts_at: string; ends_at: string; event: PersonalEvent};
export type AgendaFilter = 'all' | AgendaKind;
export const FILTERS: AgendaFilter[] = ['all', 'teach', 'learn', 'personal'];
export const PERSONAL_COLUMNS = 'id,title,notes,starts_at,ends_at,timezone,blocks_lessons';

export function mergeAgenda(me: string, lessons: Lesson[][], learnerStudentIds: Iterable<string>, events: PersonalEvent[] = []): AgendaItem[] {
  const mine = new Set(learnerStudentIds), seen = new Map<string, AgendaItem>();
  for (const l of lessons.flat()) {
    const kind: AgendaKind | null = l.teacher_id === me ? 'teach' : mine.has(l.student_id) ? 'learn' : null;
    if (!kind) continue;                                                 // not mine (e.g. visible to an admin): never shown
    const prev = seen.get('l:' + l.id);
    if (prev && prev.kind === 'teach') continue;
    seen.set('l:' + l.id, {key: 'l:' + l.id, kind, starts_at: l.starts_at, ends_at: l.ends_at, lesson: l});
  }
  for (const e of events) seen.set('p:' + e.id, {key: 'p:' + e.id, kind: 'personal', starts_at: e.starts_at, ends_at: e.ends_at, event: e});
  return [...seen.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.key.localeCompare(b.key));
}

export const applyFilter = (items: AgendaItem[], f: AgendaFilter) => f === 'all' ? items : items.filter(i => i.kind === f);

export function readFilter(v: string | null | undefined, canTeach: boolean): AgendaFilter {
  const f = (FILTERS as string[]).includes(String(v)) ? v as AgendaFilter : 'all';
  return f === 'teach' && !canTeach ? 'all' : f;
}

/** Busy slots across all roles (for a quick check in the planning form; the database has the final say). */
export function overlaps(items: AgendaItem[], start: number, end: number, ignoreLessonId?: string) {
  return items.filter(i => {
    if (i.kind !== 'personal' && (i.lesson.status === 'cancelled' || i.lesson.id === ignoreLessonId)) return false;
    if (i.kind === 'personal' && !i.event.blocks_lessons) return false;
    return Date.parse(i.starts_at) < end && Date.parse(i.ends_at) > start;
  });
}
