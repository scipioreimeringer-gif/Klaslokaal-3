'use client';
import {useCallback,useEffect,useState} from 'react';
import {Sparkles,CheckCircle2,AlertTriangle,Loader2,RotateCcw,Trash2,FileText,Bot} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {approveAnalysis,authedPost,type AnalysisRow} from '../lib/learning';
import {STATUS_LABEL,type AnalysisDoc,type AnalysisStatus} from '../lib/analysisTypes';
import {niceDate} from '../lib/data';

const lines=(a:string[]|undefined)=>(a||[]).join('\n');
const unlines=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);

export function StatusChip({status}:{status:AnalysisStatus}){
 const Icon=status==='approved'?CheckCircle2:status==='failed'?AlertTriangle:status==='ready'?Sparkles:Loader2;
 return <span className={'status-chip st-'+status}><Icon size={13} className={status==='processing'||status==='queued'?'spin':''}/>{STATUS_LABEL[status]}</span>
}

/** Read-only rendering of an (approved) analysis. */
export function AnalysisView({doc}:{doc:AnalysisDoc}){
 return <div className="analysis-view">
  <p className="analysis-summary">{doc.summary}</p>
  <div className="grid2">
   {!!doc.covered?.length&&<div><h4>Behandeld</h4><ul>{doc.covered.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!doc.practiced?.length&&<div><h4>Geoefend</h4><ul>{doc.practiced.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!doc.needs_attention?.length&&<div><h4>Extra aandacht</h4><ul>{doc.needs_attention.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {doc.next_lesson&&<div><h4>Volgende les</h4><p>{doc.next_lesson}</p></div>}
  </div>
  {!!doc.vocabulary?.length&&<><h4>Woordenschat</h4><table className="vocab"><tbody>{doc.vocabulary.map((v,i)=><tr key={i}><td><b>{v.term}</b></td><td>{v.translation}</td><td className="muted">{v.example}</td></tr>)}</tbody></table></>}
  {!!doc.grammar?.length&&<><h4>Grammatica</h4><ul>{doc.grammar.map((g,i)=><li key={i}><b>{g.topic}</b>: {g.explanation}</li>)}</ul></>}
  {!!doc.corrections?.length&&<><h4>Correcties</h4><ul className="corrections">{doc.corrections.map((c,i)=><li key={i}><s>{c.original}</s> → <b>{c.corrected}</b>{c.explanation&&<small> {c.explanation}</small>}</li>)}</ul></>}
  {!!doc.exercises?.length&&<><h4>Voorgestelde oefeningen</h4><ul>{doc.exercises.map((e,i)=><li key={i}><span className="tag">{e.type}</span> {e.prompt}</li>)}</ul></>}
 </div>
}

function Editor({a,onDone}:{a:AnalysisRow;onDone:()=>void}){
 const d=a.draft!;const [doc,setDoc]=useState<AnalysisDoc>(d);const [keepVocab,setKeepVocab]=useState<boolean[]>(d.vocabulary.map(()=>true));
 const [goalPick,setGoalPick]=useState<Record<string,'skip'|'in_progress'|'covered'>>(Object.fromEntries(d.goal_suggestions.map(g=>[g.goal_code,'covered'])));
 const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');const [showT,setShowT]=useState(false);
 const set=<K extends keyof AnalysisDoc>(k:K,v:AnalysisDoc[K])=>setDoc(x=>({...x,[k]:v}));
 async function approve(){setBusy(true);setMsg('');try{const final:AnalysisDoc={...doc,vocabulary:doc.vocabulary.filter((_,i)=>keepVocab[i]),goal_suggestions:[]};
  const goals=Object.entries(goalPick).filter(([,s])=>s!=='skip').map(([code,status])=>({code,status:status as 'in_progress'|'covered'}));
  const {data:{user}}=await supabase()!.auth.getUser();const r=await approveAnalysis(supabase()!,a,final,goals,user!.id);
  setMsg(`Goedgekeurd en gedeeld met de leerling. ${r.vocab.added} woorden toegevoegd${r.vocab.skipped?` (${r.vocab.skipped} stonden er al)`:''}, ${r.goalsSaved} leerdoelen bijgewerkt.`);onDone()}catch(e){setMsg('Goedkeuren mislukt: '+(e instanceof Error?e.message:e))}setBusy(false)}
 return <div className="analysis-editor">
  <div className={'quality q-'+a.source_quality}><Bot size={15}/> <b>AI-concept</b> · brongegevens: {a.source_quality==='good'?'goed':a.source_quality==='partial'?'gedeeltelijk':'onvoldoende'}{doc.quality_note&&<> — {doc.quality_note}</>}{a.error&&<> · {a.error}</>}</div>
  <label className="stack"><span className="label">Samenvatting (100–150 woorden, zichtbaar voor de leerling)</span><textarea className="field" rows={6} value={doc.summary} onChange={e=>set('summary',e.target.value)}/></label>
  <div className="grid2">
   <label className="stack"><span className="label">Behandeld (één per regel)</span><textarea className="field" rows={4} value={lines(doc.covered)} onChange={e=>set('covered',unlines(e.target.value))}/></label>
   <label className="stack"><span className="label">Geoefend</span><textarea className="field" rows={4} value={lines(doc.practiced)} onChange={e=>set('practiced',unlines(e.target.value))}/></label>
   <label className="stack"><span className="label">Extra aandacht</span><textarea className="field" rows={3} value={lines(doc.needs_attention)} onChange={e=>set('needs_attention',unlines(e.target.value))}/></label>
   <label className="stack"><span className="label">Voorstel volgende les</span><textarea className="field" rows={3} value={doc.next_lesson} onChange={e=>set('next_lesson',e.target.value)}/></label>
  </div>
  <h4>Woordenschat <small className="muted">(aangevinkte woorden komen na goedkeuring in de woordenlijst)</small></h4>
  {doc.vocabulary.length?<table className="vocab edit"><tbody>{doc.vocabulary.map((v,i)=><tr key={i}><td><input type="checkbox" checked={keepVocab[i]} onChange={()=>setKeepVocab(k=>k.map((x,j)=>j===i?!x:x))}/></td>
   <td><input className="field" value={v.term} onChange={e=>set('vocabulary',doc.vocabulary.map((x,j)=>j===i?{...x,term:e.target.value}:x))}/></td>
   <td><input className="field" value={v.translation} onChange={e=>set('vocabulary',doc.vocabulary.map((x,j)=>j===i?{...x,translation:e.target.value}:x))}/></td>
   <td><input className="field" value={v.example} onChange={e=>set('vocabulary',doc.vocabulary.map((x,j)=>j===i?{...x,example:e.target.value}:x))}/></td></tr>)}</tbody></table>:<p className="muted">Geen woorden voorgesteld.</p>}
  <button className="button small secondary" onClick={()=>{set('vocabulary',[...doc.vocabulary,{term:'',translation:'',example:'',kind:'word'}]);setKeepVocab(k=>[...k,true])}}>+ Woord toevoegen</button>
  <div className="grid2">
   <label className="stack"><span className="label">Grammatica (onderwerp: uitleg)</span><textarea className="field" rows={4} value={doc.grammar.map(g=>`${g.topic}: ${g.explanation}`).join('\n')} onChange={e=>set('grammar',unlines(e.target.value).map(l=>{const [t,...r]=l.split(':');return {topic:t.trim(),explanation:r.join(':').trim()}}))}/></label>
   <label className="stack"><span className="label">Correcties (fout → goed — uitleg)</span><textarea className="field" rows={4} value={doc.corrections.map(c=>`${c.original} → ${c.corrected}${c.explanation?' — '+c.explanation:''}`).join('\n')} onChange={e=>set('corrections',unlines(e.target.value).map(l=>{const [o,rest='']=l.split('→');const [c,...ex]=rest.split('—');return {original:o.trim(),corrected:c.trim(),explanation:ex.join('—').trim()}}))}/></label>
  </div>
  <label className="stack"><span className="label">Voorgestelde oefeningen (één per regel)</span><textarea className="field" rows={3} value={doc.exercises.map(x=>x.prompt).join('\n')} onChange={e=>set('exercises',unlines(e.target.value).map(p=>({type:'oefening',prompt:p})))}/></label>
  {!!d.goal_suggestions.length&&<><h4>Leerdoelen <small className="muted">(AI-voorstel — jij bepaalt; “beheerst” kan alleen jij later instellen)</small></h4>
   <ul className="goal-suggest">{d.goal_suggestions.map(g=><li key={g.goal_code}><select className="field" value={goalPick[g.goal_code]} onChange={e=>setGoalPick(p=>({...p,[g.goal_code]:e.target.value as 'skip'|'in_progress'|'covered'}))}><option value="covered">Behandeld</option><option value="in_progress">Mee bezig</option><option value="skip">Niet overnemen</option></select><span><b>{g.goal_code}</b> <small className="muted">{g.evidence}</small></span></li>)}</ul></>}
  {a.transcript&&<details className="transcript" open={showT} onToggle={e=>setShowT((e.target as HTMLDetailsElement).open)}><summary><FileText size={14}/> Transcriptie bekijken</summary><pre>{a.transcript}</pre></details>}
  <div className="row"><button className="button" disabled={busy} onClick={()=>void approve()}><CheckCircle2 size={16}/> Goedkeuren en delen met leerling</button>{msg&&<span className="muted" role="status">{msg}</span>}</div>
 </div>
}

export function TeacherAnalyses({studentId}:{studentId:string}){
 const [rows,setRows]=useState<AnalysisRow[]>([]);const [recs,setRecs]=useState<{id:string;created_at:string;ai:boolean}[]>([]);const [err,setErr]=useState('');const [open,setOpen]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const db=supabase()!;
  const [a,r]=await Promise.all([db.from('lesson_analyses').select('id,student_id,recording_id,lesson_date,status,transcript,source_quality,draft,final,error,approved_at,created_at').eq('student_id',studentId).order('created_at',{ascending:false}),
   db.from('lesson_recordings').select('id,created_at,ai_consent_teacher_at,ai_consent_student_at').eq('student_id',studentId).order('created_at',{ascending:false})]);
  if(a.error){setErr(a.error.message.includes('lesson_analyses')||a.error.code==='42P01'||a.error.code==='PGRST205'?'Database-update v28 ontbreekt: voer supabase/v28.sql uit.':a.error.message);return}
  setRows((a.data||[]) as AnalysisRow[]);setRecs(((r.data||[]) as {id:string;created_at:string;ai_consent_teacher_at:string|null;ai_consent_student_at:string|null}[]).map(x=>({id:x.id,created_at:x.created_at,ai:!!(x.ai_consent_teacher_at&&x.ai_consent_student_at)})))},[studentId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!rows.some(r=>r.status==='processing'||r.status==='queued'))return;const t=setInterval(()=>void load(),8000);return()=>clearInterval(t)},[rows,load]);
 async function start(recordingId:string){setBusy(true);setErr('');try{await authedPost(supabase()!,'/api/ai/analyze',{recordingId});await load()}catch(e){setErr(e instanceof Error?e.message:String(e))}setBusy(false)}
 async function remove(a:AnalysisRow){if(!confirm('Deze analyse (inclusief transcriptie) definitief verwijderen? De opname zelf blijft bestaan.'))return;const r=await supabase()!.from('lesson_analyses').delete().eq('id',a.id);if(r.error)setErr(r.error.message);await load()}
 const pendingRecs=recs.filter(r=>r.ai&&!rows.some(a=>a.recording_id===r.id));
 return <div className="analyses">
  {err&&<div className="notice">{err}</div>}
  {pendingRecs.map(r=><div className="analysis-card" key={r.id}><div className="row between"><span><b>Opname {niceDate(r.created_at)}</b> <small className="muted">toestemming voor AI-analyse gegeven</small></span><button className="button small" disabled={busy} onClick={()=>void start(r.id)}><Sparkles size={14}/> Analyse starten</button></div></div>)}
  {!rows.length&&!pendingRecs.length&&<p className="muted">Nog geen lesanalyses. Start een opname in het live klaslokaal en vink “AI-lesanalyse” aan; als je leerling ook toestemming geeft, verschijnt de analyse hier automatisch ter controle.</p>}
  {rows.map(a=><div className="analysis-card" key={a.id}>
   <div className="row between"><button className="analysis-head" onClick={()=>setOpen(open===a.id?null:a.id)}><b>{niceDate(a.lesson_date)}</b><StatusChip status={a.status}/></button>
    <div className="row">{a.status==='failed'&&a.recording_id&&<button className="button small secondary" disabled={busy} onClick={()=>void start(a.recording_id!)}><RotateCcw size={14}/> Opnieuw</button>}<button className="iconbtn danger" title="Analyse verwijderen" onClick={()=>void remove(a)}><Trash2 size={15}/></button></div></div>
   {a.status==='failed'&&<p className="muted">{a.error}</p>}
   {open===a.id&&a.status==='ready'&&a.draft&&<Editor a={a} onDone={()=>void load()}/>}
   {open===a.id&&a.status==='approved'&&a.final&&<AnalysisView doc={a.final}/>}
   {open!==a.id&&(a.status==='ready')&&<p className="muted small-print">Klik om het concept te controleren en goed te keuren. De leerling ziet nog niets.</p>}
  </div>)}
 </div>
}

export function StudentSummaries({studentId}:{studentId:string}){
 const [rows,setRows]=useState<{id:string;lesson_date:string;final:AnalysisDoc}[]|null>(null);const [err,setErr]=useState('');
 useEffect(()=>{void supabase()!.rpc('student_lesson_summaries',{sid:studentId}).then(({data,error})=>{if(error)setErr(error.message.includes('student_lesson_summaries')?'Nog niet beschikbaar (database-update v28 ontbreekt).':error.message);setRows((data||[]) as {id:string;lesson_date:string;final:AnalysisDoc}[])})},[studentId]);
 if(err)return <p className="muted">{err}</p>;
 if(!rows)return <div className="loader small"/>;
 if(!rows.length)return <p className="muted">Nog geen lessamenvattingen. Na een opgenomen les (met jouw toestemming voor AI-analyse) maakt AI een concept; je docent controleert het en deelt het daarna met jou.</p>;
 return <div className="analyses">{rows.map(r=><details className="analysis-card" key={r.id} open={r===rows[0]}><summary className="analysis-head"><b>{niceDate(r.lesson_date)}</b><span className="status-chip st-approved"><CheckCircle2 size={13}/> Goedgekeurd door docent</span></summary><AnalysisView doc={r.final}/></details>)}</div>
}
