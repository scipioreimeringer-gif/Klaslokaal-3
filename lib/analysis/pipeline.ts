// AI lesson analysis 2.0 — pipeline (steps, prompts, schemas). Database and AI are injected (Store, Ask),
// so the whole pipeline is testable without Supabase or OpenAI. One analysis = small bounded calls:
//   chunk analyses (fast model, compact) → deterministic merge → one synthesis → one homework draft.
import {z} from 'zod';
import {chunkUtterances, chunkText, mergeChunks, homeworkCategories, guardSuggestions, legacyCategory, levelIndex,
  type Utterance, type RawChunk, type Topic, type HistoryItem, type Category, type Suggestion} from './core.ts';

export const PIPELINE_VERSION = 2;
export type Stage = 'collect' | 'chunks' | 'merge' | 'synthesis' | 'homework' | 'done' | 'partial_failed' | 'failed';

/* ---------------- output schemas (bounded: no unbounded lists, no per-error explanations) ---------------- */
export const ChunkSchema = z.object({
  errors: z.array(z.object({
    utterance_id: z.string().describe('id of the STUDENT line, e.g. "u12"'),
    original: z.string().describe('the wrong words EXACTLY as they appear in that line (verbatim)'),
    corrected: z.string().describe('the same phrase, minimally corrected'),
    category: z.string().describe('short grammar/vocabulary category name in Dutch, e.g. "Inversie", "Verleden tijd", "Lidwoorden", "Woordkeuze"'),
    topic: z.string().nullable().describe('topic alias like "T7" from the topic list if it fits, else null'),
    kind: z.enum(['error', 'slip', 'self_correction']).describe('slip = one-off speech error; self_correction = student corrected it'),
    certainty: z.enum(['certain', 'uncertain']),
  })).describe('max 40, only real mistakes of the student'),
  covered: z.array(z.object({topic: z.string().nullable(), label: z.string()})).describe('max 6: topics the teacher explained or practised in this part'),
  positives: z.array(z.object({utterance_id: z.string(), note: z.string()})).describe('max 3: strong or correct student utterances worth praising'),
  new_words: z.array(z.object({term: z.string().describe('exact spelling as used in the lesson'), translation: z.string(), status: z.enum(['introduced', 'practised', 'difficult']).describe('introduced = new word explained by the teacher; practised = a word used again; difficult = the student clearly struggled with it (asked, could not recall, used it wrongly)')}))
    .describe('max 8: words/expressions that were introduced, practised again or were difficult for the student. A word written down is NOT proof that the student knows it.'),
});
export const SynthesisSchema = z.object({
  report: z.object({
    summary: z.string().describe('max 80 words'),
    covered: z.array(z.string()).describe('max 6'), went_well: z.array(z.string()).describe('max 4'),
    focus: z.array(z.string()).describe('max 4, most relevant mistake categories'), next_lesson: z.string().describe('one or two sentences for the teacher'),
  }),
  explanations: z.array(z.object({key: z.string(), label: z.string(), explanation: z.string().describe('max 50 words, one rule')})),
  suggestions: z.array(z.object({topic: z.string(), to: z.enum(['covered', 'in_progress', 'mastered']), reason: z.string(), evidence_count: z.number()})).describe('max 8'),
  later_note: z.string().describe('one sentence about advanced mistakes kept for later, or empty'),
  source_quality: z.enum(['good', 'partial', 'poor']),
  quality_note: z.string(),
});
const ITEM_TYPES = ['multiple_choice', 'fill_in', 'translate', 'conjugate', 'correct_error', 'make_sentence', 'write', 'reading'] as const;
export const HomeworkSchema = z.object({
  title: z.string(),
  items: z.array(z.object({
    category_key: z.string(), type: z.enum(ITEM_TYPES), prompt: z.string(), passage: z.string(), options: z.array(z.string()),
    answer: z.string().describe('correct answer, or a model answer for open tasks'), accept: z.array(z.string()), explanation: z.string().describe('short feedback or assessment guideline'),
  })),
});

/* ---------------- the analysis document (v2), stored in lesson_analyses.draft / final ---------------- */
export type AnalysisV2 = {
  version: 2;
  report: z.infer<typeof SynthesisSchema>['report'] | null;
  categories: Category[];
  later_note: string;
  covered: {topic_id: string | null; label: string}[];
  positives: {utterance_id: string; text: string; note: string}[];
  vocabulary: {term: string; translation: string; status?: 'introduced' | 'practised' | 'difficult'}[];
  checklist_suggestions: Suggestion[];
  homework: {assignment_id: string | null; items: number; skipped_reason: string | null} | null;
  speakers_separated: boolean; student_utterances: number; chunks: number; dropped_unverified: number;
  source_quality: 'good' | 'partial' | 'poor'; quality_note: string; explanation_language: string;
  steps: {merged: boolean; synthesis: boolean; homework: boolean};
  // legacy fields so older screens/games keep working
  summary: string; corrections: {original: string; corrected: string; explanation: string; category: ReturnType<typeof legacyCategory>; certainty: 'certain' | 'uncertain'}[];
  homework_suggestion: string; exercises: {type: string; prompt: string}[];
};

export type Ask = <S extends z.ZodType>(step: 'chunk' | 'synthesis' | 'homework', schema: S, system: string, user: string, maxTokens: number) => Promise<z.infer<S>>;
export type PartState = {index: number; status: 'done' | 'failed'; result: RawChunk | null; attempts: number};
export type Store = {
  parts(): Promise<PartState[]>;
  savePart(index: number, status: 'done' | 'failed', result: RawChunk | null, error: string | null): Promise<void>;
  stage(stage: Stage, detail: Record<string, unknown>): Promise<void>;
  saveDraft(doc: AnalysisV2): Promise<void>;
  loadDraft(): Promise<AnalysisV2 | null>;
  /** idempotent: one homework draft per analysis; returns its id */
  saveHomework(set: {title: string; items: unknown[]}): Promise<string | null>;
  finish(doc: AnalysisV2): Promise<void>;
  fail(stage: Stage, message: string, partial: boolean): Promise<void>;
};
export type Context = {
  utterances: Utterance[]; lessonDate: string; targetLang: string; targetName: string; uiName: string; level: string;
  notes: string; board: string; lessonGoals: {topic_id: string | null; title: string}[]; topics: Topic[]; history: HistoryItem[];
  isTest: boolean; guide: string; thinNote?: string; knownWords?: string[]; chunkWords?: number; concurrency?: number; maxAttempts?: number; deadline?: number;
};

const now = () => Date.now();
/** Topic aliases (T1, T2…) keep prompts short and avoid the model copying long uuids. */
function aliases(topics: Topic[]) {
  const toAlias = new Map<string, string>(), toId = new Map<string, string>();
  topics.forEach((t, i) => { toAlias.set(t.id, 'T' + (i + 1)); toId.set('T' + (i + 1), t.id); });
  return {toAlias, toId};
}
const STATUS_NL: Record<Topic['status'], string> = {not_started: 'niet behandeld', covered: 'behandeld', in_progress: 'nog oefenen', mastered: 'beheerst'};
/** Topics given to the model: everything already on the checklist, plus untouched topics from one level below
 *  up to three levels above (so advanced mistakes can be recognised as "later" instead of as a weakness). */
export function promptTopics(topics: Topic[], level: string, max = 90) {
  const li = levelIndex(level);
  const d = (t: Topic) => levelIndex(t.level) - li;
  return topics.filter(t => t.status !== 'not_started' || (d(t) >= -1 && d(t) <= 3))
    .sort((a, b) => Number(a.status === 'not_started') - Number(b.status === 'not_started') || Math.abs(d(a)) - Math.abs(d(b))).slice(0, max);
}

export async function runPipeline(ctx: Context, ask: Ask, store: Store): Promise<{state: 'done' | 'paused' | 'failed' | 'partial_failed'; doc?: AnalysisV2}> {
  const utts = ctx.utterances; const byId = new Map(utts.map(u => [u.id, u]));
  if (!utts.length) { await store.fail('collect', 'Geen bruikbaar transcript gevonden.', false); return {state: 'failed'}; }
  const topics = promptTopics(ctx.topics, ctx.level); const {toAlias, toId} = aliases(topics);
  const topicList = topics.map(t => `${toAlias.get(t.id)} [${t.level}] ${t.title} — ${STATUS_NL[t.status]}`).join('\n');
  const chunks = chunkUtterances(utts, ctx.chunkWords || 1400);
  const explainIn = levelIndex(ctx.level) === 0 ? ctx.uiName : ctx.targetName; // A0: interface language, otherwise the target language
  let draft = await store.loadDraft();

  /* 1. chunk analyses — each stored separately; only missing/failed ones (under the attempt limit) run */
  if (!draft?.steps?.merged) {
    await store.stage('chunks', {total: chunks.length});
    const prev = new Map((await store.parts()).map(p => [p.index, p]));
    const todo = chunks.filter(c => prev.get(c.index)?.status !== 'done' && (prev.get(c.index)?.attempts || 0) < (ctx.maxAttempts || 3));
    const system = [
      `You analyse one part of a ${ctx.targetName} lesson transcript for a language teacher. ${ctx.guide}`,
      `Student level: ${ctx.level}. Lines are numbered (u1, u2…) and labelled DOCENT (teacher), LEERLING (student) or ONBEKEND (speaker unknown).`,
      'errors: ONLY mistakes in LEERLING lines (ONBEKEND only if you are sure it is the student; then certainty "uncertain"). Never use DOCENT lines.',
      '"original" must be copied EXACTLY from that line. Do not invent quotes. Do not flag correct, natural informal speech.',
      'kind: "slip" for an obvious one-off speech error, "self_correction" when the student immediately corrected it themselves, otherwise "error".',
      'No explanations. Keep it compact. Lines marked as context must not be analysed.',
      `Topic list (use the alias in "topic" when a mistake or covered topic belongs to it):\n${topicList || '(none)'}`,
      `new_words: translations in ${ctx.uiName}. status "difficult" only with evidence in the student lines.`,
    ].join('\n');
    let i = 0; const conc = ctx.concurrency || 4;
    const worker = async () => {
      while (i < todo.length) {
        if (ctx.deadline && now() > ctx.deadline) return;
        const c = todo[i++];
        try {
          const r = await ask('chunk', ChunkSchema, system, `Part ${c.index + 1} of ${chunks.length}:\n${chunkText(c, byId)}`, 3500);
          const raw: RawChunk = {
            errors: r.errors.slice(0, 40).map(e => ({utterance_id: e.utterance_id, original: e.original, corrected: e.corrected, category: e.category, topic_id: e.topic ? toId.get(e.topic) || null : null, kind: e.kind, certainty: e.certainty}))
              .filter(e => c.ids.includes(e.utterance_id)), // never count context lines twice
            covered: r.covered.slice(0, 6).map(x => ({topic_id: x.topic ? toId.get(x.topic) || null : null, label: x.label})),
            positives: r.positives.slice(0, 3).filter(p => c.ids.includes(p.utterance_id)), new_words: r.new_words.slice(0, 8),
          };
          await store.savePart(c.index, 'done', raw, null);
        } catch (e) { await store.savePart(c.index, 'failed', null, e instanceof Error ? e.message : String(e)); }
      }
    };
    await Promise.all(Array.from({length: Math.min(conc, todo.length)}, worker));
    const parts = await store.parts();
    const done = parts.filter(p => p.status === 'done' && chunks.some(c => c.index === p.index));
    if (done.length < chunks.length) {
      if (ctx.deadline && now() > ctx.deadline) return {state: 'paused'};
      await store.fail('chunks', `${chunks.length - done.length} van ${chunks.length} transcriptdelen mislukt.`, true);
      return {state: 'partial_failed'};
    }
    /* 2. merge (deterministic) */
    await store.stage('merge', {total: chunks.length});
    const merged = mergeChunks(done.sort((a, b) => a.index - b.index).map(p => p.result!), utts, {topics: ctx.topics, studentLevel: ctx.level, todayTopicIds: ctx.lessonGoals.map(g => g.topic_id).filter(Boolean) as string[], history: ctx.history, knownWords: ctx.knownWords});
    draft = {
      version: 2, report: null, categories: merged.categories, later_note: '', covered: merged.covered,
      positives: merged.positives.map(p => ({utterance_id: p.utterance_id, text: byId.get(p.utterance_id)?.text || '', note: p.note})),
      vocabulary: merged.vocabulary, checklist_suggestions: [], homework: null,
      speakers_separated: merged.separated, student_utterances: merged.studentUtterances, chunks: chunks.length, dropped_unverified: merged.dropped,
      source_quality: merged.separated ? 'good' : 'partial', quality_note: '', explanation_language: explainIn,
      steps: {merged: true, synthesis: false, homework: false}, summary: '', corrections: [], homework_suggestion: '', exercises: [],
    };
    await store.saveDraft(draft);
  }
  if (ctx.deadline && now() > ctx.deadline) return {state: 'paused'};

  /* 3. synthesis: short report + ONE explanation per category + checklist suggestions */
  if (!draft.steps.synthesis) {
    await store.stage('synthesis', {});
    const cats = draft.categories.filter(c => c.count > 0).slice(0, 12);
    const input = {
      level: ctx.level, lesson_date: ctx.lessonDate,
      categories: cats.map(c => ({key: c.key, label: c.label, count: c.count, relevance: c.relevance, recurring: c.recurring, trend: c.trend?.direction || null, self_corrections: c.self_corrections, examples: c.examples.map(e => `${e.original} → ${e.corrected}`)})),
      self_corrections_total: draft.categories.reduce((n, c) => n + c.self_corrections, 0),
      covered: draft.covered.map(c => c.label), positives: draft.positives.map(p => p.text).slice(0, 6),
      lesson_goals: ctx.lessonGoals.map(g => g.title), teacher_notes: ctx.notes.slice(0, 1500) || '(none)', board: ctx.board.slice(0, 2500) || '(none)',
      checklist: topics.map(t => `${toAlias.get(t.id)} [${t.level}] ${t.title}: ${STATUS_NL[t.status]}`),
      speakers_separated: draft.speakers_separated, student_lines: draft.student_utterances,
      vocabulary: {introduced: draft.vocabulary.filter(v => v.status === 'introduced').map(v => v.term).slice(0, 12), practised: draft.vocabulary.filter(v => v.status === 'practised').map(v => v.term).slice(0, 12), difficult: draft.vocabulary.filter(v => v.status === 'difficult').map(v => v.term).slice(0, 12)},
    };
    try {
      const s = await ask('synthesis', SynthesisSchema, [
        `You write the result of a ${ctx.targetName} lesson analysis for teacher and student. ${ctx.guide}`,
        `Write the report and every explanation in ${explainIn}, at the student's level (${ctx.level}: short, simple sentences for A0–A2).`,
        'The mistakes are already grouped and counted: do NOT add, remove or recount mistakes. Write exactly one short explanation per category key (one rule).',
        'covered = what was taught (from covered topics, lesson goals, notes and board) even if the student made few mistakes. went_well = concrete strengths. focus = most relevant categories (relevance current/known first; never "later").',
        'Never invent things the student said. Notes and board describe what was taught, not what the student said.',
        'vocabulary: mention new and difficult words in covered/focus where useful. A word on the board or introduced by the teacher is NOT mastered by the student.',
        'suggestions: checklist changes (topic alias from the checklist, status covered / in_progress (= still practising) / mastered). Only with evidence from this lesson; "mastered" only when the student used it correctly several times (evidence_count = number of correct uses) and made no mistakes in it. Max 8.',
        'later_note: mention advanced mistakes (relevance "later") only as material for later, never as a weakness. Empty if none.',
        'source_quality: good when speakers were separated and the transcript is substantial; partial or poor otherwise, explained in quality_note.',
      ].join('\n'), JSON.stringify(input), 4000);
      const exp = new Map(s.explanations.map(e => [e.key, e]));
      draft.categories = draft.categories.map(c => ({...c, label: exp.get(c.key)?.label || c.label, explanation: exp.get(c.key)?.explanation || ''}));
      draft.report = {summary: s.report.summary, covered: s.report.covered.slice(0, 6), went_well: s.report.went_well.slice(0, 4), focus: s.report.focus.slice(0, 4), next_lesson: s.report.next_lesson};
      draft.later_note = s.later_note;
      draft.checklist_suggestions = ctx.isTest ? [] : guardSuggestions(s.suggestions.map(x => ({topic_id: toId.get(x.topic) || '', to: x.to, reason: x.reason, evidence_count: x.evidence_count})), new Map(ctx.topics.map(t => [t.id, t])), draft.categories);
      draft.source_quality = s.source_quality; draft.quality_note = s.quality_note;
      if (ctx.thinNote) { draft.source_quality = 'poor'; draft.quality_note = `${ctx.thinNote} ${s.quality_note}`.trim(); } // too little content: honest, no homework
      draft.steps.synthesis = true;
      // legacy fields for older screens and the practice games
      draft.summary = s.report.summary;
      draft.corrections = draft.categories.filter(c => c.relevance !== 'later').flatMap(c => c.examples.map(e => ({original: e.original, corrected: e.corrected, explanation: c.explanation, category: legacyCategory(c.key), certainty: e.certainty})));
      await store.saveDraft(draft);
    } catch (e) { await store.fail('synthesis', e instanceof Error ? e.message : String(e), true); return {state: 'partial_failed'}; }
  }
  if (ctx.deadline && now() > ctx.deadline) return {state: 'paused'};

  /* 4. homework draft: 3 exercises per relevant category, only known/current material; never for tests */
  if (!draft.steps.homework) {
    await store.stage('homework', {});
    const cats = homeworkCategories(draft.categories);
    if (ctx.isTest || !cats.length || draft.source_quality === 'poor') {
      draft.homework = {assignment_id: null, items: 0, skipped_reason: ctx.isTest ? 'test' : !cats.length ? 'no_relevant_mistakes' : 'too_little_content'};
    } else {
      try {
        const known = ctx.topics.filter(t => t.status !== 'not_started').map(t => t.title);
        const h = await ask('homework', HomeworkSchema, [
          `You write homework for a ${ctx.targetName} learner at level ${ctx.level}. ${ctx.guide}`,
          'Exactly 3 exercises per category key given. Choose the best type per exercise (fill_in, correct_error, multiple_choice, make_sentence, translate, conjugate, write).',
          'Use ONLY grammar and vocabulary the student already knows (listed topics, this lesson). Never require grammar that has not been taught. For A0/A1: very short, very simple, familiar words.',
          'Give the correct answer (and accepted variants) for auto-checkable items; for open tasks give a model answer and a short assessment guideline in "explanation".',
          `Instructions in ${explainIn}. options only for multiple_choice (else empty). passage empty unless needed.`,
        ].join('\n'), JSON.stringify({categories: cats.map(c => ({key: c.key, label: c.label, explanation: c.explanation, examples: c.examples.map(e => `${e.original} → ${e.corrected}`)})), known_topics: known.slice(0, 60), lesson_words: [...draft.vocabulary].sort((a, b) => Number(b.status === 'difficult') - Number(a.status === 'difficult')).map(v => v.term).slice(0, 20), lesson_goals: ctx.lessonGoals.map(g => g.title)}), 3500);
        const allowed = new Set(cats.map(c => c.key)); const per = new Map<string, number>();
        const items = h.items.filter(it => allowed.has(it.category_key) && (per.set(it.category_key, (per.get(it.category_key) || 0) + 1).get(it.category_key)! <= 3))
          .map(it => ({type: it.type, prompt: it.prompt, passage: it.passage, options: it.type === 'multiple_choice' ? it.options : [], answer: it.answer, accept: it.accept, explanation: it.explanation}));
        const id = items.length ? await store.saveHomework({title: h.title.slice(0, 200), items}) : null;
        draft.homework = {assignment_id: id, items: items.length, skipped_reason: items.length ? null : 'no_items'};
        draft.homework_suggestion = h.title; draft.exercises = items.map(i => ({type: i.type, prompt: i.prompt}));
      } catch (e) { await store.saveDraft(draft); await store.fail('homework', e instanceof Error ? e.message : String(e), true); return {state: 'partial_failed'}; }
    }
    draft.steps.homework = true;
    await store.saveDraft(draft);
  }
  await store.finish(draft);
  return {state: 'done', doc: draft};
}
