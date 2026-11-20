import 'server-only';
// Connects the analysis pipeline (lib/analysis) to Supabase (Store) and OpenAI (Ask).
// One runner per analysis at a time (claim_analysis lease). If the Vercel time limit comes close,
// the run stops cleanly and a new invocation continues from the stored state.
import type {SupabaseClient} from '@supabase/supabase-js';
import {askFast, askStrong, langName, transcribe, type UsageCtx} from './ai';
import {canvasText, subjectCode, type StudentCtx} from './context';
import {formatDialogue, mergeSpeakers, speakingTime} from '../transcript';
import {parseUtterances, wordCount, type Topic, type HistoryItem, type RawChunk} from '../analysis/core';
import {runPipeline, PIPELINE_VERSION, type Ask, type Store, type AnalysisV2, type Stage} from '../analysis/pipeline';
import {detectCanvasVocab} from './vocab';
import {normTerm} from '../vocab/core';

export const LANG_GUIDE: Record<string, string> = {
  pt: 'BRAZILIAN Portuguese: verb conjugation (e.g. "ontem eu vai" → "ontem eu fui"), ser/estar, gender/number agreement, prepositions and contractions, word order, word choice and false friends. Normal informal Brazilian speech is NOT an error ("a gente", "tá", "pra", "né", omitted object pronouns, "ter" for "haver").',
  nl: 'Dutch: verb position (V2, inversion, verb-final in subordinate clauses), separable verbs, perfect tense with hebben/zijn and participles, de/het and adjective inflection, er-constructions, word choice. Normal informal spoken Dutch is NOT an error.',
  en: 'English: tenses (present simple/continuous, past simple vs. present perfect), articles, prepositions, word order, word choice. Natural informal spoken English is NOT an error.',
  es: 'Spanish: ser/estar, past tenses (indefinido/imperfecto), gender/number agreement, por/para, pronouns, subjunctive where required. Natural informal spoken Spanish is NOT an error.',
  fr: 'French: gender and agreement, passé composé (avoir/être) vs. imparfait, pronouns, negation, prepositions. Dropping "ne" in informal speech is NOT an error.',
  de: 'German: verb position (V2, verb-final in subordinate clauses), cases and articles, adjective endings, separable verbs, Perfekt with haben/sein. Natural informal spoken German is NOT an error.',
};
const STATUS_ALIAS: Record<string, Topic['status']> = {not_started: 'not_started', covered: 'covered', in_progress: 'in_progress', mastered: 'mastered'};

async function download(db: SupabaseClient, path: string, mime: string) {
  const s = await db.storage.from('recordings').createSignedUrl(path, 600);
  if (s.error || !s.data) return null;
  const b = await fetch(s.data.signedUrl).then(r => (r.ok ? r.blob() : null)).catch(() => null);
  return b ? new Blob([b], {type: mime}) : null;
}
const ext = (mime: string) => (/mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm');

/** The student's personal checklist: standard + own topics for the language, with per-student status/overrides; hidden topics left out. */
export async function loadTopics(db: SupabaseClient, studentId: string, subject: string): Promise<Topic[]> {
  const [g, p] = await Promise.all([
    db.from('curriculum_goals').select('id,level,title').eq('subject', subject).order('level').order('sort'),
    db.from('student_goal_progress').select('*').eq('student_id', studentId),
  ]);
  const prog = new Map(((p.data || []) as {goal_id: string; status: string; hidden?: boolean; title_override?: string | null; level_override?: string | null}[]).map(x => [x.goal_id, x]));
  return ((g.data || []) as {id: string; level: string; title: string}[])
    .filter(t => !prog.get(t.id)?.hidden)
    .map(t => { const x = prog.get(t.id); return {id: t.id, title: x?.title_override || t.title, level: x?.level_override || t.level, status: STATUS_ALIAS[x?.status || 'not_started'] || 'not_started'}; });
}

export async function runAnalysisJob(db: SupabaseClient, analysisId: string, opts: {userId: string; ui: string; token: string; origin: string; started: number}) {
  const {data: claimed} = await db.rpc('claim_analysis', {p_id: analysisId, p_seconds: 290});
  if (claimed === false) return; // another runner is busy with it
  let paused = false;
  try {
    const {data: row} = await db.from('lesson_analyses').select('*').eq('id', analysisId).maybeSingle();
    if (!row) return;
    const a = row as {id: string; student_id: string; recording_id: string | null; transcript: string | null; is_test?: boolean; lesson_date: string; lesson_id?: string | null};
    const {data: st} = await db.from('students').select('id,name,subject,level,lesson_language,curriculum_subject,teacher_id,user_id').eq('id', a.student_id).maybeSingle();
    if (!st) return;
    const student = st as StudentCtx; const subject = subjectCode(student);
    const log: UsageCtx = {db, userId: opts.userId, kind: 'analysis', studentId: student.id};
    const setStage = async (stage: Stage, detail: Record<string, unknown>) => { await db.from('lesson_analyses').update({stage, stage_detail: detail, status: 'processing', updated_at: new Date().toISOString()}).eq('id', analysisId); };

    /* transcript (only once; stored) */
    let transcript = a.transcript; let studentSeconds: number | null = null;
    if (!transcript && a.recording_id) {
      await setStage('collect', {step: 'transcribe'});
      const {data: rec} = await db.from('lesson_recordings').select('*').eq('id', a.recording_id).maybeSingle();
      const r = rec as {storage_path: string; mime_type: string; teacher_track_path?: string | null; student_track_path?: string | null} | null;
      const hint = subject.length === 2 ? subject : undefined; let note = '';
      if (r?.teacher_track_path && r.student_track_path) {
        const [tb, sb] = await Promise.all([download(db, r.teacher_track_path, r.mime_type), download(db, r.student_track_path, r.mime_type)]);
        if (tb && sb) {
          const [tt, stt] = await Promise.all([transcribe(tb, 'docent.' + ext(r.mime_type), hint, log), transcribe(sb, 'leerling.' + ext(r.mime_type), hint, log)]);
          if (tt.text !== null && stt.text !== null) { transcript = formatDialogue(mergeSpeakers(tt.segments, stt.segments), 400000); studentSeconds = speakingTime(stt.segments); } else note = tt.reason || stt.reason || '';
        }
      }
      if (!transcript && r) { const mix = await download(db, r.storage_path, r.mime_type); if (mix) { const t = await transcribe(mix, 'les.' + ext(r.mime_type), hint, log); transcript = t.text; note = t.reason || note; } }
      if (!transcript) { await db.from('lesson_analyses').update({status: 'failed', stage: 'failed', error: (note || 'Transcriptie mislukt.').slice(0, 500)}).eq('id', analysisId); return; }
      await db.from('lesson_analyses').update({transcript}).eq('id', analysisId);
    }
    if (!transcript) { await db.from('lesson_analyses').update({status: 'failed', stage: 'failed', error: 'Geen transcript beschikbaar.'}).eq('id', analysisId); return; }

    /* context: notes, board, lesson goals, checklist, history (missing sources never block) */
    const test = !!a.is_test;
    const [lesson, teacherNotes, board, goals, topics, hist] = await Promise.all([
      test ? null : db.from('lesson_entries').select('notes,homework').eq('student_id', student.id).eq('lesson_date', a.lesson_date).maybeSingle().then(r => r.data as {notes?: string; homework?: string} | null),
      test || !a.lesson_id ? null : db.from('lesson_teacher_notes').select('notes').eq('lesson_id', a.lesson_id).maybeSingle().then(r => (r.data as {notes?: string} | null)?.notes || '', () => ''),
      test ? Promise.resolve('') : canvasText(db, student.id, 4000),
      db.from('lesson_goals').select('goal_id,custom_title,curriculum_goals(title)').eq('student_id', student.id).eq('lesson_date', a.lesson_date).then(r => r.error ? [] : (r.data || []) as unknown as {goal_id: string | null; custom_title: string | null; curriculum_goals: {title: string} | null}[]),
      loadTopics(db, student.id, subject),
      test ? Promise.resolve([] as HistoryItem[]) : db.from('lesson_analyses').select('lesson_date,final,is_test,pipeline_version').eq('student_id', student.id).eq('status', 'approved').neq('id', analysisId).order('lesson_date', {ascending: false}).limit(5)
        .then(r => ((r.data || []) as {lesson_date: string; final: AnalysisV2 | null; is_test?: boolean; pipeline_version?: number}[])
          .filter(x => !x.is_test && x.final?.version === 2).map(x => ({lesson_date: x.lesson_date, student_utterances: x.final!.student_utterances || 0, categories: (x.final!.categories || []).map(c => ({key: c.key, count: c.count}))}))),
    ]);
    const knownWords = ((await db.from('vocab_items').select('term').eq('student_id', student.id)).data || []).map(x => (x as {term: string}).term);
    const notes = [lesson?.notes, teacherNotes].filter(Boolean).join('\n');
    const utterances = parseUtterances(transcript);
    const studentWords = utterances.filter(u => u.speaker !== 'teacher').reduce((n, u) => n + wordCount(u.text), 0);
    const ui = langName(opts.ui), target = langName(subject);

    const ask: Ask = async (step, schema, system, user, maxTokens) => {
      const call = step === 'synthesis' ? askStrong : askFast;
      return call(schema, system, user, {maxTokens: Math.max(maxTokens, 6000), effort: 'low', log}) as never;
    };
    const store: Store = {
      async parts() {
        const {data} = await db.from('lesson_analysis_parts').select('idx,status,result,attempts').eq('analysis_id', analysisId);
        return ((data || []) as {idx: number; status: 'done' | 'failed'; result: RawChunk | null; attempts: number}[]).map(p => ({index: p.idx, status: p.status, result: p.result, attempts: p.attempts}));
      },
      async savePart(index, status, result, error) {
        const {data: prev} = await db.from('lesson_analysis_parts').select('attempts').eq('analysis_id', analysisId).eq('idx', index).maybeSingle();
        await db.from('lesson_analysis_parts').upsert({analysis_id: analysisId, idx: index, status, result, error: error?.slice(0, 500) || null, attempts: ((prev as {attempts?: number} | null)?.attempts || 0) + 1, updated_at: new Date().toISOString()}, {onConflict: 'analysis_id,idx'});
      },
      stage: setStage,
      async saveDraft(doc) { await db.from('lesson_analyses').update({draft: doc, updated_at: new Date().toISOString()}).eq('id', analysisId); },
      async loadDraft() { const {data} = await db.from('lesson_analyses').select('draft').eq('id', analysisId).maybeSingle(); const d = (data as {draft?: AnalysisV2} | null)?.draft; return d?.version === 2 ? d : null; },
      async saveHomework(set) {
        const text = (set.items as {prompt: string; options?: string[]}[]).map((it, i) => `${i + 1}. ${it.prompt}${it.options?.length ? '\n   ' + it.options.join(' / ') : ''}`).join('\n\n');
        // no RETURNING (assignments policy); unique(analysis_id) makes a retry harmless
        await db.from('assignments').insert({student_id: student.id, title: set.title || 'Huiswerk', instructions: text, exercises: set, origin: 'ai_analysis', analysis_id: analysisId});
        const {data} = await db.from('assignments').select('id').eq('analysis_id', analysisId).maybeSingle();
        return (data as {id?: string} | null)?.id || null;
      },
      async finish(doc) {
        const t = new Date().toISOString();
        await db.from('lesson_analyses').update(test
          ? {status: 'ready', draft: doc, stage: 'done', error: null, updated_at: t}
          : {status: 'approved', draft: doc, final: doc, stage: 'done', error: null, published_at: t, approved_at: t, updated_at: t}).eq('id', analysisId);
      },
      async fail(stage, message, partial) {
        await db.from('lesson_analyses').update({status: 'failed', stage: partial ? 'partial_failed' : 'failed', stage_detail: {failed_step: stage}, error: message.slice(0, 500), updated_at: new Date().toISOString()}).eq('id', analysisId);
      },
    };
    const res = await runPipeline({
      utterances, lessonDate: a.lesson_date, targetLang: subject, targetName: target, uiName: ui, level: student.level || 'A1',
      notes, board, lessonGoals: goals.map(g => ({topic_id: g.goal_id, title: g.custom_title || g.curriculum_goals?.title || ''})).filter(g => g.title),
      topics, history: hist, isTest: test, guide: LANG_GUIDE[subject] || '', knownWords,
      thinNote: studentWords < 60 && !notes && !board ? `Te weinig lesinhoud voor zinvol huiswerk (${studentWords} woorden van de leerling, geen notities of bord).` : undefined,
      deadline: opts.started + 240_000,
    }, ask, store);
    if (studentSeconds !== null && res.doc) { const d = {...res.doc, student_speaking_seconds: studentSeconds}; await db.from('lesson_analyses').update(test ? {draft: d} : {draft: d, final: d}).eq('id', analysisId); }
    paused = res.state === 'paused';
    if (res.state === 'done' && res.doc && !test) await syncVocabulary(db, student, res.doc, {userId: opts.userId, ui: opts.ui, lessonDate: a.lesson_date, lessonId: a.lesson_id || null, known: knownWords}).catch(() => undefined); // never fails the analysis
  } catch (e) {
    await db.from('lesson_analyses').update({status: 'failed', stage: 'failed', error: (e instanceof Error ? e.message : 'Onbekende fout').slice(0, 500)}).eq('id', analysisId);
  } finally {
    await db.rpc('release_analysis', {p_id: analysisId});
  }
  // continue in a fresh invocation (Vercel time limit) — resumes from the stored parts/draft
  if (paused) await fetch(`${opts.origin}/api/ai/analyze`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${opts.token}`}, body: JSON.stringify({resumeId: analysisId, uiLang: opts.ui})}).catch(() => undefined);
}
/** After a (non-test) analysis: new words → suggestions for the teacher; words the student found difficult → flagged
 *  (priority in flashcards and games; never "mastered"); new typed words on the canvas → suggestions too. */
async function syncVocabulary(db: SupabaseClient, student: StudentCtx, doc: AnalysisV2, o: {userId: string; ui: string; lessonDate: string; lessonId: string | null; known: string[]}) {
  const known = new Set(o.known.map(normTerm)); const subject = subjectCode(student);
  // v46 phase 2: words go straight into the ONE central word list (no duplicates, linked to this lesson); the teacher can
  // still edit or delete them. Words the student needed in a (certain) mistake are added too, marked difficult.
  const lang = /^[a-z]{2}$/.test(subject) ? subject : null;
  const base = {p_student: student.id, p_lesson_date: o.lessonDate, p_lesson_id: o.lessonId};
  const merged = await db.rpc('vocab_merge', {...base, p_source: 'ai', p_items: (doc.vocabulary || []).map(v => ({term: v.term, translation: v.translation, difficult: v.status === 'difficult', lang}))});
  if (!merged.error) {
    const errWords = (doc.errors || []).filter(e => e.word && e.certainty === 'certain' && !e.later).map(e => ({term: e.word, translation: e.word_en || '', difficult: true, lang}));
    if (errWords.length) await db.rpc('vocab_merge', {...base, p_source: 'error', p_items: errWords});
    await detectCanvasVocab(db, student, {userId: o.userId, ui: o.ui, lessonDate: o.lessonDate, lessonId: o.lessonId});
    return;
  }
  // database update v47 not run yet: the previous behaviour (suggestions for the teacher)
  for (const v of doc.vocabulary || []) {
    if (v.status === 'difficult' && known.has(normTerm(v.term))) await db.from('vocab_items').update({difficult: true, due_at: new Date().toISOString(), updated_at: new Date().toISOString()}).eq('student_id', student.id).ilike('term', v.term.replace(/[%_\\]/g, '\\$&'));
    else if (!known.has(normTerm(v.term))) await db.from('vocab_suggestions').insert({student_id: student.id, term: v.term.slice(0, 120), translation: v.translation.slice(0, 300), kind: /\s/.test(v.term.trim()) ? 'expression' : 'word', lang: subject.length === 2 ? subject : null, origin: 'analysis', lesson_date: o.lessonDate, lesson_id: o.lessonId});
  }
  await detectCanvasVocab(db, student, {userId: o.userId, ui: o.ui, lessonDate: o.lessonDate, lessonId: o.lessonId});
}
export {PIPELINE_VERSION};
