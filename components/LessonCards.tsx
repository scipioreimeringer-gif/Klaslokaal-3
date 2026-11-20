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

function statusText(c:LessonCard,viewer:'teacher'|'student'){
 if(c.status==='approved')return t('AI-verslag klaar');
 if(viewer==='teacher'&&c.status==='ready')return t('Concept wacht op jouw controle');
 if(viewer==='teacher'&&(c.status==='processing'||c.status==='queued'))return t('AI-verslag wordt gemaakt…');
 if(viewer==='teacher'&&c.status==='failed')return t('AI-verslag mislukt');
 return t('AI-verslag nog niet beschikbaar');
}
const isV2=(f:unknown)=>!!f&&typeof f==='object'&&(f as {version?:number}).version===2;

type Props={studentId:string;viewer:'teacher'|'student';entries:LessonEntry[];sessions:SessionLike[]|null;recordings:Recording[];lang:string;level?:string|null};

/** Loads the reports once (teacher: all own analyses; student: only approved ones via the existing RPC) and builds the cards. */
export function useLessonCards({studentId,viewer,entries,sessions,recordings}:Omit<Props,'lang'|'level'>){
 const [analyses,setAnalyses]=useState<CardAnalysis[]|null>(null);
 useEffect(()=>{let off=false;const db=supabase()!;void(async()=>{
  const a=await (viewer==='teacher'?db.from('lesson_analyses').select('id,lesson_date,status,recording_id,final,draft').eq('student_id',studentId).order('created_at',{ascending:false}):db.rpc('student_lesson_summaries',{sid:studentId}));
  if(off)return;
  const rows=(a.error?[]:(a.data||[])) as {id:string;lesson_date:string;status?:string;recording_id?:string|null;final?:unknown;draft?:unknown}[];
  setAnalyses(rows.map(r=>({id:r.id,lesson_date:r.lesson_date,status:r.status||'approved',recording_id:r.recording_id??null,final:r.final??r.draft??null})));
 })();return()=>{off=true}},[studentId,viewer]);
 return useMemo(()=>analyses===null?null:lessonCards(entries.map(e=>({student_id:e.student_id,lesson_date:e.lesson_date,words:e.words})),sessions,analyses,recordings),[entries,sessions,analyses,recordings]);
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
    <span className={'lc-status'+(c.status==='approved'?' ok':'')}>{c.status==='approved'&&<Sparkles size={13} aria-hidden/>}{c.analysis&&(viewer==='teacher'||c.status==='approved')?statusText(c,viewer):t('Les geregistreerd · AI-verslag nog niet beschikbaar')}</span>
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
   <span className={'lc-status'+(card.status==='approved'?' ok':'')}>{card.analysis&&(viewer==='teacher'||card.status==='approved')?statusText(card,viewer):t('AI-verslag nog niet beschikbaar')}</span>
  </div>
  {words===null?<div className="loader small"/>:doc?<LessonReport doc={doc} studentId={viewer==='student'?studentId:undefined} level={level} lessonLang={L} teacher={viewer==='teacher'} words={words} extra={extra}/>:
   <div className="lesson-report">
    <section className="lr-sec lr-mint"><h4><Languages size={16} aria-hidden/> {t('Woordenlijst van deze les')}</h4><LessonWords words={words}/></section>
    <section className="lr-sec lr-teal"><h4><NotebookPen size={16} aria-hidden/> {t('Samenvatting en opdrachten')}</h4>
     <p className="muted small">{card.analysis&&viewer==='teacher'?t('Het AI-verslag van deze les is nog niet klaar of in een ouder formaat; je ziet het hieronder.'):t('Voor deze les is (nog) geen AI-verslag. Fouten en grammatica verschijnen hier zodra je docent een verslag van een opgenomen les goedkeurt.')}</p>
     {extra}{!entry?.notes&&!hw.length&&!entry?.homework&&<p className="muted small">{t('Geen notities of huiswerk bij deze les.')}</p>}</section>
   </div>}
  {viewer==='teacher'&&card.analysis&&<details className="ld-edit" open={card.status==='ready'||!doc}><summary><PencilLine size={15}/> {card.status==='ready'?t('Verslag controleren en goedkeuren'):t('Verslag bewerken')}</summary>
   <TeacherAnalyses studentId={studentId} focusId={card.analysis.id} onlyId={card.analysis.id} lessonLang={L}/></details>}
 </div>
}
