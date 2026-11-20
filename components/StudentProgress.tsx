'use client';
// v44 "Voortgang" for the student: lessons followed, words learned, grammar points, homework progress.
// Only what the student may already see (RLS + approved reports via the existing RPC); never the teacher's
// learning path planning or private notes. No AI call.
import {useEffect,useMemo,useState} from 'react';
import {BookOpenCheck,Languages,ListTree,ClipboardList,Repeat2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t} from '../lib/i18n';
import {BarChart,CHART,ChartCard} from './Charts';
import {lessonsPerMonth,isEmptySeries,type LessonLike} from '../lib/stats';
import {groupCategories} from '../lib/analysis/groups';

type P={lessons:number;lessonsThisMonth:number;words:number;homeworkPublished:number;homeworkDone:number;lastLesson:string|null};
type Cat={key:string;label:string;count:number;relevance?:string;recurring?:boolean};

/** Grammar points over all approved reports: per grammar topic, summed counts, recurring ones marked. */
export function grammarOverview(finals:unknown[],lessonLang:string){
 const cats:Cat[]=[];
 for(const f of finals){const d=f as {version?:number;categories?:Cat[]}|null;if(d?.version!==2)continue;
  for(const c of d.categories||[])if(c.relevance!=='later'&&c.count>0)cats.push(c)}
 return groupCategories(cats,lessonLang).map(g=>({group:g.group,count:g.count,recurring:g.categories.some(c=>c.recurring),lessons:g.categories.length}));
}

export function StudentProgress({studentId,progress,lessons,lessonLang}:{studentId:string;progress:P;lessons:LessonLike[];lessonLang:string}){
 const [vocab,setVocab]=useState<{status:string}[]|null>(null);const [finals,setFinals]=useState<unknown[]|null>(null);
 useEffect(()=>{let off=false;const db=supabase()!;void Promise.all([db.from('vocab_items').select('status').eq('student_id',studentId),db.rpc('student_lesson_summaries',{sid:studentId})]).then(([v,s])=>{if(off)return;
  setVocab((v.error?[]:v.data||[]) as {status:string}[]);setFinals(((s.error?[]:s.data||[]) as {final:unknown}[]).map(x=>x.final))});return()=>{off=true}},[studentId]);
 const perMonth=lessonsPerMonth(lessons,6);const groups=useMemo(()=>finals?grammarOverview(finals,lessonLang).slice(0,6):[],[finals,lessonLang]);
 const mastered=vocab?vocab.filter(v=>v.status==='mastered').length:0,practicing=vocab?vocab.filter(v=>v.status==='practicing').length:0;
 const hwPct=progress.homeworkPublished?Math.round(progress.homeworkDone/progress.homeworkPublished*100):null;
 return <div className="sp-grid">
  <section className="sp-card sp-teal"><h4><BookOpenCheck size={16} aria-hidden/> {t('Gevolgde lessen')}</h4><strong className="sp-big">{progress.lessons}</strong><p className="muted small">{t('{0} deze maand',progress.lessonsThisMonth)}</p></section>
  <section className="sp-card sp-violet"><h4><Languages size={16} aria-hidden/> {t('Geleerde woorden')}</h4><strong className="sp-big">{vocab?vocab.length||progress.words:'…'}</strong>
   {vocab&&vocab.length>0&&<><div className="sp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mastered/vocab.length*100)} aria-label={t('Beheerst')}><span style={{width:`${Math.round(mastered/vocab.length*100)}%`}}/></div><p className="muted small">{t('{0} beheerst · {1} aan het oefenen',mastered,practicing)}</p></>}</section>
  <section className="sp-card sp-coral"><h4><ClipboardList size={16} aria-hidden/> {t('Huiswerk')}</h4><strong className="sp-big">{progress.homeworkDone}/{progress.homeworkPublished}</strong>
   {hwPct!=null?<><div className="sp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hwPct} aria-label={t('Huiswerk')}><span style={{width:`${hwPct}%`}}/></div><p className="muted small">{t('ingeleverd van gepubliceerd')}</p></>:<p className="muted small">{t('Nog geen huiswerk ontvangen.')}</p>}</section>
  <section className="sp-card sp-blue sp-wide"><h4><ListTree size={16} aria-hidden/> {t('Grammaticale aandachtspunten')}</h4>
   {finals===null?<div className="loader small"/>:groups.length?<ul className="lr-groups">{groups.map(g=><li key={g.group}><span>{t(g.group)}</span><b className="lr-count">{t('{0}×',g.count)}</b>{g.recurring&&<small className="muted"><Repeat2 size={12} aria-hidden/> {t('Terugkerend aandachtspunt')}</small>}</li>)}</ul>
   :<p className="muted small">{t('Nog geen goedgekeurde lesverslagen met aandachtspunten.')}</p>}</section>
  {!isEmptySeries(perMonth)&&<ChartCard className="sp-wide" title={t('Lessen per maand')} subtitle={t('Afgelopen 6 maanden')} table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>}
 </div>
}
