'use client';
// v43: the AI lesson report in a fixed order — 1 Mijn fouten · 2 Grammaticale aandachtspunten · 3 Verdieping ·
// 4 Nieuwe woorden · 5 Wat ging goed · 6 Samenvatting · 7 Oefenen. Only shows what the (teacher-approved) analysis holds;
// "Oefen dit onderwerp" starts the existing exercise generator only after a click (no AI on opening).
import {useState} from 'react';
import {XCircle,ListTree,BookOpen,Languages,ThumbsUp,FileText,Dumbbell,ChevronDown,Repeat2} from 'lucide-react';
import {t as tt} from '../lib/i18n';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import {groupCategories} from '../lib/analysis/groups';
import {SelfPractice} from './Learning';
import {ErrorList} from './ErrorReview';

type Cat=AnalysisV2['categories'][number];
export type ReportError={original:string;corrected:string;why:string;label:string};

/** Every certain error of the lesson (the student's own sentences), with the explanation of its rule. */
export function reportErrors(doc:AnalysisV2):ReportError[]{
 const out:ReportError[]=[];const seen=new Set<string>();
 for(const c of doc.categories||[]){if(c.relevance==='later')continue;
  for(const e of c.examples||[]){if(e.certainty==='uncertain')continue;const k=e.original.trim().toLowerCase();if(!k||seen.has(k))continue;seen.add(k);
   const legacy=(doc.corrections||[]).find(x=>x.original.trim().toLowerCase()===k);
   out.push({original:e.original,corrected:e.corrected,why:(legacy?.explanation||c.explanation||'').trim(),label:c.label})}}
 return out;
}

function Section({n,icon:Icon,title,tone,children}:{n:number;icon:typeof XCircle;title:string;tone:string;children:React.ReactNode}){
 return <section className={'lr-sec lr-'+tone}><h4><span className="lr-n" aria-hidden>{n}</span><Icon size={16} aria-hidden/> {title}</h4>{children}</section>
}

function DeepDive({c,studentId,level,canPractise}:{c:Cat;studentId?:string;level?:string|null;canPractise:boolean}){
 const [practise,setPractise]=useState(false);
 return <details className="lr-deep"><summary><b>{c.label}</b>{c.count>0&&<span className="tag">{tt("{0}×",c.count)}</span>}{c.recurring&&<span className="tag recurring"><Repeat2 size={12}/> {tt("Terugkerend aandachtspunt")}</span>}<ChevronDown size={15} className="lr-chev" aria-hidden/></summary>
  {c.explanation&&<p>{c.explanation}</p>}
  {!!c.examples.length&&<ul className="lr-examples">{c.examples.filter(e=>e.certainty!=='uncertain').map((e,i)=><li key={i}><s>{e.original}</s> → <b>{e.corrected}</b></li>)}</ul>}
  {canPractise&&studentId&&(practise?<div className="lr-practise"><SelfPractice studentId={studentId} level={level} topic={c.label}/></div>:
   <button type="button" className="button small secondary" onClick={()=>setPractise(true)}><Dumbbell size={14}/> {tt("Oefen dit onderwerp")}</button>)}
 </details>
}

export type LessonWord={term:string;translation?:string|null;pos?:string|null};
/** Word list of ONE lesson (rows of the central word list, or the report's own list for older lessons). */
export function LessonWords({words}:{words:LessonWord[]}){
 if(!words.length)return <p className="muted small">{tt("Nog geen woorden bij deze les.")}</p>;
 return <table className="vocab lr-words"><thead><tr><th>{tt("Woord")}</th><th>{tt("Engels")}</th></tr></thead><tbody>{words.map((v,i)=><tr key={i}><td><b>{v.term}</b>{v.pos&&<small className="muted"> · {v.pos}</small>}</td><td>{v.translation||<span className="muted">—</span>}</td></tr>)}</tbody></table>
}

/** v44 order inside a lesson: 1 Fouten · 2 Grammatica · 3 Woordenlijst van deze les · 4 Verdieping · 5 Samenvatting en opdrachten. */
export function LessonReport({doc,studentId,level,lessonLang,teacher=false,words,extra}:{doc:AnalysisV2;studentId?:string;level?:string|null;lessonLang?:string;teacher?:boolean;words?:LessonWord[];extra?:React.ReactNode}){
 const r=doc.report;
 const cats=(doc.categories||[]).filter(c=>c.relevance!=='later'&&(c.count>0||c.examples.some(e=>e.certainty!=='uncertain')));
 const groups=groupCategories(cats,lessonLang);
 const list=words&&words.length?words:(doc.vocabulary||[]).filter(v=>v.term);
 const well=[...(r?.went_well||[]),...(doc.positives||[]).map(p=>p.note||p.text).filter(Boolean)].slice(0,6);
 return <div className="lesson-report">
  <Section n={1} icon={XCircle} title={tt("Fouten en verbeteringen")} tone="coral">
   {/* v46 phase 2: every registered error, grouped per main category, details on request (teacher-removed errors hidden) */}
   <ErrorList doc={doc}/>
   {/* v72: grammatically correct but could be more natural: shown apart, never as an error */}
   {!!doc.style?.length&&<details className="lr-style"><summary>{tt("Natuurlijker formuleren ({0}) · geen fouten",doc.style.length)}</summary><ul>{doc.style.map((s,i)=><li key={i}><span className="muted">{s.original}</span> → <b>{s.better}</b>{s.why&&<small className="muted block">{s.why}</small>}</li>)}</ul></details>}
  </Section>
  <Section n={2} icon={ListTree} title={tt("Grammaticale aandachtspunten")} tone="blue">
   {groups.length?<ul className="lr-groups">{groups.map(g=><li key={g.group}><span>{tt(g.group)}</span>{g.count>0&&<b className="lr-count">{tt("{0}×",g.count)}</b>}<small className="muted">{g.categories.map(c=>c.label).join(' · ')}</small></li>)}</ul>:<p className="muted small">{tt("Geen grammaticale aandachtspunten in deze les.")}</p>}
  </Section>
  <Section n={3} icon={Languages} title={tt("Woordenlijst van deze les")} tone="mint"><LessonWords words={list}/></Section>
  {!!cats.length&&<Section n={4} icon={BookOpen} title={tt("Verdieping")} tone="violet">
   {cats.map(c=><DeepDive key={c.key} c={c} studentId={studentId} level={level} canPractise={!teacher}/>)}
  </Section>}
  <Section n={5} icon={FileText} title={tt("Samenvatting en opdrachten")} tone="teal">
   {(r?.summary||doc.summary)&&<p className="analysis-summary">{r?.summary||doc.summary}</p>}
   {!!r?.covered?.length&&<p className="muted small"><b>{tt("Behandeld")}:</b> {r.covered.join(' · ')}</p>}
   {!!well.length&&<div className="lr-well"><h5><ThumbsUp size={14} aria-hidden/> {tt("Wat ging goed")}</h5><ul>{well.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!r?.focus?.length&&<div className="lr-focus"><h5><Dumbbell size={14} aria-hidden/> {tt("Oefenen")}</h5><ul>{r.focus.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {extra}
   {!extra&&<p className="muted small">{doc.homework?.assignment_id?tt("Je docent heeft huiswerk bij deze les klaargezet: zie Huiswerk."):tt("Kies hierboven bij Verdieping een onderwerp om te oefenen, of kijk bij Huiswerk.")}</p>}
  </Section>
 </div>
}