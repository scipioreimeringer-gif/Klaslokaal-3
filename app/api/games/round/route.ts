import {authUser, enforceLimit, HttpError, jsonError, langName, type UsageCtx} from '../../../../lib/server/ai';
import {studentAccess, subjectCode} from '../../../../lib/server/context';
import {tabooFor} from '../../../../lib/server/vocab';
import {pickRound, selectWords, type Selection, type Word} from '../../../../lib/vocab/core';
import {BANKS, bankPool, hasBank, loadBank, isCat, isLevel, pickBank, termKey, widen, type BankFilter, type BankItem} from '../../../../lib/wordbank';

type Card = {vocab_id: string | null; bank_id?: string; term: string; hint: string; forbidden: string[]};

/** Teacher (host) starts a 30 Seconds / Taboo round. The cards are stored in game_rounds, readable ONLY by the
 *  explaining player (RLS). When the student explains, this response contains no cards at all, so the
 *  teacher's browser never receives them. Two word sources: the student's personal word list, or the
 *  built-in word bank (works without any personal words and without AI). */
export async function POST(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    const {student, role} = await studentAccess(db, user.id, String(b.studentId || ''));
    if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een spelronde.');
    const uuid = /^[0-9a-f-]{36}$/i;
    const roundId = String(b.roundId || ''), sessionId = String(b.sessionId || '');
    if (!uuid.test(roundId) || !uuid.test(sessionId)) throw new HttpError(400, 'Ongeldige spelronde');
    const kind = b.kind === 'taboo' ? 'taboo' : 'thirty';
    const explainer = b.explainer === 'student' ? 'student' : 'teacher';
    if (explainer === 'student' && !student.user_id) throw new HttpError(400, 'De leerling heeft nog geen account gekoppeld en kan daarom niet uitleggen.');
    const count = Math.min(5, Math.max(1, Math.round(Number(b.count) || 5)));
    const taboo = Math.min(3, Math.max(1, Math.round(Number(b.taboo) || 3)));
    const roundNo = Math.min(500, Math.max(1, Math.round(Number(b.round) || 1)));
    let cards: Card[] = []; let vocabIds: string[] = [], bankIds: string[] = []; let notice: string | null = null;

    if (b.source === 'bank') {
      /* ---------- built-in word bank ---------- */
      const lang = subjectCode(student);
      if (!hasBank(lang)) throw new HttpError(400, 'De ingebouwde woordenbank is er voor Nederlands en Portugees (Brazilië).');
      await loadBank(lang); // v42: only this lesson language is loaded
      const f: BankFilter = {level: isLevel(b.level) ? b.level : 'mix', cat: isCat(b.category) ? b.category : 'all', minTaboo: kind === 'taboo' ? taboo : 0};
      const pool = bankPool(lang, f);
      if (pool.length < count) return Response.json({tooFew: true, available: pool.length, canWiden: !!widen(f)}); // never a silent fallback
      const used = await db.rpc('game_used_bank', {p_session: sessionId, p_student: student.id});
      if (used.error) throw new HttpError(400, /game_used_bank/.test(used.error.message) ? 'Voer eerst supabase/v38.sql uit.' : used.error.message);
      const items = pickBank(pool, count, new Set((used.data || []) as string[]));
      cards = items.map(w => ({vocab_id: null, bank_id: w.id, term: w.term, hint: w.meaning, forbidden: kind === 'taboo' ? w.taboo.slice(0, taboo) : []}));
      bankIds = items.map(w => w.id);
    } else {
      /* ---------- the student's personal word list ---------- */
      const sel = (b.selection && typeof b.selection === 'object' ? b.selection : {mode: 'all'}) as Selection;
      const {data, error} = await db.from('vocab_items').select('id,term,translation,example,status,lesson_date,created_at,correct_count,wrong_count,difficult,due_at').eq('student_id', student.id);
      if (error) throw new HttpError(400, /difficult/.test(error.message) ? 'Voer eerst supabase/v35.sql uit.' : error.message);
      const pool = selectWords((data || []) as Word[], sel).filter(w => w.term.trim());
      // v41: too few personal words → top up with built-in words when asked (fillBank), never silently
      const lang = subjectCode(student), canFill = b.fillBank === true && hasBank(lang);
      await loadBank(lang); // for topping up and for the checked forbidden words (no-op for other languages)
      if (pool.length < count && !canFill) return Response.json({tooFew: true, available: pool.length, canWiden: false});
      const used = await db.rpc('game_used_words', {p_session: sessionId, p_student: student.id});
      if (used.error) throw new HttpError(400, /game_used_words/.test(used.error.message) ? 'Voer eerst supabase/v35.sql uit.' : used.error.message);
      const words = pickRound(pool, Math.min(count, pool.length), new Set((used.data || []) as string[]), roundNo * 7919 + Date.now() % 1000);
      let extra: BankItem[] = [];
      if (words.length < count && canFill) {
        const lv = isLevel(b.level) ? b.level : isLevel(student.level) ? student.level as BankFilter['level'] : 'mix';
        const own = new Set(words.map(w => termKey(w.term)));
        let bp = bankPool(lang, {level: lv, cat: 'all', minTaboo: kind === 'taboo' ? taboo : 0}).filter(w => !own.has(termKey(w.term)));
        if (bp.length < count - words.length) bp = bankPool(lang, {level: 'mix', cat: 'all', minTaboo: kind === 'taboo' ? taboo : 0}).filter(w => !own.has(termKey(w.term)));
        const ub = await db.rpc('game_used_bank', {p_session: sessionId, p_student: student.id}); // v38.sql; without it: no history, still no repeats within a round
        extra = pickBank(bp, count - words.length, new Set(ub.error ? [] : (ub.data || []) as string[]));
        if (extra.length) notice = 'Aangevuld met woorden uit de ingebouwde woordenbank.';
      }
      if (!words.length && !extra.length) return Response.json({tooFew: true, available: 0, canWiden: false});
      let forbidden = new Map<string, string[]>();
      if (kind === 'taboo') {
        // forbidden words from the cache, then the built-in bank (same word); AI only when the teacher switches it on
        const ai = b.aiTaboo === true;
        const log: UsageCtx = {db, userId: user.id, kind: 'games', studentId: student.id};
        const opts = {level: student.level || 'A1', targetName: langName(subjectCode(student)), log};
        try { if (ai) await enforceLimit(db, user.id, 'games'); forbidden = await tabooFor(db, words.map(w => ({id: w.id, term: w.term})), {...opts, noAi: !ai}); }
        catch { forbidden = await tabooFor(db, words.map(w => ({id: w.id, term: w.term})), {...opts, noAi: true}).catch(() => new Map()); notice = 'AI-aanvulling lukte niet; kaarten zonder opgeslagen verboden woorden hebben er minder.'; }
        // controlled local approach: a personal word that is also in the bank gets the bank's checked forbidden words
        const byTerm = new Map((BANKS[lang] || []).map(x => [termKey(x.term), x.taboo]));
        for (const w of words) { const have = forbidden.get(w.id) || []; const bt = byTerm.get(termKey(w.term)); if (have.length < taboo && bt) forbidden.set(w.id, [...have, ...bt.filter(x => !have.includes(x))].slice(0, 3)); }
        if (!notice && words.some(w => (forbidden.get(w.id) || []).length < taboo)) notice = 'Sommige kaarten hebben minder verboden woorden dan gekozen.';
      }
      cards = [...words.map(w => ({vocab_id: w.id, term: w.term, hint: w.translation, forbidden: kind === 'taboo' ? (forbidden.get(w.id) || []).slice(0, taboo) : []})),
        ...extra.map(w => ({vocab_id: null, bank_id: w.id, term: w.term, hint: w.meaning, forbidden: kind === 'taboo' ? w.taboo.slice(0, taboo) : []}))];
      vocabIds = words.map(w => w.id); bankIds = extra.map(w => w.id);
    }

    const explainerId = explainer === 'teacher' ? user.id : student.user_id!;
    // no RETURNING: the teacher may not read a round in which the student explains
    const row: Record<string, unknown> = {id: roundId, student_id: student.id, session_id: sessionId, round_no: roundNo, kind, explainer_user_id: explainerId, vocab_ids: vocabIds, cards, created_by: user.id};
    if (bankIds.length) row.bank_ids = bankIds;
    const ins = await db.from('game_rounds').insert(row);
    if (ins.error && /bank_ids/.test(ins.error.message)) throw new HttpError(400, 'Voer eerst supabase/v38.sql uit.');
    // same round id sent twice (reconnect) → keep the first; another round with the same number → refuse
    if (ins.error && !(ins.error.code === '23505' && /pkey/.test(ins.error.message))) throw new HttpError(ins.error.code === '23505' ? 409 : 400, ins.error.code === '23505' ? 'Deze ronde is al gestart.' : ins.error.message);
    // the notice says nothing about the words themselves, so it is safe for both roles
    return Response.json({roundId, cardCount: cards.length, notice, ...(explainer === 'teacher' ? {cards} : {})});
  } catch (e) { return jsonError(e); }
}
