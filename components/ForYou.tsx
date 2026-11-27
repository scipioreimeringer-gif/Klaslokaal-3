'use client';
// v76: "Voor jou klaar" — at most three personal recommendations from real data (learning line: Extra oefenen → In
// ontwikkeling → recent mistakes → words due for review), each with a direct practice link, plus the always available
// "Start gemengde oefening". No AI call: everything comes from stored data, so it updates with new practice results.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Target,Route,Wrench,Layers,Shuffle,Sparkles} from 'lucide-react';
import {t} from '../lib/i18n';
import {supabase} from '../lib/supabase';
import {useLineSummary} from './StudentDash';
import {useStats} from './Progress';
import {vocabStats} from '../lib/progressStats';
import {errorsOf} from '../lib/analysis/core';

type Row={key:string;icon:typeof Target;tone:string;title:string;info:string;href:string};
export function ForYouCard({studentId,lang,level}:{studentId:string;lang:string;level:string}){
 const line=useLineSummary(studentId,lang,level,3);const {d}=useStats([studentId]);
 const [errs,setErrs]=useState<{n:number;date:string}|null>(null);
 useEffect(()=>{let off=false;void supabase()!.rpc('student_lesson_summaries',{sid:studentId}).then(r=>{if(off)return;
  const last=((r.data||[]) as {lesson_date:string;final:unknown}[]).sort((a,b)=>b.lesson_date.localeCompare(a.lesson_date))[0];
  const n=last?errorsOf(last.final as never).filter(e=>e.status!=='rejected'&&!e.later&&e.certainty==='certain').length:0;setErrs({n,date:last?.lesson_date||''})});return()=>{off=true}},[studentId]);
 const base='/oefenen?student='+encodeURIComponent(studentId);
 const rows:Row[]=[];
 for(const r of line?.recs||[])if(r.reason==='review'||r.reason==='in_progress'||r.reason==='error')rows.push({key:r.id,icon:Route,tone:r.reason==='review'?'tone-gold':'tone-blue',title:t('Oefen {0}',r.title),info:t(r.reason==='review'?'Extra oefenen':r.reason==='error'?'Recente fouten':'In ontwikkeling'),href:base+'&onderwerp='+encodeURIComponent(r.title)+'#zelf'});
 if(errs&&errs.n>0)rows.push({key:'errs',icon:Wrench,tone:'tone-gold',title:t('Verbeter fouten uit je laatste les'),info:t('{0} verbeterpunten',errs.n),href:base+'&spel=errors'});
 const due=d?vocabStats(d.vocab,'all').review:0;
 if(due>0)rows.push({key:'words',icon:Layers,tone:'tone-green',title:t('{0} woorden herhalen',due),info:t('Woorden die herhaling nodig hebben'),href:base+'&spel=flashcards'});
 const show=rows.slice(0,3);
 return <section className="sd-card foryou"><h3><Sparkles size={16}/> {t('Voor jou klaar')}</h3>
  {!line||!d?<div className="loader small"/>:show.length?<ul className="fy-rows">{show.map(r=>{const I=r.icon;return <li key={r.key}><Link className={'fy-row '+r.tone} href={r.href}><span className="fy-ic"><I size={16}/></span><span className="fy-txt"><b>{r.title}</b><small>{r.info}</small></span><span className="fy-go" aria-hidden>›</span></Link></li>})}</ul>
   :<p className="muted small">{t('Nog geen persoonlijke aanbevelingen. Ze verschijnen na je lessen en oefeningen.')}</p>}
  <Link className="button fy-mix" href={'/oefenen/dagelijks?student='+encodeURIComponent(studentId)+'&mix=1'}><Shuffle size={15}/> {t('Start gemengde oefening')}</Link>
 </section>
}
