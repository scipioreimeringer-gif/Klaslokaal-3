'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {MessageCircle,Repeat,Layers,ListChecks,Mic,Square,Shuffle,Eye,Check,X} from 'lucide-react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {StudentPortal,useMyStudentProfiles} from '../../components/StudentPortal';
import {supabase} from '../../lib/supabase';
import {allWords,type LessonEntry} from '../../lib/data';
import {CHECKLIST,PERSONS,SPEAKING,STARTER_WORDS,TENSES,VERBS,checkAnswer,conjugate,type Tense} from '../../lib/portuguese';
import {t as tt} from '../../lib/i18n';

const pick=<T,>(a:readonly T[])=>a[Math.floor(Math.random()*a.length)];

function Speaking(){
 const [theme,setTheme]=useState(0);const [done,setDone]=useState<Record<string,boolean>>({});
 return <div><div className="chipbar">{SPEAKING.map((t,i)=><button key={t.theme} aria-pressed={theme===i} onClick={()=>setTheme(i)}>{t.theme}</button>)}</div>
  <ol className="question-list">{SPEAKING[theme].questions.map(q=><li key={q} className={done[q]?'done':''}><label><input type="checkbox" checked={!!done[q]} onChange={()=>setDone(d=>({...d,[q]:!d[q]}))}/><span>{q}</span></label></li>)}</ol>
  <p className="muted">{tt("Tip: beantwoord elke vraag hardop in 3 tot 5 zinnen. Gebruik minstens één verleden tijd en één uitdrukking uit je woordenlijst.")}</p></div>
}

function Verbs(){
 const [tense,setTense]=useState<Tense>('presente');const [q,setQ]=useState(()=>({verb:'ser',person:0}));const [answer,setAnswer]=useState('');const [result,setResult]=useState<null|'correct'|'accent'|'wrong'>(null);const [score,setScore]=useState({ok:0,total:0});const input=useRef<HTMLInputElement>(null);
 const correct=conjugate(q.verb,tense)[q.person];
 function next(){setQ({verb:pick(Object.keys(VERBS)),person:Math.floor(Math.random()*4)});setAnswer('');setResult(null);setTimeout(()=>input.current?.focus(),0)}
 useEffect(()=>{next()},[tense]);// eslint-disable-line react-hooks/exhaustive-deps
 function check(e:React.FormEvent){e.preventDefault();if(result){next();return}const r=checkAnswer(answer,correct);setResult(r);setScore(s=>({ok:s.ok+(r==='correct'?1:0),total:s.total+1}))}
 return <div className="drill"><div className="chipbar">{(Object.keys(TENSES) as Tense[]).map(t=><button key={t} aria-pressed={tense===t} onClick={()=>setTense(t)}>{TENSES[t]}</button>)}<span className="score">{score.ok}/{score.total} {tt("goed")}</span></div>
  <form className="drill-card" onSubmit={check}><div className="drill-q"><span className="muted">{TENSES[tense]}</span><strong>{PERSONS[q.person]} · <em>{q.verb}</em></strong><small className="muted">{VERBS[q.verb].nl}</small></div>
   <div className="row"><input ref={input} className="field grow" autoComplete="off" autoCapitalize="off" spellCheck={false} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder={tt("Vervoeging…")} readOnly={!!result}/><button className="button" type="submit">{result?tt("Volgende"):tt("Controleer")}</button></div>
   {result&&<p className={'drill-result '+result}>{result==='correct'?<><Check size={16}/> {tt("Perfeito!")}</>:result==='accent'?<><Check size={16}/> {tt("Bijna: let op het accent →")} <b>{correct}</b></>:<><X size={16}/> {tt("Juist is:")} <b>{correct}</b></>}</p>}
  </form>
  <details className="table-details"><summary>{tt("Bekijk de volledige tabel ({0})", TENSES[tense])}</summary><table className="vocab"><thead><tr><th>{tt("Werkwoord")}</th>{PERSONS.map(p=><th key={p}>{p}</th>)}</tr></thead><tbody>{Object.keys(VERBS).map(v=><tr key={v}><td><b>{v}</b></td>{conjugate(v,tense).map((f,i)=><td key={i}>{f}</td>)}</tr>)}</tbody></table></details></div>
}

function Flashcards({words}:{words:{nl:string;uit:string}[]}){
 const deck=words.filter(w=>w.uit);const [i,setI]=useState(0);const [show,setShow]=useState(false);const [known,setKnown]=useState(0);
 if(!deck.length)return <p className="muted">{tt("Nog geen woorden met betekenis.")}</p>;
 const w=deck[i%deck.length];const go=(k:boolean)=>{if(k)setKnown(n=>n+1);setShow(false);setI(Math.floor(Math.random()*deck.length))};
 return <div className="flash"><button className="flashcard" onClick={()=>setShow(!show)} aria-live="polite"><strong>{w.nl}</strong>{show?<span>{w.uit}</span>:<small><Eye size={14}/> {tt("tik om de betekenis te zien")}</small>}</button>
  <div className="row center"><button className="button secondary" onClick={()=>go(false)}><Shuffle size={15}/> {tt("Nog oefenen")}</button><button className="button" onClick={()=>go(true)}><Check size={15}/> {tt("Ken ik")}</button></div><p className="muted center">{known} {tt("gekend ·")} {deck.length} {tt("kaarten")}</p></div>
}

function Checklist(){
 const {user}=useAuth();const [items,setItems]=useState<boolean[]>(CHECKLIST.map(()=>false));const [message,setMessage]=useState('');
 useEffect(()=>{if(!user)return;void supabase()!.from('portuguese_checklists').select('completed').eq('user_id',user.id).maybeSingle().then(({data})=>{if(Array.isArray(data?.completed))setItems(CHECKLIST.map((_,i)=>Boolean(data.completed[i])))})},[user?.id]);
 async function toggle(i:number){const next=items.map((v,j)=>j===i?!v:v);setItems(next);if(!user)return;const {error}=await supabase()!.from('portuguese_checklists').upsert({user_id:user.id,completed:next,updated_at:new Date().toISOString()});setMessage(error?tt("Opslaan mislukt: ")+error.message:tt("Voortgang opgeslagen ✓"))}
 return <div>{CHECKLIST.map(([name,detail],i)=><label key={name} className="task"><input type="checkbox" checked={items[i]} onChange={()=>void toggle(i)}/><span><strong>{i+1}. {name}</strong><small>{detail}</small></span></label>)}<p className="muted" role="status">{message||tt("{0} van {1} gedaan", items.filter(Boolean).length, CHECKLIST.length)}</p></div>
}

function PracticeRecorder(){
 const [rec,setRec]=useState<MediaRecorder|null>(null);const [url,setUrl]=useState('');const [msg,setMsg]=useState('');const chunks=useRef<Blob[]>([]);
 async function start(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});chunks.current=[];const r=new MediaRecorder(s);r.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};r.onstop=()=>{s.getTracks().forEach(t=>t.stop());if(url)URL.revokeObjectURL(url);setUrl(URL.createObjectURL(new Blob(chunks.current,{type:r.mimeType||'audio/webm'})));setRec(null)};r.start();setRec(r);setMsg('')}catch{setMsg(tt("Microfoon niet beschikbaar of geweigerd."))}}
 return <div><p className="muted">{tt("Neem jezelf op voor de spreekopdracht (60 seconden). Dit blijft alleen op dit apparaat en wordt niet opgeslagen. Lesopnames met je docent maak je in het live klaslokaal, met toestemming van beiden.")}</p>
  {!rec?<button className="button" onClick={()=>void start()}><Mic size={16}/> {tt("Start oefenopname")}</button>:<button className="button danger" onClick={()=>rec.stop()}><Square size={14}/> {tt("Stop")}</button>}{rec&&<span className="rec-dot">{tt("● opname")}</span>}
  {url&&<audio controls src={url} style={{display:'block',marginTop:12,width:'100%'}}/>}{msg&&<p className="muted">{msg}</p>}</div>
}

type Tab='spreken'|'werkwoorden'|'woorden'|'checklist'|'opname';
export default function Portuguese(){
 const {items,loaded,teacherName}=useMyStudentProfiles();
 const pt=useMemo(()=>items.find(s=>/portug|portu/i.test(s.subject||'')||s.lesson_language==='pt'),[items]);
 const [lessons,setLessons]=useState<LessonEntry[]>([]);const [tab,setTab]=useState<Tab>('spreken');
 useEffect(()=>{if(!pt)return;void supabase()!.from('lesson_entries').select('id,student_id,lesson_date,notes,homework,words,updated_at').eq('student_id',pt.id).order('lesson_date',{ascending:false}).then(({data})=>setLessons((data||[]) as LessonEntry[]))},[pt?.id]);
 const words=useMemo(()=>{const own=allWords(lessons).map(w=>({nl:w.nl,uit:w.uit}));return own.length>=5?own:own.concat(STARTER_WORDS.filter(s=>!own.some(o=>o.nl===s.nl)))},[lessons]);
 const tabs:[Tab,string,typeof Mic][]=[['spreken','Spreekvragen',MessageCircle],['werkwoorden','Werkwoorden',Repeat],['woorden','Woordenschat',Layers],['checklist','Checklist',ListChecks],['opname','Oefenopname',Mic]];
 return <Nav>
  <div className="page-head"><div><p className="eyebrow-dark">{tt("MIJN LEERLINGPROFIEL")}</p><h1>{tt("🇧🇷 Portugees")}</h1><p className="muted">{tt("Bereid je volgende les voor en bekijk je eerdere Portugese lessen.")}</p></div></div>
  <section className="card prep"><h2>{tt("Lesvoorbereiding")}</h2><div className="tabs" role="tablist">{tabs.map(([k,l,Icon])=><button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k)}><Icon size={15}/>{tt(l)}</button>)}</div>
   {tab==='spreken'&&<Speaking/>}{tab==='werkwoorden'&&<Verbs/>}{tab==='woorden'&&<><p className="muted">{lessons.length?tt("Woorden uit je eigen lessen"):tt("Startlijst")}{lessons.length&&allWords(lessons).length<5?tt(", aangevuld met een startlijst"):''}.</p><Flashcards words={words}/></>}{tab==='checklist'&&<Checklist/>}{tab==='opname'&&<PracticeRecorder/>}
  </section>
  <h2 className="section-title">{tt("Mijn Portugese lessen")}</h2>
  {!loaded?<div className="loader small"/>:pt?<StudentPortal profile={pt} teacherName={teacherName(pt.id)}/>:<section className="card"><h3>{tt("Nog geen Portugese lessen gekoppeld")}</h3><p>{tt("Je Portugese docent logt in met haar eigen TeachyRooms-account (en vraagt daar een docentprofiel aan). Daarna voegt zij je toe als leerling met jouw e-mailadres en als vak bijvoorbeeld Portugees. Zodra je inlogt, zie je een uitnodiging om te accepteren. Je gebruikt hiervoor hetzelfde account als voor je docentprofiel.")}</p>{items.length>0&&<p className="muted">{tt("Je hebt wel andere leerlingprofielen: {0}. Zie “Mijn lessen”.", items.map(i=>i.subject||i.name).join(', '))}</p>}</section>}
 </Nav>
}
