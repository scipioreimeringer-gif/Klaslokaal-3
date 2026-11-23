// Planned lessons (v30): status, time zones, calendar grid, countdown, error messages.
// Pure functions (unit-tested); times are stored as absolute instants and shown in the viewer's own zone.
import {t, locale} from './i18n.ts';

export type Lesson = {
  id: string; student_id: string; teacher_id: string; starts_at: string; ends_at: string; timezone: string;
  language: string | null; status: 'scheduled' | 'completed' | 'cancelled'; series_id: string | null; cancelled_at: string | null;
};
export type LessonState = 'scheduled' | 'live' | 'completed' | 'cancelled';
export const LESSON_COLUMNS = 'id,student_id,teacher_id,starts_at,ends_at,timezone,language,status,series_id,cancelled_at';

/** Shown status: cancelled > explicitly completed > live (now between start and end) > completed (ended) > scheduled. */
export function lessonState(l: Pick<Lesson, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()): LessonState {
  if (l.status === 'cancelled') return 'cancelled';
  if (l.status === 'completed') return 'completed';
  const s = Date.parse(l.starts_at), e = Date.parse(l.ends_at);
  if (now >= s && now < e) return 'live';
  if (now >= e) return 'completed';
  return 'scheduled';
}
export const stateLabel = (s: LessonState) => ({scheduled: t('Gepland'), live: t('Bezig'), completed: t('Afgerond'), cancelled: t('Geannuleerd')})[s];

/** The viewer's time zone (browser). */
export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
/** Calendar day of an instant in a zone: 'YYYY-MM-DD'. */
export function dayKey(iso: string | number | Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(iso));
}
/** Wall-clock time 'HH:MM' of an instant in a zone. */
export function clock(iso: string | number | Date, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));
}
export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = {weekday: 'long', day: 'numeric', month: 'long'}) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString(locale(), {...opts, timeZone: 'UTC'});
}
export function fmtWhen(l: Pick<Lesson, 'starts_at' | 'ends_at'>, tz: string) {
  return `${fmtDay(dayKey(l.starts_at, tz))} · ${clock(l.starts_at, tz)}–${clock(l.ends_at, tz)}`;
}
export const minutesOf = (l: Pick<Lesson, 'starts_at' | 'ends_at'>) => Math.round((Date.parse(l.ends_at) - Date.parse(l.starts_at)) / 60000);

/* ---------- calendar arithmetic on 'YYYY-MM-DD' (pure dates, no time zone involved) ---------- */
export function addDays(day: string, n: number) {
  const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
/** Monday of the week containing day. */
export function weekStart(day: string) {
  const dow = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(day, -dow);
}
export type View = 'day' | 'week' | 'month';
/** Days shown for a view (month: full weeks Monday–Sunday covering the month). */
export function gridDays(anchor: string, view: View): string[] {
  if (view === 'day') return [anchor];
  if (view === 'week') { const s = weekStart(anchor); return Array.from({length: 7}, (_, i) => addDays(s, i)); }
  const first = anchor.slice(0, 8) + '01';
  const s = weekStart(first);
  const nextMonth = addDays(first, 32).slice(0, 8) + '01';
  const days: string[] = [];
  for (let d = s; d < nextMonth || days.length % 7; d = addDays(d, 1)) days.push(d);
  return days;
}
export function shift(anchor: string, view: View, dir: -1 | 1) {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week') return addDays(anchor, 7 * dir);
  const d = new Date(anchor.slice(0, 8) + '15T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + dir); return d.toISOString().slice(0, 10);
}
/** Group lessons by calendar day in the viewer's zone, sorted by start. */
export function byDay<T extends {starts_at: string}>(lessons: T[], tz: string) {
  const m = new Map<string, T[]>();
  for (const l of [...lessons].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) { const k = dayKey(l.starts_at, tz); m.set(k, [...(m.get(k) || []), l]); }
  return m;
}
/** Next lesson that is not cancelled and not yet over (a running lesson counts). */
export function nextLesson(lessons: Lesson[], now = Date.now()) {
  return [...lessons].filter(l => l.status !== 'cancelled' && l.status !== 'completed' && Date.parse(l.ends_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] || null;
}

/** v43: "Over 1 dag en 2 uur" / "Over 5 uur en 30 min" / "Over 25 minuten" / "Les bezig" — measured from the absolute
 *  start time (time-zone safe), never rounded up to a start that passed. */
export function countdown(startIso: string, now = Date.now()) {
  const ms = Date.parse(startIso) - now;
  if (ms <= 0) return t('Les bezig');
  const min = Math.ceil(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24), rh = h - d * 24, rm = min - h * 60;
  if (d >= 1) return rh ? t(d === 1 ? 'Over {0} dag en {1} uur' : 'Over {0} dagen en {1} uur', d, rh) : t(d === 1 ? 'Over {0} dag' : 'Over {0} dagen', d);
  if (h >= 1) return rm ? t('Over {0} uur en {1} min', h, rm) : t('Over {0} uur', h);
  return t(min === 1 ? 'Over 1 minuut' : 'Over {0} minuten', min);
}

/** Readable message for database errors from planning (double booking, invalid input). */
export function planningError(msg: string) {
  const m = msg.match(/DOUBLE_BOOKING_(TEACHER|STUDENT|PERSONAL)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (m) {
    const when = `${fmtDay(m[2], {weekday: 'short', day: 'numeric', month: 'short'})} ${m[3]}`;
    if (m[1] === 'PERSONAL') return t('Dubbele boeking: je hebt op {0} een persoonlijke afspraak.', when);
    return m[1] === 'TEACHER' ? t('Dubbele boeking: je hebt op {0} al een les (die je geeft of zelf volgt).', when) : t('Dubbele boeking: deze leerling heeft op {0} al een les (ook bij een andere docent).', when);
  }
  // v59: booking by the learner
  const na = msg.match(/NOT_AVAILABLE\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (na) return t('Je docent is op {0} niet beschikbaar.', `${fmtDay(na[1], {weekday: 'short', day: 'numeric', month: 'short'})} ${na[2]}`);
  if (/NO_AVAILABILITY/.test(msg)) return t('Je docent heeft nog geen beschikbaarheid ingesteld.');
  if (/TOO_SOON/.test(msg)) return t('Boek minstens een uur van tevoren.');
  if (/Invalid time zone/.test(msg)) return t('Ongeldige tijdzone.');
  if (/Invalid duration/.test(msg)) return t('Kies een lesduur tussen 10 minuten en 8 uur.');
  if (/Invalid number of weeks/.test(msg)) return t('Kies tussen 1 en 52 weken.');
  if (/lessons|schedule_lessons|relation .* does not exist|function .* does not exist/i.test(msg)) return t('De agenda is nog niet ingesteld: voer supabase/v30.sql uit.');
  return msg;
}

/** Classroom link; the lesson id links recordings and the analysis to this lesson. */
/** v57: with the role (als=docent|leerling) the classroom opens with the right access when one account is both. */
export const classroomHref = (l: Pick<Lesson, 'id' | 'student_id'>, as?: 'teacher' | 'student') =>
  `/klaslokaal/live?student=${encodeURIComponent(l.student_id)}&lesson=${encodeURIComponent(l.id)}` + (as ? '&als=' + (as === 'teacher' ? 'docent' : 'leerling') : '');

/** All IANA time zones the browser knows (fallback: a short list). */
export function timeZones(): string[] {
  const i = Intl as unknown as {supportedValuesOf?: (k: string) => string[]};
  try { const z = i.supportedValuesOf?.('timeZone'); if (z && z.length) return z; } catch { /* old browser */ }
  return ['Europe/Amsterdam', 'Europe/Brussels', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'America/Sao_Paulo', 'America/New_York', 'UTC'];
}
