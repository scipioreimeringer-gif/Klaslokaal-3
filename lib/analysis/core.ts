// AI lesson analysis 2.0 — deterministic core (no AI, no database; unit-tested).
// The model only proposes mistakes per transcript chunk; everything that must be exact
// (quotes, speakers, counting, grouping, relevance, progress) is decided here in code.

export type Speaker = 'teacher' | 'student' | 'unknown';
export type Utterance = {id: string; speaker: Speaker; text: string; start: number | null; pos: number};

const TEACHER = /^(docent|teacher|professor|professora|profesor|profesora|professeur|enseignant|enseignante|lehrer|lehrerin|lehrkraft|tutor)$/i;
const STUDENT = /^(leerling|student|studente|aluno|aluna|alumno|alumna|élève|eleve|schüler|schülerin|learner)$/i;

/** Parse a transcript into numbered utterances. Understands "[mm:ss] SPEAKER: text" (our own format)
 *  and plain "Speaker: text" lines; continuation lines belong to the previous speaker. */
export function parseUtterances(text: string): Utterance[] {
  const out: Utterance[] = [];
  let pos = 0;
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim(); pos += raw.length + 1;
    if (!line || /^\[…/.test(line)) continue;
    const m = line.match(/^(?:\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*)?([\p{L} .'-]{2,30})\s*:\s*(.+)$/u);
    let speaker: Speaker = 'unknown', body = line, start: number | null = null, labelled = false;
    if (m) {
      const label = m[4].trim();
      if (TEACHER.test(label) || STUDENT.test(label) || UNKNOWN.test(label)) {
        speaker = TEACHER.test(label) ? 'teacher' : STUDENT.test(label) ? 'student' : 'unknown'; body = m[5].trim(); labelled = true;
        if (m[1]) start = m[3] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
      }
    }
    if (speaker === 'unknown' && out.length && !m && !labelled) { out[out.length - 1].text += ' ' + body; continue; }
    out.push({id: 'u' + (out.length + 1), speaker, text: body, start, pos: pos - raw.length - 1});
  }
  return splitLong(out);
}
const UNKNOWN = /^(onbekend|unknown|spreker|speaker)$/i;
/** v72: an utterance of more than `max` words (e.g. a mixed recording transcribed as one block) is split on sentence
 *  boundaries, so every part of a long lesson fits in one bounded AI call and nothing is cut off. */
export function splitLong(utts: Utterance[], max = 220): Utterance[] {
  if (!utts.some(u => wordCount(u.text) > max)) return utts;
  const out: Utterance[] = [];
  for (const u of utts) {
    if (wordCount(u.text) <= max) { out.push(u); continue; }
    const parts: string[] = []; let cur = '';
    for (const s of u.text.match(/[^.!?…]+[.!?…]*\s*/g) || [u.text]) {
      if (cur && wordCount(cur) + wordCount(s) > max) { parts.push(cur.trim()); cur = ''; }
      cur += s;
      while (wordCount(cur) > max) { const w = cur.trim().split(/\s+/); parts.push(w.slice(0, max).join(' ')); cur = w.slice(max).join(' ') + ' '; }
    }
    if (cur.trim()) parts.push(cur.trim());
    for (const p of parts) out.push({...u, text: p});
  }
  return out.map((u, i) => ({...u, id: 'u' + (i + 1)}));
}
export const wordCount = (s: string) => (String(s).match(/[\p{L}\p{N}'’-]+/gu) || []).length;
export const speakersKnown = (u: Utterance[]) => u.some(x => x.speaker === 'teacher') && u.some(x => x.speaker === 'student');

export type Chunk = {index: number; ids: string[]; contextIds: string[]; words: number};
/** Split on utterance boundaries into chunks of ~maxWords. The last `context` utterances of the previous
 *  chunk are passed as read-only context (never analysed twice → no double counting). */
export function chunkUtterances(utts: Utterance[], maxWords = 1400, context = 2): Chunk[] {
  const chunks: Chunk[] = []; let cur: string[] = [], words = 0;
  const flush = () => { if (!cur.length) return; const prev = chunks.length ? chunks[chunks.length - 1].ids.slice(-context) : []; chunks.push({index: chunks.length, ids: cur, contextIds: prev, words}); cur = []; words = 0; };
  for (const u of utts) { const w = wordCount(u.text); if (cur.length && words + w > maxWords) flush(); cur.push(u.id); words += w; }
  flush();
  return chunks;
}
/** Text sent to the model for one chunk: context lines marked, analysable lines with their ids. */
export function chunkText(chunk: Chunk, byId: Map<string, Utterance>) {
  const fmt = (u: Utterance) => `${u.id} ${u.speaker === 'teacher' ? 'DOCENT' : u.speaker === 'student' ? 'LEERLING' : 'ONBEKEND'}: ${u.text}`;
  const ctx = chunk.contextIds.map(id => byId.get(id)).filter(Boolean) as Utterance[];
  return (ctx.length ? `(context, do not analyse)\n${ctx.map(fmt).join('\n')}\n---\n` : '') + chunk.ids.map(id => fmt(byId.get(id)!)).join('\n');
}

/* ---------------- verification & merging ---------------- */
/** v72 kinds: style = grammatically correct but could be more natural (never an error); transcript = probably a
 *  transcription mistake (never registered); word choice stays an error type, regional/informal speech is not flagged. */
export type RawError = {utterance_id: string; original: string; corrected: string; category: string; topic_id: string | null; kind: 'error' | 'slip' | 'self_correction' | 'style' | 'transcript'; certainty: 'certain' | 'uncertain';
  /* v46 phase 2 (optional so older stored parts keep working) */ type?: ErrorType; why?: string; word?: string; word_en?: string};

/* v46: every error also gets ONE main category (fixed list) next to its finer grammar topic. */
export type ErrorType = 'grammar' | 'conjugation' | 'word_order' | 'word_choice' | 'missing_word' | 'article' | 'preposition' | 'pronunciation' | 'other';
export const ERROR_TYPES: ErrorType[] = ['grammar', 'conjugation', 'word_order', 'word_choice', 'missing_word', 'article', 'preposition', 'pronunciation', 'other'];
export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {grammar: 'Grammatica', conjugation: 'Werkwoordvervoegingen', word_order: 'Woordvolgorde en zinsbouw', word_choice: 'Verkeerd woordgebruik',
  missing_word: 'Ontbrekende woorden', article: 'Lidwoorden', preposition: 'Voorzetsels', pronunciation: 'Uitspraak', other: 'Overig'};
const TYPE_OF_KEY: Record<string, ErrorType> = {inversion: 'word_order', subordinate_clause: 'word_order', word_order: 'word_order', sentence_structure: 'word_order',
  auxiliary: 'conjugation', participle: 'conjugation', past_tense: 'conjugation', present_tense: 'conjugation', conjugation: 'conjugation', separable_verbs: 'conjugation', subjunctive: 'conjugation', ser_estar: 'conjugation',
  articles: 'article', gender: 'article', prepositions: 'preposition', word_choice: 'word_choice', pronunciation: 'pronunciation', plural: 'grammar', adjectives: 'grammar', pronouns: 'grammar'};
/** Main category: the model's choice when valid, otherwise derived from the grammar category. */
export function errorType(given: unknown, category: string): ErrorType {
  if (typeof given === 'string' && (ERROR_TYPES as string[]).includes(given)) return given as ErrorType;
  if (/ontbre|missing|weggelaten|falta/i.test(category)) return 'missing_word';
  return TYPE_OF_KEY[categoryKey(category).key] || 'grammar';
}
/** One registered error (all of them, not only examples). The teacher approves, corrects or removes it; only
 *  approved errors are used for practice. */
export type ErrorItem = {id: string; utterance_id: string; original: string; corrected: string; why: string; type: ErrorType; category: string; category_key: string;
  topic_id: string | null; start: number | null; certainty: 'certain' | 'uncertain'; kind: 'error' | 'slip'; repeats: number; later: boolean;
  word: string | null; word_en: string | null; status: 'pending' | 'approved' | 'rejected'; edited?: boolean;
  /** v51: one entry per unique error — the moments it was made (repeats = how often) and the merged entries */ times?: (number | null)[]; ids?: string[]};
const shortHash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export type RawChunk = {errors: RawError[]; covered: {topic_id: string | null; label: string}[]; positives: {utterance_id: string; note: string}[]; new_words: {term: string; translation: string; status?: WordStatus}[]};
export type WordStatus = 'introduced' | 'practised' | 'difficult';

const norm = (s: string) => String(s || '').toLowerCase().replace(/[“”"‘’'`.,!?;:()…\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
/** Category key: synonyms map to one key so the same rule is explained once. Unknown categories stay possible. */
const SYNONYMS: [RegExp, string, string][] = [
  [/invers|v2|werkwoord.*(tweede|plaats)|verb.second|verb position/i, 'inversion', 'Inversie'],
  [/bijzin|subordinat|relative clause|betrekkelijk|ondergeschikt/i, 'subordinate_clause', 'Bijzinnen'],
  [/woordvolgorde|word.?order|ordem|orden de|ordre des mots|wortstellung/i, 'word_order', 'Woordvolgorde'],
  [/hebben.*zijn|zijn.*hebben|auxiliar|hulpwerkwoord|haben.*sein|avoir.*être/i, 'auxiliary', 'Hebben versus zijn'],
  [/voltooid deelwoord|participle|particípio|participio|participe|partizip/i, 'participle', 'Voltooid deelwoord'],
  [/verleden|past|pretérit|preterit|passé|imparfait|imperfe|präteritum|perfe[ck]t|perfectum|voltooid|pretérito/i, 'past_tense', 'Verleden tijd'],
  [/tegenwoordige|present|presente|présent|präsens/i, 'present_tense', 'Tegenwoordige tijd'],
  [/vervoeging|conjugat|conjuga|congruentie|agreement.*verb|subject.?verb/i, 'conjugation', 'Werkwoordsvervoeging'],
  [/lidwoord|article|artigo|artículo|artikel|de\/het/i, 'articles', 'Lidwoorden'],
  [/voorzetsel|preposi|präposition/i, 'prepositions', 'Voorzetsels'],
  [/meervoud|plural|pluriel/i, 'plural', 'Meervoud'],
  [/bijvoeglijk|adjecti|adjektiv/i, 'adjectives', 'Bijvoeglijke naamwoorden'],
  [/scheidbaar|separable|trennbar/i, 'separable_verbs', 'Scheidbare werkwoorden'],
  [/woordkeuze|word.?choice|vocab|woordenschat|escolha|elección|choix du mot|wortwahl|collocat/i, 'word_choice', 'Woordkeuze'],
  [/zinsbouw|sentence|construct|letterlijk|literal/i, 'sentence_structure', 'Zinsbouw'],
  [/ser.*estar|estar.*ser/i, 'ser_estar', 'Ser of estar'],
  [/subjunti|subjonctif|konjunktiv/i, 'subjunctive', 'Subjunctief'],
  [/gender|geslacht|género|genre/i, 'gender', 'Geslacht'],
  [/pronom|voornaamwoord/i, 'pronouns', 'Voornaamwoorden'],
  [/uitspraak|pronunc/i, 'pronunciation', 'Uitspraak'],
];
export function categoryKey(raw: string): {key: string; label: string} {
  for (const [re, key, label] of SYNONYMS) if (re.test(raw)) return {key, label};
  const label = String(raw || 'Overig').trim().slice(0, 60) || 'Overig';
  return {key: 'x_' + norm(label).replace(/ /g, '_').slice(0, 40), label};
}

export type Example = {utterance_id: string; original: string; corrected: string; start: number | null; certainty: 'certain' | 'uncertain'};
export type Relevance = 'current' | 'known' | 'new_today' | 'relevant' | 'later';
export type Category = {key: string; label: string; topic_ids: string[]; count: number; count_reliable: boolean; examples: Example[]; self_corrections: number; slips: number; relevance: Relevance; recurring: boolean; trend: Trend | null; explanation: string};

/** Keep only errors that are real student utterances with a verbatim quote. Teacher speech is never a student error. */
export function verifyErrors(raw: RawError[], byId: Map<string, Utterance>, speakersSeparated: boolean) {
  const kept: (RawError & {start: number | null})[] = []; let dropped = 0; const seen = new Set<string>();
  for (const e of raw || []) {
    const u = byId.get(e.utterance_id);
    if (!u || u.speaker === 'teacher' || !e.original || !norm(u.text).includes(norm(e.original))) { dropped++; continue; }
    const dup = `${u.id}|${norm(e.original)}|${categoryKey(e.category).key}`;
    if (seen.has(dup)) continue; seen.add(dup);
    // v46: pronunciation can rarely be proven from a transcript → never 'certain'; unknown speaker → uncertain
    // v72: a line marked unclear by the transcriber is never a certain error
    const certainty: RawError['certainty'] = !speakersSeparated || u.speaker === 'unknown' || /\[onduidelijk\]/.test(u.text) || errorType(e.type, e.category) === 'pronunciation' ? 'uncertain' : e.certainty;
    kept.push({...e, certainty, start: u.start});
  }
  return {kept, dropped};
}

export type Topic = {id: string; title: string; level: string; status: 'not_started' | 'covered' | 'in_progress' | 'mastered'};
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const levelIndex = (l: string | null | undefined) => Math.max(0, LEVELS.indexOf(String(l || 'A1').toUpperCase()));

/** Relevance of a category for THIS student: checklist first, then today's goals/covered topics, then level.
 *  CEFR level is a guideline: an unknown topic is only "later" when it is clearly above the student's level. */
export function relevanceOf(topicIds: string[], topics: Map<string, Topic>, studentLevel: string, todayTopicIds: Set<string>, coveredToday: Set<string> = new Set()): Relevance {
  if (topicIds.some(id => todayTopicIds.has(id))) return 'current';
  const ts = topicIds.map(id => topics.get(id)).filter(Boolean) as Topic[];
  if (ts.some(t => t.status === 'in_progress' || t.status === 'covered' || t.status === 'mastered')) return 'known';
  if (topicIds.some(id => coveredToday.has(id))) return 'new_today'; // explained/practised in this lesson
  if (ts.length && ts.every(t => t.status === 'not_started' && levelIndex(t.level) > levelIndex(studentLevel) + 1)) return 'later';
  return 'relevant';
}

export type Trend = {previous: number[]; direction: 'down' | 'up' | 'stable' | 'insufficient'};
export type HistoryItem = {lesson_date: string; student_utterances: number; categories: {key: string; count: number}[]};
/** Compare with earlier lessons, per 100 student utterances; only when every lesson has enough student speech. */
export function trendFor(key: string, count: number, studentUtts: number, history: HistoryItem[]): {trend: Trend | null; recurring: boolean} {
  const prev = history.slice(0, 3);
  const recurring = prev.filter(h => h.categories.some(c => c.key === key && c.count > 0)).length >= 2;
  if (!prev.length) return {trend: null, recurring};
  const enough = studentUtts >= 20 && prev.every(h => h.student_utterances >= 20);
  const rate = (c: number, n: number) => Math.round(c / n * 1000) / 10;
  const prevRates = prev.map(h => rate(h.categories.find(c => c.key === key)?.count || 0, Math.max(1, h.student_utterances)));
  if (!enough) return {trend: {previous: prev.map(h => h.categories.find(c => c.key === key)?.count || 0), direction: 'insufficient'}, recurring};
  const now = rate(count, studentUtts), avg = prevRates.reduce((a, b) => a + b, 0) / prevRates.length;
  const direction = now < avg * 0.7 ? 'down' : now > avg * 1.3 ? 'up' : 'stable';
  return {trend: {previous: prevRates, direction}, recurring};
}

/** Merge all chunk results into grouped categories (max 2 examples each), sorted by relevance then frequency. */
export function mergeChunks(results: RawChunk[], utts: Utterance[], opts: {topics: Topic[]; studentLevel: string; todayTopicIds: string[]; history: HistoryItem[]; knownWords?: string[]}) {
  const byId = new Map(utts.map(u => [u.id, u]));
  const separated = speakersKnown(utts);
  const every = results.flatMap(r => r.errors || []);
  // v72: suspected transcription errors are never registered; style remarks are kept apart (not errors, not counted)
  const transcriptDoubts = every.filter(e => e.kind === 'transcript').length;
  const styleRaw = verifyErrors(every.filter(e => e.kind === 'style'), byId, separated).kept;
  const all = every.filter(e => e.kind !== 'transcript' && e.kind !== 'style');
  const {kept, dropped} = verifyErrors(all, byId, separated);
  const style = styleRaw.filter((e, i, a) => a.findIndex(x => norm(x.original) === norm(e.original)) === i).slice(0, 40)
    .map(e => ({utterance_id: e.utterance_id, original: e.original.trim(), better: e.corrected.trim(), why: String(e.why || '').trim().slice(0, 200), start: e.start}));
  const topics = new Map(opts.topics.map(t => [t.id, t]));
  const today = new Set(opts.todayTopicIds);
  const coveredToday = new Set(results.flatMap(r => r.covered || []).map(c => c.topic_id).filter((x): x is string => !!x && topics.has(x)));
  const groups = new Map<string, {label: string; topic_ids: Set<string>; errs: typeof kept; self: number; slips: number}>();
  for (const e of kept) {
    const {key, label} = categoryKey(e.category);
    const g = groups.get(key) || {label, topic_ids: new Set<string>(), errs: [], self: 0, slips: 0};
    if (e.topic_id && topics.has(e.topic_id)) g.topic_ids.add(e.topic_id);
    if (e.kind === 'self_correction') g.self++; else if (e.kind === 'slip') g.slips++; else g.errs.push(e);
    groups.set(key, g);
  }
  const studentUtts = utts.filter(u => u.speaker === 'student').length || utts.filter(u => u.speaker === 'unknown').length;
  const order: Relevance[] = ['current', 'known', 'new_today', 'relevant', 'later'];
  const categories: Category[] = [];
  for (const [key, g] of groups) {
    // a single slip is not a learning problem; repeated slips (≥2) are
    const count = g.errs.length + (g.slips >= 2 ? g.slips : 0);
    if (!count) { if (g.self) categories.push(base(key, g, 0)); continue; }
    categories.push(base(key, g, count));
  }
  function base(key: string, g: {label: string; topic_ids: Set<string>; errs: typeof kept; self: number; slips: number}, count: number): Category {
    const ids = [...g.topic_ids];
    const examples = [...g.errs].sort((a, b) => (a.certainty === 'certain' ? 0 : 1) - (b.certainty === 'certain' ? 0 : 1))
      .filter((e, i, arr) => arr.findIndex(x => norm(x.original) === norm(e.original)) === i).slice(0, 2)
      .map(e => ({utterance_id: e.utterance_id, original: e.original.trim(), corrected: e.corrected.trim(), start: e.start, certainty: e.certainty}));
    const {trend, recurring} = trendFor(key, count, studentUtts, opts.history);
    return {key, label: g.label, topic_ids: ids, count, count_reliable: separated, examples, self_corrections: g.self, slips: g.slips,
      relevance: relevanceOf(ids, topics, opts.studentLevel, today, coveredToday), recurring, trend, explanation: ''};
  }
  categories.sort((a, b) => order.indexOf(a.relevance) - order.indexOf(b.relevance) || b.count - a.count || b.self_corrections - a.self_corrections);
  // covered topics (teacher explained / board / practised): unique, chronological
  const covered: {topic_id: string | null; label: string}[] = [];
  for (const c of results.flatMap(r => r.covered || [])) {
    const k = c.topic_id && topics.has(c.topic_id) ? c.topic_id : norm(c.label);
    if (!covered.some(x => (x.topic_id && topics.has(x.topic_id) ? x.topic_id : norm(x.label)) === k)) covered.push({topic_id: c.topic_id && topics.has(c.topic_id) ? c.topic_id : null, label: c.label.trim().slice(0, 80)});
  }
  const positives = results.flatMap(r => r.positives || []).filter(p => byId.get(p.utterance_id)?.speaker !== 'teacher').slice(0, 8);
  // vocabulary: one entry per word; "difficult" wins over "introduced" over "practised". Known words (already in the list) are never "introduced".
  const rank: Record<WordStatus, number> = {difficult: 3, introduced: 2, practised: 1};
  const known = new Set((opts.knownWords || []).map(norm));
  const words = new Map<string, {term: string; translation: string; status: WordStatus}>();
  for (const w of results.flatMap(r => r.new_words || [])) {
    const k = norm(w.term); if (!k) continue;
    let st: WordStatus = w.status || 'introduced'; if (st === 'introduced' && known.has(k)) st = 'practised';
    const prev = words.get(k);
    if (!prev) words.set(k, {term: w.term.trim(), translation: w.translation.trim(), status: st}); else if (rank[st] > rank[prev.status]) prev.status = st;
  }
  // v46: ALL verified errors (not only 2 examples per category); the same correction in different sentences = a pattern
  const relOf = new Map(categories.map(c => [c.key, c.relevance]));
  const list = kept.filter(e => e.kind !== 'self_correction');
  const errors: ErrorItem[] = dedupeErrors(list.map(e => { const {key, label} = categoryKey(e.category); return {
    id: 'e_' + e.utterance_id + '_' + shortHash(norm(e.original) + '|' + key), utterance_id: e.utterance_id, original: e.original.trim(), corrected: e.corrected.trim(),
    why: String(e.why || '').trim().slice(0, 200), type: errorType(e.type, e.category), category: label, category_key: key, topic_id: e.topic_id && topics.has(e.topic_id) ? e.topic_id : null,
    start: e.start, certainty: e.certainty, kind: (e.kind === 'slip' ? 'slip' : 'error') as ErrorItem['kind'], repeats: 1, later: relOf.get(key) === 'later',
    word: e.word ? String(e.word).trim().slice(0, 120) || null : null, word_en: e.word_en ? String(e.word_en).trim().slice(0, 200) || null : null, status: 'pending' as const}; })
    .sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9) || a.utterance_id.localeCompare(b.utterance_id, undefined, {numeric: true})));
  return {categories, errors, covered: covered.slice(0, 16), positives, vocabulary: [...words.values()].sort((a, b) => rank[b.status] - rank[a.status]).slice(0, 60), dropped, separated, studentUtterances: studentUtts, style, transcriptDoubts};
}

/** Categories that may get homework: only material that was taught (checklist status, today's goals, explained this lesson).
 *  Untaught grammar never gets homework; unmapped vocabulary mistakes (word choice) do, because the words came up in the lesson. */
export function homeworkCategories(cats: Category[], max = 4) {
  const taught = (c: Category) => c.relevance === 'current' || c.relevance === 'known' || c.relevance === 'new_today' || (c.relevance === 'relevant' && !c.topic_ids.length && c.key === 'word_choice');
  return cats.filter(c => c.count > 0 && taught(c)).slice(0, max);
}

export type Suggestion = {topic_id: string; from: Topic['status']; to: Topic['status']; reason: string; evidence_count: number; decision?: 'accepted' | 'rejected' | 'adjusted'};
/** Guard AI checklist proposals: valid topic, real change, never "mastered" on thin evidence or with errors this lesson. */
export function guardSuggestions(raw: {topic_id: string; to: string; reason: string; evidence_count: number}[], topics: Map<string, Topic>, cats: Category[]): Suggestion[] {
  const valid = new Set(['not_started', 'covered', 'in_progress', 'mastered']);
  const erred = new Set(cats.filter(c => c.count > 0).flatMap(c => c.topic_ids));
  const out: Suggestion[] = [];
  for (const s of raw || []) {
    const t = topics.get(s.topic_id); if (!t || !valid.has(s.to) || s.to === t.status || out.some(o => o.topic_id === s.topic_id)) continue;
    if (s.to === 'mastered' && (s.evidence_count < 3 || erred.has(s.topic_id))) continue;
    if (s.to === 'not_started') continue;
    out.push({topic_id: s.topic_id, from: t.status, to: s.to as Topic['status'], reason: String(s.reason || '').slice(0, 240), evidence_count: Math.max(0, Math.round(s.evidence_count || 0))});
  }
  return out.slice(0, 8);
}

/** Legacy compatibility: flat corrections list for older views/games (practice "errors" game, dashboards). */
export function legacyCategory(key: string): 'grammar' | 'conjugation' | 'word_order' | 'word_choice' | 'pronunciation' | 'other' {
  if (/inversion|word_order|subordinate|sentence/.test(key)) return 'word_order';
  if (/conjugation|past|present|participle|auxiliary|separable|subjunctive/.test(key)) return 'conjugation';
  if (/word_choice/.test(key)) return 'word_choice';
  if (/pronunciation/.test(key)) return 'pronunciation';
  if (/^x_/.test(key)) return 'other';
  return 'grammar';
}

/* v46: errors of a report — the full list (v46+) or, for older reports, the examples of the categories. Older reports were
   already approved by the teacher, so their examples count as approved. */
export function errorsOf(doc: {errors?: ErrorItem[]; categories?: Category[]} | null | undefined): ErrorItem[] {
  if (!doc) return [];
  if (Array.isArray(doc.errors)) return dedupeErrors(doc.errors); // v51: also older reports show each error once
  return (doc.categories || []).flatMap(c => c.examples.map(e => ({id: 'e_' + e.utterance_id + '_' + shortHash(norm(e.original) + '|' + c.key), utterance_id: e.utterance_id, original: e.original, corrected: e.corrected,
    why: c.explanation || '', type: errorType(null, c.label), category: c.label, category_key: c.key, topic_id: c.topic_ids[0] || null, start: e.start, certainty: e.certainty,
    kind: 'error' as const, repeats: 1, later: c.relevance === 'later', word: null, word_en: null, status: 'approved' as const})));
}
/** Errors per main category in the fixed order, for the report. */
export function groupErrors(list: ErrorItem[]) {
  // v51: within a category the errors made most often first, then in the order of the lesson
  return ERROR_TYPES.map(t => ({type: t, label: ERROR_TYPE_LABEL[t], items: list.filter(e => e.type === t).sort((a, b) => b.repeats - a.repeats || (a.start ?? 1e9) - (b.start ?? 1e9))})).filter(g => g.items.length);
}
/* v51: DEDUPLICATION. A student who says "Ik heb gisteren naar school gegaan" five times made ONE error five times:
   it is listed once with its count and moments. The same error = the same category AND the same sentence (capitals and
   punctuation do not matter) or nearly the same sentence with nearly the same correction (a word more or less).
   Two different sentences with the same grammar problem ("… naar school gegaan" / "… naar huis gegaan") stay separate
   examples under the same category. Idempotent: running it again on its own result changes nothing. */
const words = (s: string) => new Set(norm(s).split(' ').filter(Boolean));
function overlap(a: string, b: string) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); }
export function sameError(a: Pick<ErrorItem, 'original' | 'corrected' | 'category_key'>, b: Pick<ErrorItem, 'original' | 'corrected' | 'category_key'>) {
  if (a.category_key !== b.category_key) return false;
  if (norm(a.original) === norm(b.original)) return true;
  return overlap(a.original, b.original) >= 0.8 && overlap(a.corrected, b.corrected) >= 0.8;
}
/** v72: re-analysis keeps the teacher's decisions. A new error that the teacher already rejected stays rejected (so a
 *  wrong AI observation does not come back); an approved or corrected one keeps the teacher's text and status. */
export function carryDecisions(fresh: ErrorItem[], old: ErrorItem[]): ErrorItem[] {
  const decided = (old || []).filter(o => o.status !== 'pending' || o.edited);
  return fresh.map(e => {
    const o = decided.find(x => sameError(x, e) || (x.edited && x.utterance_id === e.utterance_id && x.category_key === e.category_key));
    return o ? {...e, status: o.status, ...(o.edited ? {original: o.original, corrected: o.corrected, why: o.why || e.why, edited: true} : {})} : e;
  });
}
export function dedupeErrors(list: ErrorItem[]): ErrorItem[] {
  const groups: ErrorItem[][] = [];
  for (const e of list) { const g = groups.find(x => sameError(x[0], e)); if (g) g.push(e); else groups.push([e]); }
  return groups.map(g => {
    if (g.length === 1 && g[0].times) return g[0];
    const rep = g.find(x => x.edited) || g.find(x => x.status === 'approved') || g[0];
    const times = g.flatMap(x => x.times || [x.start]);
    const status: ErrorItem['status'] = g.some(x => x.status === 'approved') ? 'approved' : g.every(x => x.status === 'rejected') ? 'rejected' : 'pending';
    const starts = times.filter((t): t is number => t != null);
    return {...rep, id: g[0].id, start: starts.length ? Math.min(...starts) : rep.start, times, repeats: times.length,
      certainty: g.some(x => x.certainty === 'certain') ? 'certain' : 'uncertain', status, ids: [...new Set(g.flatMap(x => x.ids || [x.id]))]};
  });
}