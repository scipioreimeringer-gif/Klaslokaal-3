'use client';
// v38: short lesson analysis — at most 3 points: ❌ what was said, ✅ the correction, 💡 one tip. Details on request.
import type {ReactNode} from 'react';
import {Repeat2} from 'lucide-react';
import {compactAnalysis} from '../lib/analysis/compact';
import {CATEGORY_LABEL,type AnalysisDoc,type CorrectionCategory} from '../lib/analysisTypes';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import {t as tt} from '../lib/i18n';

export function CompactAnalysis({doc,details,detailsLabel}:{doc:AnalysisV2|AnalysisDoc;details?:ReactNode;detailsLabel?:string}){
 const c=compactAnalysis(doc,{max:3,label:k=>CATEGORY_LABEL[k as CorrectionCategory]||k});
 return <div className="compact-analysis">
  {c.summary&&<p className="analysis-summary">{c.summary}</p>}
  {!!c.wentWell.length&&<p className="compact-well">✅ <b>{tt("Dit ging goed:")}</b> {c.wentWell.join(' · ')}</p>}
  {c.points.length?<ol className="compact-points">{c.points.map((p,i)=><li key={i}>
   <div className="row wrap"><b>{p.label}</b>{p.recurring&&<span className="tag recurring"><Repeat2 size={12}/> {tt("Terugkerend aandachtspunt")}</span>}</div>
   <div className="cp-line cp-wrong"><span aria-hidden>❌</span><span className="sr-only">{tt("Gezegd:")}</span> <s>{p.wrong}</s></div>
   <div className="cp-line cp-right"><span aria-hidden>✅</span><span className="sr-only">{tt("Beter:")}</span> {p.right}</div>
   {p.tip&&<div className="cp-line cp-tip"><span aria-hidden>💡</span><span className="sr-only">{tt("Tip:")}</span> {p.tip}</div>}
  </li>)}</ol>:<p className="muted">{tt("Geen belangrijke fouten in de stof van deze les. Goed gedaan!")}</p>}
  {details&&<details className="compact-more"><summary>{detailsLabel||tt("Meer details")}{c.morePoints>0?' '+tt("(nog {0} aandachtspunten)",c.morePoints):''}</summary>{details}</details>}
 </div>
}
