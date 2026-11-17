'use client';
// v38: "Voor jou klaar" — what the student can do now: published homework, words to review with flashcards,
// and the latest teacher-approved lesson report (short: max. 3 points). Everything is read with the student's
// own session (dashboard queries), so RLS decides what is visible; nothing here is generated or estimated.
import Link from 'next/link';
import {ClipboardList,Layers,Sparkles,CheckCircle2} from 'lucide-react';
import {niceDate} from '../lib/data';
import {hasReady,type ReadyItem} from '../lib/ready';
import {CompactAnalysis} from './CompactAnalysis';
import type {AnalysisDoc} from '../lib/analysisTypes';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import {t as tt} from '../lib/i18n';

type Rel={id:string;label:string};
/** items: computed by the dashboard from the data it already loaded (no extra queries); null while loading. */
export function ReadyForYou({relations,items}:{relations:Rel[];items:ReadyItem[]|null}){
 if(!relations.length)return null;
 const list=(items||[]).filter(hasReady);const multi=relations.length>1;
 return <section className="panel ready-panel" aria-labelledby="ready-h"><div className="panelheader"><div><h2 id="ready-h"><Sparkles size={18}/> {tt("Voor jou klaar")}</h2><p>{tt("Huiswerk, woorden om te herhalen en je laatste lesverslag")}</p></div></div>
  {!items?<div className="loader small"/>:!list.length?<p className="muted"><CheckCircle2 size={15}/> {tt("Alles is bij. Er staat nu niets voor je klaar.")}</p>:
  list.map(r=>{const label=relations.find(x=>x.id===r.studentId)?.label||'';return <div key={r.studentId} className="ready-rel">
   {multi&&<h3 className="muted">{label}</h3>}
   <div className="ready-grid">
    {r.homework.length>0&&<div className="ready-card"><h3><ClipboardList size={16}/> {tt("Huiswerk ({0})",r.homework.length)}</h3>
     <ul>{r.homework.slice(0,3).map(h=><li key={h.id}>{h.title}</li>)}</ul>{r.homework.length>3&&<small className="muted">{tt("en nog {0}",r.homework.length-3)}</small>}
     <Link className="button small" href={`/mijn-profiel?student=${r.studentId}&tab=huiswerk`}>{tt("Huiswerk maken")}</Link></div>}
    {r.dueWords>0&&<div className="ready-card"><h3><Layers size={16}/> {tt("Flashcards")}</h3>
     <p>{tt("{0} woorden staan klaar om te herhalen.",r.dueWords)}</p>
     <Link className="button small" href={`/oefenen?student=${r.studentId}&spel=flashcards`}>{tt("Flashcards oefenen")}</Link></div>}
    {r.latest&&<div className="ready-card ready-report"><h3><Sparkles size={16}/> {tt("Lesverslag van {0}",niceDate(r.latest.lesson_date))}</h3>
     <CompactAnalysis doc={r.latest.final as AnalysisV2|AnalysisDoc}/>
     <Link className="textlink" href={`/mijn-profiel?student=${r.studentId}&tab=analyses`}>{tt("Meer details")}</Link></div>}
   </div></div>})}
 </section>
}
