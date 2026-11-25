// v68: one view on both structured grammar curricula (Dutch NT2 and Brazilian Portuguese) + lesson-topic
// recommendations (pure, unit-tested, plain data from database queries — no AI call).
import {NT2_BY_CODE} from './nt2.ts';
import {PTBR_BY_CODE} from './ptbr.ts';

export type TopicInfo = {code: string; level: string; stage: string; n: number; title: string; pt?: string; sub: string[]; keys: string[]; continuous: boolean};
export function topicInfo(code: string | null | undefined): TopicInfo | null {
  if (!code) return null;
  const t = NT2_BY_CODE.get(code) || PTBR_BY_CODE.get(code);
  if (!t) return null;
  return {code: t.code, level: t.level, stage: t.stage, n: t.n, title: t.title, pt: (t as {pt?: string}).pt, sub: t.sub, keys: t.keys || [], continuous: t.level === '-'};
}
/** Prefix of the structured curriculum of a subject ('' = none: all standard goals are shown). */
export const stagedPrefix = (subject: string) => subject === 'nl' ? 'nt2-' : subject === 'pt' ? 'ptbr-' : '';
/** The structured curriculum replaces the older standard goals of that language in the view (they stay stored);
 *  own topics are always shown. Without the structured goals in the database (migration not run) nothing changes. */
export function visibleGoals<G extends {code?: string | null}>(goals: G[], subject: string): G[] {
  const p = stagedPrefix(subject);
  return p && goals.some(g => g.code?.startsWith(p)) ? goals.filter(g => !g.code || g.code.startsWith(p)) : goals;
}
/** Title in the interface language: a Portuguese teacher sees the Brazilian-Portuguese title; a teacher's own
 *  rename for this student always wins. */
export function goalTitle(g: {code?: string | null; title: string}, override: string | null | undefined, uiLang: string): string {
  if (override) return override;
  const t = topicInfo(g.code);
  return uiLang === 'pt' && t?.pt ? t.pt : g.title;
}

export type RecTopic = {id: string; code?: string | null; level: string; sort: number; status: string; updated_at?: string | null; lesson_date?: string | null; hidden?: boolean};
export type Rec = {id: string; reason: 'review' | 'in_progress' | 'error' | 'repeat' | 'next'; score: number};
const LV = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
/** At most `n` recommendations for the next lesson: Extra oefenen, In ontwikkeling, topics with recent grammar
 *  mistakes (AI memory), earlier covered grammar that needs repetition (not seen for 4+ weeks), and the next topics
 *  of the learning line at or below the student's level. The teacher decides; nothing is selected automatically. */
export function recommendTopics(topics: RecTopic[], o: {level: string; errorKeys?: Set<string>; exclude?: Set<string>; now?: number}, n = 5): Rec[] {
  const now = o.now ?? Date.now(), L = Math.max(1, LV.indexOf(String(o.level || 'A1').toUpperCase())), ex = o.exclude || new Set<string>(), err = o.errorKeys || new Set<string>();
  const out: Rec[] = [];
  const nexts = topics.filter(t => t.status === 'not_started' && !t.hidden && t.level !== '-' && LV.indexOf(t.level) <= L && LV.indexOf(t.level) >= 0).sort((a, b) => LV.indexOf(a.level) - LV.indexOf(b.level) || a.sort - b.sort).slice(0, 2).map(t => t.id);
  for (const t of topics) {
    if (t.hidden || ex.has(t.id)) continue;
    const keys = topicInfo(t.code)?.keys || [], hasErr = keys.some(k => err.has(k));
    const age = (now - Date.parse(t.lesson_date || t.updated_at || '1970-01-01')) / 86400e3;
    let r: Rec | null = null;
    if (t.status === 'review') r = {id: t.id, reason: 'review', score: 100};
    else if (t.status === 'in_progress' || t.status === 'covered') r = {id: t.id, reason: hasErr ? 'error' : 'in_progress', score: 80 + (hasErr ? 15 : 0)};
    else if (hasErr && t.status !== 'mastered') r = {id: t.id, reason: 'error', score: 75};
    else if (t.status === 'mastered' && (age > 28 || hasErr)) r = {id: t.id, reason: hasErr ? 'error' : 'repeat', score: hasErr ? 70 : 55};
    else if (nexts.includes(t.id)) r = {id: t.id, reason: 'next', score: 50 - nexts.indexOf(t.id)};
    if (r) { if (r.reason !== 'next' && LV.indexOf(t.level) > L + 1) r.score -= 30; out.push(r); }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
export const REC_LABEL: Record<Rec['reason'], string> = {review: 'Extra oefenen', in_progress: 'In ontwikkeling', error: 'Recente fouten', repeat: 'Herhaling nodig', next: 'Volgende in de leerlijn'};
