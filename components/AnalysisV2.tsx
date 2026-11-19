'use client';
// AI lesson analysis 2.0 — teacher view (progress, retry, edit, checklist suggestions) and the student view.
import {useEffect,useState} from 'react';
import {Bot,CheckCircle2,Loader2,RotateCcw,Trash2,FileText,Repeat2,ClipboardList,Check,X,Plus} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {addVocab,authedPost,GOAL_STATUS_LABEL,type GoalStatus} from '../lib/learning';
import {niceDate} from '../lib/data';
import {t as tt} from '../lib/i18n';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import type {Category,Suggestion} from '../lib/analysis/core';
import {LessonReport} from './LessonReport';
import {proposeTopics,type LessonTopics} from '../lib/analysis/material';
import {ListChecks} from 'lucide-react';

export type V2Row={id:string;student_id:string;lesson_date:string;status:string;transcript:string|null;error:string|null;is_test?:boolean;
 draft:unknown;final:unknown;stage?:string|null;stage_detail?:Record<string,unknown>|null;pipeline_version?:number|null;published_at?:string|null;updated_at?:string|null};
export const isV2=(a:{pipeline_version?:number|null;draft?:unknown;final?:unknown})=>a.pipeline_version===2||(a.final as {version?:number}|null)?.version===2||(a.draft as {version?:number}|null)?.version===2;

const STEPS:[string,string][]=[['collect','Bronnen verzamelen en transcriberen'],['chunks','Transcript in delen analyseren'],['merge','Fouten samenvoegen en tellen'],['synthesis','Verslag en uitleg schrijven'],['homework','Huiswerkconcept maken'],['done','Klaar']];
const REL_LABEL:Record<string,string>={current:'Lesdoel van vandaag',known:'Al behandeld',new_today:'Vandaag uitgelegd',relevant:'Relevant',later:'Voor later'};
const lines=(a:string[]|undefined)=>(a||[]).join('\n');
const unlines=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);

/** Progress of a running / failed analysis, with retry. */
export function StageProgress({a,onChange}:{a:V2Row;onChange:()=>void}){
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const stage=a.stage||'collect';const idx=STEPS.findIndex(s=>s[0]===stage);
 const stale=a.status==='processing'&&!!a.updated_at&&Date.now()-new Date(a.updated_at).getTime()>6*60_000;
 async function retry(){setBusy(true);setErr('');try{await authedPost(supabase()!,'/api/ai/analyze',{resumeId:a.id,retryFailed:true});onChange()}catch(e){setErr(e instanceof Error?e.message:String(e))}setBusy(false)}
 const failed=a.status==='failed';const failedStep=(a.stage_detail as {failed_step?:string}|null)?.failed_step;
 const total=(a.stage_detail as {total?:number}|null)?.total;
 return <div className="stage-progress">
  <ol className="stages">{STEPS.slice(0,5).map(([k,l],i)=>{const st=failed&&(k===failedStep||(!failedStep&&i===idx))?'failed':i<idx||stage==='done'?'done':i===idx&&!failed?'active':'todo';
   return <li key={k} className={'stage s-'+st}>{st==='done'?<CheckCircle2 size={14}/>:st==='active'?<Loader2 size={14} className="spin"/>:st==='failed'?<X size={14}/>:<span className="dot"/>}{tt(l)}{k==='chunks'&&total?<small className="muted"> {tt("({0} delen)",total)}</small>:null}</li>})}</ol>
  {failed&&<p className="notice">{stage==='partial_failed'?tt("Een deel van de analyse is mislukt. Geslaagde stappen zijn bewaard; alleen de mislukte stap wordt opnieuw gedaan."):tt("De analyse is mislukt.")} {a.error}</p>}
  {(failed||stale)&&<button className="button small" disabled={busy} onClick={()=>void retry()}><RotateCcw size={14}/> {failed?tt("Opnieuw proberen"):tt("Analyse hervatten")}</button>}
  {err&&<p className="notice" role="alert">{err}</p>}
 </div>
}

function CategoryCard({c,teacher,onChange,onDelete}:{c:Category;teacher:boolean;onChange?:(c:Category)=>void;onDelete?:()=>void}){
 const up=(p:Partial<Category>)=>onChange?.({...c,...p});
 const trend=c.trend&&c.trend.direction!=='insufficient'?c.trend.direction==='down'?tt("minder vaak dan in eerdere lessen"):c.trend.direction==='up'?tt("vaker dan in eerdere lessen"):tt("ongeveer even vaak als in eerdere lessen"):null;
 return <div className={'error-cat rel-'+c.relevance}>
  <div className="row between wrap"><div className="row wrap">
   {teacher?<input className="field cat-label" value={c.label} onChange={e=>up({label:e.target.value})} aria-label={tt("Categorie")}/>:<b>{c.label}</b>}
   {c.count>0&&<span className="tag">{c.count_reliable?tt("{0}×",c.count):tt("±{0}× (sprekers niet gescheiden)",c.count)}</span>}
   <span className="tag">{tt(REL_LABEL[c.relevance]||c.relevance)}</span>
   {c.recurring&&<span className="tag recurring"><Repeat2 size={12}/> {tt("Terugkerend aandachtspunt")}</span>}
  </div>{teacher&&onDelete&&<button className="iconbtn danger" title={tt("Categorie verwijderen")} onClick={onDelete}><Trash2 size={14}/></button>}</div>
  {teacher?<textarea className="field" rows={2} value={c.explanation} onChange={e=>up({explanation:e.target.value})} aria-label={tt("Uitleg")}/>:c.explanation&&<p>{c.explanation}</p>}
  {!!c.examples.length&&<ul className="corrections">{c.examples.map((e,i)=><li key={i}>{e.certainty==='uncertain'&&<span className="tag uncertain">{tt("onzeker")}</span>} <s>{e.original}</s> → <b>{e.corrected}</b>
   {teacher&&<button className="iconbtn" title={tt("Voorbeeld verwijderen")} onClick={()=>up({examples:c.examples.filter((_,j)=>j!==i)})}><X size={12}/></button>}</li>)}</ul>}
  <small className="muted">{[c.self_corrections?tt("{0}× zelf verbeterd",c.self_corrections):'',trend||''].filter(Boolean).join(' · ')}</small>
 </div>
}

/** Read-only result (student, and teacher for older analyses). "Later" items are never presented as weaknesses. */
export function AnalysisV2View({doc,teacher=false}:{doc:AnalysisV2;teacher?:boolean}){
 const r=doc.report;const cats=doc.categories.filter(c=>c.count>0&&c.relevance!=='later');const self=doc.categories.reduce((n,c)=>n+c.self_corrections,0);
 return <div className="analysis-view v2">
  {r?.summary&&<p className="analysis-summary">{r.summary}</p>}
  <div className="grid2">
   {!!r?.covered?.length&&<div><h4>{tt("Behandeld")}</h4><ul>{r.covered.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!r?.went_well?.length&&<div><h4>{tt("Dit ging goed")}</h4><ul>{r.went_well.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!r?.focus?.length&&<div><h4>{tt("Aandachtspunten")}</h4><ul>{r.focus.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {r?.next_lesson&&teacher&&<div><h4>{tt("Volgende les")}</h4><p>{r.next_lesson}</p></div>}
  </div>
  {!!cats.length&&<><h4>{tt("Foutenanalyse")}</h4>{cats.map(c=><CategoryCard key={c.key} c={c} teacher={false}/>)}</>}
  {self>0&&<p className="muted">{tt("Je hebt jezelf {0}× verbeterd tijdens de les. Goed opgelet!",self)}</p>}
  {teacher&&doc.later_note&&<p className="muted"><b>{tt("Voor later:")}</b> {doc.later_note}</p>}
  {!!doc.vocabulary?.length&&<><h4>{tt("Woordenschat")}</h4><table className="vocab"><tbody>{doc.vocabulary.map((v,i)=><tr key={i}><td><b>{v.term}</b></td><td>{v.translation}</td></tr>)}</tbody></table></>}
 </div>
}

/** v40 "Lesonderwerpen": the AI proposes (from this analysis, no extra AI call), the teacher adjusts and confirms.
 *  Confirmed topics are the first source for homework "Vanuit mijn les". Stored in the analysis itself (no new table). */
function LessonTopicsBox({doc,onSave}:{doc:AnalysisV2;onSave:(t:LessonTopics)=>void}){
 const cur=(doc as AnalysisV2&{lesson_topics?:LessonTopics|null}).lesson_topics||null;
 const [t,setT]=useState<LessonTopics>(()=>cur||proposeTopics(doc));
 const F:[keyof Omit<LessonTopics,'instructions'|'confirmed_at'>,string][]=[['grammar','Behandelde grammatica'],['vocab','Woordenschat'],['errors','Fouten om te oefenen'],['repeat','Herhalen']];
 return <details className="topics-box" open={!cur?.confirmed_at}><summary className="row between"><b><ListChecks size={15}/> {tt("Lesonderwerpen")}</b>{cur?.confirmed_at?<span className="tag ok"><Check size={12}/> {tt("bevestigd")}</span>:<span className="tag">{tt("AI-voorstel")}</span>}</summary>
  <div className="grid2">{F.map(([k,l])=><label key={k} className="stack"><span className="label">{tt(l)} <small className="muted">{tt("(één per regel)")}</small></span><textarea className="field" rows={3} value={lines(t[k])} onChange={e=>setT(x=>({...x,[k]:unlines(e.target.value)}))}/></label>)}</div>
  <label className="stack"><span className="label">{tt("Instructies voor het huiswerk")}</span><input className="field" value={t.instructions} placeholder={tt("bijv. focus op het perfectum met zijn")} onChange={e=>setT(x=>({...x,instructions:e.target.value.slice(0,600)}))}/></label>
  <div className="row"><button className="button small" onClick={()=>onSave({...t,confirmed_at:new Date().toISOString()})}><Check size={14}/> {cur?.confirmed_at?tt("Wijzigingen bevestigen"):tt("Lesonderwerpen bevestigen")}</button>
   <button className="button small secondary" onClick={()=>setT(proposeTopics(doc))}>{tt("AI-voorstel terugzetten")}</button></div>
 </details>
}

type TopicName={id:string;title:string;status:GoalStatus};
/** Teacher: review and edit a finished analysis. Edits are saved to the version the student sees (not for TEST). */
export function TeacherAnalysisV2({a,onChange,lessonLang}:{a:V2Row;onChange:()=>void;lessonLang?:string}){
 const src=(a.final||a.draft) as AnalysisV2;const [doc,setDoc]=useState<AnalysisV2>(src);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 const [keep,setKeep]=useState<boolean[]>(src.vocabulary.map(()=>true));const [topics,setTopics]=useState<Record<string,TopicName>>({});const [adj,setAdj]=useState<Record<string,GoalStatus>>({});
 useEffect(()=>{const ids=src.checklist_suggestions.map(s=>s.topic_id);if(!ids.length)return;const db=supabase()!;
  void Promise.all([db.from('curriculum_goals').select('id,title').in('id',ids),db.from('student_goal_progress').select('goal_id,status,title_override').eq('student_id',a.student_id).in('goal_id',ids)]).then(([g,p])=>{
   const pm=new Map(((p.data||[]) as {goal_id:string;status:GoalStatus;title_override?:string|null}[]).map(x=>[x.goal_id,x]));
   setTopics(Object.fromEntries(((g.data||[]) as {id:string;title:string}[]).map(x=>[x.id,{id:x.id,title:pm.get(x.id)?.title_override||x.title,status:pm.get(x.id)?.status||'not_started'}])))})},[a.id]);
 const published=!a.is_test&&a.status==='approved';
 async function save(next=doc,note?:string){setBusy(true);setMsg('');
  const r=await supabase()!.from('lesson_analyses').update(a.is_test?{draft:next,updated_at:new Date().toISOString()}:{draft:next,final:next,updated_at:new Date().toISOString()}).eq('id',a.id);
  setBusy(false);setMsg(r.error?r.error.message:note||(published?tt("Opgeslagen. De leerling ziet de aangepaste versie."):tt("Opgeslagen.")));if(!r.error)onChange()}
 const setReport=(p:Partial<NonNullable<AnalysisV2['report']>>)=>setDoc(d=>({...d,report:{...(d.report||{summary:'',covered:[],went_well:[],focus:[],next_lesson:''}),...p}}));
 const setCat=(key:string,c:Category|null)=>setDoc(d=>({...d,categories:c?d.categories.map(x=>x.key===key?c:x):d.categories.filter(x=>x.key!==key)}));
 async function decide(s:Suggestion,decision:'accepted'|'rejected'|'adjusted'){
  if(a.is_test)return;const to=decision==='adjusted'?(adj[s.topic_id]||s.to):s.to;
  if(decision!=='rejected'){const db=supabase()!;const cur=await db.from('student_goal_progress').select('*').eq('student_id',a.student_id).eq('goal_id',s.topic_id).maybeSingle();
   const c=cur.data as {lesson_refs?:string[];note?:string;hidden?:boolean;title_override?:string|null;level_override?:string|null}|null;
   const refs=[...new Set([...(c?.lesson_refs||[]),a.lesson_date])].slice(-20);
   const r=await db.from('student_goal_progress').upsert({student_id:a.student_id,goal_id:s.topic_id,status:to,basis:'ai_confirmed',lesson_date:a.lesson_date,lesson_refs:refs,note:c?.note||'',hidden:c?.hidden||false,title_override:c?.title_override||null,level_override:c?.level_override||null,updated_at:new Date().toISOString()},{onConflict:'student_id,goal_id'});
   if(r.error){setMsg(r.error.message);return}}
  const next={...doc,checklist_suggestions:doc.checklist_suggestions.map(x=>x.topic_id===s.topic_id?{...x,to,decision}:x)};setDoc(next);
  await save(next,decision==='rejected'?tt("Voorstel afgewezen; het leertraject is niet gewijzigd."):tt("Leertraject bijgewerkt: {0} → {1}.",topics[s.topic_id]?.title||'',GOAL_STATUS_LABEL[to]))}
 async function addWords(){const words=doc.vocabulary.filter((_,i)=>keep[i]);const r=await addVocab(supabase()!,a.student_id,words,'ai',a.lesson_date);setMsg(tt("{0} woorden toegevoegd aan de woordenlijst{1}.",r.added,r.skipped?tt(" ({0} stonden er al)",r.skipped):''))}
 const rep=doc.report;const main=doc.categories.filter(c=>c.relevance!=='later'&&(c.count>0||c.self_corrections>0));const later=doc.categories.filter(c=>c.relevance==='later');
 const hw=doc.homework;
 return <div className="analysis-editor v2">
  <div className={'quality q-'+doc.source_quality}><Bot size={15}/> <b>{tt("AI-lesanalyse")}</b> {tt("· brongegevens:")} {doc.source_quality==='good'?tt("goed"):doc.source_quality==='partial'?tt("gedeeltelijk"):tt("onvoldoende")}{doc.quality_note&&<> — {doc.quality_note}</>}
   <small className="muted block">{tt("{0} transcriptdelen · {1} leerlingzinnen · {2} niet-verifieerbare fouten weggelaten · taal van de uitleg: {3}",doc.chunks,doc.student_utterances,doc.dropped_unverified,doc.explanation_language)}</small></div>
  {a.is_test?<p className="notice test-note"><span className="test-badge">{'TEST'}</span> {tt('TEST-analyse: nooit gedeeld met de leerling; geen huiswerk, geen voorstellen voor het leertraject.')}</p>
   :published&&<p className="muted"><CheckCircle2 size={14}/> {tt("Verslag en foutenanalyse zijn automatisch gedeeld met de leerling{0}. Je kunt ze hier aanpassen.",a.published_at?' ('+niceDate(a.published_at)+')':'')}</p>}

  {!a.is_test&&<details className="compact-preview"><summary><b>{tt("Zo ziet de leerling het verslag")}</b></summary><LessonReport doc={doc} teacher lessonLang={lessonLang}/></details>}

  <h4>{tt("Kort lesverslag")}</h4>
  <label className="stack"><span className="label">{tt("Samenvatting")}</span><textarea className="field" rows={4} value={rep?.summary||''} onChange={e=>setReport({summary:e.target.value})}/></label>
  <div className="grid2">
   <label className="stack"><span className="label">{tt("Behandeld (één per regel)")}</span><textarea className="field" rows={3} value={lines(rep?.covered)} onChange={e=>setReport({covered:unlines(e.target.value)})}/></label>
   <label className="stack"><span className="label">{tt("Dit ging goed")}</span><textarea className="field" rows={3} value={lines(rep?.went_well)} onChange={e=>setReport({went_well:unlines(e.target.value)})}/></label>
   <label className="stack"><span className="label">{tt("Aandachtspunten")}</span><textarea className="field" rows={3} value={lines(rep?.focus)} onChange={e=>setReport({focus:unlines(e.target.value)})}/></label>
   <label className="stack"><span className="label">{tt("Voorstel volgende les (alleen voor jou)")}</span><textarea className="field" rows={3} value={rep?.next_lesson||''} onChange={e=>setReport({next_lesson:e.target.value})}/></label>
  </div>

  <h4>{tt("Foutenanalyse")} <small className="muted">{tt("(gegroepeerd per regel, max. 2 voorbeelden · alleen letterlijke zinnen van de leerling ·")} {doc.speakers_separated?tt("sprekers gescheiden"):tt("sprekers niet gescheiden: tellingen zijn een schatting")})</small></h4>
  {main.length?main.map(c=><CategoryCard key={c.key} c={c} teacher onChange={x=>setCat(c.key,x)} onDelete={()=>setCat(c.key,null)}/>):<p className="muted">{tt("Geen relevante fouten gevonden.")}</p>}
  {!!later.length&&<details className="later"><summary>{tt("Voor later ({0}) — geen zwakte, nog niet behandelde stof",later.length)}</summary>{later.map(c=><CategoryCard key={c.key} c={c} teacher onChange={x=>setCat(c.key,x)} onDelete={()=>setCat(c.key,null)}/>)}</details>}
  {doc.later_note&&<p className="muted small-print">{doc.later_note}</p>}
  <div className="row"><button className="button" disabled={busy} onClick={()=>void save()}><Check size={15}/> {tt("Wijzigingen opslaan")}</button>{msg&&<span className="muted" role="status">{msg}</span>}</div>

  {!a.is_test&&!!doc.checklist_suggestions.length&&<><h4>{tt("Voorstellen voor het leertraject")} <small className="muted">{tt("(niets verandert zonder jouw akkoord)")}</small></h4>
   <ul className="goal-suggest">{doc.checklist_suggestions.map(s=><li key={s.topic_id} className={s.decision?'decided':''}>
    <span className="grow"><b>{topics[s.topic_id]?.title||tt("Onderwerp")}</b> <small className="muted">{GOAL_STATUS_LABEL[s.from]} → {GOAL_STATUS_LABEL[s.to]} · {s.reason}</small></span>
    {s.decision?<span className="tag">{s.decision==='rejected'?tt("afgewezen"):tt("overgenomen")}</span>:<>
     <button className="button small" onClick={()=>void decide(s,'accepted')}><Check size={13}/> {tt("Accepteren")}</button>
     <select className="cell" value={adj[s.topic_id]||s.to} onChange={e=>setAdj(x=>({...x,[s.topic_id]:e.target.value as GoalStatus}))} aria-label={tt("Status")}>{(['covered','in_progress','mastered'] as GoalStatus[]).map(k=><option key={k} value={k}>{GOAL_STATUS_LABEL[k]}</option>)}</select>
     <button className="button small secondary" onClick={()=>void decide(s,'adjusted')}>{tt("Aangepast overnemen")}</button>
     <button className="button small secondary" onClick={()=>void decide(s,'rejected')}><X size={13}/> {tt("Afwijzen")}</button></>}
   </li>)}</ul></>}

  {!!doc.vocabulary.length&&<><h4>{tt("Nieuwe woorden uit de les")}</h4>
   <table className="vocab edit"><tbody>{doc.vocabulary.map((v,i)=><tr key={i}><td><input type="checkbox" checked={keep[i]} onChange={()=>setKeep(k=>k.map((x,j)=>j===i?!x:x))}/></td><td><b>{v.term}</b></td><td>{v.translation}</td><td>{v.status&&<span className={'tag'+(v.status==='difficult'?' uncertain':'')}>{v.status==='difficult'?tt('nog moeilijk'):v.status==='practised'?tt('opnieuw geoefend'):tt('nieuw')}</span>}</td></tr>)}</tbody></table>
   {!a.is_test&&<p className="muted small-print">{tt('Nieuwe woorden staan ook als voorstel in de Woordenlijst; woorden die nog moeilijk zijn, krijgen voorrang bij flashcards en spelletjes.')}</p>}
   {!a.is_test&&<button className="button small secondary" onClick={()=>void addWords()}><Plus size={14}/> {tt("Aangevinkte woorden naar de woordenlijst")}</button>}</>}

  {!a.is_test&&<LessonTopicsBox doc={doc} onSave={t=>{const next={...doc,lesson_topics:t} as AnalysisV2;setDoc(next);void save(next,tt("Lesonderwerpen bevestigd. Huiswerk 'Vanuit mijn les' gebruikt ze voortaan."))}}/>}

  <h4><ClipboardList size={15}/> {tt("Huiswerk")}</h4>
  {hw?.assignment_id?<p>{tt("Huiswerkconcept met {0} oefeningen staat klaar onder de tab Huiswerk. De leerling ziet het pas nadat jij het hebt gecontroleerd en gepubliceerd.",hw.items)}</p>
   :<p className="muted">{hw?.skipped_reason==='test'?tt("Geen huiswerk: dit is een TEST-analyse."):hw?.skipped_reason==='too_little_content'?tt("Geen huiswerk: te weinig lesinhoud voor zinvolle oefeningen."):hw?.skipped_reason==='no_relevant_mistakes'?tt("Geen huiswerk: geen relevante fouten in behandelde stof."):tt("Geen huiswerk gemaakt.")}</p>}

  {a.transcript&&<details className="transcript"><summary><FileText size={14}/> {tt("Transcriptie bekijken")}</summary><pre>{a.transcript}</pre></details>}
 </div>
}
