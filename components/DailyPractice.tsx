'use client';
// v46 phase 3: "Dagelijkse oefening" — a short personal practice of 5–10 minutes from the student's own lessons:
// words (central word list), mistakes the teacher approved, exercises from earlier homework. Spaced repetition:
// words via record_vocab_practice, mistakes/homework via record_practice_item; the finished day is a practice session
// (kind 'daily'). Only real stored data is shown; nothing is invented. AI only for feedback on a free sentence.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Flame,Play,CheckCircle2,XCircle,ArrowRight,Mic,MicOff,RotateCcw,Sparkles,Clock3,PartyPopper,Eye} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {authedPost} from '../lib/learning';
import {useExplainLang, ExplainLangSelect, NoteList} from './ExplainLang';
import {focusKeysOf} from '../lib/curriculum/focus';
import {toQuestion,type BankRow} from '../lib/dailyAi';
import {errorsOf} from '../lib/analysis/core';
import {practiceDays} from '../lib/motivation';
import {streaks} from '../lib/progressStats';
import {buildDaily,checkAnswer,streakOf,summaryOf,type DailySet,type HwItem,type ItemState,type Mistake,type Question,type Word} from '../lib/daily';

const today = () => new Date().toLocaleDateString('en-CA');
type Session = {created_at: string; score: number; total: number; details: {day?: string; words?: string[]; grammar?: string[]} | null};
export type DailyData = {set: DailySet; sessions: Session[]; streak: number; doneToday: Session | null; hasMaterial: boolean; migration: boolean;
  /** v75: build today's set with the personal bank questions (same inputs as set) */ withAi: (ai: {topic: Question[]; error: Question[]; review: Question[]}) => DailySet};

/** Loads only this student's material (RLS) and builds today's set. */
export function useDaily(studentId: string, level?: string | null, lang?: string) {
  const [d, setD] = useState<DailyData | null>(null);
  const load = useCallback(async () => {
    const db = supabase()!, day = today();
    const [v, s, a, st, ps, mf, fk, allP] = await Promise.all([
      db.from('vocab_items').select('id,term,translation,example,pos,status,due_at,difficult,wrong_count,streak,last_practiced_at,lesson_date').eq('student_id', studentId),
      db.rpc('student_lesson_summaries', {sid: studentId}),
      db.from('assignments').select('id,title,exercises,published_at').eq('student_id', studentId).not('published_at', 'is', null),
      db.from('practice_items').select('item_key,streak,wrong_count,due_at,last_practiced_at').eq('student_id', studentId),
      db.from('practice_sessions').select('created_at,score,total,details').eq('student_id', studentId).eq('kind', 'daily').order('created_at', {ascending: false}).limit(120),
      db.rpc('memory_focus', {sid: studentId}),
      focusKeysOf(db, studentId),
      // v74: the streak counts EVERY practice day (daily practice and games), in the student's own time zone — the same
      // definition as Voortgang and the dashboard (lib/motivation practiceDays + lib/progressStats streaks)
      db.from('practice_sessions').select('created_at,total,kind,details').eq('student_id', studentId).order('created_at', {ascending: false}).limit(1500),
    ]);
    // v60: AI memory — mistakes of points that need practice across lessons come first; mastered points less often
    const focus = new Map(((mf.error ? [] : mf.data || []) as {key: string; status: string}[]).map(f => [f.key, f.status]));
    const weight = (k: string, r: number) => { const f = focus.get(k); return f === 'review' || f === 'learning' ? r + 3 : f === 'mastered' ? Math.max(1, r - 1) : r; };
    // only mistakes the teacher APPROVED (older reports: already approved), never "for later" material
    const mistakes: Mistake[] = ((s.data || []) as {id: string; lesson_date: string; final: unknown}[]).flatMap(r =>
      errorsOf(r.final as never).filter(e => e.status !== 'rejected' && !e.later && e.original && e.corrected) // v56: reports are published without approval; only errors the teacher removed are left out
        .map(e => ({key: `err:${r.id}:${e.id}`.slice(0, 200), original: e.original, corrected: e.corrected, why: e.why, type: e.type, label: e.category, repeats: weight(e.category_key, e.repeats || 1), lesson_date: r.lesson_date})));
    const homework: HwItem[] = ((a.data || []) as {id: string; title: string; exercises: {items?: {type: string; prompt: string; options?: string[]; answer?: string; accept?: string[]; explanation?: string}[]} | null}[])
      .flatMap(x => (x.exercises?.items || []).map((it, i) => ({it, i, x})))
      .filter(({it}) => ['multiple_choice', 'fill_in', 'conjugate', 'translate'].includes(it.type) && (it.answer || '').trim() && it.prompt)
      .map(({it, i, x}) => ({key: `hw:${x.id}:${i}`, type: it.type, prompt: it.prompt, options: it.options || [], answer: it.answer!.trim(), accept: it.accept || [], explanation: it.explanation || '', label: x.title.slice(0, 60)}));
    const words = (v.data || []) as Word[];
    const sessions = (ps.error ? [] : ps.data || []) as Session[];
    const days = sessions.map(x => x.details?.day || x.created_at.slice(0, 10));
    const inp = {studentId, day, level, lang, words, mistakes, homework, state: (st.error ? [] : st.data || []) as ItemState[], topics: fk.known, focusTopics: fk.focus};
    const set = buildDaily(inp);
    const allDays = practiceDays(((allP.error ? [] : allP.data || []) as {created_at: string; total: number; kind: string; details: {day?: string} | null}[]));
    setD({set, sessions, streak: streaks(allDays.length ? allDays : days, day).current, doneToday: sessions.find(x => (x.details?.day || x.created_at.slice(0, 10)) === day) || null,
      hasMaterial: !set.empty, migration: !st.error && !ps.error, withAi: ai => buildDaily({...inp, ai})});
  }, [studentId, level, lang]);
  useEffect(() => { void load(); }, [load]);
  return {d, reload: load};
}

/** Dashboard card (student). */
export function DailyCard({studentId, level, label}: {studentId: string; level?: string | null; label?: string}) {
  const {d} = useDaily(studentId, level);
  if (!d) return <section className="dp-card"><div className="loader small"/></section>;
  const href = '/oefenen/dagelijks?student=' + encodeURIComponent(studentId);
  return <section className="dp-card" aria-label={t('Dagelijkse oefening')}>
    <div className="dp-head"><span className="dp-ico" aria-hidden><Sparkles size={18}/></span><div><h3>{t('Dagelijkse oefening')}</h3>{label && <small className="muted">{label}</small>}</div>
      <span className="dp-streak" title={t('Aantal opeenvolgende oefendagen')}><Flame size={15} aria-hidden/> {d.streak}</span></div>
    {!d.hasMaterial ? <p className="muted small">{t('Nog geen lesmateriaal om te oefenen. Na je eerste lessen verschijnen hier je eigen woorden en verbeterpunten.')}</p> : <>
      <div className="dp-facts"><span>{t('{0} vragen', d.set.questions.length)}</span><span><Clock3 size={13} aria-hidden/> {t('± {0} min', d.set.minutes)}</span>
        {d.doneToday && <span className="dp-done"><CheckCircle2 size={13} aria-hidden/> {t('Vandaag: {0}/{1} goed', d.doneToday.score, d.doneToday.total)}</span>}</div>
      <div className="dp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.doneToday ? 100 : 0} aria-label={t('Voortgang van vandaag')}><span style={{width: d.doneToday ? '100%' : '0%'}}/></div>
      <Link className="button dp-start" href={href}><Play size={15}/> {d.doneToday ? t('Nog een keer oefenen') : t('Start dagelijkse oefening')}</Link></>}
  </section>;
}

type SR = {start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; onresult: ((e: {results: {0: {transcript: string}}[]}) => void) | null; onerror: (() => void) | null; onend: (() => void) | null};
function speechApi(): (new () => SR) | null { const w = window as unknown as {SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR}; return w.SpeechRecognition || w.webkitSpeechRecognition || null; }

/** The practice itself: one question at a time, progress bar, feedback after every answer, summary at the end. */
export function DailyPlayer({studentId, level, lang, userId, autoStart = false, onRoundDone}: {studentId: string; level?: string | null; lang: string; userId: string; autoStart?: boolean;
  /** v76: inside the daily route — report the result instead of showing the end screen */ onRoundDone?: (score: number, total: number, firstDaily: boolean, topics: string[]) => void}) {
  const {d, reload} = useDaily(studentId, level, lang);
  const [ex, setEx] = useExplainLang(lang, studentId); // v67/v75: explanation language of the feedback (per student and language)
  const day = today(), key = 'teachy-daily-' + studentId + '-' + day;
  // v75: the set of the day is FROZEN once started (daily_runs, or this device when v75.sql is missing): a refresh, a new
  // login or another device continues with exactly the same questions; the day is registered once
  const [run, setRun] = useState<{questions: Question[]; answers: boolean[]; finished: boolean; server: boolean} | null | undefined>(undefined);
  const [extra, setExtra] = useState<Question[] | null>(null); // extra practice after the day (no daily reward)
  const [i, setI] = useState(0); const [res, setRes] = useState<{q: Question; ok: boolean}[]>([]);
  const [given, setGiven] = useState(''); const [fb, setFb] = useState<{state: 'correct' | 'accent' | 'wrong'; text?: string; corrected?: string} | null>(null);
  const [flipped, setFlipped] = useState(false); const [busy, setBusy] = useState(false); const [listening, setListening] = useState(false); const [saved, setSaved] = useState(false);
  const [starting, setStarting] = useState(false); const [note, setNote] = useState('');
  const rec = useRef<SR | null>(null);
  useEffect(() => { let off = false;
    void supabase()!.from('daily_runs').select('questions,answers,finished_at').eq('student_id', studentId).eq('day', day).maybeSingle().then(r => {
      if (off) return;
      if (!r.error && r.data) { const x = r.data as {questions: Question[]; answers: {ok: boolean}[]; finished_at: string | null}; setRun({questions: x.questions, answers: (x.answers || []).map(a => !!a.ok), finished: !!x.finished_at, server: true}); setI((x.answers || []).length); return; }
      try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if (s && Array.isArray(s.questions)) { setRun({questions: s.questions, answers: s.ok || [], finished: false, server: false}); setI((s.ok || []).length); return; } } catch { /* fresh */ }
      setRun(null); });
    return () => { off = true; }; }, [studentId, day, key]);
  const qs = extra || run?.questions || [];
  const allRes = useMemo(() => extra ? res : (run?.answers || []).map((ok, n) => ({q: qs[n], ok})).filter(x => x.q), [run, res, qs, extra]);
  const q = qs[i];
  async function start() {
    if (!d) return; setStarting(true); setNote('');
    let ai = {topic: [] as Question[], error: [] as Question[], review: [] as Question[]};
    try { const r = await authedPost<{questions: BankRow[]}>(supabase()!, '/api/daily/prepare', {studentId, explain: ex, day});
      const list = r.questions.map((x, n) => toQuestion(x, n)); r.questions.forEach((x, n) => ai[x.source].push(list[n])); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); /* the built-in material still makes a full day */ }
    const set = d.withAi(ai);
    const row = {student_id: studentId, day, questions: set.questions, answers: []};
    const w = await supabase()!.from('daily_runs').insert(row);
    try { localStorage.setItem(key, JSON.stringify({questions: set.questions, ok: []})); } catch { /* private mode */ }
    setRun({questions: set.questions, answers: [], finished: false, server: !w.error}); setI(0); setRes([]); setStarting(false);
  }
  // the dashboard's "Nu beginnen" is the student's own click: start right away (only when today's set does not exist yet)
  const auto = useRef(false);
  useEffect(() => { if (autoStart && run === null && d?.hasMaterial && !auto.current) { auto.current = true; void start(); } }, [autoStart, run, d]); // eslint-disable-line react-hooks/exhaustive-deps
  async function record(qq: Question, ok: boolean) {
    const db = supabase()!;
    if (qq.source === 'word') await db.rpc('record_vocab_practice', {item: qq.ref, correct: ok});
    else await db.rpc('record_practice_item', {p_student: studentId, p_key: qq.ref, p_kind: qq.source === 'mistake' ? 'error' : qq.source === 'grammar' ? 'grammar' : 'homework', p_label: qq.label, p_correct: ok});
  }
  function answer(ok: boolean, info?: {state: 'correct' | 'accent' | 'wrong'; text?: string; corrected?: string}) {
    if (!q || fb) return;
    setFb(info || {state: ok ? 'correct' : 'wrong'});
    const next = [...res, {q, ok}]; setRes(next);
    if (!extra && run) {
      const answers = [...run.answers.slice(0, i), ok];
      try { localStorage.setItem(key, JSON.stringify({questions: run.questions, ok: answers})); } catch { /* private mode */ }
      if (run.server) void supabase()!.from('daily_runs').update({answers: answers.map((a, n) => ({ok: a, ref: run.questions[n]?.ref, bank: run.questions[n]?.bank || null})), updated_at: new Date().toISOString()}).eq('student_id', studentId).eq('day', day);
      setRun({...run, answers});
    }
    void record(q, ok);
  }
  function check(text = given) { if (!q) return; const r = checkAnswer(q, text); answer(r !== 'wrong', {state: r}); }
  async function aiCheck(text: string) {
    if (!q || !text.trim()) return; setBusy(true);
    try { const r = await authedPost<{ok: boolean; corrected: string; feedback: string}>(supabase()!, '/api/practice/check', q.kind === 'answer' ? {studentId, question: q.prompt, grammar: q.topic, sentence: text} : {studentId, word: q.answers[0], grammar: q.topic, sentence: text});
      answer(r.ok, {state: r.ok ? 'correct' : 'wrong', text: r.feedback, corrected: r.ok ? undefined : r.corrected}); }
    catch (e) { setFb({state: 'wrong', text: e instanceof Error ? e.message : String(e)}); }
    setBusy(false);
  }
  function listen() {
    const Api = speechApi(); if (!Api) return;
    const r = new Api(); rec.current = r; r.lang = lang === 'pt' ? 'pt-BR' : lang === 'nl' ? 'nl-NL' : lang; r.interimResults = false;
    r.onresult = e => { const txt = e.results[0][0].transcript; setGiven(txt); if (q?.kind === 'speak') check(txt); else void aiCheck(txt); };
    r.onerror = () => setListening(false); r.onend = () => setListening(false);
    setListening(true); r.start();
  }
  function next() { setI(n => n + 1); setGiven(''); setFb(null); setFlipped(false); }
  const finished = !!d && qs.length > 0 && i >= qs.length;
  useEffect(() => {
    if (!finished || saved || !d || extra || !run) return; setSaved(true);
    const s = summaryOf(allRes);
    // registered ONCE per day: a second "daily" session for the same day is never written (XP and streak stay honest)
    if (!d.doneToday && !run.finished) void supabase()!.from('practice_sessions').insert({student_id: studentId, user_id: userId, kind: 'daily', score: s.correct, total: s.correct + s.wrong, details: {day, words: s.words, grammar: s.grammar}}).then(() => reload());
    if (run.server) void supabase()!.from('daily_runs').update({finished_at: new Date().toISOString()}).eq('student_id', studentId).eq('day', day);
  }, [finished, saved, d, allRes, studentId, userId, reload, extra, run, day]);

  if (!d || run === undefined) return <div className="loader small"/>;
  if (!d.migration) return <p className="notice">{t('De dagelijkse oefening is nog niet ingesteld: voer supabase/v48.sql uit.')}</p>;
  if (!d.hasMaterial) return <div className="lc-empty"><Sparkles size={22} aria-hidden/><div><strong>{t('Nog niets om te oefenen')}</strong><p className="muted">{t('Nog geen lesmateriaal om te oefenen. Na je eerste lessen verschijnen hier je eigen woorden en verbeterpunten.')}</p></div></div>;
  if (!run && !extra) return <div className="dp-intro">
    <span className="dp-intro-ic" aria-hidden><Sparkles size={26}/></span>
    <h2>{t('Dagelijkse uitdaging')}</h2>
    <p className="muted">{t('Tien persoonlijke vragen: grammatica uit jouw leerlijn, jouw eigen woorden en de regels achter fouten uit je lessen.')}</p>
    <div className="dp-facts"><span>{t('{0} vragen', 10)}</span><span><Clock3 size={13} aria-hidden/> {t('± {0} min', 6)}</span><span>⚡ {t('+{0} XP', 20)}</span></div>
    <div className="row"><ExplainLangSelect value={ex} onChange={setEx}/><button className="button" disabled={starting} onClick={() => void start()}><Play size={15}/> {starting ? t('Vragen klaarzetten…') : t('Nu beginnen')}</button></div>
  </div>;
  if (finished && onRoundDone && !extra) return <RoundDone d={d} res={allRes} done={onRoundDone}/>;
  if (finished) {
    const s = summaryOf(allRes); const first = !extra && !d.doneToday;
    const practised = [...new Set(qs.filter(x => x.source !== 'word' && x.label).map(x => x.label))].slice(0, 6);
    const wrongQs = allRes.filter(x => !x.ok).map(x => x.q);
    return <div className="dp-end">
      <PartyPopper size={34} className="dp-party" aria-hidden/>
      <h2>{s.wrong === 0 ? t('Alles goed — knap gedaan!') : s.correct >= s.wrong ? t('Goed bezig! Je oefening van vandaag zit erop.') : t('Goed dat je hebt geoefend — morgen komen deze punten terug.')}</h2>
      <div className="dp-score"><span className="ok"><CheckCircle2 size={16}/> {t('{0} van {1} goed', s.correct, s.correct + s.wrong)}</span>{first && <span className="xp">⚡ {t('+{0} XP', 20)}</span>}<span><Flame size={16}/> {t('{0} dagen op rij', d.streak)}</span></div>
      {!!practised.length && <div className="dp-list"><h4>{t('Geoefende grammatica')}</h4><ul className="chips">{practised.map(w => <li key={w}>{w}</li>)}</ul></div>}
      {!!s.grammar.length && <div className="dp-list"><h4>{t('Nog oefenen')}</h4><ul className="chips">{s.grammar.map(w => <li key={w}>{w}</li>)}</ul></div>}
      {!!s.words.length && <div className="dp-list"><h4>{t('Woorden die extra aandacht nodig hebben')}</h4><ul className="chips">{s.words.map(w => <li key={w}><b>{w}</b></li>)}</ul></div>}
      <div className="row">{wrongQs.length > 0 && <button className="button" onClick={() => { setExtra(wrongQs.map((x, n) => ({...x, id: 'x' + n}))); setI(0); setRes([]); setFb(null); setGiven(''); }}><RotateCcw size={15}/> {t('Fouten opnieuw oefenen')}</button>}
        <Link className="button secondary" href="/">{t('Terug naar Overzicht')}</Link><Link className="linklike" href="/oefenen">{t('Verder oefenen')}</Link></div>
    </div>;
  }
  if (!q) return null;
  const SpeechOk = typeof window !== 'undefined' && !!speechApi();
  const pct = Math.round(i / qs.length * 100);
  return <div className="dp-player">
    {note && <p className="muted small">{note}</p>}
    <div className="dp-top"><div className="dp-bar big" role="progressbar" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={i} aria-label={t('Vraag {0} van {1}', i + 1, qs.length)}><span style={{width: pct + '%'}}/></div><small className="muted">{i + 1}/{qs.length}</small><ExplainLangSelect value={ex} onChange={setEx}/></div>
    <div className={'dp-q k-' + q.kind} key={q.id}>
      {q.label && q.source !== 'word' && <span className="dp-topic">{q.label}</span>}
      {q.sub && <p className="dp-sub">{t(q.sub)}</p>}
      {q.prompt && <p className={'dp-prompt' + (q.kind === 'correct' || q.kind === 'speak' ? ' wrong' : q.kind === 'answer' ? ' ask' : '')}>{q.prompt}</p>}
      {q.hint && <p className="dp-hint">{q.kind === 'fill' && q.source === 'mistake' && !q.bank ? <><s>{q.hint}</s></> : q.hint}</p>}
      {q.kind === 'mc' && <div className="dp-options">{(q.options || []).map(o => { const right = q.answers.includes(o); const cls = fb ? (right ? ' right' : given === o ? ' wrongpick' : '') : '';
        return <button key={o} type="button" className={'dp-opt' + cls} disabled={!!fb} onClick={() => { setGiven(o); answer(right); }}>{o}</button>; })}</div>}
      {q.kind === 'flash' && (!flipped ? <button type="button" className="button dp-flip" onClick={() => setFlipped(true)}><Eye size={15}/> {t('Toon antwoord')}</button>
        : <><p className="dp-flipped">{q.flip}</p>{!fb && <div className="dp-options two"><button type="button" className="dp-opt" onClick={() => answer(false)}>{t('Nog niet')}</button><button type="button" className="dp-opt good" onClick={() => answer(true)}>{t('Ik wist het')}</button></div>}</>)}
      {(q.kind === 'fill' || q.kind === 'correct' || q.kind === 'write' || q.kind === 'speak' || q.kind === 'answer') && !fb && <form className="dp-input" onSubmit={e => { e.preventDefault(); if (q.kind === 'write' || q.kind === 'answer') void aiCheck(given); else check(); }}>
        {q.kind === 'fill' ? <input className="field" autoFocus value={given} onChange={e => setGiven(e.target.value)} placeholder={t('Jouw antwoord')} aria-label={t('Jouw antwoord')}/>
          : <textarea className="field" rows={2} autoFocus value={given} onChange={e => setGiven(e.target.value)} placeholder={q.kind === 'speak' ? t('Spreek in, of typ de zin') : q.kind === 'answer' ? t('Jouw antwoord in een hele zin') : t('Jouw zin')} aria-label={t('Jouw antwoord')}/>}
        <div className="row">{(q.kind === 'speak' || q.kind === 'write' || q.kind === 'answer') && SpeechOk && <button type="button" className={'button secondary' + (listening ? ' rec' : '')} onClick={() => listening ? rec.current?.stop() : listen()}>{listening ? <MicOff size={15}/> : <Mic size={15}/>} {listening ? t('Stop') : t('Inspreken')}</button>}
          <button type="submit" className="button" disabled={!given.trim() || busy}>{busy ? t('Bezig…') : t('Controleren')}</button>
          {q.kind !== 'write' && q.kind !== 'answer' && <button type="button" className="linklike" onClick={() => answer(false, {state: 'wrong'})}>{t('Weet ik niet')}</button>}</div>
        {(q.kind === 'speak' || q.kind === 'write' || q.kind === 'answer') && !SpeechOk && <small className="muted">{t('Spraakherkenning is in deze browser niet beschikbaar: typ je antwoord.')}</small>}
      </form>}
      {fb && <div className={'dp-feedback ' + (fb.state === 'wrong' ? 'bad' : 'ok')} role="status">
        <b>{fb.state === 'correct' ? t('Goed!') : fb.state === 'accent' ? t('Bijna goed — let op de accenten.') : t('Nog niet helemaal.')}</b>
        {fb.text && <p>{fb.text}</p>}
        {fb.state !== 'correct' && q.kind !== 'flash' && q.kind !== 'answer' && <p className="dp-right">{t('Goed is:')} <b>{fb.corrected || q.answers[0]}</b></p>}
        {q.kind === 'answer' && fb.corrected && <p className="dp-right">{t('Beter:')} <b>{fb.corrected}</b></p>}
        {!!q.notes?.length && <NoteList className="dp-notes" notes={fb.state === 'correct' ? q.notes.slice(0, 1) : q.notes} ex={ex}/>}
        {q.explain && (fb.state !== 'correct' || !!q.bank) && <p className="muted small">{q.explain}</p>}
        <button type="button" className="button" autoFocus onClick={next}>{i + 1 < qs.length ? <>{t('Doorgaan')} <ArrowRight size={15}/></> : t('Afronden')}</button>
      </div>}
    </div>
  </div>;
}

/** v76: the daily challenge inside the route: report once, then the route shows its own interstitial. */
function RoundDone({d, res, done}: {d: DailyData; res: {q: Question; ok: boolean}[]; done: (score: number, total: number, first: boolean, topics: string[]) => void}) {
  const sent = useRef(false); const first = useRef(!d.doneToday);
  useEffect(() => { if (sent.current) return; sent.current = true; const s = summaryOf(res); done(s.correct, s.correct + s.wrong, first.current, [...new Set(res.filter(x => x.q.source !== 'word' && x.q.label).map(x => x.q.label))]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="loader small"/>;
}

/** Teacher: per student, only stored facts — does the student practise, how much, which words and grammar stay hard. */
export function TeacherDailyOverview({studentId}: {studentId: string}) {
  const [d, setD] = useState<{sessions: Session[]; words: {term: string; wrong_count: number; correct_count: number}[]; items: {label: string; kind: string; wrong_count: number; correct_count: number}[]} | null | 'missing'>(null);
  useEffect(() => { let off = false; const db = supabase()!; void Promise.all([
    db.from('practice_sessions').select('created_at,score,total,details').eq('student_id', studentId).eq('kind', 'daily').order('created_at', {ascending: false}).limit(200),
    db.from('vocab_items').select('term,wrong_count,correct_count').eq('student_id', studentId).gt('wrong_count', 0).order('wrong_count', {ascending: false}).limit(8),
    db.from('practice_items').select('label,kind,wrong_count,correct_count').eq('student_id', studentId)]).then(([s, w, p]) => {
      if (off) return; if (p.error) { setD('missing'); return; }
      setD({sessions: (s.data || []) as Session[], words: (w.data || []) as never, items: (p.data || []) as never}); }); return () => { off = true; }; }, [studentId]);
  if (d === null) return <div className="loader small"/>;
  if (d === 'missing') return <p className="muted small">{t('De dagelijkse oefening is nog niet ingesteld: voer supabase/v48.sql uit.')}</p>;
  const day = today(), days = [...new Set(d.sessions.map(x => x.details?.day || x.created_at.slice(0, 10)))];
  const last14 = Array.from({length: 14}, (_, k) => { const x = new Date(day + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 13 + k); return x.toISOString().slice(0, 10); });
  const tot = d.sessions.reduce((n, x) => n + x.total, 0), ok = d.sessions.reduce((n, x) => n + x.score, 0);
  const byLabel = new Map<string, number>(); for (const it of d.items) if (it.kind === 'error' && it.wrong_count > 0 && it.label) byLabel.set(it.label, (byLabel.get(it.label) || 0) + it.wrong_count);
  const grammar = [...byLabel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  // development: share of correct answers per week (last 4 weeks with practice), from stored sessions only
  const weeks = new Map<string, {ok: number; tot: number}>(); for (const x of d.sessions) { const dt = new Date(x.created_at); const wk = new Date(dt.getTime() - ((dt.getDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10); const w = weeks.get(wk) || {ok: 0, tot: 0}; w.ok += x.score; w.tot += x.total; weeks.set(wk, w); }
  const trend = [...weeks.entries()].sort().slice(-4);
  if (!d.sessions.length && !d.items.length) return <p className="muted small">{t('Je leerling heeft de dagelijkse oefening nog niet gedaan.')}</p>;
  return <div className="dp-teacher">
    <div className="dp-days" aria-label={t('Oefendagen, laatste 14 dagen')}>{last14.map(x => <span key={x} className={days.includes(x) ? 'on' : ''} title={new Date(x + 'T12:00:00').toLocaleDateString(locale(), {day: 'numeric', month: 'short'})}/>)}</div>
    <div className="dp-facts"><span><Flame size={13} aria-hidden/> {t('{0} dagen op rij met de dagelijkse oefening', streakOf(days, day))}</span><span>{t('{0} oefeningen voltooid', d.sessions.length)}</span>{tot > 0 && <span>{t('{0}% goed', Math.round(ok / tot * 100))}</span>}</div>
    {!!trend.length && <p className="muted small">{t('Per week:')} {trend.map(([wk, w]) => `${new Date(wk + 'T12:00:00').toLocaleDateString(locale(), {day: 'numeric', month: 'short'})} ${Math.round(w.ok / Math.max(1, w.tot) * 100)}%`).join(' · ')}</p>}
    {!!d.words.length && <div className="dp-list"><h4>{t('Woorden die moeilijk blijven')}</h4><ul className="chips">{d.words.map(w => <li key={w.term}><b>{w.term}</b> <small className="muted">{w.wrong_count}✗ {w.correct_count}✓</small></li>)}</ul></div>}
    {!!grammar.length && <div className="dp-list"><h4>{t('Terugkerende grammaticale fouten')}</h4><ul className="chips">{grammar.map(([l, n]) => <li key={l}>{l} <small className="muted">{n}✗</small></li>)}</ul></div>}
  </div>;
}
