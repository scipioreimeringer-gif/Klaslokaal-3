'use client';
// Word games in the live classroom: Flashcards, 30 Seconds and Taboo, synchronised between teacher and student
// over the classroom's existing data channel. The teacher's browser is the host (lib/games/state.ts).
// Cards of a 30 Seconds / Taboo round are loaded ONLY by the explaining player, from game_rounds (RLS).
// v41: words are always available — default source is the built-in word bank ("🎲 Willekeurig"); personal lists
// can be topped up with bank words; Flashcards can use the bank too; no AI for normal rounds. New, friendlier look.
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X,Pause,Play,Repeat2,Check,Ban,Sparkles,ChevronLeft,ChevronRight,RotateCcw,Square,Brain,Timer,Target,Dices,BookOpen,GraduationCap,Users,Layers,SkipForward} from 'lucide-react';
import {supabase} from '../lib/supabase';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {authedPost} from '../lib/learning';
import {newGame,reduce,remaining,wire,fromWire,flashSummary,type Action,type GameState,type Kind,type Role} from '../lib/games/state';
import {selectWords,type Selection,type Word} from '../lib/vocab/core';
import {Select} from './Select';
import {languageName} from '../lib/languages';
const langLabel=(l:string)=>l?languageName(l):tt('Lestaal');
import {t as tt} from '../lib/i18n';

type Card={vocab_id:string|null;bank_id?:string;term:string;hint:string;forbidden:string[]};
type Msg=({t:'game';k:'state';s:GameState;at?:number}|{t:'game';k:'act';a:Action|{a:'newround'}|{a:'sync'};aid?:string});
const frame=()=>document.querySelector('iframe.live-frame') as HTMLIFrameElement|null;
// v50: every game message goes over TWO independent routes: the classroom's data channel (peer-to-peer) AND a Supabase
// Realtime broadcast channel between the two apps (part of the existing Supabase project; no new service). Whichever
// arrives first is used; duplicates are ignored (states carry the host's time, actions an id). The shared state never
// contains the cards, so nothing hidden travels over either route.
let rt:RealtimeChannel|null=null;let rtOn=false;
function send(m:unknown){
 try{(frame()?.contentWindow as unknown as {__klasGameSend?:(m:unknown)=>void}|null)?.__klasGameSend?.(m)}catch{/* classroom not ready */}
 if(rt&&rtOn)void rt.send({type:'broadcast',event:'g',payload:m}).catch(()=>{});
}
function peerOnline(){try{return !!(frame()?.contentWindow as unknown as {__klasOnline?:()=>boolean}|null)?.__klasOnline?.()}catch{return false}}
function online(){return peerOnline()||rtOn}
const KIND_LABEL:Record<Kind,string>={flash:'Flashcards',thirty:'30 Seconds',taboo:'Taboe'};
const KIND_ICON:Record<Kind,ReactNode>={flash:<Brain size={18}/>,thirty:<Timer size={18}/>,taboo:<Target size={18}/>};
const KIND_HINT:Record<Kind,string>={flash:'Omdraaien en oefenen',thirty:'Leg zoveel mogelijk woorden uit',taboo:'Uitleggen zonder verboden woorden'};
const SEL_LABEL:Record<Selection['mode'],string>={last_lesson:'Woorden uit de vorige les',last5:'Woorden uit de laatste vijf lessen',all:'Alle woorden',difficult:'Woorden die de leerling moeilijk vindt',manual:'Zelf kiezen'};
/** bank = built-in word bank (random), list = the student's own word list, lesson = words from the last lesson */
type Source='bank'|'list'|'lesson';
type BankMod=typeof import('../lib/wordbank');
type BankLevelSel=import('../lib/wordbank').BankLevel|'mix';type BankCatSel=import('../lib/wordbank').BankCat|'all';
const UUID=/^[0-9a-f-]{36}$/i;

type Props={studentId:string;role:Role;open:boolean;onOpen:()=>void;onClose:()=>void;mount?:Element|null};
/** v36: rendered inside the classroom's "Spelletjes" tab (host = a shadow-DOM mount in the work panel); without a host it floats over the classroom. */
export function GamesPanel(props:Props){const view=GamesView(props);return props.mount?createPortal(view,props.mount):view}
function GamesView({studentId,role,open,onOpen,onClose,mount}:Props):ReactNode{
 const host=role==='teacher';const store='teachy-game-'+studentId;
 const [state,setState]=useState<GameState|null>(()=>{if(!host||typeof window==='undefined')return null;try{const x=JSON.parse(sessionStorage.getItem(store)||'null') as GameState|null;return x&&x.phase!=='ended'?{...x,phase:x.phase==='running'?'paused':x.phase,runningSince:null}:null}catch{return null}});
 const ref=useRef(state);ref.current=state;
 const [now,setNow]=useState(Date.now());
 const [words,setWords]=useState<Word[]>([]);const [pending,setPending]=useState(0);
 const [kind,setKind]=useState<Kind>('thirty');const [sel,setSel]=useState<Selection>({mode:'last5'});const [manual,setManual]=useState<Set<string>>(new Set());
 const [duration,setDuration]=useState<30|60|90>(30);const [taboo,setTaboo]=useState<1|2|3>(3);const [first,setFirst]=useState<Role>('teacher');
 const [count,setCount]=useState(5);const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);const [few,setFew]=useState<number|null>(null);
 const [cards,setCards]=useState<{roundId:string;cards:Card[]}|null>(null);
 // built-in word bank (no personal words or AI needed); default source once it is known to exist for this language
 const [source,setSource]=useState<Source|null>(null);const [bank,setBank]=useState<BankMod|null>(null);const [bankLang,setBankLang]=useState('');
 const [level,setLevel]=useState<BankLevelSel>('mix');const [cat,setCat]=useState<BankCatSel>('all');const [aiTaboo,setAiTaboo]=useState(false);const [fill,setFill]=useState(true);
 const [widen,setWiden]=useState(false);const [notice,setNotice]=useState('');
 // v42: flashcards lesson language → English (default) or English → lesson language; translations hidden during a guessing round
 const [dir,setDir]=useState<'to-en'|'from-en'>('to-en');const [shown,setShown]=useState<Set<number>>(new Set());

 /* ---------- host: apply + broadcast ---------- */
 const apply=useCallback((a:Action,actor:Role)=>{const s=ref.current;if(!s)return;const n=reduce(s,a,actor,Date.now());if(n===s)return;
  // flashcard results count as practice for personal words only (host only → never twice); bank words have no row
  if(a.a==='mark'&&s.flash){const c=s.flash.cards[s.flash.index];if(c&&UUID.test(c.id))void supabase()!.rpc('record_vocab_practice',{item:c.id,correct:a.result==='good'})}
  ref.current=n;setState(n);send(wire(n,Date.now()))},[]);
 const broadcast=useCallback((s:GameState|null)=>{if(s)send(wire(s,Date.now()))},[]);
 useEffect(()=>{if(host&&state)sessionStorage.setItem(store,JSON.stringify(state))},[host,state,store]);

 /* ---------- messages from the other player ---------- */
 const newRound=useRef<(c?:number,f?:{level:BankLevelSel;cat:BankCatSel})=>Promise<void>>(async()=>{});
 const opened=useRef('');
 // v47: teacher reloaded during a game → the restored game opens its panel again (and therefore at the student too)
 useEffect(()=>{if(host&&mount&&ref.current&&ref.current.phase!=='ended'&&!opened.current){opened.current='restored';onOpen()}},[host,mount,onOpen]);
 // v47 fix: messages arrive as window events from the classroom (works whatever bridge object exists, and after a
 // classroom reload); the student asks for the current state itself when it has none (opened later, missed a message)
 const seen=useRef<Set<string>>(new Set());const lastAt=useRef<{id:string;at:number}|null>(null);
 const handle=useRef<(m:Msg)=>void>(()=>{});
 handle.current=(m:Msg)=>{if(!m||m.t!=='game')return;
   if(host&&m.k==='act'){if(m.aid){if(seen.current.has(m.aid))return;seen.current.add(m.aid);if(seen.current.size>300)seen.current=new Set([...seen.current].slice(-150))}
    const a=(m.a as {a:string}).a;if(a==='sync')broadcast(ref.current);else if(a==='newround')void newRound.current();else apply(m.a as Action,'student')}
   if(!host&&m.k==='state'){const L=lastAt.current;if(m.at&&L&&L.id===m.s.id&&m.at<L.at)return; // an older copy over the slower route
    if(m.at)lastAt.current={id:m.s.id,at:m.at}}
   handleState(m)};
 // Realtime route (one channel per student classroom; only the two apps of this lesson subscribe)
 useEffect(()=>{const db=supabase();if(!db)return;const c=db.channel('teachy-game-'+studentId,{config:{broadcast:{self:false}}});
  c.on('broadcast',{event:'g'},({payload})=>handle.current(payload as Msg));
  c.subscribe(st=>{rtOn=st==='SUBSCRIBED';if(rtOn&&host)broadcast(ref.current)});rt=c;
  return()=>{if(rt===c){rt=null;rtOn=false}void db.removeChannel(c)}},[studentId,host,broadcast]);
 const handleState=(m:Msg)=>{
   if(!host&&m.k==='state'){
   // v47: open the panel at the student once per game/round (not on every state update: a panel the student closed
   // on purpose must not jump open again with every timer tick); the timer always follows the host's state
   const s=fromWire(m,Date.now());setState(s);const k=s.id+':'+s.round+':'+(s.phase==='ended'?'end':'on');if(s.phase!=='ended'&&opened.current!==k){opened.current=k;onOpen()}if(s.phase==='ended')opened.current=k}};
 useEffect(()=>{
  const onMsg=(e:Event)=>handle.current((e as CustomEvent).detail as Msg);
  const onHello=()=>{if(host)broadcast(ref.current)}; // student (re)connected: send the current state again
  window.addEventListener('teachy-game',onMsg);window.addEventListener('teachy-peer-hello',onHello);
  return()=>{window.removeEventListener('teachy-game',onMsg);window.removeEventListener('teachy-peer-hello',onHello)}},[host,apply,broadcast,onOpen]);
 // student without a state: ask the teacher every 4 s while connected (a few bytes) until the game state arrives,
 // so a game started before the student joined, or a lost message, never leaves the student waiting
 const [linked,setLinked]=useState(true);
 useEffect(()=>{if(host||state)return;const ask=()=>{const on=online();setLinked(on);if(on)send({t:'game',k:'act',a:{a:'sync'},aid:crypto.randomUUID()})};ask();const id=setInterval(ask,4000);return()=>clearInterval(id)},[host,state]);

 /* ---------- timer ---------- */
 // v47: one timer — the host's start/end. The host re-sends the state every 4 s while the clock runs, so the student's
 // display is corrected continuously (latency, a hidden tab, a reconnect) instead of drifting on its own.
 useEffect(()=>{let last=0;const id=setInterval(()=>{const t=Date.now();setNow(t);if(host&&ref.current?.phase==='running')apply({a:'tick'},'teacher');if(host&&ref.current&&ref.current.phase!=='ended'&&t-last>(ref.current.phase==='running'?4000:8000)){last=t;broadcast(ref.current)}},250);return()=>clearInterval(id)},[host,apply,broadcast]);

 /* ---------- teacher: words + suggestions ---------- */
 const loadWords=useCallback(async()=>{const db=supabase()!;
  const r=await db.from('vocab_items').select('id,term,translation,example,status,lesson_date,created_at,correct_count,wrong_count,difficult,due_at').eq('student_id',studentId);
  const rows=r.error?(await db.from('vocab_items').select('id,term,translation,example,status,lesson_date,created_at,correct_count,wrong_count,due_at').eq('student_id',studentId)).data:r.data; // v35 optional
  setWords((rows||[]) as Word[]);
  const p=await db.from('vocab_suggestions').select('id',{count:'exact',head:true}).eq('student_id',studentId).eq('status','pending');setPending(p.count||0)},[studentId]);
 useEffect(()=>{if(host&&open)void loadWords()},[host,open,loadWords]);
 // target language + level of this student → which bank, which default level
 useEffect(()=>{if(!host||!open||bank)return;let c=false;void(async()=>{const m=await import('../lib/wordbank');
  const r=await supabase()!.from('students').select('curriculum_subject,subject,lesson_language,level').eq('id',studentId).maybeSingle();
  const row=(r.error?(await supabase()!.from('students').select('subject,lesson_language,level').eq('id',studentId).maybeSingle()).data:r.data) as {curriculum_subject?:string|null;subject?:string|null;lesson_language?:string|null;level?:string|null}|null;
  const lang=m.bankLangFor(row||{});await m.loadBank(lang); // v42: only the lesson language is loaded
  if(c)return;setBank(m);setBankLang(lang);if(m.isLevel(row?.level))setLevel(row!.level as BankLevelSel)})();return()=>{c=true}},[host,open,bank,studentId]);
 const bankOk=!!bank&&bank.hasBank(bankLang);
 // default: random words from the bank (a game can start right away); personal words when the language has no bank
 const src:Source=source||(bankOk?'bank':'list');
 const bankPool=useMemo(()=>bankOk?bank!.bankPool(bankLang,{level,cat,minTaboo:kind==='taboo'?taboo:0}):[],[bankOk,bank,bankLang,level,cat,kind,taboo]);
 async function scan(){setBusy(true);setMsg('');try{const r=await authedPost<{added:number;scannedPages:number}>(supabase()!,'/api/vocab/detect',{studentId});setMsg(r.added?tt('{0} nieuwe woorden gevonden. Controleer ze hieronder.',r.added):r.scannedPages?tt('Geen nieuwe woorden gevonden op het canvas.'):tt('Het canvas is niet veranderd sinds de vorige keer.'));await loadWords()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy(false)}
 const selection:Selection=src==='lesson'?{mode:'last_lesson'}:sel.mode==='manual'?{mode:'manual',ids:[...manual]}:sel;
 const pool=useMemo(()=>selectWords(words,selection),[words,sel,manual,src]);// eslint-disable-line react-hooks/exhaustive-deps
 const canFill=bankOk&&src!=='bank'&&fill;
 const need=kind==='flash'?1:count;
 const avail=src==='bank'?bankPool.length:pool.length;
 const playable=avail>=need||(canFill&&avail+bankPool.length>=need);

 async function start(){setMsg('');setFew(null);const id=crypto.randomUUID();
  if(kind==='flash'){
   // personal cards (+ bank cards to top up), or bank cards only; the back shows the meaning or the words to describe it
   // front = lesson language, back = English (stored translation; never generated here) — or the other way round
   const rev=dir==='from-en';
   const mine=src==='bank'?[]:pool.filter(w=>!rev||w.translation.trim()).slice(0,30).map(w=>rev?{id:w.id,term:w.translation,back:w.term,example:w.example}:{id:w.id,term:w.term,back:w.translation,example:w.example});
   const fromBank=(src==='bank'||canFill)&&bank?bank.pickBank(bankPool.filter(w=>w.en),Math.max(0,(src==='bank'?20:Math.min(20,Math.max(10,mine.length)))-mine.length),new Set(),Math.random)
    .map(w=>rev?{id:w.id,term:w.en,back:w.term,example:bank.bankGrammar(w)}:{id:w.id,term:w.term,back:w.en,example:bank.bankGrammar(w)}):[];
   const cardsF=[...mine,...fromBank];
   if(!cardsF.length){setMsg(tt('Er zijn nog geen woorden in deze selectie. Voeg woorden toe in de Woordenlijst.'));return}
   const s=newGame(id,'flash',{cards:cardsF});ref.current=s;setState(s);broadcast(s);return}
  const s=newGame(id,kind,{explainer:first,duration,taboo});ref.current=s;setState(s);broadcast(s);await newRound.current(count)}
 newRound.current=async(c?:number,f?:{level:BankLevelSel;cat:BankCatSel})=>{const s=ref.current;if(!s||!host||s.kind==='flash'||s.phase!=='between')return;setBusy(true);setFew(null);setWiden(false);setNotice('');
  const lv=f?.level||level,ct=f?.cat||cat;
  try{const r=await authedPost<{tooFew?:boolean;available?:number;canWiden?:boolean;roundId?:string;cardCount?:number;notice?:string|null}>(supabase()!,'/api/games/round',{studentId,sessionId:s.id,roundId:crypto.randomUUID(),round:s.round+1,kind:s.kind,explainer:s.explainer,count:c||count,taboo:s.taboo||taboo,
    ...(src==='bank'?{source:'bank',level:lv,category:ct}:{source:'list',selection,aiTaboo,fillBank:canFill,level:lv})});
   if(r.tooFew){setFew(r.available||0);setWiden(!!r.canWiden);apply({a:'error',message:tt('Te weinig woorden voor een ronde ({0} beschikbaar).',r.available||0)},'teacher')}else{if(r.notice)setNotice(tt(r.notice));apply({a:'round',roundId:r.roundId!,cardCount:r.cardCount!},'teacher')}}
  catch(e){apply({a:'error',message:e instanceof Error?e.message:String(e)},'teacher')}setBusy(false)};

 /* ---------- actions (host applies directly, student asks the host) ---------- */
 const act=(a:Action|{a:'newround'})=>{if(host){if(a.a==='newround')void newRound.current();else apply(a as Action,'teacher')}else send({t:'game',k:'act',a,aid:crypto.randomUUID()})};
 const me:Role=role;const explaining=!!state&&state.kind!=='flash'&&state.explainer===me;

 /* ---------- explainer: load the round's cards (RLS: only the explainer can read them) ---------- */
 useEffect(()=>{const rid=state?.roundId;if(!explaining||!rid||cards?.roundId===rid)return;let c=false;
  void supabase()!.from('game_rounds').select('cards').eq('id',rid).maybeSingle().then(({data})=>{if(!c&&data)setCards({roundId:rid,cards:(data as {cards:Card[]}).cards})});return()=>{c=true}},[explaining,state?.roundId,cards?.roundId]);
 useEffect(()=>{setShown(new Set())},[state?.roundId]); // a new round starts with all meanings hidden again
 function guessed(i:number){const c=cards?.cards[i];act({a:'guessed',index:i});if(c?.vocab_id&&state?.roundId)void supabase()!.rpc('game_mark_guessed',{p_round:state.roundId,p_vocab:c.vocab_id})}

 if(!open&&!mount)return null;
 const left=state?Math.ceil(remaining(state,now)/1000):0;
 const accent=state?state.kind:kind;
 const head=<header className="gx-head"><span className="gx-title"><Layers size={17}/> {tt('Spelletjes')}{state&&<small> · {tt(KIND_LABEL[state.kind])}</small>}</span><button className="gx-close" aria-label={tt('Sluiten')} onClick={onClose}><X size={17}/></button></header>;

 /* ---------- no game yet ---------- */
 if(!state||state.phase==='ended'&&!host){
  if(!host)return <aside className={'games-panel gx gx-'+accent} aria-live="polite">{head}<div className="gx-wait"><Deco/><p>{state?.phase==='ended'?tt('Het spel is afgelopen.'):linked?tt('Je docent start zo een spel.'):tt('Nog niet verbonden met je docent. Het spel verschijnt zodra de verbinding er is.')}</p>{state&&<Score s={state}/>}</div></aside>;
 }
 if(host&&(!state||state.phase==='ended')){
  const srcOpts=[{value:'bank' as Source,label:tt('Willekeurig'),icon:<Dices size={15}/>,hint:bankOk?tt('ingebouwde woordenbank'):tt('geen woordenbank voor deze taal'),disabled:!bankOk},
   {value:'list' as Source,label:tt('Mijn woordenlijst'),icon:<BookOpen size={15}/>,hint:tt('{0} woorden',words.length)},
   {value:'lesson' as Source,label:tt('Woorden uit de les'),icon:<Sparkles size={15}/>,hint:tt('vorige les')}];
  return <aside className={'games-panel gx gx-'+accent}>{head}
  {state?.phase==='ended'&&<div className="gx-result">{state.kind==='flash'?tt('Flashcards klaar: {0} goed, {1} nog oefenen.',flashSummary(state).good,flashSummary(state).bad):<Score s={state}/>}</div>}
  <div className="gx-kinds" role="tablist" aria-label={tt('Spel kiezen')}>{(['flash','thirty','taboo'] as Kind[]).map(k=><button key={k} role="tab" aria-selected={kind===k} className={'gx-kind gx-k-'+k} onClick={()=>setKind(k)}>
   <span className="gx-kind-ico">{KIND_ICON[k]}</span><span className="gx-kind-txt"><b>{tt(KIND_LABEL[k])}</b><small>{tt(KIND_HINT[k])}</small></span></button>)}</div>
  <div className="gx-settings">
   <Select<Source> size="sm" label={tt('Woorden')} value={src} onChange={setSource} options={srcOpts}/>
   {src==='bank'&&bank&&<>
    <Select<BankLevelSel> size="sm" label={tt('Niveau')} value={level} onChange={setLevel} icon={<GraduationCap size={14}/>} options={(['mix',...bank.BANK_LEVELS] as BankLevelSel[]).map(l=>({value:l,label:tt(bank.LEVEL_LABEL[l])}))}/>
    <Select<BankCatSel> size="sm" label={tt('Categorie')} value={cat} onChange={setCat} options={(['all',...bank.BANK_CATS] as BankCatSel[]).map(c=>({value:c,label:tt(bank.CAT_LABEL[c])}))}/></>}
   {kind==='flash'&&<Select<'to-en'|'from-en'> size="sm" label={tt('Richting')} value={dir} onChange={setDir} icon={<Repeat2 size={14}/>} options={[{value:'to-en',label:tt('{0} → Engels',langLabel(bankLang))},{value:'from-en',label:tt('Engels → {0}',langLabel(bankLang))}]}/>}
   {src==='list'&&<Select<Selection['mode']> size="sm" label={tt('Welke woorden?')} value={sel.mode} onChange={m=>setSel({mode:m})} options={(Object.keys(SEL_LABEL) as Selection['mode'][]).map(k=>({value:k,label:tt(SEL_LABEL[k])}))}/>}
   {kind!=='flash'&&<>
    <Select<30|60|90> size="sm" label={tt('Tijd')} value={duration} onChange={setDuration} icon={<Timer size={14}/>} options={([30,60,90] as const).map(d=>({value:d,label:tt('{0} sec',d)}))}/>
    <Select<Role> size="sm" label={tt('Uitlegger')} value={first} onChange={setFirst} icon={<Users size={14}/>} options={[{value:'teacher',label:tt('Docent')},{value:'student',label:tt('Leerling')}]}/>
    {kind==='taboo'&&<Select<1|2|3> size="sm" label={tt('Verboden woorden')} value={taboo} onChange={setTaboo} icon={<Ban size={14}/>} options={([1,2,3] as const).map(n=>({value:n,label:tt('{0} verboden',n)}))}/>}</>}
  </div>
  {src==='list'&&sel.mode==='manual'&&<div className="games-pick">{words.map(w=><label key={w.id} className="row small"><input type="checkbox" checked={manual.has(w.id)} onChange={()=>setManual(m=>{const n=new Set(m);if(n.has(w.id))n.delete(w.id);else n.add(w.id);return n})}/> {w.term}</label>)}</div>}
  <div className="gx-status">
   <span className={'gx-count'+(avail<need?' low':'')}>{tt('{0} woorden in deze selectie.',avail)}</span>
   {src!=='bank'&&bankOk&&avail<Math.max(need,5)&&<label className="gx-check"><input type="checkbox" checked={fill} onChange={e=>setFill(e.target.checked)}/> {tt('Aanvullen met ingebouwde woorden')}</label>}
   {kind==='taboo'&&src!=='bank'&&<label className="gx-check"><input type="checkbox" checked={aiTaboo} onChange={e=>setAiTaboo(e.target.checked)}/> {tt('Ontbrekende verboden woorden met AI aanvullen')}</label>}
   {src!=='bank'&&pending>0&&<span className="muted small">{tt('{0} voorgestelde woorden wachten op controle in de Woordenlijst.',pending)}</span>}
  </div>
  {!playable&&<p className="gx-note">{src==='bank'?tt('Er zijn maar {0} woorden met deze keuze. Kies een ander niveau of een andere categorie, of speel een kleinere ronde.',avail):tt('Er zijn maar {0} geschikte woorden; een ronde heeft er normaal vijf. Voeg woorden toe in de Woordenlijst of speel een kleinere ronde.',avail)}</p>}
  {kind!=='flash'&&!playable&&avail>0&&<div className="gx-settings"><Select<number> size="sm" label={tt('Woorden per ronde')} value={Math.min(count,avail)} onChange={setCount} options={Array.from({length:avail},(_,i)=>({value:i+1,label:String(i+1)}))}/></div>}
  <div className="gx-actions"><button className="gx-start" disabled={busy||!avail&&!(canFill&&bankPool.length)} onClick={()=>{if(kind!=='flash'&&!playable)setCount(Math.min(count,avail));void start()}}><Play size={16}/> {tt('Spel starten')}</button>
   {src!=='bank'&&<button className="gx-ghost" disabled={busy} onClick={()=>void scan()}><Sparkles size={15}/> {tt('Woorden van het canvas ophalen')}</button>}</div>
  {msg&&<p className="muted small" role="status">{msg}</p>}
 </aside>}
 const s=state!;

 /* ---------- flashcards (shared: both see the same card) ---------- */
 if(s.kind==='flash'&&s.flash){const c=s.flash.cards[s.flash.index];const done=Object.keys(s.flash.results).length;
  return <aside className="games-panel gx gx-flash">{head}
   <div className="gx-progress" role="progressbar" aria-valuemin={0} aria-valuemax={s.flash.cards.length} aria-valuenow={done}><span style={{width:`${(done/Math.max(1,s.flash.cards.length))*100}%`}}/></div>
   <p className="gx-counter">{s.flash.index+1} / {s.flash.cards.length}</p>
   {c&&<button className={'flipcard gx-flip'+(s.flash.flipped?' flipped':'')} onClick={()=>act({a:'flip'})} aria-live="polite"><span className="face front"><strong>{c.term}</strong><small>{tt('tik om om te draaien')}</small></span><span className="face back"><strong>{c.back||tt('(nog geen betekenis)')}</strong>{c.example&&<small>{c.example}</small>}</span></button>}
   <div className="gx-play-actions">
    <button className="gx-round" aria-label={tt('Vorige')} onClick={()=>act({a:'prev'})}><ChevronLeft size={18}/></button>
    <button className="gx-bad" onClick={()=>act({a:'mark',result:'bad'})}><RotateCcw size={15}/> {tt('Nog oefenen')}</button>
    <button className="gx-good" onClick={()=>act({a:'mark',result:'good'})}><Check size={15}/> {tt('Goed')}</button>
    <button className="gx-round" aria-label={tt('Overslaan')} title={tt('Overslaan')} onClick={()=>act({a:'next'})}><ChevronRight size={18}/></button></div>
   <div className="gx-foot"><button className="gx-ghost small" onClick={()=>act({a:'end'})}><Square size={13}/> {tt('Stoppen')}</button></div>
  </aside>}

 /* ---------- 30 Seconds / Taboo ---------- */
 const total=Math.max(1,s.duration);const frac=s.phase==='between'?1:Math.max(0,Math.min(1,left/total));
 return <aside className={'games-panel gx gx-'+s.kind} aria-live="polite">{head}
  <div className="gx-top">
   <Ring frac={frac} low={left<=5&&s.phase==='running'} label={s.phase==='between'?String(s.duration):String(left)}/>
   <div className="gx-top-info"><span className="gx-tag">{tt('Ronde {0}',s.round||1)}</span><span className={'gx-tag '+(s.explainer===me?'me':'')}>{s.explainer===me?tt('Jij legt uit'):tt('Jij raadt')}</span><Score s={s}/></div>
  </div>
  {s.error&&<p className="gx-note">{s.error}</p>}
  {host&&few!==null&&<div className="gx-actions">{few>0&&<button className="gx-ghost small" onClick={()=>void newRound.current(few)}>{tt('Kleinere ronde met {0} woorden',few)}</button>}
   {src==='bank'&&widen&&bank&&<button className="gx-ghost small" onClick={()=>{const w=bank.widen({level,cat});if(!w)return;setLevel(w.level);setCat(w.cat);void newRound.current(undefined,{level:w.level,cat:w.cat})}}>{cat!=='all'?tt('Alle categorieën gebruiken'):tt('Alle niveaus gebruiken')}</button>}
   {src!=='bank'&&bankOk&&!canFill&&<button className="gx-ghost small" onClick={()=>{setFill(true);setTimeout(()=>void newRound.current(),0)}}>{tt('Aanvullen met ingebouwde woorden')}</button>}</div>}
  {host&&notice&&<p className="muted small">{notice}</p>}
  {(s.phase==='ready'||s.phase==='running'||s.phase==='paused')&&(explaining?
   <div className="gx-cards">{!cards||cards.roundId!==s.roundId?<div className="loader small"/>:cards.cards.map((c,i)=><div key={c.vocab_id||c.bank_id||i} className={'gx-card'+(s.guessed.includes(i)?' done':'')}>
     <div className="grow"><b className="gx-word">{c.term}</b>{c.hint&&(shown.has(i)?<small className="muted block">{c.hint}</small>:<button type="button" className="gx-reveal" onClick={()=>setShown(x=>new Set(x).add(i))}>{tt('Betekenis tonen')}</button>)}{!!c.forbidden.length&&<small className="gx-forbidden"><Ban size={12}/> {c.forbidden.join(' · ')}</small>}</div>
     {s.phase==='running'&&(s.guessed.includes(i)?<button className="gx-round" title={tt('Ongedaan maken')} aria-label={tt('Ongedaan maken')} onClick={()=>act({a:'undo',index:i})}><RotateCcw size={14}/></button>:<button className="gx-good small" onClick={()=>guessed(i)}><Check size={14}/> {tt('Geraden')}</button>)}</div>)}
    <p className="muted small">{s.kind==='taboo'?tt('Leg uit zonder het woord zelf en zonder de verboden woorden te gebruiken.'):tt('Leg uit zonder het woord zelf te noemen.')}</p></div>
   :<div className="gx-guess"><Deco/><strong>{tt('{0} van {1} geraden',s.guessed.length,s.cardCount)}</strong><p className="muted">{s.explainer==='teacher'?tt('Je docent legt uit. Raad de woorden!'):tt('Je leerling legt uit. Raad de woorden!')}</p></div>)}
  {s.phase==='between'&&!!s.rounds.length&&<p className="gx-result">{tt('Ronde klaar: {0} van {1} geraden.',s.rounds[s.rounds.length-1].guessed,s.rounds[s.rounds.length-1].of)}</p>}
  <div className="gx-play-actions">
   {s.phase==='ready'&&<button className="gx-start" onClick={()=>act({a:'begin'})}><Play size={16}/> {tt('Start de tijd')}</button>}
   {s.phase==='running'&&<button className="gx-ghost" onClick={()=>act({a:'pause'})}><Pause size={15}/> {tt('Pauze')}</button>}
   {s.phase==='paused'&&<button className="gx-start" onClick={()=>act({a:'resume'})}><Play size={16}/> {tt('Verder')}</button>}
   {s.phase==='between'&&<><button className="gx-start" disabled={busy} onClick={()=>act({a:'newround'})}><SkipForward size={16}/> {tt('Volgende ronde')}</button>
    <button className="gx-ghost" onClick={()=>act({a:'switch'})}><Repeat2 size={15}/> {tt('Wissel van rol')}</button>
    {host&&<Select<30|60|90> size="sm" label={tt('Tijd')} value={s.duration} onChange={v=>act({a:'duration',seconds:v})} icon={<Timer size={14}/>} options={([30,60,90] as const).map(d=>({value:d,label:tt('{0} sec',d)}))}/>}</>}
  </div>
  <div className="gx-foot"><button className="gx-ghost small" onClick={()=>act({a:'end'})}><Square size={13}/> {tt('Spel afsluiten')}</button></div>
 </aside>
}

/** Round countdown: a light SVG ring (no images, no heavy animation). */
function Ring({frac,low,label}:{frac:number;low:boolean;label:string}){const r=26,c=2*Math.PI*r;
 return <span className={'gx-ring'+(low?' low':'')} role="timer" aria-label={label+' '+tt('seconden')}><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden><circle cx="32" cy="32" r={r} className="track"/><circle cx="32" cy="32" r={r} className="bar" strokeDasharray={c} strokeDashoffset={c*(1-frac)}/></svg><b>{label}</b></span>}
/** small decorative SVG accent (inline, no network request) */
function Deco(){return <svg className="gx-deco" viewBox="0 0 120 40" aria-hidden><circle cx="14" cy="20" r="8" fill="#bfeee6"/><rect x="34" y="10" width="20" height="20" rx="6" fill="#ffe9a8"/><path d="M74 30l10-20 10 20z" fill="#ffd2c4"/><circle cx="108" cy="20" r="6" fill="#cfe2ff"/></svg>}
function Score({s}:{s:GameState}){return <div className="gx-score"><span>{tt('Docent')} <b>{s.score.teacher}</b></span><span>{tt('Leerling')} <b>{s.score.student}</b></span></div>}
