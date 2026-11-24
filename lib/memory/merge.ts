// v61: AI memory — merge ONE published lesson report into the student's memory (pure, unit-tested, no AI call).
// Uses only what the analysis already produced: verified errors (category, certainty, slip/error, repeats) and the
// topics covered. Rules:
//  * a pattern counts LESSONS, not repetitions (5× the same mistake in one lesson = 1 lesson, 5 occurrences)
//  * an uncertain observation (possible transcription error, poor audio, speakers not separated) never becomes a
//    fact on its own: it raises `uncertain`, not `lessons_seen`; confidence stays low
//  * a slip of the tongue is not a grammar error (only counted as `slips` on an existing pattern)
//  * mastery needs several lessons: one clean lesson after a mistake = "fair", two or more = "mastered"
//  * errors the teacher removed from the report are ignored; the teacher's own status/hidden/note are never touched
import {categoryKey, type ErrorItem} from '../analysis/core.ts';

export type Status = 'new' | 'learning' | 'fair' | 'mastered' | 'review';
export type Confidence = 'low' | 'medium' | 'high';
export type Example = {original: string; corrected: string; lesson_date: string; analysis_id: string; certain: boolean};
export type HistoryEntry = {lesson_date: string; analysis_id: string; n: number; clean: boolean};
export type Pattern = {
  kind: 'error' | 'topic'; key: string; label: string; error_type: string | null; status: Status; confidence: Confidence;
  lessons_seen: number; occurrences: number; uncertain: number; slips: number; clean_lessons: number;
  examples: Example[]; history: HistoryEntry[]; first_seen: string | null; last_seen: string | null; last_clean: string | null;
  hidden?: boolean; teacher_status?: Status | null; teacher_note?: string | null;
};
export type ReportLike = {
  errors?: Pick<ErrorItem, 'original' | 'corrected' | 'category' | 'category_key' | 'type' | 'certainty' | 'kind' | 'repeats' | 'status'>[];
  covered?: {label: string}[]; source_quality?: 'good' | 'partial' | 'poor'; speakers_separated?: boolean;
};
export type Profile = {strengths: string[]; weaknesses: string[]; recurring: string[]; improved: string[]; next_goals: string[]};

const MAX_EX = 6, MAX_HIST = 20;

function statusOf(p: Pattern): Status {
  if (p.lessons_seen === 0) return p.kind === 'topic' && p.clean_lessons ? (p.clean_lessons >= 3 ? 'mastered' : 'fair') : 'new';
  // clean lessons AFTER the last lesson with the mistake
  let cleanSince = 0;
  for (let i = p.history.length - 1; i >= 0 && p.history[i].clean; i--) cleanSince++;
  if (cleanSince >= 2) return 'mastered';
  if (cleanSince === 1) return 'fair';
  if (p.lessons_seen >= 3) return 'review';
  if (p.lessons_seen === 2) return 'learning';
  return 'new';
}
function confidenceOf(p: Pattern): Confidence {
  if (p.lessons_seen === 0) return 'low';
  return p.lessons_seen >= 3 || p.lessons_seen + p.clean_lessons >= 4 ? 'high' : 'medium';
}
const blank = (kind: Pattern['kind'], key: string, label: string, type: string | null): Pattern => ({kind, key, label, error_type: type, status: 'new', confidence: 'low',
  lessons_seen: 0, occurrences: 0, uncertain: 0, slips: 0, clean_lessons: 0, examples: [], history: [], first_seen: null, last_seen: null, last_clean: null});

/** Returns only the patterns that change, plus the recomputed compact profile. Same report twice → identical result
 *  (and the database refuses the second apply). */
export function mergeReport(existing: Pattern[], doc: ReportLike, meta: {analysis_id: string; lesson_date: string}): {changed: Pattern[]; profile: Profile} {
  const byKey = new Map(existing.map(p => [p.kind + ':' + p.key, p]));
  const poor = doc.source_quality === 'poor' || doc.speakers_separated === false;
  type Obs = {label: string; type: string | null; certain: number; uncertain: number; slips: number; ex: Example[]};
  const obs = new Map<string, Obs>();
  for (const e of doc.errors || []) {
    if (e.status === 'rejected' || !e.category_key) continue;                          // the teacher removed it
    const o = obs.get(e.category_key) || {label: e.category || e.category_key, type: e.type || null, certain: 0, uncertain: 0, slips: 0, ex: []};
    const n = Math.max(1, e.repeats || 1);
    if (e.kind === 'slip') o.slips += n;
    else if (e.certainty === 'uncertain' || poor) o.uncertain += n;
    else o.certain += n;
    if (e.kind !== 'slip' && e.original && e.corrected) o.ex.push({original: e.original.slice(0, 200), corrected: e.corrected.slice(0, 200), lesson_date: meta.lesson_date, analysis_id: meta.analysis_id, certain: e.certainty !== 'uncertain' && !poor});
    obs.set(e.category_key, o);
  }
  const covered = new Map<string, string>();
  for (const c of doc.covered || []) { if (!c?.label) continue; const {key, label} = categoryKey(c.label); covered.set(key, label || c.label); }

  const changed: Pattern[] = [];
  const touch = (p: Pattern) => { p.status = statusOf(p); p.confidence = confidenceOf(p); changed.push(p); byKey.set(p.kind + ':' + p.key, p); };
  const already = (p: Pattern) => p.history.some(h => h.analysis_id === meta.analysis_id);

  // error patterns
  for (const [key, o] of obs) {
    const prev = byKey.get('error:' + key);
    if (!prev && o.certain === 0 && o.uncertain === 0) continue;                       // a slip alone creates nothing
    const p: Pattern = prev ? {...prev, examples: [...prev.examples], history: [...prev.history]} : blank('error', key, o.label, o.type);
    if (already(p)) continue;
    p.occurrences += o.certain + o.uncertain; p.uncertain += o.uncertain; p.slips += o.slips;
    if (o.certain > 0) {
      p.lessons_seen += 1; p.last_seen = meta.lesson_date; p.first_seen = p.first_seen || meta.lesson_date;
      p.history = [...p.history, {lesson_date: meta.lesson_date, analysis_id: meta.analysis_id, n: o.certain, clean: false}].slice(-MAX_HIST);
    }
    p.examples = [...o.ex.sort((a, b) => Number(b.certain) - Number(a.certain)), ...p.examples].filter((x, i, a) => a.findIndex(y => y.original === x.original && y.corrected === x.corrected) === i).slice(0, MAX_EX);
    if (!p.label || p.label === p.key) p.label = o.label;
    touch(p);
  }
  // improvement: a known mistake whose topic was practised in this lesson WITHOUT the mistake
  for (const p of existing) {
    if (p.kind !== 'error' || p.lessons_seen === 0 || obs.get(p.key)?.certain || !covered.has(p.key)) continue;
    const q: Pattern = {...p, history: [...p.history]}; if (already(q)) continue;
    q.clean_lessons += 1; q.last_clean = meta.lesson_date;
    q.history = [...q.history, {lesson_date: meta.lesson_date, analysis_id: meta.analysis_id, n: 0, clean: true}].slice(-MAX_HIST);
    touch(q);
  }
  // topics covered (behandelde grammatica)
  for (const [key, label] of covered) {
    const prev = byKey.get('topic:' + key);
    const p: Pattern = prev ? {...prev, history: [...prev.history]} : blank('topic', key, label, null);
    if (already(p)) continue;
    const errs = obs.get(key)?.certain || 0;
    p.occurrences += errs; p.last_seen = meta.lesson_date; p.first_seen = p.first_seen || meta.lesson_date;
    if (errs) p.lessons_seen += 1; else { p.clean_lessons += 1; p.last_clean = meta.lesson_date; }
    p.history = [...p.history, {lesson_date: meta.lesson_date, analysis_id: meta.analysis_id, n: errs, clean: !errs}].slice(-MAX_HIST);
    touch(p);
  }
  return {changed, profile: profileOf([...byKey.values()])};
}

/** The compact core profile, recomputed from all patterns (hidden ones and low-confidence ones left out). */
export function profileOf(all: Pattern[]): Profile {
  const vis = all.filter(p => !p.hidden && p.confidence !== 'low');
  const st = (p: Pattern) => p.teacher_status || p.status;
  const errs = vis.filter(p => p.kind === 'error').sort((a, b) => b.lessons_seen - a.lessons_seen || b.occurrences - a.occurrences);
  const uniq = (l: string[]) => [...new Set(l)];
  return {
    weaknesses: uniq(errs.filter(p => ['review', 'learning', 'new'].includes(st(p))).map(p => p.label)).slice(0, 5),
    recurring: uniq(errs.filter(p => p.lessons_seen >= 2 && st(p) !== 'mastered').map(p => p.label)).slice(0, 5),
    improved: uniq(errs.filter(p => ['fair', 'mastered'].includes(st(p))).map(p => p.label)).slice(0, 5),
    strengths: uniq(vis.filter(p => p.kind === 'topic' && ['fair', 'mastered'].includes(st(p))).map(p => p.label)).slice(0, 5),
    next_goals: uniq(errs.filter(p => st(p) === 'review').concat(errs.filter(p => st(p) === 'learning')).map(p => p.label)).slice(0, 3),
  };
}

/** Max three concrete recommendations for the next lesson (no AI needed). */
export function recommendations(all: Pattern[]): string[] {
  const p = profileOf(all), out: string[] = [];
  if (p.next_goals[0]) out.push(`Herhaal ${p.next_goals[0]} met een korte gerichte oefening.`);
  if (p.next_goals[1]) out.push(`Laat de leerling ${p.next_goals[1]} toepassen in een spreekopdracht.`);
  const fresh = all.filter(x => !x.hidden && x.kind === 'error' && (x.teacher_status || x.status) === 'fair')[0];
  if (fresh) out.push(`Controleer of ${fresh.label} beklijft (vorige les ging het goed).`);
  return out.slice(0, 3);
}
