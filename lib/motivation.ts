// v74: motivation without a second bookkeeping. XP, the week goal and milestones are DERIVED from activities that are
// already stored once (practice sessions, submitted homework, attended lessons, word list, learning line). So XP can
// never be awarded twice (a refresh, retry or reopened activity changes nothing), it is per relation = per learning
// language, and it never changes the CEFR level or any mastery status. No public ranking anywhere.
export const XP = {daily: 20, game: 10, homework: 30, lesson: 50, weekGoal: 50} as const;
/** Anti-repeat: at most this many game rounds count per day; a round counts only with at least MIN_ROUND answers. */
export const GAME_CAP_PER_DAY = 6, MIN_ROUND = 3; // v76: the short rounds of the daily route (3 items) count too

/** The student's local calendar day of a timestamp (the browser's time zone = the student's own). */
export const localDay = (iso: string, tz?: string) => new Date(iso).toLocaleDateString('en-CA', tz ? {timeZone: tz} : undefined);
type Sess = {created_at: string; total: number; kind: string; details?: {day?: string} | null};
/** ONE definition of a practice day (used by every streak in the app): any stored practice session that day. */
export function practiceDays(rows: Sess[], tz?: string): string[] {
  return [...new Set(rows.map(r => r.kind === 'daily' && r.details?.day ? r.details.day : localDay(r.created_at, tz)))].sort();
}
const addDay = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
/** Monday of the week of a day (YYYY-MM-DD). */
export function weekOf(day: string) { const w = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7; return addDay(day, -w); }
/** This week Monday…Sunday with practised yes/no, and whether the goal (days per week) is reached. */
export function weekProgress(days: string[], goal: number, today: string) {
  const mon = weekOf(today), set = new Set(days);
  const week = Array.from({length: 7}, (_, i) => { const d = addDay(mon, i); return {day: d, done: set.has(d), future: d > today}; });
  const done = week.filter(x => x.done).length;
  return {week, done, goal, reached: done >= goal};
}
/** Weeks (Mondays) in which the goal was reached. */
export function goalWeeks(days: string[], goal: number): string[] {
  const per = new Map<string, number>(); for (const d of new Set(days)) per.set(weekOf(d), (per.get(weekOf(d)) || 0) + 1);
  return [...per.entries()].filter(([, n]) => n >= goal).map(([w]) => w).sort();
}

export type XpInput = {practice: Sess[]; homeworkDone: number; lessons: number; goal: number; tz?: string};
export function xpOf(i: XpInput) {
  const daily = new Set(i.practice.filter(r => r.kind === 'daily').map(r => r.details?.day || localDay(r.created_at, i.tz))).size;
  const perDay = new Map<string, number>();
  for (const r of i.practice) if (r.kind !== 'daily' && (r.total || 0) >= MIN_ROUND) { const d = localDay(r.created_at, i.tz); perDay.set(d, Math.min(GAME_CAP_PER_DAY, (perDay.get(d) || 0) + 1)); }
  const games = [...perDay.values()].reduce((a, b) => a + b, 0);
  const weeks = goalWeeks(practiceDays(i.practice, i.tz), i.goal).length;
  const parts = {daily: daily * XP.daily, games: games * XP.game, homework: i.homeworkDone * XP.homework, lessons: i.lessons * XP.lesson, weeks: weeks * XP.weekGoal};
  return {...parts, total: Object.values(parts).reduce((a, b) => a + b, 0)};
}

/* ---------------- milestones: only real data; the date is when it was first reached, if that is known ---------------- */
export type Milestone = {key: string; label: string; date: string | null; icon: 'lesson' | 'homework' | 'words' | 'goal' | 'grammar' | 'time'};
export type MilestoneInput = {
  lessonDates: string[];                                  // attended lessons (sorted or not)
  lessonMinutes: {date: string; minutes: number}[];       // measured minutes only
  homeworkDates: string[];                                // submitted_at of submitted homework
  practisedWords: number;                                 // unique words practised at least once (date unknown)
  masteredDates: string[];                                // updated_at of topics marked mastered by the teacher
  goalWeeks: string[];
};
const nth = (dates: string[], n: number) => { const s = dates.filter(Boolean).map(d => d.slice(0, 10)).sort(); return s.length >= n ? s[n - 1] : undefined; };
export function milestones(m: MilestoneInput): Milestone[] {
  const out: Milestone[] = [];
  const push = (key: string, label: string, icon: Milestone['icon'], date: string | null | undefined) => { if (date !== undefined) out.push({key, label, icon, date}); };
  push('lesson1', 'Eerste les gevolgd', 'lesson', nth(m.lessonDates, 1));
  push('lesson10', 'Tien lessen gevolgd', 'lesson', nth(m.lessonDates, 10));
  push('lesson50', 'Vijftig lessen gevolgd', 'lesson', nth(m.lessonDates, 50));
  push('hw1', 'Eerste huiswerk afgerond', 'homework', nth(m.homeworkDates, 1));
  push('hw10', 'Tien keer huiswerk afgerond', 'homework', nth(m.homeworkDates, 10));
  if (m.practisedWords >= 100) push('words100', 'Honderd unieke woorden geoefend', 'words', null);
  if (m.practisedWords >= 500) push('words500', 'Vijfhonderd unieke woorden geoefend', 'words', null);
  push('goal1', 'Eerste weekdoel bereikt', 'goal', nth(m.goalWeeks, 1));
  push('gram1', 'Eerste grammaticaonderwerp beheerst', 'grammar', nth(m.masteredDates, 1));
  push('gram10', 'Tien grammaticaonderwerpen beheerst', 'grammar', nth(m.masteredDates, 10));
  let sum = 0; for (const x of [...m.lessonMinutes].sort((a, b) => a.date.localeCompare(b.date))) { sum += x.minutes; if (sum >= 300) { push('hours5', 'Vijf uur les gevolgd', 'time', x.date.slice(0, 10)); break; } }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/* v75: experience levels — completely separate from CEFR and grammar mastery; one central setting */
export const XP_PER_LEVEL = 100;
export function levelOf(xp: number) { const x = Math.max(0, Math.floor(xp)); return {level: Math.floor(x / XP_PER_LEVEL) + 1, into: x % XP_PER_LEVEL, need: XP_PER_LEVEL, toNext: XP_PER_LEVEL - (x % XP_PER_LEVEL)}; }
