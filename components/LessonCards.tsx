'use client';
// v43: lesson history as cards — every registered lesson (real joint presence), with or without a recording.
// A card opens the existing AI report of THAT lesson; no AI is called here.
import {useEffect,useMemo,useState} from 'react';
import {CalendarCheck,Clock3,AlertCircle,Languages,Sparkles,Mic,ChevronDown,ChevronRight} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t} from '../lib/i18n';
import {niceDate,type LessonEntry,type Recording} from '../lib/data';
import {languageName} from '../lib/languages';
import {Flag} from './Flag';
import {lessonCards,type CardAnalysis,type LessonCard} from '../lib/lessonCards';
import type {SessionLike} from '../lib/stats';

function statusText(c:LessonCard,viewer:'teacher'|'student'){
 if(c.status==='approved')return t('AI-verslag klaar');
 if(viewer==='teacher'&&c.status==='ready')return t('Concept wacht op jouw controle');
 if(viewer==='teacher'&&(c.status==='processing'||c.status==='queued'))return t('AI-verslag wordt gemaakt…');
 if(viewer==='teacher'&&c.status==='failed')return t('AI-verslag mislukt');
 return t('AI-verslag nog niet beschikbaar');
}

export function LessonCards({studentId,viewer,entries,sessions,recordings,lang,level,onOpenReport,limit}:{studentId:string;viewer:'teacher'|'student';entries:LessonEntry[];sessions:SessionLike[]|null;recordings:Recording[];lang:string;level?:string|null;onOpenReport:(analysisId:string)=>void;limit?:number}){
 const [analyses,setAnalyses]=useState<CardAnalysis[]|null>(null);const [open,setOpen]=useState<string|null>(null);
 useEffect(()=>{let off=false;const db=supabase()!;void(async()=>{
  // sessions come with the workspace bundle (null = migration v43 not run yet → one card per lesson day)
  const a=await (viewer==='teacher'?db.from('lesson_analyses').select('id,lesson_date,status,recording_id,final,draft').eq('student_id',studentId).order('created_at',{ascending:false}):db.rpc('student_lesson_summaries',{sid:studentId}));
  if(off)return;
  const rows=(a.error?[]:(a.data||[])) as {id:string;lesson_date:string;status?:string;recording_id?:string|null;final?:unknown;draft?:unknown}[];
  setAnalyses(rows.map(r=>({id:r.id,lesson_date:r.lesson_date,status:r.status||'approved',recording_id:r.recording_id??null,final:r.final??r.draft??null})));
 })();return()=>{off=true}},[studentId,viewer]);
 const cards=useMemo(()=>analyses===null?null:lessonCards(entries.map(e=>({student_id:e.student_id,lesson_date:e.lesson_date,words:e.words})),sessions,analyses,recordings),[entries,sessions,analyses,recordings]);
 if(!cards)return <div className="loader small"/>;
 if(!cards.length)return <div className="lc-empty"><CalendarCheck size={22} aria-hidden/><div><strong>{t('Nog geen lessen')}</strong><p className="muted">{t('Een les telt automatisch zodra docent en leerling minstens 2 minuten samen in het klaslokaal zijn. Een opname is niet nodig.')}</p></div></div>;
 const byDate=new Map(entries.map(e=>[e.lesson_date,e]));
 return <div className="lc-list">{(limit?cards.slice(0,limit):cards).map(c=>{const L=c.language||lang;const e=byDate.get(c.date);const canOpen=!!c.analysis&&(viewer==='teacher'||c.status==='approved');const expanded=open===c.key;
  return <article key={c.key} className={'lc-card st-'+c.status}>
   <button type="button" className="lc-main" aria-expanded={canOpen?undefined:expanded} onClick={()=>canOpen?onOpenReport(c.analysis!.id):setOpen(expanded?null:c.key)}>
    <span className="lc-num">{t('Les {0}',c.number)}</span>
    <span className="lc-title">{L&&<Flag code={L} size={16}/>}<b>{L?languageName(L):t('Les')}{level?' '+level:''}</b><span className="muted">· {niceDate(c.date)}</span></span>
    <span className="lc-facts">
     {c.minutes!=null&&<span title={t('Samen aanwezig')}><Clock3 size={13} aria-hidden/> {t('{0} min',c.minutes)}</span>}
     {c.errors!=null&&<span><AlertCircle size={13} aria-hidden/> {t('{0} fouten',c.errors)}</span>}
     <span><Languages size={13} aria-hidden/> {t('{0} woorden',c.words)}</span>
     {c.recording&&<span title={t('Opname')}><Mic size={13} aria-hidden/></span>}
    </span>
    <span className={'lc-status'+(c.status==='approved'?' ok':'')}>{c.status==='approved'&&<Sparkles size={13} aria-hidden/>}{c.analysis?statusText(c,viewer):t('Les geregistreerd · AI-verslag nog niet beschikbaar')}</span>
    {canOpen?<ChevronRight size={16} className="lc-go" aria-hidden/>:<ChevronDown size={16} className="lc-go" aria-hidden/>}
   </button>
   {expanded&&<div className="lc-body">{e?.notes?<><h4>{t('Lesnotities')}</h4><p className="pre">{e.notes}</p></>:<p className="muted">{t('Geen notities.')}</p>}
    {!!(e?.words||[]).length&&<><h4>{t('Woorden')}</h4><ul className="chips">{(e!.words||[]).map((w,j)=><li key={j}><b>{w.nl}</b>{w.uit?<span> · {w.uit}</span>:null}</li>)}</ul></>}
    {e?.homework&&<><h4>{t('Huiswerk')}</h4><p className="pre">{e.homework}</p></>}</div>}
  </article>})}</div>
}
