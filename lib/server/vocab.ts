import 'server-only';
// Server side of the word list: canvas recognition → the central word list (v47; before: teacher-reviewed suggestions), taboo cards (cached).
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {askFast, langName, type UsageCtx} from './ai';
import {subjectCode, type StudentCtx} from './context';
import {detectPages, cleanGrammar, checkBatch, VocabCheckSchema, type Page, type Grammar} from '../vocab/detect';
import {grammarLabel} from '../vocab/grammar';
import {cleanTaboo, canvasBlocks, candidatesFrom, mergeCandidates, normTerm, pageHash} from '../vocab/core';

/** Scan this student's canvas pages (stored per student → words can never end up with another student)
 *  and store new words as suggestions for the teacher. Unchanged pages are skipped (no AI cost). */
export async function detectCanvasVocab(db: SupabaseClient, student: StudentCtx, opts: {userId: string; ui: string; lessonDate?: string | null; lessonId?: string | null;
  /* v62 */ page?: number | null; list?: boolean; /* v65 */ listOnly?: boolean}) {
  const [cs, vi, vs, sc] = await Promise.all([
    db.from('classroom_states').select('canvas').eq('student_id', student.id).maybeSingle(),
    db.from('vocab_items').select('*').eq('student_id', student.id),
    db.from('vocab_suggestions').select('term').eq('student_id', student.id),
    db.from('vocab_canvas_scans').select('page_hash').eq('student_id', student.id),
  ]);
  if (vs.error || sc.error) throw new Error(/vocab_suggestions|vocab_canvas_scans/.test((vs.error || sc.error)!.message) ? 'Voer eerst supabase/v35.sql uit.' : (vs.error || sc.error)!.message);
  let pages = ((cs.data?.canvas as {pages?: Page[]} | null)?.pages || []).filter(p => p && typeof p.html === 'string');
  if (typeof opts.page === 'number') pages = pages[opts.page] ? [pages[opts.page]] : [];     // v62: "Deze pagina verwerken"
  if (opts.listOnly) return {added: 0, known: 0, list: await pageList(db, student.id, pages)};   // v65: after the batched import: no AI
  const log: UsageCtx = {db, userId: opts.userId, kind: 'vocab', studentId: student.id};
  const subject = subjectCode(student);
  const items = (vi.data || []) as {term: string; grammar?: unknown}[];
  const res = await detectPages(pages, {
    existing: [...items, ...(vs.data || [])].map(x => (x as {term: string}).term),
    scanned: new Set((sc.data || []).map(x => (x as {page_hash: string}).page_hash)),
    // v62: the word list button re-reads the page and only asks grammar for known words that have none yet
    force: !!opts.list, enrich: opts.list ? new Set(items.filter(x => !x.grammar).map(x => normTerm(x.term))) : undefined,
    targetName: langName(subject), // v42: the meaning stored with a word is English by default (flashcards); the grammar label follows the interface
    explainName: langName('en'), explainCode: opts.ui === subject ? 'en' : opts.ui, targetCode: subject, level: student.level || 'A1',
    ask: (schema, system, user) => askFast(schema, system, user, {maxTokens: 3000, effort: 'low', log}) as never,
  });
  let added = 0;
  // v46 phase 2: canvas words go straight into the central word list (one row per word, linked to the lesson)
  if (res.suggestions.length) {
    const m = await db.rpc('vocab_merge', {p_student: student.id, p_source: 'canvas', p_lesson_date: opts.lessonDate || new Date().toISOString().slice(0, 10), p_lesson_id: opts.lessonId || null,
      p_items: res.suggestions.map(w => ({term: w.term, translation: w.translation, example: w.example, pos: w.pos || null, kind: w.kind, lang: subject.length === 2 ? subject : null, grammar: w.grammar || null, page: w.page || null}))});
    if (!m.error) {
      for (const h of res.hashes) await db.from('vocab_canvas_scans').upsert({student_id: student.id, page_hash: h.hash, found: h.found, scanned_at: new Date().toISOString()}, {onConflict: 'student_id,page_hash'});
      const added = (m.data as {added?: number} | null)?.added || 0;
      return {added, known: res.known, scannedPages: res.hashes.length, aiCalls: res.aiCalls, direct: true, list: opts.list ? await pageList(db, student.id, pages) : undefined};
    }
  }
  if (opts.list) {   // nothing new: the list is built from the bank (no AI)
    for (const h of res.hashes) await db.from('vocab_canvas_scans').upsert({student_id: student.id, page_hash: h.hash, found: h.found, scanned_at: new Date().toISOString()}, {onConflict: 'student_id,page_hash'});
    return {added: 0, known: res.known, scannedPages: res.hashes.length, aiCalls: res.aiCalls, list: await pageList(db, student.id, pages)};
  }
  for (const w of res.suggestions) {
    const r = await db.from('vocab_suggestions').insert({student_id: student.id, term: w.term, translation: w.translation, example: w.example, pos: w.pos || null, kind: w.kind, lang: subject.length === 2 ? subject : null,
      origin: 'canvas', lesson_date: opts.lessonDate || new Date().toISOString().slice(0, 10), lesson_id: opts.lessonId || null, source_page: w.page.slice(0, 120) || null});
    if (!r.error) added++; // 23505 = already suggested (e.g. two scans at the same time): harmless
  }
  for (const h of res.hashes) await db.from('vocab_canvas_scans').upsert({student_id: student.id, page_hash: h.hash, found: h.found, scanned_at: new Date().toISOString()}, {onConflict: 'student_id,page_hash'});
  return {added, scannedPages: res.hashes.length, aiCalls: res.aiCalls};
}

/** v62: the vocabulary of these pages as stored in the bank (with grammar) — for the word list on the canvas. */
async function pageList(db: SupabaseClient, studentId: string, pages: Page[]) {
  const keys = new Set(pages.flatMap(p => mergeCandidates(candidatesFrom(canvasBlocks(p.html), p.title || '')).map(c => normTerm(c.term))));
  const {data} = await db.from('vocab_items').select('*').eq('student_id', studentId);
  return ((data || []) as {term: string; translation: string; pos: string | null; kind: string; grammar: unknown}[]).filter(v => keys.has(normTerm(v.term)))
    .map(v => ({term: v.term, translation: v.translation, pos: v.pos, kind: v.kind, grammar: v.grammar || null}));
}

/** v65: import ONE batch (max 40 words) of one canvas page into the central word bank and store the progress.
 *  Called repeatedly by the classroom until the page is done → no request runs into the time limit, every batch is
 *  saved at once, a closed page or another student simply continues later. Known words cost no AI call unless they
 *  still miss grammar. Words that are not vocabulary are listed (never skipped silently). */
export const IMPORT_BATCH = 40;
export async function importBatch(db: SupabaseClient, student: StudentCtx, opts: {userId: string; ui: string; page: number; lessonId?: string | null}) {
  const [cs, vi] = await Promise.all([
    db.from('classroom_states').select('canvas').eq('student_id', student.id).maybeSingle(),
    db.from('vocab_items').select('term,grammar').eq('student_id', student.id).limit(20000),
  ]);
  const pages = ((cs.data?.canvas as {pages?: Page[]} | null)?.pages || []).filter(p => p && typeof p.html === 'string');
  const page = pages[opts.page]; if (!page) return {done: true, total: 0, next: 0, added: 0, known: 0, skipped: 0, missing: true};
  const blocks = canvasBlocks(page.html), hash = pageHash(blocks.map(b => b.text).join('\n'));
  const cands = mergeCandidates(candidatesFrom(blocks, page.title || ''));
  const prog = await db.from('vocab_import_progress').select('*').eq('student_id', student.id).eq('page_hash', hash).maybeSingle();
  if (prog.error) throw new Error(/vocab_import_progress/.test(prog.error.message) ? 'Voer eerst supabase/v65.sql uit.' : prog.error.message);
  type P = {next_offset: number; added: number; known: number; skipped: number; skipped_terms: string[]; attempts: number; status: string};
  const p: P = (prog.data as P | null) || {next_offset: 0, added: 0, known: 0, skipped: 0, skipped_terms: [], attempts: 0, status: 'running'};
  if (p.status === 'failed') { p.attempts = 0; p.status = 'running'; }   // a new session/try: again max 3 attempts
  const save = (x: Partial<P> & {status?: string; last_error?: string | null}) => db.from('vocab_import_progress').upsert({student_id: student.id, page_hash: hash, page_index: opts.page, page_title: (page.title || '').slice(0, 120), total: cands.length, ...p, ...x, updated_at: new Date().toISOString()}, {onConflict: 'student_id,page_hash'});
  if (p.next_offset >= cands.length) { await save({status: 'done'}); return {done: true, total: cands.length, next: cands.length, added: p.added, known: p.known, skipped: p.skipped, skippedTerms: p.skipped_terms}; }
  const batch = cands.slice(p.next_offset, p.next_offset + IMPORT_BATCH);
  const have = new Map(((vi.data || []) as {term: string; grammar: unknown}[]).map(v => [normTerm(v.term), !!v.grammar]));
  const known = batch.filter(c => have.has(normTerm(c.term)));
  const toCheck = batch.filter(c => !have.has(normTerm(c.term)) || !have.get(normTerm(c.term)));   // new, or known without grammar
  const subject = subjectCode(student);
  try {
    const res = toCheck.length ? await checkBatch(toCheck, {targetName: langName(subject), explainName: langName('en'), explainCode: opts.ui === subject ? 'en' : opts.ui, targetCode: subject, level: student.level || 'A1',
      ask: (schema, system, user) => askFast(schema, system, user, {maxTokens: 6000, effort: 'low', log: {db, userId: opts.userId, kind: 'vocab', studentId: student.id}}) as never}) : {kept: [], dropped: []};
    let added = 0;
    if (res.kept.length) {
      const m = await db.rpc('vocab_merge', {p_student: student.id, p_source: 'canvas', p_lesson_date: new Date().toISOString().slice(0, 10), p_lesson_id: opts.lessonId || null,
        p_items: res.kept.map(w => ({term: w.term, translation: w.translation, example: w.example, pos: w.pos || null, kind: w.kind, lang: subject.length === 2 ? subject : null, grammar: w.grammar || null, page: w.page || null}))});
      if (m.error) throw new Error(m.error.message);
      added = (m.data as {added?: number} | null)?.added || 0;
    }
    const knownNow = known.length + (res.kept.length - added - res.kept.filter(w => known.some(k => normTerm(k.term) === normTerm(w.term))).length);
    const next = p.next_offset + batch.length;
    const nx = {next_offset: next, added: p.added + added, known: p.known + Math.max(0, knownNow), skipped: p.skipped + res.dropped.length,
      skipped_terms: [...p.skipped_terms, ...res.dropped.map(d => d.term)].slice(0, 300), attempts: 0, status: next >= cands.length ? 'done' : 'running', last_error: null};
    await save(nx);
    if (next >= cands.length) await db.from('vocab_canvas_scans').upsert({student_id: student.id, page_hash: hash, found: nx.added + nx.known, scanned_at: new Date().toISOString()}, {onConflict: 'student_id,page_hash'});
    return {done: next >= cands.length, total: cands.length, next, added: nx.added, known: nx.known, skipped: nx.skipped, skippedTerms: nx.skipped_terms};
  } catch (e) {
    const attempts = p.attempts + 1, msg = e instanceof Error ? e.message : String(e);
    await save({attempts, status: attempts >= 3 ? 'failed' : 'running', last_error: msg.slice(0, 300)});
    return {done: false, failed: attempts >= 3, retry: attempts < 3, error: msg, total: cands.length, next: p.next_offset, added: p.added, known: p.known, skipped: p.skipped};
  }
}
/** v65: unfinished imports of this student (to continue automatically). */
export async function pendingImports(db: SupabaseClient, studentId: string) {
  const r = await db.from('vocab_import_progress').select('page_index,page_title,total,next_offset,status,attempts').eq('student_id', studentId).neq('status', 'done').order('updated_at', {ascending: false}).limit(20);
  return r.error ? [] : r.data || [];
}

/** v65: Dutch words already in the bank (canvas, imports, reports) whose verb forms are missing get them once — in
 *  batches of 40, only what is missing, never overwriting stored/teacher values. Words that are not verbs are marked
 *  as checked, so they never cost a second AI call. */
export async function fillDutchVerbs(db: SupabaseClient, student: StudentCtx, opts: {userId: string; ui: string}) {
  if (subjectCode(student) !== 'nl') return {updated: 0, remaining: 0};
  const {data, error} = await db.from('vocab_items').select('id,term,pos,grammar').eq('student_id', student.id).limit(2000);
  if (error) throw new Error(error.message);
  type Row = {id: string; term: string; pos: string | null; grammar: (Grammar & {checked?: boolean}) | null};
  const need = ((data || []) as Row[]).filter(r => {
    const g = r.grammar;
    if (!g) return !r.pos || /^(ww|v\.|verb)/i.test(r.pos);
    return g.pos === 'verb' && (!g.aux || !g.past_pl || !g.participle) && !g.checked;
  });
  const batch = need.slice(0, 40); if (!batch.length) return {updated: 0, remaining: 0};
  const r = await askFast(VocabCheckSchema, [
    'You complete Dutch grammar for words from a learner\'s word list. For each numbered word decide the word class; for verbs give base (infinitive, "zich …" when reflexive), past_sg, past_pl (with the separated prefix for separable verbs: "sprak af" / "spraken af"), participle, aux H/Z/H/Z (H/Z only when both are used depending on meaning, with a short aux_note), separable, conj_present and conj_past (6 forms each).',
    'Strong, weak and irregular verbs exactly right; modal verbs: mention the replacing infinitive in aux_note. keep=true for every real word. Never change the word itself.',
  ].join('\n'), JSON.stringify({candidates: batch.map((w, i) => ({index: i, text: w.term}))}), {maxTokens: 3500, effort: 'low', log: {db, userId: opts.userId, kind: 'vocab', studentId: student.id}});
  const byIdx = new Map(r.items.map(x => [x.index, x]));
  let updated = 0;
  for (const [i, w] of batch.entries()) {
    const x = byIdx.get(i); const fresh = x ? cleanGrammar(x, 'nl') : null;
    const cur = (w.grammar || {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = {...(fresh || {pos: x?.pos || 'other'}), ...Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== '' && v != null)), checked: true};
    const patch: Record<string, unknown> = {grammar: merged, updated_at: new Date().toISOString()};
    if (!w.pos && fresh && x) patch.pos = grammarLabel({pos: x.pos, article: x.article, plural: x.plural}, opts.ui === 'nl' ? 'en' : opts.ui, 'nl');
    const u = await db.from('vocab_items').update(patch).eq('id', w.id).eq('student_id', student.id);
    if (!u.error && fresh?.pos === 'verb') updated++;
  }
  return {updated, remaining: Math.max(0, need.length - batch.length)};
}

const TabooSchema = z.object({cards: z.array(z.object({index: z.number(), forbidden: z.array(z.string()).describe('exactly 3 common words a player would naturally use to explain the target word')}))});
/** Forbidden words per word for the student's level: read from the cache, generate only the missing ones (one call, optional: noAi skips it). */
export async function tabooFor(db: SupabaseClient, words: {id: string; term: string}[], opts: {level: string; targetName: string; log: UsageCtx; noAi?: boolean}) {
  const level = /^(A0|A1|A2|B1|B2|C1|C2)$/.test(opts.level) ? opts.level : 'A1';
  const {data} = await db.from('vocab_taboo').select('vocab_id,words').eq('level', level).in('vocab_id', words.map(w => w.id));
  const have = new Map(((data || []) as {vocab_id: string; words: string[]}[]).map(x => [x.vocab_id, x.words]));
  const missing = words.filter(w => !have.has(w.id));
  if (missing.length && !opts.noAi) {
    const r = await askFast(TabooSchema, [
      `Taboo game in ${opts.targetName} for a learner at level ${level}. For each target word give 3 forbidden words in ${opts.targetName}:`,
      'the most obvious words someone would use to explain it. Simple, frequent words that fit the level; never the target word itself, a form of it or a word that contains it.',
    ].join('\n'), JSON.stringify(missing.map((w, i) => ({index: i, target: w.term}))), {maxTokens: 2500, effort: 'low', log: opts.log});
    for (const c of r.cards) {
      const w = missing[c.index]; if (!w) continue;
      const clean = cleanTaboo(w.term, c.forbidden, 3); if (!clean.length) continue;
      have.set(w.id, clean);
      await db.from('vocab_taboo').upsert({vocab_id: w.id, level, words: clean}, {onConflict: 'vocab_id,level'});
    }
  }
  return have;
}
