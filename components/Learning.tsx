'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Trash2,Search,Check,X,RotateCcw,Shuffle,Eye,Sparkles,Layers,ListChecks,Keyboard,Puzzle,Trophy,Flag} from 'lucide-react';
import {niceDate} from '../lib/data';
import {supabase} from '../lib/supabase';
import {addVocab,authedPost,loadVocab,LEVELS,VOCAB_STATUS_LABEL,type VocabItem} from '../lib/learning';
import {checkText,mcOptions,practiceOrder} from '../lib/answers';
import {blankSentence,drillSet,hasDrills} from '../lib/conjugation';
import {PenLine,Repeat,Wrench,CalendarDays,Clock3} from 'lucide-react';
import {Select} from './Select';
import {InfoTip} from './InfoTip';
import {posIcon} from '../lib/vocab/grammar';
import {t as tt, translated} from '../lib/i18n';

/* ========================= Vocabulary ========================= */
/** Teacher: words recognised on the canvas or in the AI lesson analysis, waiting for review. Nothing enters the list unseen. */
type Sug={id:string;term:string;translation:string;example:string;pos:string|null;kind:'word'|'expression';lang:string|null;origin:'canvas'|'analysis';lesson_date:string|null;lesson_id:string|null;source_page:string|null};
function Suggestions({studentId,onAdded}:{studentId:string;onAdded:()=>void}){
 const [rows,setRows]=useState<Sug[]|null>(null);const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await supabase()!.from('vocab_suggestions').select('id,term,translation,example,pos,kind,lang,origin,lesson_date,lesson_id,source_page').eq('student_id',studentId).eq('status','pending').order('created_at');
  if(r.error){setRows([]);if(!/vocab_suggestions|PGRST205/.test(r.error.message))setMsg(r.error.message);return}setRows((r.data||[]) as Sug[])},[studentId]);
 useEffect(()=>{void load()},[load]);
 async function scan(){setBusy(true);setMsg('');try{const r=await authedPost<{added:number;scannedPages:number}>(supabase()!,'/api/vocab/detect',{studentId});setMsg(r.added?tt('{0} nieuwe woorden gevonden. Controleer ze hieronder.',r.added):r.scannedPages?tt('Geen nieuwe woorden gevonden op het canvas.'):tt('Het canvas is niet veranderd sinds de vorige keer.'));await load()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy(false)}
 async function accept(list:Sug[]){setBusy(true);const db=supabase()!;let added=0;
  for(const s of list){const r=await db.from('vocab_items').insert({student_id:studentId,term:s.term.trim(),translation:s.translation.trim(),example:s.example.trim(),kind:s.kind,pos:s.pos||null,lang:s.lang,source:s.origin==='analysis'?'ai':'canvas',lesson_date:s.lesson_date,lesson_id:s.lesson_id,source_page:s.source_page});
   if(!r.error)added++;await db.from('vocab_suggestions').update({status:'accepted',decided_at:new Date().toISOString(),term:s.term.trim(),translation:s.translation.trim()}).eq('id',s.id)}
  setMsg(tt('{0} woorden toegevoegd aan de woordenlijst.',added));setBusy(false);await load();onAdded()}
 async function reject(s:Sug){await supabase()!.from('vocab_suggestions').update({status:'rejected',decided_at:new Date().toISOString()}).eq('id',s.id);await load()}
 const up=(id:string,p:Partial<Sug>)=>setRows(x=>x?.map(r=>r.id===id?{...r,...p}:r)||null);
 if(!rows)return null;
 return <section className="vocab-suggest">
  <div className="row between wrap"><h4><Sparkles size={15}/> {tt('Voorgestelde woorden')} {rows.length>0&&<span className="tag">{rows.length}</span>}</h4>
   <div className="row wrap"><button className="button small secondary" disabled={busy} onClick={()=>void scan()}>{tt('Woorden van het canvas herkennen')}</button>{rows.length>1&&<button className="button small" disabled={busy} onClick={()=>void accept(rows)}><Check size={14}/> {tt('Alles toevoegen')}</button>}</div></div>
  {msg&&<p className="muted" role="status">{msg}</p>}
  {rows.length?<table className="vocab edit"><tbody>{rows.map(s=><tr key={s.id}>
   <td><input className="cell" value={s.term} onChange={e=>up(s.id,{term:e.target.value})} aria-label={tt('Woord')}/></td>
   <td><input className="cell" value={s.translation} onChange={e=>up(s.id,{translation:e.target.value})} aria-label={tt('Betekenis')}/></td>
   <td className="muted small-print">{s.pos?(posIcon(s.pos)+' '+s.pos).trim():''}{s.source_page?' · '+s.source_page:''}{s.origin==='analysis'?' · '+tt('AI-lesanalyse'):''}</td>
   <td className="row"><button className="button small" disabled={busy||!s.term.trim()} onClick={()=>void accept([s])}><Check size={13}/> {tt('Toevoegen')}</button><button className="iconbtn danger" title={tt('Afwijzen')} onClick={()=>void reject(s)}><X size={14}/></button></td></tr>)}</tbody></table>
  :<p className="muted small-print">{tt('Geen voorstellen. Getypte tekst op het canvas wordt herkend; handgeschreven tekst op het bord niet, omdat die niet betrouwbaar te lezen is.')}</p>}
 </section>
}

export function VocabManager({studentId,viewer}:{studentId:string;viewer:'teacher'|'student'}){
 const [items,setItems]=useState<VocabItem[]|null>(null);const [err,setErr]=useState('');const [q,setQ]=useState('');const [filter,setFilter]=useState<'all'|VocabItem['status']>('all');
 const [term,setTerm]=useState('');const [tr,setTr]=useState('');const [ex,setEx]=useState('');
 const load=useCallback(async()=>{const r=await loadVocab(supabase()!,studentId);if(r.error)setErr(/vocab_items/.test(r.error)?tt("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):r.error);setItems(r.items)},[studentId]);
 useEffect(()=>{void load()},[load]);
 const canEdit=(v:VocabItem)=>viewer==='teacher'||v.source==='student';
 async function add(){if(!term.trim())return;const r=await addVocab(supabase()!,studentId,[{term,translation:tr,example:ex}],viewer==='teacher'?'teacher':'student');if(!r.added)setErr(tt("Dit woord staat al in de lijst."));else{setErr('');setTerm('');setTr('');setEx('')}await load()}
 async function patch(v:VocabItem,p:Partial<VocabItem>){setItems(x=>x?.map(i=>i.id===v.id?{...i,...p}:i)||null);const r=await supabase()!.from('vocab_items').update({...p,updated_at:new Date().toISOString()}).eq('id',v.id);if(r.error)setErr(r.error.message)}
 async function del(v:VocabItem){if(!confirm(tt("\"{0}\" verwijderen?", v.term)))return;await supabase()!.from('vocab_items').delete().eq('id',v.id);await load()}
 if(!items)return <div className="loader small"/>;
 const counts={new:items.filter(i=>i.status==='new').length,practicing:items.filter(i=>i.status==='practicing').length,mastered:items.filter(i=>i.status==='mastered').length};
 const shown=items.filter(i=>(filter==='all'||i.status===filter)&&(i.term+' '+i.translation+' '+i.example).toLowerCase().includes(q.toLowerCase()));
 return <div>
  {err&&<div className="notice">{err}</div>}
  {viewer==='teacher'&&<Suggestions studentId={studentId} onAdded={()=>void load()}/>}
  <div className="chipbar"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{tt("Alle ({0})", items.length)}</button>{(['new','practicing','mastered'] as const).map(s=><button key={s} aria-pressed={filter===s} onClick={()=>setFilter(s)}>{VOCAB_STATUS_LABEL[s]} ({counts[s]})</button>)}</div>
  <form className="row vocab-add" onSubmit={e=>{e.preventDefault();void add()}}><input className="field" placeholder={tt("Woord of uitdrukking")} value={term} onChange={e=>setTerm(e.target.value)}/><input className="field" placeholder={tt("Betekenis")} value={tr} onChange={e=>setTr(e.target.value)}/><input className="field grow" placeholder={tt("Voorbeeldzin (optioneel)")} value={ex} onChange={e=>setEx(e.target.value)}/><button className="button small" type="submit"><Plus size={15}/> {tt("Toevoegen")}</button></form>
  <label className="searchbox"><Search size={16}/><input placeholder={tt("Zoeken…")} value={q} onChange={e=>setQ(e.target.value)}/></label>
  {!shown.length?<p className="muted">{tt("Nog geen woorden. Woorden uit de live les, goedgekeurde AI-analyses en woorden die je hier toevoegt, komen in deze lijst.")}</p>:
  <table className="vocab"><thead><tr><th>{tt("Woord")}</th><th>{tt("Betekenis")}</th><th>{tt("Voorbeeld")}</th><th>{tt("Status")}</th><th>{tt("Les")}</th><th>{tt("Bron")}</th><th/></tr></thead><tbody>{shown.map(v=><tr key={v.id}>
   <td>{canEdit(v)?<input className="cell" value={v.term} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,term:e.target.value}:i)||null)} onBlur={e=>void patch(v,{term:e.target.value})}/>:<b>{v.term}</b>}</td>
   <td>{canEdit(v)?<input className="cell" value={v.translation} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,translation:e.target.value}:i)||null)} onBlur={e=>void patch(v,{translation:e.target.value})}/>:v.translation}</td>
   <td className="muted">{canEdit(v)?<input className="cell" value={v.example} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,example:e.target.value}:i)||null)} onBlur={e=>void patch(v,{example:e.target.value})}/>:v.example}</td>
   <td>{viewer==='teacher'?<select className="cell" value={v.status} onChange={e=>void patch(v,{status:e.target.value as VocabItem['status']})}>{(['new','practicing','mastered'] as const).map(s=><option key={s} value={s}>{VOCAB_STATUS_LABEL[s]}</option>)}</select>:<span className={'vstat vs-'+v.status}>{VOCAB_STATUS_LABEL[v.status]}</span>}<small className="muted block">{v.correct_count}✓ {v.wrong_count}✗</small></td>
   <td className="muted small-print">{v.lesson_date?niceDate(v.lesson_date):niceDate(v.created_at)}{v.pos?<small className="block">{(posIcon(v.pos)+' '+v.pos).trim()}</small>:null}</td>
   <td><span className="tag">{v.source==='lesson'?tt("les"):v.source==='ai'?tt("AI · goedgekeurd"):v.source==='canvas'?tt("canvas"):v.source==='student'?tt("zelf"):tt("docent")}</span>{v.difficult&&<span className="tag uncertain">{tt('moeilijk')}</span>}{viewer==='teacher'&&<button className="iconbtn" title={v.difficult?tt('Niet meer als moeilijk markeren'):tt('Markeren als moeilijk')} onClick={()=>void patch(v,{difficult:!v.difficult})}><Flag size={13}/></button>}</td>
   <td>{canEdit(v)&&<button className="iconbtn danger" title={tt("Verwijderen")} onClick={()=>void del(v)}><Trash2 size={14}/></button>}</td></tr>)}</tbody></table>}
 </div>
}

/* ========================= Games ========================= */
type GameKind='flashcards'|'quiz'|'typing'|'match'|'sentence'|'conjugate'|'errors';
type TypeItem={id?:string;prompt:string;hint?:string;answers:string[]};
async function saveSession(studentId:string,kind:string,score:number,total:number,started:number,details:unknown,assignmentId?:string|null){
 const db=supabase()!;const {data:{user}}=await db.auth.getUser();if(!user)return;
 await db.from('practice_sessions').insert({student_id:studentId,user_id:user.id,kind,score,total,duration_seconds:Math.round((Date.now()-started)/1000),details,assignment_id:assignmentId||null});
}
const record=(id:string,ok:boolean)=>supabase()!.rpc('record_vocab_practice',{item:id,correct:ok});

export function VocabGames({studentId,subject,start}:{studentId:string;subject?:string;start?:string|null}){
 const [items,setItems]=useState<VocabItem[]|null>(null);const [game,setGame]=useState<GameKind|null>(null);
 // v38: "Flashcards oefenen" on the dashboard opens the game directly (once, only with enough words)
 const autoStarted=useRef(false);
 useEffect(()=>{if(start==='flashcards'&&items&&items.length>=2&&!autoStarted.current){autoStarted.current=true;setGame('flashcards')}},[start,items]);const [result,setResult]=useState<string>('');const [corr,setCorr]=useState<TypeItem[]>([]);
 const load=useCallback(async()=>{const r=await loadVocab(supabase()!,studentId);setItems(practiceOrder(r.items.filter(i=>i.translation)));
  const s=await supabase()!.rpc('student_lesson_summaries',{sid:studentId});const list=((s.data||[]) as {final:{corrections?:{original:string;corrected:string;explanation:string;certainty?:string}[]}}[]).flatMap(x=>x.final?.corrections||[]).filter(c=>c.original&&c.corrected&&c.certainty!=='uncertain');setCorr(list.slice(0,12).map(c=>({prompt:c.original,hint:c.explanation,answers:[c.corrected]})))},[studentId]);
 useEffect(()=>{void load()},[load]);
 if(!items)return <div className="loader small"/>;
 const sentences:TypeItem[]=items.flatMap((v):TypeItem[]=>{const b=v.example?blankSentence(v.example,v.term):null;return b?[{id:v.id,prompt:b,hint:v.translation,answers:[v.term]}]:[]}).slice(0,10);
 const drills:TypeItem[]=subject&&hasDrills(subject)?drillSet(subject,10,Date.now()%100000).map(d=>({prompt:` · `,hint:` — `,answers:d.answers})):[];
 if(items.length<2&&!corr.length&&!drills.length)return <p className="muted">{tt("Je hebt minstens 2 woorden met een betekenis nodig om te oefenen. Woorden uit je lessen verschijnen automatisch; je kunt ze ook zelf toevoegen bij Woordenschat.")}</p>;
 const deck=items.slice(0,12);
 const done=(label:string)=>{setResult(label);setGame(null);void load()};
 if(game==='flashcards')return <Flashcards deck={deck} studentId={studentId} onDone={done}/>;
 if(game==='quiz')return <Quiz deck={deck} pool={items} studentId={studentId} onDone={done}/>;
 if(game==='typing')return <Typing deck={deck} studentId={studentId} onDone={done}/>;
 if(game==='match')return <Match deck={deck.slice(0,6)} studentId={studentId} onDone={done}/>;
 if(game==='sentence')return <TypeGame title={tt("Zinnen aanvullen")} kind="sentence" items={sentences} studentId={studentId} onDone={done}/>;
 if(game==='conjugate')return <TypeGame title={tt("Werkwoorden vervoegen")} kind="conjugate" items={drills} studentId={studentId} onDone={done}/>;
 if(game==='errors')return <TypeGame title={tt("Fouten verbeteren")} kind="errors" items={corr} studentId={studentId} onDone={done} long/>;
 const due=items.filter(i=>new Date(i.due_at).getTime()<=Date.now()).length;
 return <div>
  {result&&<div className="game-result"><Trophy size={18}/> {result}</div>}
  <p className="muted">{tt("{0} woorden staan klaar om te herhalen.", due)} <InfoTip text={tt("Moeilijke woorden komen vaker terug (gespreide herhaling); na 5 keer achter elkaar goed is een woord “beheerst”.")}/></p>
  <div className="game-grid">
   <button className="game-tile" disabled={items.length<2} onClick={()=>setGame('flashcards')}><Layers size={24}/><b>{tt("Flashcards")}</b><small>{tt("Omdraaien en zelf beoordelen")}</small></button>
   <button className="game-tile" disabled={items.length<4} onClick={()=>setGame('quiz')}><ListChecks size={24}/><b>{tt("Meerkeuzequiz")}</b><small>{items.length<4?tt("Minstens 4 woorden nodig"):tt("Kies de juiste vertaling")}</small></button>
   <button className="game-tile" disabled={items.length<2} onClick={()=>setGame('typing')}><Keyboard size={24}/><b>{tt("Vertaalspel")}</b><small>{tt("Schrijf het woord bij de betekenis")}</small></button>
   <button className="game-tile" disabled={items.length<3} onClick={()=>setGame('match')}><Puzzle size={24}/><b>{tt("Woorden koppelen")}</b><small>{tt("Verbind woord en betekenis")}</small></button>
   <button className="game-tile" disabled={!sentences.length} onClick={()=>setGame('sentence')}><PenLine size={24}/><b>{tt("Zinnen aanvullen")}</b><small>{sentences.length?tt("Vul het ontbrekende woord in"):tt("Nodig: woorden met voorbeeldzin")}</small></button>
   <button className="game-tile" disabled={!drills.length} onClick={()=>setGame('conjugate')}><Repeat size={24}/><b>{tt("Werkwoorden vervoegen")}</b><small>{drills.length?tt("Presens en verleden tijden"):tt("Beschikbaar voor Nederlands en Portugees")}</small></button>
   <button className="game-tile" disabled={!corr.length} onClick={()=>setGame('errors')}><Wrench size={24}/><b>{tt("Fouten verbeteren")}</b><small>{corr.length?tt("Je eigen fouten uit goedgekeurde lesanalyses"):tt("Nog geen goedgekeurde correcties")}</small></button>
  </div>
 </div>
}

function GameShell({title,i,n,onQuit,children}:{title:string;i:number;n:number;onQuit:()=>void;children:React.ReactNode}){
 return <div className="game"><div className="row between"><b>{title}</b><div className="row"><span className="muted">{Math.min(i+1,n)} / {n}</span><button className="iconbtn" title={tt("Stoppen")} onClick={onQuit}><X size={16}/></button></div></div><div className="game-progress"><span style={{width:`${(i/n)*100}%`}}/></div>{children}</div>
}

function Flashcards({deck,studentId,onDone}:{deck:VocabItem[];studentId:string;onDone:(s:string)=>void}){
 const [i,setI]=useState(0);const [flip,setFlip]=useState(false);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);
 async function answer(ok:boolean){const v=deck[i];void record(v.id,ok);if(ok)score.current++;else wrong.current.push(v.term);setFlip(false);
  if(i+1>=deck.length){await saveSession(studentId,'flashcards',score.current,deck.length,started.current,{wrong:wrong.current});onDone(`Flashcards: ${score.current} van ${deck.length} gekend`)}else setI(i+1)}
 const v=deck[i];
 return <GameShell title={tt("Flashcards")} i={i} n={deck.length} onQuit={()=>onDone('')}>
  <button className={'flipcard'+(flip?' flipped':'')} onClick={()=>setFlip(!flip)} aria-live="polite"><span className="face front"><strong>{v.term}</strong><small><Eye size={14}/> {tt("tik om om te draaien")}</small></span><span className="face back"><strong>{v.translation}</strong>{v.example&&<small>{v.example}</small>}</span></button>
  <div className="row center"><button className="button secondary" onClick={()=>void answer(false)}><RotateCcw size={15}/> {tt("Nog oefenen")}</button><button className="button" onClick={()=>void answer(true)}><Check size={15}/> {tt("Ken ik")}</button></div>
 </GameShell>
}

function Quiz({deck,pool,studentId,onDone}:{deck:VocabItem[];pool:VocabItem[];studentId:string;onDone:(s:string)=>void}){
 const [i,setI]=useState(0);const [picked,setPicked]=useState<string|null>(null);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);
 const v=deck[i];const opts=useMemo(()=>mcOptions(v.translation,pool.map(p=>p.translation),i*31+v.term.length),[v,pool,i]);
 function pick(o:string){if(picked)return;setPicked(o);const ok=o===v.translation;void record(v.id,ok);if(ok)score.current++;else wrong.current.push(v.term)}
 async function next(){setPicked(null);if(i+1>=deck.length){await saveSession(studentId,'quiz',score.current,deck.length,started.current,{wrong:wrong.current});onDone(`Quiz: ${score.current} van ${deck.length} goed`)}else setI(i+1)}
 return <GameShell title={tt("Meerkeuzequiz")} i={i} n={deck.length} onQuit={()=>onDone('')}>
  <div className="quiz-q"><small className="muted">{tt("Wat betekent")}</small><strong>{v.term}</strong></div>
  <div className="quiz-opts">{opts.map(o=><button key={o} className={'quiz-opt'+(picked?o===v.translation?' right':o===picked?' wrong':'':'')} onClick={()=>pick(o)}>{o}</button>)}</div>
  {picked&&<div className="row center"><button className="button" onClick={()=>void next()}>{tt("Volgende")}</button></div>}
 </GameShell>
}

function Typing({deck,studentId,onDone}:{deck:VocabItem[];studentId:string;onDone:(s:string)=>void}){
 const [i,setI]=useState(0);const [val,setVal]=useState('');const [res,setRes]=useState<null|'correct'|'accent'|'wrong'>(null);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);const inp=useRef<HTMLInputElement>(null);
 const v=deck[i];
 async function submit(e:React.FormEvent){e.preventDefault();if(res){setRes(null);setVal('');if(i+1>=deck.length){await saveSession(studentId,'typing',score.current,deck.length,started.current,{wrong:wrong.current});onDone(`Typen: ${score.current} van ${deck.length} goed`)}else{setI(i+1);setTimeout(()=>inp.current?.focus(),0)}return}
  const r=checkText(val,[v.term]);setRes(r);const ok=r!=='wrong';void record(v.id,ok);if(ok)score.current++;else wrong.current.push(v.term)}
 return <GameShell title={tt("Typ het woord")} i={i} n={deck.length} onQuit={()=>onDone('')}>
  <form className="drill-card" onSubmit={e=>void submit(e)}><div className="drill-q"><small className="muted">{tt("Schrijf in de doeltaal")}</small><strong>{v.translation}</strong>{v.example&&res&&<small className="muted">{v.example}</small>}</div>
   <div className="row"><input ref={inp} autoFocus className="field grow" autoComplete="off" autoCapitalize="off" spellCheck={false} value={val} readOnly={!!res} onChange={e=>setVal(e.target.value)}/><button className="button" type="submit">{res?tt("Volgende"):tt("Controleer")}</button></div>
   {res&&<p className={'drill-result '+res}>{res==='correct'?<><Check size={16}/> {tt("Goed!")}</>:res==='accent'?<><Check size={16}/> {tt("Bijna: let op de accenten →")} <b>{v.term}</b></>:<><X size={16}/> {tt("Juist is:")} <b>{v.term}</b></>}</p>}</form>
 </GameShell>
}

function TypeGame({title,kind,items,studentId,onDone,long}:{title:string;kind:string;items:TypeItem[];studentId:string;onDone:(s:string)=>void;long?:boolean}){
 const [i,setI]=useState(0);const [val,setVal]=useState('');const [res,setRes]=useState<null|'correct'|'accent'|'wrong'>(null);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);const inp=useRef<HTMLInputElement&HTMLTextAreaElement>(null);
 const it=items[i];
 async function submit(e:React.FormEvent){e.preventDefault();if(res){setRes(null);setVal('');if(i+1>=items.length){await saveSession(studentId,kind,score.current,items.length,started.current,{wrong:wrong.current});onDone(`${title}: ${score.current} van ${items.length} goed`)}else{setI(i+1);setTimeout(()=>inp.current?.focus(),0)}return}
  const r=checkText(val,it.answers);setRes(r);const ok=r!=='wrong';if(it.id)void record(it.id,ok);if(ok)score.current++;else wrong.current.push(it.answers[0])}
 return <GameShell title={title} i={i} n={items.length} onQuit={()=>onDone('')}>
  <form className="drill-card" onSubmit={e=>void submit(e)}><div className="drill-q"><small className="muted">{it.hint}</small><strong className={long?'long':''}>{it.prompt}</strong></div>
   <div className="row">{long?<textarea ref={inp} autoFocus className="field grow" rows={2} spellCheck={false} value={val} readOnly={!!res} onChange={e=>setVal(e.target.value)} placeholder={tt("Schrijf de verbeterde zin…")}/>:<input ref={inp} autoFocus className="field grow" autoComplete="off" autoCapitalize="off" spellCheck={false} value={val} readOnly={!!res} onChange={e=>setVal(e.target.value)}/>}<button className="button" type="submit">{res?tt("Volgende"):tt("Controleer")}</button></div>
   {res&&<p className={'drill-result '+res}>{res==='correct'?<><Check size={16}/> {tt("Top!")}</>:res==='accent'?<><Check size={16}/> {tt("Bijna: let op de accenten →")} <b>{it.answers[0]}</b></>:<><X size={16}/> {tt("Juist is:")} <b>{it.answers[0]}</b></>}</p>}</form>
 </GameShell>
}

function Match({deck,studentId,onDone}:{deck:VocabItem[];studentId:string;onDone:(s:string)=>void}){
 const right=useMemo(()=>mcOptions(deck[0].translation,deck.map(d=>d.translation),deck.length).concat(deck.map(d=>d.translation)).filter((x,i,a)=>a.indexOf(x)===i),[deck]);
 const [sel,setSel]=useState<string|null>(null);const [matched,setMatched]=useState<string[]>([]);const [flash,setFlash]=useState('');const mistakes=useRef(0);const started=useRef(Date.now());
 function pickRight(t:string){if(!sel)return;const v=deck.find(d=>d.id===sel)!;const ok=v.translation===t;void record(v.id,ok);if(ok){const m=[...matched,v.id];setMatched(m);setSel(null);if(m.length===deck.length){void saveSession(studentId,'match',Math.max(0,deck.length-mistakes.current),deck.length,started.current,{mistakes:mistakes.current}).then(()=>onDone(`Matchspel klaar met ${mistakes.current} fout${mistakes.current===1?'':'en'}`))}}else{mistakes.current++;setFlash(t);setTimeout(()=>setFlash(''),500)}}
 return <GameShell title={tt("Matchspel")} i={matched.length} n={deck.length} onQuit={()=>onDone('')}>
  <div className="match"><div>{deck.map(d=><button key={d.id} disabled={matched.includes(d.id)} className={'match-item'+(sel===d.id?' sel':'')+(matched.includes(d.id)?' done':'')} onClick={()=>setSel(d.id)}>{d.term}</button>)}</div>
   <div>{right.map(t=><button key={t} disabled={deck.filter(d=>matched.includes(d.id)).some(d=>d.translation===t)} className={'match-item'+(flash===t?' wrong':'')+(deck.filter(d=>matched.includes(d.id)).some(d=>d.translation===t)?' done':'')} onClick={()=>pickRight(t)}>{t}</button>)}</div></div>
  <p className="muted center">{tt("Kies links een woord en daarna rechts de betekenis.")}</p>
 </GameShell>
}

/* ========================= Exercises (AI) ========================= */
export type ExerciseItem={type:'multiple_choice'|'fill_in'|'translate'|'conjugate'|'correct_error'|'make_sentence'|'write'|'reading';prompt:string;passage:string;options:string[];answer:string;accept:string[];explanation:string};
export type ExerciseSet={title:string;items:ExerciseItem[]};
const KIND_LABELS:Record<string,string>=translated({woordenschat:'Woordenschat',grammatica:'Grammatica',vertalen:'Vertalen',invullen:'Invulzinnen',meerkeuze:'Meerkeuze',werkwoorden:'Werkwoorden vervoegen',fouten:'Fouten verbeteren',zinnen:'Zinnen maken',schrijven:'Schrijven',lezen:'Begrijpend lezen',gemengd:'Gemengde herhaling'});

/* v40: one compact card. "Vanuit mijn les" (default) = one chosen lesson with its approved summary, errors, words,
   notes and the teacher's confirmed lesson topics. "Zelf kiezen" = exercise types (multi-select), level, duration, topic.
   AI is only called on the button; the same choices give the same set again this session (no second AI call),
   "Opnieuw genereren" asks for a new one. A second click while busy is ignored. */
const exCache=new Map<string,ExerciseSet>();
export function ExerciseForm({studentId,defaultLevel,onReady,teacher}:{studentId:string;defaultLevel?:string|null;onReady:(s:ExerciseSet)=>void;teacher?:boolean}){
 const [mode,setMode]=useState<'lesson'|'own'>('lesson');
 const [kinds,setKinds]=useState<string[]>(['gemengd']);const [level,setLevel]=useState<string>(defaultLevel&&LEVELS.includes(defaultLevel as typeof LEVELS[number])?defaultLevel:'A2');const [topic,setTopic]=useState('');const [minutes,setMinutes]=useState(10);
 const [lessons,setLessons]=useState<{date:string;report:boolean}[]|null>(null);const [lessonDate,setLessonDate]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [reused,setReused]=useState(false);const inFlight=useRef(false);
 useEffect(()=>{let c=false;const db=supabase()!;void Promise.all([db.from('lesson_entries').select('lesson_date').eq('student_id',studentId).order('lesson_date',{ascending:false}).limit(30),db.rpc('student_lesson_summaries',{sid:studentId})]).then(([l,s])=>{if(c)return;
  const rep=new Set(((s.data||[]) as {lesson_date:string}[]).map(x=>x.lesson_date));const dates=Array.from(new Set([...rep,...((l.data||[]) as {lesson_date:string}[]).map(x=>x.lesson_date)])).sort().reverse().slice(0,30);
  setLessons(dates.map(d=>({date:d,report:rep.has(d)})));setLessonDate(d=>d||dates[0]||'')});return()=>{c=true}},[studentId]);
 const params=mode==='lesson'?{source:'lesson',kinds:['gemengd'],lessonDate:lessonDate||undefined,level,minutes}:{source:'own',kinds,level,minutes,topic:topic.trim()};
 const key=studentId+'|'+JSON.stringify(params);
 async function go(force=false){if(inFlight.current)return;setErr('');setReused(false);
  if(!force&&exCache.has(key)){setReused(true);onReady(exCache.get(key)!);return}
  inFlight.current=true;setBusy(true);try{const r=await authedPost<ExerciseSet>(supabase()!,'/api/ai/exercises',{studentId,...params});exCache.set(key,r);onReady(r)}catch(e){setErr(e instanceof Error?e.message:String(e))}inFlight.current=false;setBusy(false)}
 const kindOpts=Object.entries(KIND_LABELS).map(([k,l])=>({value:k,label:l}));
 return <div className="hw-card">
  <div className="hw-head"><b><Sparkles size={16}/> {teacher?tt("Genereer huiswerk"):tt("Maak mijn huiswerk")}</b>
   <div className="seg" role="group" aria-label={tt("Bron van de oefeningen")}><button type="button" aria-pressed={mode==='lesson'} onClick={()=>setMode('lesson')}>📚 {tt("Vanuit mijn les")}</button><button type="button" aria-pressed={mode==='own'} onClick={()=>setMode('own')}>✏️ {tt("Zelf kiezen")}</button></div></div>
  <div className="hw-row">
   {mode==='lesson'?(lessons&&!lessons.length?<span className="muted small">{tt("Nog geen lessen opgeslagen.")}</span>:
    <Select<string> label={tt("Les")} value={lessonDate||null} placeholder={tt("Les kiezen…")} onChange={setLessonDate} icon={<CalendarDays size={15}/>}
     options={(lessons||[]).map(x=>({value:x.date,label:niceDate(x.date),hint:x.report?tt("met lesverslag"):tt("alleen notities")}))}/>)
    :<Select<string> label={tt("Oefentypes")} value={null} placeholder={tt("Oefentypes kiezen…")} options={kindOpts} onChange={()=>{}} icon={<ListChecks size={15}/>}
      multi={{values:kinds,onToggle:k=>setKinds(x=>x.includes(k)?x.filter(y=>y!==k):[...x,k])}}/>}
   <Select<string> size="sm" label={tt("Niveau")} value={level} onChange={setLevel} options={LEVELS.map(l=>({value:l,label:l}))}/>
   <Select<number> size="sm" label={tt("Duur")} value={minutes} onChange={setMinutes} icon={<Clock3 size={14}/>} options={[5,10,15,20,30].map(m=>({value:m,label:`${m} ${tt("min")}`}))}/>
  </div>
  {mode==='own'&&<input className="field compact" placeholder={tt("Onderwerp (optioneel), bijv. pretérito perfeito")} value={topic} onChange={e=>setTopic(e.target.value)} aria-label={tt("Onderwerp (optioneel)")}/>}
  <div className="hw-actions"><button className="button" disabled={busy||(mode==='own'&&!kinds.length)||(mode==='lesson'&&lessons!==null&&!lessons.length)} onClick={()=>void go()}><Sparkles size={15}/> {busy?tt("Oefeningen maken…"):tt("Genereer oefeningen")}</button>
   {reused&&<button type="button" className="textlink" onClick={()=>void go(true)}>{tt("Opnieuw genereren")}</button>}
   <InfoTip text={mode==='lesson'?tt("Gebaseerd op de gekozen les: goedgekeurd lesverslag, fouten, woorden, lesnotities en door de docent bevestigde lesonderwerpen. Door AI gemaakt."):tt("Gebaseerd op jouw woordenlijst, recente lesnotities en behandelde leerdoelen. Door AI gemaakt; controleer bij twijfel met je docent.")}/></div>
  {reused&&<p className="muted small">{tt("Dezelfde keuzes als eerder: je ziet dezelfde oefeningen (geen nieuwe AI-aanvraag).")}</p>}
  {err&&<p className="notice">{err}</p>}
 </div>
}

/** Interactive player with feedback; stores the result as a practice session. */
export function ExercisePlayer({set,studentId,kind='exercise',assignmentId,onFinish}:{set:ExerciseSet;studentId:string;kind?:'exercise'|'homework';assignmentId?:string|null;onFinish:(score:number,total:number,answers:string[])=>void}){
 const [answers,setAnswers]=useState<string[]>(set.items.map(()=>''));const [checked,setChecked]=useState(false);const started=useRef(Date.now());
 const auto=(it:ExerciseItem)=>it.type!=='write'&&it.type!=='make_sentence';
 const results=set.items.map((it,i)=>auto(it)?checkText(answers[i],[it.answer,...(it.accept||[])]):null);
 const score=results.filter(r=>r==='correct'||r==='accent').length,total=set.items.filter(auto).length;
 async function check(){setChecked(true);await saveSession(studentId,kind,score,total,started.current,{title:set.title,items:set.items.map((it,i)=>({prompt:it.prompt,given:answers[i],answer:it.answer,result:results[i]}))},assignmentId);onFinish(score,total,answers)}
 return <div className="exercise-player"><h3>{set.title}</h3>
  {set.items.map((it,i)=><div key={i} className={'ex-item'+(checked&&results[i]?' r-'+results[i]:'')}>
   <div className="ex-num">{i+1}</div><div className="grow">
    {it.passage&&<blockquote className="passage">{it.passage}</blockquote>}
    <p className="ex-prompt">{it.prompt}</p>
    {it.type==='multiple_choice'&&it.options.length?<div className="quiz-opts small">{it.options.map(o=><button key={o} disabled={checked} className={'quiz-opt'+(answers[i]===o?' chosen':'')+(checked&&o===it.answer?' right':'')} onClick={()=>setAnswers(a=>a.map((x,j)=>j===i?o:x))}>{o}</button>)}</div>
     :(it.type==='write'||it.type==='make_sentence'||it.type==='correct_error')?<textarea className="field" rows={3} disabled={checked} value={answers[i]} onChange={e=>setAnswers(a=>a.map((x,j)=>j===i?e.target.value:x))}/>
     :<input className="field" disabled={checked} value={answers[i]} onChange={e=>setAnswers(a=>a.map((x,j)=>j===i?e.target.value:x))}/>}
    {checked&&<p className="ex-feedback">{results[i]==='correct'?tt("✓ Goed"):results[i]==='accent'?tt("≈ Bijna (accenten)"):results[i]==='wrong'?<>{tt("✗ Juist:")} <b>{it.answer}</b></>:<>{tt("Voorbeeldantwoord:")} <i>{it.answer}</i></>}{it.explanation&&<small className="block">{it.explanation}</small>}</p>}
   </div></div>)}
  {!checked?<button className="button" onClick={()=>void check()}><Check size={16}/> {tt("Nakijken")}</button>:<div className="game-result"><Trophy size={18}/> {tt("{0} van {1} automatisch nagekeken vragen goed", score, total)}{set.items.length>total?tt(" · {0} schrijfopdracht(en) met voorbeeldantwoord", set.items.length-total):''}</div>}
 </div>
}

export function SelfPractice({studentId,level}:{studentId:string;level?:string|null}){
 const [set,setSet]=useState<ExerciseSet|null>(null);
 return set?<div><ExercisePlayer set={set} studentId={studentId} onFinish={()=>{}}/><button className="button secondary" onClick={()=>setSet(null)}><Shuffle size={15}/> {tt("Nieuwe oefeningen")}</button></div>:<ExerciseForm studentId={studentId} defaultLevel={level} onReady={setSet}/>
}
