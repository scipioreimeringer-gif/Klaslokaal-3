// Languages a student learns: grouped from teacher–student relations (one students row per
// teacher + language) plus self-study languages without a teacher (student_languages, v29).
/** Language of one teacher–student relation. Same rule as SQL public.relation_language (v29). */
export function relationLanguage(s: {curriculum_subject?: string | null; subject?: string | null; lesson_language?: string | null}) {
  if (s.curriculum_subject) return s.curriculum_subject;
  if (/portug/i.test(s.subject || '')) return 'pt';
  if (/nederl|dutch|nt2/i.test(s.subject || '')) return 'nl';
  return s.lesson_language || 'nl';
}

export const LANGUAGES = [
  {code: 'nl', name: 'Nederlands'},
  {code: 'pt', name: 'Portugees (Brazilië)'},
  {code: 'en', name: 'Engels'},
  {code: 'es', name: 'Spaans'},
  {code: 'fr', name: 'Frans'},
  {code: 'de', name: 'Duits'},
  {code: 'it', name: 'Italiaans'},
] as const;
export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export function languageName(code: string | null | undefined) {
  return LANGUAGES.find(l => l.code === code)?.name || (code ? code.toUpperCase() : 'Onbekend');
}

export type RelationLike = {id: string; teacher_id: string; subject?: string | null; curriculum_subject?: string | null; lesson_language?: string | null; level?: string | null; archived_at?: string | null};
export type SelfLanguage = {id: string; language: string; level: string | null};
export type LanguageCard<R extends RelationLike = RelationLike> = {code: string; level: string | null; relations: R[]; self: SelfLanguage | null};

/** One card per language. Relations keep their own data (they are never merged). */
export function buildLanguageCards<R extends RelationLike>(relations: R[], selfLangs: SelfLanguage[]): LanguageCard<R>[] {
  const map = new Map<string, LanguageCard<R>>();
  for (const r of relations) {
    const code = relationLanguage(r);
    const c = map.get(code) || {code, level: null, relations: [], self: null};
    c.relations.push(r);
    if (!c.level && r.level) c.level = r.level;
    map.set(code, c);
  }
  for (const s of selfLangs) {
    const c = map.get(s.language) || {code: s.language, level: null, relations: [], self: null};
    c.self = s;
    if (!c.level && s.level) c.level = s.level;
    map.set(s.language, c);
  }
  // languages with a teacher first, then alphabetically by name
  return Array.from(map.values()).sort((a, b) => (b.relations.length ? 1 : 0) - (a.relations.length ? 1 : 0) || languageName(a.code).localeCompare(languageName(b.code)));
}

/** Measured numbers for a card, only from stored rows of its own relations. */
export function cardStats(card: LanguageCard, lessons: {student_id: string}[], vocab: {student_id: string; status: string}[]) {
  const ids = new Set(card.relations.map(r => r.id));
  const words = vocab.filter(v => ids.has(v.student_id));
  return {
    lessons: lessons.filter(l => ids.has(l.student_id)).length,
    words: words.length,
    mastered: words.filter(v => v.status === 'mastered').length,
    pct: words.length ? Math.round(words.filter(v => v.status === 'mastered').length / words.length * 100) : null,
  };
}

/** Which relation of a language is shown: the requested one if it belongs to this language, else the first. */
export function pickRelation<R extends RelationLike>(card: LanguageCard<R> | undefined, wanted: string | null) {
  if (!card) return null;
  return card.relations.find(r => r.id === wanted) || card.relations[0] || null;
}
