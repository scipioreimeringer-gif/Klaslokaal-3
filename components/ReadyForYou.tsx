'use client';
// "Voor jou klaar" — what the student can do now, per lesson language and teacher (strictly separate relations).
// v40: compact card grid (desktop 4, tablet 2, mobile 1–2) with short labels: 📋 Huiswerk · 🧠 Flashcards ·
// ✨ Laatste les · 🎯 Oefenen. All data comes from the dashboard's own RLS-limited queries; nothing is generated here.
import Link from 'next/link';
import {ClipboardList,Brain,Sparkles,Target,ChevronRight,CheckCircle2} from 'lucide-react';
import {niceDate} from '../lib/data';
import {hasReady,type ReadyItem} from '../lib/ready';
import {compactAnalysis} from '../lib/analysis/compact';
import type {AnalysisDoc} from '../lib/analysisTypes';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import {Flag} from './Flag';
import {languageName} from '../lib/languages';
import {t as tt} from '../lib/i18n';

export type ReadyRel={id:string;label:string;lang?:string;level?:string|null;teacher?:string};

function Card({tone,icon,title,value,sub,progress,href,action}:{tone:string;icon:React.ReactNode;title:string;value:string;sub?:string;progress?:number|null;href:string;action:string}){
 return <Link className={'rcard tone-'+tone} href={href}>
  <span className="rcard-top"><span className="rcard-ico" aria-hidden>{icon}</span><span className="rcard-title">{title}</span></span>
  <strong className="rcard-value">{value}</strong>
  {sub&&<span className="rcard-sub">{sub}</span>}
  {progress!=null&&<span className="rcard-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={title}><span style={{width:`${Math.max(4,Math.min(100,progress))}%`}}/></span>}
  <span className="rcard-action">{action} <ChevronRight size={14} aria-hidden/></span>
 </Link>
}

export function ReadyForYou({relations,items}:{relations:ReadyRel[];items:ReadyItem[]|null}){
 if(!relations.length)return null;
 const multi=relations.length>1;
 return <section className="panel ready-panel" aria-labelledby="ready-h"><div className="panelheader"><div><h2 id="ready-h"><Sparkles size={18}/> {tt("Voor jou klaar")}</h2></div></div>
  {!items?<div className="loader small"/>:relations.map(rel=>{const r=items.find(x=>x.studentId===rel.id);if(!r)return null;
   const pts=r.latest?compactAnalysis(r.latest.final as AnalysisV2|AnalysisDoc,{max:3}).points:[];
   const pub=r.homeworkPublished||0,done=r.homeworkDone||0;
   const base=`/mijn-profiel?student=${rel.id}`;
   return <div key={rel.id} className="ready-rel">
    {multi&&<h3 className="ready-rel-head">{rel.lang&&<Flag code={rel.lang} size={16}/>}{rel.lang?languageName(rel.lang):rel.label}{rel.teacher&&<span className="muted"> · {rel.teacher}</span>}</h3>}
    {!hasReady(r)&&<p className="muted small"><CheckCircle2 size={14}/> {tt("Alles is bij. Er staat nu niets voor je klaar.")}</p>}
    <div className="rgrid">
     {r.homework.length>0&&<Card tone="coral" icon={<ClipboardList size={16}/>} title={tt("Huiswerk")} value={tt("{0} open",r.homework.length)} sub={r.homework[0].title} progress={pub?done/pub*100:null} href={base+'&tab=huiswerk'} action={tt("Maken")}/>}
     {r.dueWords>0&&<Card tone="violet" icon={<Brain size={16}/>} title={tt("Flashcards")} value={tt("{0} woorden herhalen",r.dueWords)} href={`/oefenen?student=${rel.id}&spel=flashcards`} action={tt("Oefenen")}/>}
     {r.latest&&<Card tone="teal" icon={<Sparkles size={16}/>} title={tt("Laatste les")} value={niceDate(r.latest.lesson_date)} sub={pts.length?pts.map(p=>p.label).join(' · '):tt("Geen belangrijke fouten")} href={base+'&tab=analyses'} action={tt("Bekijken")}/>}
     <Card tone="yellow" icon={<Target size={16}/>} title={tt("Oefenen")} value={tt("Gemengde oefening")+(rel.level?` · ${rel.level}`:'')} href={`/oefenen?student=${rel.id}`} action={tt("Start")}/>
    </div></div>})}
 </section>
}
