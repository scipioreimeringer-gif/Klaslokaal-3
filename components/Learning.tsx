'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Trash2,Search,Check,X,RotateCcw,Shuffle,Eye,Sparkles,Layers,ListChecks,Keyboard,Puzzle,Trophy,Target} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {addVocab,authedPost,loadVocab,GOAL_STATUS_LABEL,LEVELS,SKILLS,SUBJECTS,VOCAB_STATUS_LABEL,subjectOf,type Goal,type GoalProgress,type GoalStatus,type VocabItem} from '../lib/learning';
import {checkText,mcOptions,practiceOrder} from '../lib/answers';
import {blankSentence,drillSet,hasDrills} from '../lib/conjugation';
import {PenLine,Repeat,Wrench} from 'lucide-react';
import {t as tt, translated} from '../lib/i18n';

/* ========================= Vocabulary ========================= */
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
  <div className="chipbar"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{tt("Alle ({0})", items.length)}</button>{(['new','practicing','mastered'] as const).map(s=><button key={s} aria-pressed={filter===s} onClick={()=>setFilter(s)}>{VOCAB_STATUS_LABEL[s]} ({counts[s]})</button>)}</div>
  <form className="row vocab-add" onSubmit={e=>{e.preventDefault();void add()}}><input className="field" placeholder={tt("Woord of uitdrukking")} value={term} onChange={e=>setTerm(e.target.value)}/><input className="field" placeholder={tt("Betekenis")} value={tr} onChange={e=>setTr(e.target.value)}/><input className="field grow" placeholder={tt("Voorbeeldzin (optioneel)")} value={ex} onChange={e=>setEx(e.target.value)}/><button className="button small" type="submit"><Plus size={15}/> {tt("Toevoegen")}</button></form>
  <label className="searchbox"><Search size={16}/><input placeholder={tt("Zoeken…")} value={q} onChange={e=>setQ(e.target.value)}/></label>
  {!shown.length?<p className="muted">{tt("Nog geen woorden. Woorden uit de live les, goedgekeurde AI-analyses en woorden die je hier toevoegt, komen in deze lijst.")}</p>:
  <table className="vocab"><thead><tr><th>{tt("Woord")}</th><th>{tt("Betekenis")}</th><th>{tt("Voorbeeld")}</th><th>{tt("Status")}</th><th>{tt("Bron")}</th><th/></tr></thead><tbody>{shown.map(v=><tr key={v.id}>
   <td>{canEdit(v)?<input className="cell" value={v.term} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,term:e.target.value}:i)||null)} onBlur={e=>void patch(v,{term:e.target.value})}/>:<b>{v.term}</b>}</td>
   <td>{canEdit(v)?<input className="cell" value={v.translation} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,translation:e.target.value}:i)||null)} onBlur={e=>void patch(v,{translation:e.target.value})}/>:v.translation}</td>
   <td className="muted">{canEdit(v)?<input className="cell" value={v.example} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,example:e.target.value}:i)||null)} onBlur={e=>void patch(v,{example:e.target.value})}/>:v.example}</td>
   <td>{viewer==='teacher'?<select className="cell" value={v.status} onChange={e=>void patch(v,{status:e.target.value as VocabItem['status']})}>{(['new','practicing','mastered'] as const).map(s=><option key={s} value={s}>{VOCAB_STATUS_LABEL[s]}</option>)}</select>:<span className={'vstat vs-'+v.status}>{VOCAB_STATUS_LABEL[v.status]}</span>}<small className="muted block">{v.correct_count}✓ {v.wrong_count}✗</small></td>
   <td><span className="tag">{v.source==='lesson'?tt("les"):v.source==='ai'?tt("AI · goedgekeurd"):v.source==='student'?tt("zelf"):tt("docent")}</span></td>
   <td>{canEdit(v)&&<button className="iconbtn danger" title={tt("Verwijderen")} onClick={()=>void del(v)}><Trash2 size={14}/></button>}</td></tr>)}</tbody></table>}
 </div>
}

/* ========================= Learning goals ========================= */
export function GoalsPanel({student,viewer}:{student:{id:string;subject:string;level:string|null;lesson_language:string|null;curriculum_subject?:string|null};viewer:'teacher'|'student'}){
 const [subject,setSubject]=useState(subjectOf(student));const [goals,setGoals]=useState<Goal[]>([]);const [prog,setProg]=useState<Record<string,GoalProgress>>({});const [err,setErr]=useState('');const [level,setLevel]=useState<string>(student.level&&LEVELS.includes(student.level as typeof LEVELS[number])?student.level:'all');
 const [nt,setNt]=useState({title:'',level:'A1',skill:'grammatica'});
 const load=useCallback(async()=>{const db=supabase()!;const [g,p]=await Promise.all([db.from('curriculum_goals').select('*').eq('subject',subject).order('sort'),db.from('student_goal_progress').select('*').eq('student_id',student.id)]);
  if(g.error){setErr(/curriculum_goals/.test(g.error.message)||g.error.code==='PGRST205'?tt("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):g.error.message);return}
  setGoals((g.data||[]) as Goal[]);setProg(Object.fromEntries(((p.data||[]) as GoalProgress[]).map(x=>[x.goal_id,x])))},[subject,student.id]);
 useEffect(()=>{void load()},[load]);
 async function setStatus(goal:Goal,status:GoalStatus){const row={student_id:student.id,goal_id:goal.id,status,basis:'teacher' as const,updated_at:new Date().toISOString()};setProg(p=>({...p,[goal.id]:{...(p[goal.id]||{note:'',lesson_date:null}),...row}}));const r=await supabase()!.from('student_goal_progress').upsert(row,{onConflict:'student_id,goal_id'});if(r.error)setErr(r.error.message)}
 async function addGoal(){if(!nt.title.trim())return;const {data:{user}}=await supabase()!.auth.getUser();const r=await supabase()!.from('curriculum_goals').insert({subject,level:nt.level,skill:nt.skill,title:nt.title.trim(),owner_teacher:user!.id,sort:999});if(r.error)setErr(r.error.message);else{setNt({...nt,title:''});await load()}}
 async function saveSubject(v:string){setSubject(v);if(viewer==='teacher')await supabase()!.from('students').update({curriculum_subject:v}).eq('id',student.id)}
 const visible=goals.filter(g=>level==='all'||g.level===level);
 const byLevel=LEVELS.map(l=>({l,items:visible.filter(g=>g.level===l)})).filter(x=>x.items.length);
 const total=goals.length,done=goals.filter(g=>['covered','mastered'].includes(prog[g.id]?.status)).length;
 return <div className="goals">
  {err&&<div className="notice">{err}</div>}
  <div className="row between"><div className="row"><label className="row"><span className="label">{tt("Leerlijn")}</span><select className="field" value={subject} onChange={e=>void saveSubject(e.target.value)}>{Object.entries(SUBJECTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="row"><span className="label">{tt("Niveau")}</span><select className="field" value={level} onChange={e=>setLevel(e.target.value)}><option value="all">{tt("Alle")}</option>{LEVELS.map(l=><option key={l}>{l}</option>)}</select></label></div>
   <span className="muted">{tt("{0} van {1} doelen behandeld of beheerst", done, total)}</span></div>
  <p className="muted small-print">{tt("Standaardleerlijn op basis van het ERK/CEFR (A0 is een optionele voorbereidende fase). Onderwerpen zijn richtpunten, niet exclusief voor één niveau. Status wordt alleen door de docent vastgesteld; AI kan voorstellen doen, maar bepaalt nooit dat iets beheerst is.")}</p>
  {byLevel.map(({l,items})=><section key={l} className="goal-level"><h4>{l}{l==='A0'&&<small className="muted"> {tt("(voorbereidend)")}</small>}</h4>
   {SKILLS.map(sk=>{const its=items.filter(g=>g.skill===sk);if(!its.length)return null;return <div key={sk} className="goal-skill"><span className="tag">{sk}</span><ul>{its.map(g=>{const p=prog[g.id];const st=p?.status||'not_started';return <li key={g.id} className={'goal st-'+st}>
    <span className="grow"><b>{g.title}</b>{g.owner_teacher&&<span className="tag own">{tt("eigen doel")}</span>}{g.description&&<small className="muted block">{g.description}</small>}{p?.basis==='ai_confirmed'&&<small className="basis">{tt("AI-voorstel, bevestigd door docent")}</small>}</span>
    {viewer==='teacher'?<select className="cell" value={st} onChange={e=>void setStatus(g,e.target.value as GoalStatus)}>{(Object.keys(GOAL_STATUS_LABEL) as GoalStatus[]).map(s=><option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}</select>:<span className={'gstat gs-'+st}>{GOAL_STATUS_LABEL[st]}</span>}</li>})}</ul></div>})}
  </section>)}
  {viewer==='teacher'&&<form className="row goal-add" onSubmit={e=>{e.preventDefault();void addGoal()}}><Target size={16}/><input className="field grow" placeholder={tt("Eigen leerdoel toevoegen, bijv. 'Telefoongesprek met de huisarts'")} value={nt.title} onChange={e=>setNt({...nt,title:e.target.value})}/><select className="field" value={nt.level} onChange={e=>setNt({...nt,level:e.target.value})}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select><select className="field" value={nt.skill} onChange={e=>setNt({...nt,skill:e.target.value})}>{SKILLS.map(s=><option key={s}>{s}</option>)}</select><button className="button small" type="submit"><Plus size={15}/> {tt("Toevoegen")}</button></form>}
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

export function VocabGames({studentId,subject}:{studentId:string;subject?:string}){
 const [items,setItems]=useState<VocabItem[]|null>(null);const [game,setGame]=useState<GameKind|null>(null);const [result,setResult]=useState<string>('');const [corr,setCorr]=useState<TypeItem[]>([]);
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
  <p className="muted">{tt("{0} woorden staan klaar om te herhalen. Moeilijke woorden komen vaker terug (gespreide herhaling); na 5 keer achter elkaar goed is een woord “beheerst”.", due)}</p>
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

export function ExerciseForm({studentId,defaultLevel,onReady,teacher}:{studentId:string;defaultLevel?:string|null;onReady:(s:ExerciseSet)=>void;teacher?:boolean}){
 const [kinds,setKinds]=useState<string[]>(['gemengd']);const [level,setLevel]=useState(defaultLevel&&LEVELS.includes(defaultLevel as typeof LEVELS[number])?defaultLevel:'A2');const [topic,setTopic]=useState('');const [minutes,setMinutes]=useState(10);const [lessonDate,setLessonDate]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 async function go(){setBusy(true);setErr('');try{const r=await authedPost<ExerciseSet>(supabase()!,'/api/ai/exercises',{studentId,kinds,level,topic,minutes,lessonDate:lessonDate||undefined});onReady(r)}catch(e){setErr(e instanceof Error?e.message:String(e))}setBusy(false)}
 return <div className="exercise-form">
  <div className="chipbar">{Object.entries(KIND_LABELS).map(([k,l])=><button key={k} aria-pressed={kinds.includes(k)} onClick={()=>setKinds(x=>x.includes(k)?x.filter(y=>y!==k):[...x,k])}>{l}</button>)}</div>
  <div className="row"><label className="row"><span className="label">{tt("Niveau")}</span><select className="field" value={level} onChange={e=>setLevel(e.target.value)}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select></label>
   <label className="row"><span className="label">{tt("Duur")}</span><select className="field" value={minutes} onChange={e=>setMinutes(+e.target.value)}>{[5,10,15,20,30].map(m=><option key={m} value={m}>{m} {tt("min")}</option>)}</select></label>
   {teacher&&<label className="row"><span className="label">{tt("Uit les van")}</span><input className="field" type="date" value={lessonDate} onChange={e=>setLessonDate(e.target.value)}/></label>}
   <input className="field grow" placeholder={tt("Onderwerp (optioneel), bijv. pretérito perfeito")} value={topic} onChange={e=>setTopic(e.target.value)}/></div>
  <button className="button" disabled={busy||!kinds.length} onClick={()=>void go()}><Sparkles size={16}/> {busy?tt("Oefeningen maken…"):teacher?tt("Genereer huiswerk"):tt("Maak mijn huiswerk")}</button>
  {err&&<p className="notice">{err}</p>}
  <p className="muted small-print">{tt("Gebaseerd op jouw woordenlijst, recente lesnotities en behandelde leerdoelen. Door AI gemaakt; controleer bij twijfel met je docent.")}</p>
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
