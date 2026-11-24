import 'server-only';
// Server side of the word list: canvas recognition → the central word list (v47; before: teacher-reviewed suggestions), taboo cards (cached).
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {askFast, langName, type UsageCtx} from './ai';
import {subjectCode, type StudentCtx} from './context';
import {detectPages, type Page} from '../vocab/detect';
import {cleanTaboo, canvasBlocks, candidatesFrom, mergeCandidates, normTerm} from '../vocab/core';

/** Scan this student's canvas pages (stored per student → words can never end up with another student)
 *  and store new words as suggestions for the teacher. Unchanged pages are skipped (no AI cost). */
export async function detectCanvasVocab(db: SupabaseClient, student: StudentCtx, opts: {userId: string; ui: string; lessonDate?: string | null; lessonId?: string | null;
  /* v62 */ page?: number | null; list?: boolean}) {
  const [cs, vi, vs, sc] = await Promise.all([
    db.from('classroom_states').select('canvas').eq('student_id', student.id).maybeSingle(),
    db.from('vocab_items').select('*').eq('student_id', student.id),
    db.from('vocab_suggestions').select('term').eq('student_id', student.id),
    db.from('vocab_canvas_scans').select('page_hash').eq('student_id', student.id),
  ]);
  if (vs.error || sc.error) throw new Error(/vocab_suggestions|vocab_canvas_scans/.test((vs.error || sc.error)!.message) ? 'Voer eerst supabase/v35.sql uit.' : (vs.error || sc.error)!.message);
  let pages = ((cs.data?.canvas as {pages?: Page[]} | null)?.pages || []).filter(p => p && typeof p.html === 'string');
  if (typeof opts.page === 'number') pages = pages[opts.page] ? [pages[opts.page]] : [];     // v62: "Deze pagina verwerken"
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

const TabooSchema =z.object({cards: z.array(z.object({index: z.number(), forbidden: z.array(z.string()).describe('exactly 3 common words a player would naturally use to explain the target word')}))});
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
