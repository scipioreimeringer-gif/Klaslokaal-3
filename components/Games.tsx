'use client';
// Word games in the live classroom: Flashcards, 30 Seconds and Taboo, synchronised between teacher and student
// over the classroom's existing data channel. The teacher's browser is the host (lib/games/state.ts).
// Cards of a 30 Seconds / Taboo round are loaded ONLY by the explaining player, from game_rounds (RLS).
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {X,Pause,Play,Repeat2,Check,Layers,Timer,Ban,Sparkles,ChevronLeft,ChevronRight,RotateCcw,Square} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {authedPost} from '../lib/learning';
import {newGame,reduce,remaining,wire,fromWire,flashSummary,type Action,type GameState,type Kind,type Role} from '../lib/games/state';
import {selectWords,type Selection,type Word} from '../lib/vocab/core';
import {t as tt} from '../lib/i18n';

type Card={vocab_id:string;term:string;hint:string;forbidden:string[]};
type Msg={t:'game';k:'state';s:GameState}|{t:'game';k:'act';a:Action|{a:'newround'}};
const frame=()=>document.querySelector('iframe.live-frame') as HTMLIFrameElement|null;
function send(m:unknown){try{(frame()?.contentWindow as unknown as {__klasGameSend?:(m:unknown)=>void}|null)?.__klasGameSend?.(m)}catch{/* classroom not ready */}}
const bridge=()=>(window as unknown as {teachyBridge?:{onGame?:(m:unknown)=>void;onPeerHello?:()=>void}}).teachyBridge;
const KIND_LABEL:Record<Kind,string>={flash:'Flashcards',thirty:'30 Seconds',taboo:'Taboe'};
const SEL_LABEL:Record<Selection['mode'],string>={last_lesson:'Woorden uit de vorige les',last5:'Woorden uit de laatste vijf lessen',all:'Alle woorden',difficult:'Woorden die de leerling moeilijk vindt',manual:'Zelf kiezen'};

export function GamesPanel({studentId,role,open,onOpen,onClose}:{studentId:string;role:Role;open:boolean;onOpen:()=>void;onClose:()=>void}){
 const host=role==='teacher';const store='teachy-game-'+studentId;
 const [state,setState]=useState<GameState|null>(()=>{if(!host||typeof window==='undefined')return null;try{const x=JSON.parse(sessionStorage.getItem(store)||'null') as GameState|null;return x&&x.phase!=='ended'?{...x,phase:x.phase==='running'?'paused':x.phase,runningSince:null}:null}catch{return null}});
 const ref=useRef(state);ref.current=state;
 const [now,setNow]=useState(Date.now());
 const [words,setWords]=useState<Word[]>([]);const [pending,setPending]=useState(0);
 const [kind,setKind]=useState<Kind>('thirty');const [sel,setSel]=useState<Selection>({mode:'last5'});const [manual,setManual]=useState<Set<string>>(new Set());
 const [duration,setDuration]=useState<30|60|90>(30);const [taboo,setTaboo]=useState<1|2|3>(3);const [first,setFirst]=useState<Role>('teacher');
 const [count,setCount]=useState(5);const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);const [few,setFew]=useState<number|null>(null);
 const [cards,setCards]=useState<{roundId:string;cards:Card[]}|null>(null);

 /* ---------- host: apply + broadcast ---------- */
 const apply=useCallback((a:Action,actor:Role)=>{const s=ref.current;if(!s)return;const n=reduce(s,a,actor,Date.now());if(n===s)return;
  // flashcard results count as practice (host only → never twice)
  if(a.a==='mark'&&s.flash){const c=s.flash.cards[s.flash.index];if(c)void supabase()!.rpc('record_vocab_practice',{item:c.id,correct:a.result==='good'})}
  ref.current=n;setState(n);send(wire(n,Date.now()))},[]);
 const broadcast=useCallback((s:GameState|null)=>{if(s)send(wire(s,Date.now()))},[]);
 useEffect(()=>{if(host&&state)sessionStorage.setItem(store,JSON.stringify(state))},[host,state,store]);

 /* ---------- messages from the other player ---------- */
 const newRound=useRef<(c?:number)=>Promise<void>>(async()=>{});
 useEffect(()=>{const b=bridge();if(!b)return;
  b.onGame=(raw:unknown)=>{const m=raw as Msg;if(!m||m.t!=='game')return;
   if(host&&m.k==='act'){if((m.a as {a:string}).a==='newround')void newRound.current();else apply(m.a as Action,'student')}
   if(!host&&m.k==='state'){const s=fromWire(m,Date.now());setState(s);if(s.phase!=='ended')onOpen()}};
  if(host)b.onPeerHello=()=>broadcast(ref.current); // student (re)connected: send the current state again
  return()=>{if(b.onGame)b.onGame=undefined;if(host)b.onPeerHello=undefined}},[host,apply,broadcast,onOpen]);

 /* ---------- timer ---------- */
 useEffect(()=>{const id=setInterval(()=>{setNow(Date.now());if(host&&ref.current?.phase==='running')apply({a:'tick'},'teacher')},250);return()=>clearInterval(id)},[host,apply]);

 /* ---------- teacher: words + suggestions ---------- */
 const loadWords=useCallback(async()=>{const db=supabase()!;
  const r=await db.from('vocab_items').select('id,term,translation,example,status,lesson_date,created_at,correct_count,wrong_count,difficult,due_at').eq('student_id',studentId);
  const rows=r.error?(await db.from('vocab_items').select('id,term,translation,example,status,lesson_date,created_at,correct_count,wrong_count,due_at').eq('student_id',studentId)).data:r.data; // v35 optional
  setWords((rows||[]) as Word[]);
  const p=await db.from('vocab_suggestions').select('id',{count:'exact',head:true}).eq('student_id',studentId).eq('status','pending');setPending(p.count||0)},[studentId]);
 useEffect(()=>{if(host&&open)void loadWords()},[host,open,loadWords]);
 async function scan(){setBusy(true);setMsg('');try{const r=await authedPost<{added:number;scannedPages:number}>(supabase()!,'/api/vocab/detect',{studentId});setMsg(r.added?tt('{0} nieuwe woorden gevonden. Controleer ze hieronder.',r.added):r.scannedPages?tt('Geen nieuwe woorden gevonden op het canvas.'):tt('Het canvas is niet veranderd sinds de vorige keer.'));await loadWords()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy(false)}
 const selection:Selection=sel.mode==='manual'?{mode:'manual',ids:[...manual]}:sel;
 const pool=useMemo(()=>selectWords(words,selection),[words,sel,manual]);

 async function start(){setMsg('');setFew(null);const id=crypto.randomUUID();
  if(kind==='flash'){if(!pool.length){setMsg(tt('Er zijn nog geen woorden in deze selectie. Voeg woorden toe in de Woordenlijst.'));return}
   const cards=pool.slice(0,30).map(w=>({id:w.id,term:w.term,back:w.translation,example:w.example}));const s=newGame(id,'flash',{cards});ref.current=s;setState(s);broadcast(s);return}
  const s=newGame(id,kind,{explainer:first,duration,taboo});ref.current=s;setState(s);broadcast(s);await newRound.current(count)}
 newRound.current=async(c?:number)=>{const s=ref.current;if(!s||!host||s.kind==='flash'||s.phase!=='between')return;setBusy(true);setFew(null);
  try{const r=await authedPost<{tooFew?:boolean;available?:number;roundId?:string;cardCount?:number}>(supabase()!,'/api/games/round',{studentId,sessionId:s.id,roundId:crypto.randomUUID(),round:s.round+1,kind:s.kind,explainer:s.explainer,selection,count:c||count,taboo:s.taboo||taboo});
   if(r.tooFew){setFew(r.available||0);apply({a:'error',message:tt('Te weinig woorden voor een ronde ({0} beschikbaar).',r.available||0)},'teacher')}else apply({a:'round',roundId:r.roundId!,cardCount:r.cardCount!},'teacher')}
  catch(e){apply({a:'error',message:e instanceof Error?e.message:String(e)},'teacher')}setBusy(false)};

 /* ---------- actions (host applies directly, student asks the host) ---------- */
 const act=(a:Action|{a:'newround'})=>{if(host){if(a.a==='newround')void newRound.current();else apply(a as Action,'teacher')}else send({t:'game',k:'act',a})};
 const me:Role=role;const explaining=!!state&&state.kind!=='flash'&&state.explainer===me;

 /* ---------- explainer: load the round's cards (RLS: only the explainer can read them) ---------- */
 useEffect(()=>{const rid=state?.roundId;if(!explaining||!rid||cards?.roundId===rid)return;let c=false;
  void supabase()!.from('game_rounds').select('cards').eq('id',rid).maybeSingle().then(({data})=>{if(!c&&data)setCards({roundId:rid,cards:(data as {cards:Card[]}).cards})});return()=>{c=true}},[explaining,state?.roundId,cards?.roundId]);
 function guessed(i:number){const c=cards?.cards[i];act({a:'guessed',index:i});if(c&&state?.roundId)void supabase()!.rpc('game_mark_guessed',{p_round:state.roundId,p_vocab:c.vocab_id})}

 if(!open)return null;
 const left=state?Math.ceil(remaining(state,now)/1000):0;
 const head=<div className="row between"><h3><Layers size={17}/> {tt('Spelletjes')}{state&&<small className="muted"> · {tt(KIND_LABEL[state.kind])}</small>}</h3><button className="iconbtn" aria-label={tt('Sluiten')} onClick={onClose}><X size={18}/></button></div>;

 /* ---------- no game yet ---------- */
 if(!state||state.phase==='ended'&&!host){
  if(!host)return <aside className="games-panel" aria-live="polite">{head}<p className="muted">{state?.phase==='ended'?tt('Het spel is afgelopen.'):tt('Je docent start zo een spel.')}</p>{state&&<Score s={state}/>}</aside>;
 }
 if(host&&(!state||state.phase==='ended'))return <aside className="games-panel">{head}
  {state?.phase==='ended'&&<div className="game-result">{state.kind==='flash'?tt('Flashcards klaar: {0} goed, {1} nog oefenen.',flashSummary(state).good,flashSummary(state).bad):<Score s={state}/>}</div>}
  <div className="chipbar">{(['flash','thirty','taboo'] as Kind[]).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}>{tt(KIND_LABEL[k])}</button>)}</div>
  <label className="stack"><span className="label">{tt('Welke woorden?')}</span><select className="field" value={sel.mode} onChange={e=>setSel({mode:e.target.value as Selection['mode']})}>{(Object.keys(SEL_LABEL) as Selection['mode'][]).map(k=><option key={k} value={k}>{tt(SEL_LABEL[k])}</option>)}</select></label>
  {sel.mode==='manual'&&<div className="games-pick">{words.map(w=><label key={w.id} className="row small"><input type="checkbox" checked={manual.has(w.id)} onChange={()=>setManual(m=>{const n=new Set(m);if(n.has(w.id))n.delete(w.id);else n.add(w.id);return n})}/> {w.term}</label>)}</div>}
  <p className="muted small-print">{tt('{0} woorden in deze selectie.',pool.length)} {pending>0&&tt('{0} voorgestelde woorden wachten op controle in de Woordenlijst.',pending)}</p>
  {kind!=='flash'&&<div className="row wrap">
   <label className="row"><span className="label">{tt('Tijd')}</span><select className="field" value={duration} onChange={e=>setDuration(+e.target.value as 30|60|90)}>{[30,60,90].map(d=><option key={d} value={d}>{tt('{0} seconden',d)}</option>)}</select></label>
   {kind==='taboo'&&<label className="row"><span className="label">{tt('Verboden woorden')}</span><select className="field" value={taboo} onChange={e=>setTaboo(+e.target.value as 1|2|3)}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>}
   <label className="row"><span className="label">{tt('Eerst uitleggen')}</span><select className="field" value={first} onChange={e=>setFirst(e.target.value as Role)}><option value="teacher">{tt('Docent')}</option><option value="student">{tt('Leerling')}</option></select></label></div>}
  {kind!=='flash'&&pool.length<5&&<p className="notice">{tt('Er zijn maar {0} geschikte woorden; een ronde heeft er normaal vijf. Voeg woorden toe in de Woordenlijst of speel een kleinere ronde.',pool.length)}</p>}
  {kind!=='flash'&&pool.length<5&&pool.length>0&&<label className="row"><span className="label">{tt('Woorden per ronde')}</span><select className="field" value={Math.min(count,pool.length)} onChange={e=>setCount(+e.target.value)}>{Array.from({length:pool.length},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</select></label>}
  <div className="row wrap"><button className="button" disabled={busy||!pool.length} onClick={()=>{if(kind!=='flash'&&pool.length<5)setCount(Math.min(count,pool.length));void start()}}><Play size={15}/> {tt('Spel starten')}</button>
   <button className="button secondary" disabled={busy} onClick={()=>void scan()}><Sparkles size={15}/> {tt('Woorden van het canvas ophalen')}</button></div>
  {msg&&<p className="muted" role="status">{msg}</p>}
 </aside>;
 const s=state!;

 /* ---------- flashcards (shared: both see the same card) ---------- */
 if(s.kind==='flash'&&s.flash){const c=s.flash.cards[s.flash.index];
  return <aside className="games-panel">{head}
   <div className="game-progress"><span style={{width:`${(Object.keys(s.flash.results).length/Math.max(1,s.flash.cards.length))*100}%`}}/></div>
   <p className="muted center">{s.flash.index+1} / {s.flash.cards.length}</p>
   {c&&<button className={'flipcard'+(s.flash.flipped?' flipped':'')} onClick={()=>act({a:'flip'})} aria-live="polite"><span className="face front"><strong>{c.term}</strong><small>{tt('tik om om te draaien')}</small></span><span className="face back"><strong>{c.back||tt('(nog geen betekenis)')}</strong>{c.example&&<small>{c.example}</small>}</span></button>}
   <div className="row center wrap"><button className="iconbtn" aria-label={tt('Vorige')} onClick={()=>act({a:'prev'})}><ChevronLeft size={18}/></button>
    <button className="button secondary" onClick={()=>act({a:'mark',result:'bad'})}><RotateCcw size={15}/> {tt('Nog oefenen')}</button><button className="button" onClick={()=>act({a:'mark',result:'good'})}><Check size={15}/> {tt('Goed')}</button>
    <button className="iconbtn" aria-label={tt('Volgende')} onClick={()=>act({a:'next'})}><ChevronRight size={18}/></button></div>
   <div className="row"><button className="button small secondary" onClick={()=>act({a:'end'})}><Square size={13}/> {tt('Stoppen')}</button></div>
  </aside>}

 /* ---------- 30 Seconds / Taboo ---------- */
 return <aside className="games-panel" aria-live="polite">{head}
  <div className="game-top"><span className={'game-timer'+(left<=5&&s.phase==='running'?' low':'')}><Timer size={16}/> {s.phase==='between'?s.duration:left}{tt('s')}</span>
   <span className="tag">{tt('Ronde {0}',s.round||1)}</span><span className="tag">{s.explainer===me?tt('Jij legt uit'):tt('Jij raadt')}</span></div>
  <Score s={s}/>
  {s.error&&<p className="notice">{s.error}</p>}
  {host&&few!==null&&<div className="row wrap">{few>0&&<button className="button small" onClick={()=>void newRound.current(few)}>{tt('Kleinere ronde met {0} woorden',few)}</button>}<span className="muted small-print">{tt('Of voeg woorden toe in de Woordenlijst.')}</span></div>}
  {(s.phase==='ready'||s.phase==='running'||s.phase==='paused')&&(explaining?
   <div className="game-cards">{!cards||cards.roundId!==s.roundId?<div className="loader small"/>:cards.cards.map((c,i)=><div key={c.vocab_id} className={'game-card'+(s.guessed.includes(i)?' done':'')}>
     <div className="grow"><b>{c.term}</b>{c.hint&&<small className="muted block">{c.hint}</small>}{!!c.forbidden.length&&<small className="forbidden block"><Ban size={12}/> {c.forbidden.join(' · ')}</small>}</div>
     {s.phase==='running'&&(s.guessed.includes(i)?<button className="iconbtn" title={tt('Ongedaan maken')} onClick={()=>act({a:'undo',index:i})}><RotateCcw size={14}/></button>:<button className="button small" onClick={()=>guessed(i)}><Check size={14}/> {tt('Geraden')}</button>)}</div>)}
    <p className="muted small-print">{s.kind==='taboo'?tt('Leg uit zonder het woord zelf en zonder de verboden woorden te gebruiken.'):tt('Leg uit zonder het woord zelf te noemen.')}</p></div>
   :<div className="game-guess"><strong>{tt('{0} van {1} geraden',s.guessed.length,s.cardCount)}</strong><p className="muted">{s.explainer==='teacher'?tt('Je docent legt uit. Raad de woorden!'):tt('Je leerling legt uit. Raad de woorden!')}</p></div>)}
  {s.phase==='between'&&!!s.rounds.length&&<p className="game-result">{tt('Ronde klaar: {0} van {1} geraden.',s.rounds[s.rounds.length-1].guessed,s.rounds[s.rounds.length-1].of)}</p>}
  <div className="row wrap">
   {s.phase==='ready'&&<button className="button" onClick={()=>act({a:'begin'})}><Play size={15}/> {tt('Start de tijd')}</button>}
   {s.phase==='running'&&<button className="button secondary" onClick={()=>act({a:'pause'})}><Pause size={15}/> {tt('Pauze')}</button>}
   {s.phase==='paused'&&<button className="button" onClick={()=>act({a:'resume'})}><Play size={15}/> {tt('Verder')}</button>}
   {s.phase==='between'&&<><button className="button" disabled={busy} onClick={()=>act({a:'newround'})}><Play size={15}/> {tt('Volgende ronde')}</button>
    <button className="button secondary" onClick={()=>act({a:'switch'})}><Repeat2 size={15}/> {tt('Wissel van rol')}</button>
    {host&&<select className="field" value={s.duration} onChange={e=>act({a:'duration',seconds:+e.target.value as 30|60|90})} aria-label={tt('Tijd')}>{[30,60,90].map(d=><option key={d} value={d}>{tt('{0} seconden',d)}</option>)}</select>}</>}
   <button className="button small secondary" onClick={()=>act({a:'end'})}><Square size={13}/> {tt('Spel afsluiten')}</button>
  </div>
 </aside>
}

function Score({s}:{s:GameState}){return <div className="game-score"><span>{tt('Docent')}: <b>{s.score.teacher}</b></span><span>{tt('Leerling')}: <b>{s.score.student}</b></span></div>}
