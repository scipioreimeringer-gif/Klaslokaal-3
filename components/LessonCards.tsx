'use client';
// v43/v44: "Lessen" is the central place — every registered lesson as a card; a card opens the lesson's own page
// with (in this order) mistakes, grammar points, the word list of this lesson, deeper look, summary and assignments,
// plus lesson notes and the homework of this lesson. A lesson without an AI report is shown too. No AI is called here.
import {useEffect,useMemo,useState} from 'react';
import {CalendarCheck,Clock3,AlertCircle,Languages,Sparkles,Mic,ChevronRight,ArrowLeft,NotebookPen,ClipboardList,PencilLine} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t} from '../lib/i18n';
import {niceDate,type LessonEntry,type Recording} from '../lib/data';
import {languageName} from '../lib/languages';
import {Flag} from './Flag';
import {lessonCards,type CardAnalysis,type LessonCard} from '../lib/lessonCards';
import type {SessionLike} from '../lib/stats';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import {LessonReport,LessonWords,type LessonWord} from './LessonReport';
import {TeacherAnalyses} from './Analysis';

/** v56: the processing state of a lesson's recording (student_analysis_status; no content), for teacher AND student */
export type RecState={recording_id:string;lesson_id:string|null;lesson_date:string;state:'no_consent'|'queued'|'transcribing'|'analysing'|'available'|'failed'|'hidden';updated_at:string};
const PENDING=new Set(['queued','transcribing','analysing']);
export function stateOf(c:LessonCard,states:RecState[]):RecState|null{return states.find(s=>(c.lessonId&&s.lesson_id===c.lessonId))||states.find(s=>s.lesson_date===c.date)||null}
const STATE_TEXT:Record<RecState['state'],string>={no_consent:'Geen toestemming voor AI-verslag',queued:'Opname verwerken',transcribing:'Transcriptie maken',analysing:'AI-verslag genereren',available:'Verslag beschikbaar',failed:'Verwerking mislukt',hidden:'Verslag verborgen door je docent'};
function statusText(c:LessonCard,viewer:'teacher'|'student',st?:RecState|null){
 if(c.status==='approved')return t('Verslag beschikbaar');
 if(viewer==='teacher'&&c.status==='ready')return st?.state==='hidden'?t('Verborgen voor de leerling'):t('Concept · wordt automatisch gepubliceerd');
 if(st&&st.state!=='available'&&!(viewer==='student'&&st.state==='hidden'))return t(STATE_TEXT[st.state]);
 if(viewer==='teacher'&&(c.status==='processing'||c.status==='queued'))return t('AI-verslag genereren');
 if(viewer==='teacher'&&c.status==='failed')return t('Verwerking mislukt');
 return t('AI-verslag nog niet beschikbaar');
}
const isV2=(f:unknown)=>!!f&&typeof f==='object'&&(f as {version?:number}).version===2;

type Props={studentId:string;viewer:'teacher'|'student';entries:LessonEntry[];sessions:SessionLike[]|null;recordings:Recording[];lang:string;level?:string|null};

/** Loads the reports (teacher: all own analyses; student: only published ones via the existing RPC) and builds the cards.
 *  v56: also the processing state per recording; while something is being processed it is checked every 20 s and a
 *  report that became available appears without reloading the page. */
export function useLessonCards({studentId,viewer,entries,sessions,recordings}:Omit<Props,'lang'|'level'>){
 const [analyses,setAnalyses]=useState<CardAnalysis[]|null>(null);const [states,setStates]=useState<RecState[]>([]);const [ver,setVer]=useState(0);
 useEffect(()=>{let off=false,timer:ReturnType<typeof setTimeout>|null=null;const db=supabase()!;let avail=-1;
  const poll=async()=>{const r=await db.rpc('student_analysis_status',{sid:studentId});if(off)return;if(r.error){setStates([]);return}
   const list=(r.data||[]) as RecState[];setStates(list);const n=list.filter(s=>s.state==='available').length;if(avail>=0&&n!==avail)setVer(v=>v+1);avail=n;
   if(list.some(s=>PENDING.has(s.state)))timer=setTimeout(()=>void poll(),20000)};
  void poll();return()=>{off=true;if(timer)clearTimeout(timer)}},[studentId]);
 useEffect(()=>{let off=false;const db=supabase()!;void(async()=>{
  const a=await (viewer==='teacher'?db.from('lesson_analyses').select('id,lesson_date,status,recording_id,final,draft').eq('student_id',studentId).order('created_at',{ascending:false}):db.rpc('student_lesson_summaries',{sid:studentId}));
  if(off)return;
  const rows=(a.error?[]:(a.data||[])) as {id:string;lesson_date:string;status?:string;recording_id?:string|null;final?:unknown;draft?:unknown}[];
  setAnalyses(rows.map(r=>({id:r.id,lesson_date:r.lesson_date,status:r.status||'approved',recording_id:r.recording_id??null,final:r.final??r.draft??null})));
 })();return()=>{off=true}},[studentId,viewer,ver]);
 return useMemo(()=>analyses===null?null:lessonCards(entries.map(e=>({student_id:e.student_id,lesson_date:e.lesson_date,words:e.words})),sessions,analyses,recordings).map(c=>({...c,rec:stateOf(c,states)})),[entries,sessions,analyses,recordings,states]);
}

export function LessonCards({cards,viewer,lang,level,onOpen,limit}:{cards:LessonCard[]|null;viewer:'teacher'|'student';lang:string;level?:string|null;onOpen:(c:LessonCard)=>void;limit?:number}){
 if(!cards)return <div className="loader small"/>;
 if(!cards.length)return <div className="lc-empty"><CalendarCheck size={22} aria-hidden/><div><strong>{t('Nog geen lessen')}</strong><p className="muted">{t('Een les telt automatisch zodra docent en leerling minstens 2 minuten samen in het klaslokaal zijn. Een opname is niet nodig.')}</p></div></div>;
 return <div className="lc-list">{(limit?cards.slice(0,limit):cards).map(c=>{const L=c.language||lang;
  return <article key={c.key} className={'lc-card st-'+c.status}>
   <button type="button" className="lc-main" onClick={()=>onOpen(c)} title={t('Les openen')}>
    <span className="lc-num">{t('Les {0}',c.number)}</span>
    <span className="lc-title">{L&&<Flag code={L} size={16}/>}<b>{L?languageName(L):t('Les')}{level?' '+level:''}</b><span className="muted">· {niceDate(c.date)}</span></span>
    <span className="lc-facts">
     {c.minutes!=null&&<span title={t('Samen aanwezig')}><Clock3 size={13} aria-hidden/> {t('{0} min',c.minutes)}</span>}
     {c.errors!=null&&<span><AlertCircle size={13} aria-hidden/> {t('{0} fouten',c.errors)}</span>}
     <span><Languages size={13} aria-hidden/> {t('{0} woorden',c.words)}</span>
     {c.recording&&<span title={t('Opname')}><Mic size={13} aria-hidden/></span>}
    </span>
    <span className={'lc-status'+(c.status==='approved'?' ok':(c as CardX).rec&&PENDING.has((c as CardX).rec!.state)?' busy':'')}>{c.status==='approved'&&<Sparkles size={13} aria-hidden/>}{c.analysis&&(viewer==='teacher'||c.status==='approved')||(c as CardX).rec?statusText(c,viewer,(c as CardX).rec):t('Les geregistreerd · AI-verslag nog niet beschikbaar')}</span>
    <ChevronRight size={16} className="lc-go" aria-hidden/>
   </button>
  </article>})}</div>
}

type Hw={id:string;title:string;published_at:string|null;lesson_id?:string|null;analysis_id?:string|null;due_at?:string|null};
/** One lesson: its own page inside "Lessen". */
export function LessonDetail({card,studentId,viewer,entries,lang,level,onBack,onHomework}:{card:LessonCard;studentId:string;viewer:'teacher'|'student';entries:LessonEntry[];lang:string;level?:string|null;onBack:()=>void;onHomework:()=>void}){
 const [words,setWords]=useState<LessonWord[]|null>(null);const [hw,setHw]=useState<Hw[]>([]);
 const entry=entries.find(e=>e.lesson_date===card.date);const L=card.language||lang;
 useEffect(()=>{let off=false;const db=supabase()!;void(async()=>{
  // the word list of this lesson = rows of the ONE central word list with this lesson date (no copy)
  const v=await db.from('vocab_items').select('id,term,translation,pos').eq('student_id',studentId).eq('lesson_date',card.date).order('created_at');
  const central=(v.error?[]:(v.data||[])) as (LessonWord&{id:string})[];
  // v46: words that came back in this lesson (linked through vocab_lessons; same rows of the central list)
  const lk=await db.from('vocab_lessons').select('vocab_id').eq('student_id',studentId).eq('lesson_date',card.date);
  const extraIds=lk.error?[]:((lk.data||[]) as {vocab_id:string}[]).map(x=>x.vocab_id).filter(id=>!central.some(c=>c.id===id));
  if(extraIds.length){const ex=await db.from('vocab_items').select('id,term,translation,pos').in('id',extraIds.slice(0,300));if(!ex.error)central.push(...((ex.data||[]) as (LessonWord&{id:string})[]))}
  const legacy=(entry?.words||[]).map(w=>({term:w.nl,translation:w.uit||''}));
  let a=await db.from('assignments').select('id,title,published_at,lesson_id,analysis_id,due_at').eq('student_id',studentId);
  if(a.error&&/due_at|column/.test(a.error.message))a=await db.from('assignments').select('id,title,published_at,lesson_id,analysis_id').eq('student_id',studentId) as typeof a;
  if(off)return;
  setWords(central.length?central:legacy);
  setHw(((a.error?[]:a.data||[]) as Hw[]).filter(x=>(card.lessonId&&x.lesson_id===card.lessonId)||(card.analysis&&x.analysis_id===card.analysis.id)));
 })();return()=>{off=true}},[studentId,card.key,card.date,card.lessonId,card.analysis,entry]);
 const doc=card.analysis&&isV2(card.analysis.final)&&(viewer==='teacher'||card.status==='approved')?card.analysis.final as AnalysisV2:null;
 const rec=(card as CardX).rec||null;
 const extra=<>
  {entry?.notes&&<div className="lr-notes"><h5><NotebookPen size={14} aria-hidden/> {t('Lesnotities')}</h5><p className="pre">{entry.notes}</p></div>}
  {(hw.length>0||entry?.homework)&&<div className="lr-hw"><h5><ClipboardList size={14} aria-hidden/> {t('Huiswerk bij deze les')}</h5>
   {entry?.homework&&<p className="pre">{entry.homework}</p>}
   {hw.length>0&&<ul className="lr-hwlist">{hw.map(h=><li key={h.id}><b>{h.title}</b>{h.due_at&&<span className="muted"> · {t('inleveren vóór {0}',niceDate(h.due_at))}</span>}{viewer==='teacher'&&!h.published_at&&<span className="tag">{t('Concept')}</span>}</li>)}</ul>}
   <button type="button" className="button small secondary" onClick={onHomework}><ClipboardList size={14}/> {t('Naar Huiswerk')}</button></div>}
 </>;
 return <div className="lesson-detail">
  <div className="ld-head">
   <button type="button" className="button small secondary" onClick={onBack}><ArrowLeft size={15}/> {viewer==='teacher'?t('Alle lessen'):t('Mijn lessen')}</button>
   <div className="ld-title"><span className="lc-num">{t('Les {0}',card.number)}</span><div><h3>{L&&<Flag code={L} size={18}/>} {L?languageName(L):t('Les')}{level?' '+level:''}</h3>
    <p className="muted small">{niceDate(card.date)}{card.minutes!=null?' · '+t('{0} min samen aanwezig',card.minutes):''}{card.recording?' · '+t('met opname'):''}</p></div></div>
   <span className={'lc-status'+(card.status==='approved'?' ok':'')}>{card.analysis&&(viewer==='teacher'||card.status==='approved')||rec?statusText(card,viewer,rec):t('AI-verslag nog niet beschikbaar')}</span>
  </div>
  {rec&&rec.state==='no_consent'&&<ConsentAfterwards rec={rec} viewer={viewer}/>}
  {rec&&rec.state==='failed'&&<p className="notice small">{viewer==='teacher'?t('Het AI-verslag van deze opname is mislukt. TeachyRooms probeert het automatisch opnieuw (maximaal 3 keer).'):t('Het AI-verslag van deze les kon nog niet worden gemaakt. Er wordt automatisch opnieuw geprobeerd.')}</p>}
  {!card.recording&&!card.analysis&&<p className="muted small">{t('Van deze les is geen opname bewaard, daarom is er geen AI-verslag. Een verslag wordt nooit verzonnen zonder opname.')}</p>}
  {words===null?<div className="loader small"/>:doc?<LessonReport doc={doc} studentId={viewer==='student'?studentId:undefined} level={level} lessonLang={L} teacher={viewer==='teacher'} words={words} extra={extra}/>:
   <div className="lesson-report">
    <section className="lr-sec lr-mint"><h4><Languages size={16} aria-hidden/> {t('Woordenlijst van deze les')}</h4><LessonWords words={words}/></section>
    <section className="lr-sec lr-teal"><h4><NotebookPen size={16} aria-hidden/> {t('Samenvatting en opdrachten')}</h4>
     <p className="muted small">{card.analysis&&viewer==='teacher'?t('Het AI-verslag van deze les is nog niet klaar of in een ouder formaat; je ziet het hieronder.'):t('Voor deze les is (nog) geen AI-verslag. Een opgenomen les met toestemming voor een AI-verslag krijgt automatisch een verslag; het verschijnt hier vanzelf.')}</p>
     {extra}{!entry?.notes&&!hw.length&&!entry?.homework&&<p className="muted small">{t('Geen notities of huiswerk bij deze les.')}</p>}</section>
   </div>}
  {viewer==='teacher'&&card.analysis&&<details className="ld-edit" open={card.status==='ready'||!doc}><summary><PencilLine size={15}/> {t('Verslag bekijken, aanpassen of verbergen')}</summary>
   <TeacherAnalyses studentId={studentId} focusId={card.analysis.id} onlyId={card.analysis.id} lessonLang={L}/></details>}
 </div>
}

type CardX=LessonCard&{rec?:RecState|null};
/** v56: AI consent afterwards for an existing recording (the student for itself, the teacher for itself). The report
 *  is then made automatically (the teacher's TeachyRooms starts it). Consent is never assumed. */
function ConsentAfterwards({rec,viewer}:{rec:RecState;viewer:'teacher'|'student'}){
 const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 async function give(){setBusy(true);const r=await supabase()!.rpc('give_ai_consent',{p_recording:rec.recording_id});setBusy(false);
  setMsg(r.error?(/give_ai_consent/.test(r.error.message)?t('Dit kan zodra de database-update v56 is uitgevoerd.'):r.error.message):r.data==='both'?t('Toestemming gegeven. Het AI-verslag wordt automatisch gemaakt en verschijnt hier vanzelf.'):viewer==='student'?t('Toestemming gegeven. Het verslag wordt gemaakt zodra ook je docent toestemming heeft gegeven.'):t('Toestemming gegeven. Het verslag wordt gemaakt zodra ook je leerling toestemming heeft gegeven.'))}
 return <div className="notice small consent-after"><p>{viewer==='student'?t('Er is een opname van deze les, maar zonder toestemming voor een AI-verslag. Wil je alsnog een verslag met woorden, verbeterpunten en oefeningen? De opname wordt dan omgezet in tekst (via OpenAI).'):t('Er is een opname van deze les, maar zonder toestemming van jullie allebei voor een AI-verslag. Na toestemming van jou en je leerling wordt het verslag automatisch gemaakt.')}</p>
  {!msg&&<button type="button" className="button small" disabled={busy} onClick={()=>void give()}>{t('Toestemming geven voor AI-verslag')}</button>}{msg&&<p role="status">{msg}</p>}</div>
}