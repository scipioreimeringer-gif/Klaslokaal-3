'use client';
import {useCallback,useEffect,useState} from 'react';
import {Sparkles,CheckCircle2,AlertTriangle,Loader2,RotateCcw,Trash2,FileText,Bot,FlaskConical,X} from 'lucide-react';
import {useAuth} from './Auth';
import {loadStudents,type StudentRecord} from '../lib/data';
import {supabase} from '../lib/supabase';
import {approveAnalysis,authedPost,type AnalysisRow} from '../lib/learning';
import {CATEGORY_LABEL,STATUS_LABEL,type AnalysisDoc,type AnalysisStatus,type Correction,type CorrectionCategory} from '../lib/analysisTypes';
import {niceDate} from '../lib/data';
import {t as tt} from '../lib/i18n';
import {StageProgress,TeacherAnalysisV2,isV2,type V2Row} from './AnalysisV2';
import type {AnalysisV2} from '../lib/analysis/pipeline';
import {LessonReport} from './LessonReport';
import {CompactAnalysis} from './CompactAnalysis';
import {Flag} from './Flag';
import {languageName} from '../lib/languages';
import {getLang} from '../lib/i18n';
import {applyTexts,extractTexts,switchLanguages} from '../lib/analysis/translate';

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
   {!!doc.covered?.length&&<div><h4>{tt("Behandeld")}</h4><ul>{doc.covered.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!doc.practiced?.length&&<div><h4>{tt("Geoefend")}</h4><ul>{doc.practiced.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {!!doc.needs_attention?.length&&<div><h4>{tt("Extra aandacht")}</h4><ul>{doc.needs_attention.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
   {doc.next_lesson&&<div><h4>{tt("Volgende les")}</h4><p>{doc.next_lesson}</p></div>}
  </div>
  {!!doc.vocabulary?.length&&<><h4>{tt("Woordenschat")}</h4><table className="vocab"><tbody>{doc.vocabulary.map((v,i)=><tr key={i}><td><b>{v.term}</b></td><td>{v.translation}</td><td className="muted">{v.example}</td></tr>)}</tbody></table></>}
  {!!doc.grammar?.length&&<><h4>{tt("Grammatica")}</h4><ul>{doc.grammar.map((g,i)=><li key={i}><b>{g.topic}</b>: {g.explanation}</li>)}</ul></>}
  {!!doc.corrections?.length&&<><h4>{tt("Taalcorrecties")}</h4><ul className="corrections">{doc.corrections.map((c,i)=><li key={i}>{c.category&&<span className="tag">{CATEGORY_LABEL[c.category]}</span>}{c.certainty==='uncertain'&&<span className="tag uncertain">{tt("onzeker")}</span>} <s>{c.original}</s> → <b>{c.corrected}</b>{c.explanation&&<small className="block">{c.explanation}</small>}</li>)}</ul></>}
  {!!doc.recurring_errors?.length&&<><h4>{tt("Terugkerende fouten")}</h4><ul>{doc.recurring_errors.map((r,i)=><li key={i}>{r.pattern} <small className="muted">({r.occurrences}{tt("×)")}</small></li>)}</ul></>}
  {!!doc.informal_notes?.length&&<><h4>{tt("Informele spreektaal (geen fout)")}</h4><ul>{doc.informal_notes.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
  {!!doc.pronunciation?.length&&<><h4>{tt("Uitspraak")} <small className="muted">{tt("(voorzichtig: spraakherkenning meet uitspraak niet betrouwbaar)")}</small></h4><ul>{doc.pronunciation.map((p,i)=><li key={i}><b>{p.word}</b>: {p.note}</li>)}</ul></>}
  {doc.homework_suggestion&&<><h4>{tt("Voorgesteld huiswerk")}</h4><p>{doc.homework_suggestion}</p></>}
  {!!doc.exercises?.length&&<><h4>{tt("Voorgestelde oefeningen")}</h4><ul>{doc.exercises.map((e,i)=><li key={i}><span className="tag">{e.type}</span> {e.prompt}</li>)}</ul></>}
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
  setMsg(tt("Goedgekeurd en gedeeld met de leerling. {0} woorden toegevoegd{1}, {2} leerdoelen bijgewerkt.", r.vocab.added, r.vocab.skipped?tt(" ({0} stonden er al)", r.vocab.skipped):'', r.goalsSaved));onDone()}catch(e){setMsg(tt("Goedkeuren mislukt: ")+(e instanceof Error?e.message:e))}setBusy(false)}
 return <div className="analysis-editor">
  <div className={'quality q-'+a.source_quality}><Bot size={15}/> <b>{tt("AI-concept")}</b> {tt("· brongegevens:")} {a.source_quality==='good'?tt("goed"):a.source_quality==='partial'?tt("gedeeltelijk"):tt("onvoldoende")}{doc.quality_note&&<> — {doc.quality_note}</>}{a.error&&<> · {a.error}</>}</div>
  <label className="stack"><span className="label">{tt("Samenvatting (100–150 woorden, zichtbaar voor de leerling)")}</span><textarea className="field" rows={6} value={doc.summary} onChange={e=>set('summary',e.target.value)}/></label>
  <div className="grid2">
   <label className="stack"><span className="label">{tt("Behandeld (één per regel)")}</span><textarea className="field" rows={4} value={lines(doc.covered)} onChange={e=>set('covered',unlines(e.target.value))}/></label>
   <label className="stack"><span className="label">{tt("Geoefend")}</span><textarea className="field" rows={4} value={lines(doc.practiced)} onChange={e=>set('practiced',unlines(e.target.value))}/></label>
   <label className="stack"><span className="label">{tt("Extra aandacht")}</span><textarea className="field" rows={3} value={lines(doc.needs_attention)} onChange={e=>set('needs_attention',unlines(e.target.value))}/></label>
   <label className="stack"><span className="label">{tt("Voorstel volgende les")}</span><textarea className="field" rows={3} value={doc.next_lesson} onChange={e=>set('next_lesson',e.target.value)}/></label>
  </div>
  <h4>{tt("Woordenschat")} <small className="muted">{tt("(aangevinkte woorden komen na goedkeuring in de woordenlijst)")}</small></h4>
  {doc.vocabulary.length?<table className="vocab edit"><tbody>{doc.vocabulary.map((v,i)=><tr key={i}><td><input type="checkbox" checked={keepVocab[i]} onChange={()=>setKeepVocab(k=>k.map((x,j)=>j===i?!x:x))}/></td>
   <td><input className="field" value={v.term} onChange={e=>set('vocabulary',doc.vocabulary.map((x,j)=>j===i?{...x,term:e.target.value}:x))}/></td>
   <td><input className="field" value={v.translation} onChange={e=>set('vocabulary',doc.vocabulary.map((x,j)=>j===i?{...x,translation:e.target.value}:x))}/></td>
   <td><input className="field" value={v.example} onChange={e=>set('vocabulary',doc.vocabulary.map((x,j)=>j===i?{...x,example:e.target.value}:x))}/></td></tr>)}</tbody></table>:<p className="muted">{tt("Geen woorden voorgesteld.")}</p>}
  <button className="button small secondary" onClick={()=>{set('vocabulary',[...doc.vocabulary,{term:'',translation:'',example:'',kind:'word'}]);setKeepVocab(k=>[...k,true])}}>{tt("+ Woord toevoegen")}</button>
  <div className="grid2">
   <label className="stack"><span className="label">{tt("Grammatica (onderwerp: uitleg)")}</span><textarea className="field" rows={4} value={doc.grammar.map(g=>`${g.topic}: ${g.explanation}`).join('\n')} onChange={e=>set('grammar',unlines(e.target.value).map(l=>{const [t,...r]=l.split(':');return {topic:t.trim(),explanation:r.join(':').trim()}}))}/></label>
   <label className="stack"><span className="label">{tt("Correcties (fout → goed — uitleg)")}</span><textarea className="field" rows={4} value={doc.corrections.map(c=>`${c.original} → ${c.corrected}${c.explanation?' — '+c.explanation:''}`).join('\n')} onChange={e=>set('corrections',unlines(e.target.value).map(l=>{const [o,rest='']=l.split('→');const [c,...ex]=rest.split('—');return {original:o.trim(),corrected:c.trim(),explanation:ex.join('—').trim()}}))}/></label>
  </div>
  <h4>{tt("Taalcorrecties")} <small className="muted">{tt("(alleen zinnen die de leerling zelf zei ·")} {doc.speakers_separated?tt("sprekers gescheiden via aparte sporen"):tt("sprekers niet gescheiden: controleer extra goed")})</small></h4>
  {doc.corrections.length?<table className="vocab edit corr"><thead><tr><th>{tt("Zin van leerling")}</th><th>{tt("Correctie")}</th><th>{tt("Uitleg")}</th><th>{tt("Soort")}</th><th>{tt("Zeker?")}</th><th/></tr></thead><tbody>{doc.corrections.map((c,i)=>{const up=(p:Partial<Correction>)=>set('corrections',doc.corrections.map((x,j)=>j===i?{...x,...p}:x));return <tr key={i} className={c.certainty==='uncertain'?'uncertain-row':''}>
   <td><input className="field" value={c.original} onChange={e=>up({original:e.target.value})}/></td><td><input className="field" value={c.corrected} onChange={e=>up({corrected:e.target.value})}/></td><td><input className="field" value={c.explanation} onChange={e=>up({explanation:e.target.value})}/></td>
   <td><select className="cell" value={c.category||'other'} onChange={e=>up({category:e.target.value as CorrectionCategory})}>{(Object.keys(CATEGORY_LABEL) as CorrectionCategory[]).map(k=><option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}</select></td>
   <td><select className="cell" value={c.certainty||'certain'} onChange={e=>up({certainty:e.target.value as 'certain'|'uncertain'})}><option value="certain">{tt("zeker")}</option><option value="uncertain">{tt("onzeker")}</option></select></td>
   <td><button className="iconbtn danger" title={tt("Verwijderen")} onClick={()=>set('corrections',doc.corrections.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></td></tr>})}</tbody></table>:<p className="muted">{tt("Geen correcties gevonden.")}</p>}
  <button className="button small secondary" onClick={()=>set('corrections',[...doc.corrections,{original:'',corrected:'',explanation:'',category:'grammar',certainty:'certain'}])}>{tt("+ Correctie toevoegen")}</button>
  {doc.student_speaking_seconds!=null&&<p className="muted small-print">{tt("Gemeten spreektijd leerling:")} {Math.round(doc.student_speaking_seconds/60)} {tt("min (uit het aparte leerlingspoor).")}</p>}
  <label className="stack"><span className="label">{tt("Voorgestelde oefeningen (één per regel)")}</span><textarea className="field" rows={3} value={doc.exercises.map(x=>x.prompt).join('\n')} onChange={e=>set('exercises',unlines(e.target.value).map(p=>({type:'oefening',prompt:p})))}/></label>
  {!!d.goal_suggestions.length&&<><h4>{tt("Leerdoelen")} <small className="muted">{tt("(AI-voorstel — jij bepaalt; “beheerst” kan alleen jij later instellen)")}</small></h4>
   <ul className="goal-suggest">{d.goal_suggestions.map(g=><li key={g.goal_code}><select className="field" value={goalPick[g.goal_code]} onChange={e=>setGoalPick(p=>({...p,[g.goal_code]:e.target.value as 'skip'|'in_progress'|'covered'}))}><option value="covered">{tt("Behandeld")}</option><option value="in_progress">{tt("Mee bezig")}</option><option value="skip">{tt("Niet overnemen")}</option></select><span><b>{g.goal_code}</b> <small className="muted">{g.evidence}</small></span></li>)}</ul></>}
  {a.transcript&&<details className="transcript" open={showT} onToggle={e=>setShowT((e.target as HTMLDetailsElement).open)}><summary><FileText size={14}/> {tt("Transcriptie bekijken")}</summary><pre>{a.transcript}</pre></details>}
  {a.is_test?<p className="notice test-note"><span className="test-badge">{'TEST'}</span> {tt('Dit is een TEST-analyse van een geïmporteerd transcript. Ze kan niet worden goedgekeurd of gedeeld: de leerling ziet niets en er worden geen woorden, leerdoelen of huiswerk overgenomen.')}</p>:
  <div className="row"><button className="button" disabled={busy} onClick={()=>void approve()}><CheckCircle2 size={16}/> {tt("Goedkeuren en delen met leerling")}</button>{msg&&<span className="muted" role="status">{msg}</span>}</div>}
 </div>
}


/** ADMIN-ONLY test of the AI lesson analysis: import a (fictional) transcript as .txt or pasted text.
 *  It runs through the same analysis as recordings, is marked TEST and can never be shared with a student. */
function TestTranscriptImport({defaultStudent,onClose,onStarted}:{defaultStudent:string;onClose:()=>void;onStarted:(studentId:string)=>void}){
 const {user}=useAuth();const [students,setStudents]=useState<StudentRecord[]>([]);const [sid,setSid]=useState(defaultStudent);
 const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');const [fileName,setFileName]=useState('');
 useEffect(()=>{if(!user)return;void loadStudents(supabase()!,{teacherId:user.id}).then(r=>setStudents(r.data))},[user?.id]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 async function pick(f?:File){setMsg('');if(!f)return;if(!/\.txt$/i.test(f.name)&&f.type!=='text/plain'){setMsg(tt('Kies een .txt-bestand.'));return}if(f.size>1024*1024){setMsg(tt('Het bestand is groter dan 1 MB.'));return}setText(await f.text());setFileName(f.name)}
 async function start(){if(!sid||text.trim().length<40){setMsg(tt('Het transcript is te kort (minimaal een paar zinnen).'));return}setBusy(true);setMsg('');
  try{await authedPost(supabase()!,'/api/ai/analyze',{test:true,studentId:sid,transcript:text});onStarted(sid)}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy(false)}
 return <div className="modal-scrim" onClick={onClose}><div className="modal card test-import" role="dialog" aria-modal="true" aria-label={tt('Testtranscript importeren')} onClick={e=>e.stopPropagation()}>
  <div className="row between"><h3><span className="test-badge">{'TEST'}</span> {tt('Testtranscript importeren')}</h3><button className="iconbtn" aria-label={tt('Sluiten')} onClick={onClose}><X size={18}/></button></div>
  <p className="muted">{tt('Alleen voor beheerders. Het transcript gaat door dezelfde AI-lesanalyse als echte opnames. Het resultaat wordt als TEST gemarkeerd en wordt nooit met een leerling gedeeld: er worden geen woorden, leerdoelen of huiswerk naar de leerling gestuurd.')}</p>
  <label className="stack"><span className="label">{tt('Testleerling')}</span><select className="field" value={sid} onChange={e=>setSid(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name} — {s.subject||s.email}</option>)}</select></label>
  <label className="stack"><span className="label">{tt('Transcript (.txt uploaden of hieronder plakken)')}</span><input type="file" accept=".txt,text/plain" onChange={e=>void pick(e.target.files?.[0])}/>{fileName&&<small className="muted">{fileName}</small>}</label>
  <textarea className="field" rows={10} value={text} onChange={e=>setText(e.target.value)} placeholder={tt('Bijvoorbeeld:\nDocent: Wat heb je gisteren gedaan?\nLeerling: Ik heb naar de markt gegaan en ik kocht drie appel.')}/>
  <small className="muted">{tt('Tip: zet "Docent:" en "Leerling:" voor de zinnen, zodat de AI alleen fouten van de leerling citeert.')} {text.length.toLocaleString()} / 400.000</small>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={busy||!sid} onClick={()=>void start()}><Sparkles size={15}/> {busy?tt('Starten…'):tt('Test-analyse starten')}</button><button className="button secondary" onClick={onClose}>{tt('Annuleren')}</button></div>
 </div></div>
}

export function TeacherAnalyses({studentId,focusId,lessonLang,onlyId}:{studentId:string;focusId?:string|null;lessonLang?:string;onlyId?:string}){
 const {role}=useAuth();const [importing,setImporting]=useState(false);const [testMsg,setTestMsg]=useState('');
 const [rows,setRows]=useState<AnalysisRow[]>([]);const [recs,setRecs]=useState<{id:string;created_at:string;ai:boolean}[]>([]);const [err,setErr]=useState('');const [open,setOpen]=useState<string|null>(focusId||null);
 useEffect(()=>{if(focusId){setOpen(focusId);setTimeout(()=>document.getElementById('an-'+focusId)?.scrollIntoView({block:'start',behavior:'smooth'}),300)}},[focusId,rows.length]);/* v43: opened from a lesson card */const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const db=supabase()!;
  const cols='id,student_id,recording_id,lesson_date,status,transcript,source_quality,draft,final,error,approved_at,created_at';
  const q=(c:string)=>db.from('lesson_analyses').select(c).eq('student_id',studentId).order('created_at',{ascending:false});
  const analyses=async()=>{let x=await q(cols+',is_test,stage,stage_detail,pipeline_version,published_at,updated_at');if(x.error&&/stage|pipeline_version|published_at/.test(x.error.message))x=await q(cols+',is_test');if(x.error&&/is_test/.test(x.error.message))x=await q(cols);return x}; // v33/v34 optional
  const [a,r]=await Promise.all([analyses(),
   db.from('lesson_recordings').select('id,created_at,ai_consent_teacher_at,ai_consent_student_at').eq('student_id',studentId).order('created_at',{ascending:false})]);
  if(a.error){setErr(a.error.message.includes('lesson_analyses')||a.error.code==='42P01'||a.error.code==='PGRST205'?tt("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):a.error.message);return}
  setRows((a.data||[]) as unknown as AnalysisRow[]);setRecs(((r.data||[]) as {id:string;created_at:string;ai_consent_teacher_at:string|null;ai_consent_student_at:string|null}[]).map(x=>({id:x.id,created_at:x.created_at,ai:!!(x.ai_consent_teacher_at&&x.ai_consent_student_at)})))},[studentId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!rows.some(r=>r.status==='processing'||r.status==='queued'))return;const t=setInterval(()=>void load(),8000);return()=>clearInterval(t)},[rows,load]);
 async function start(recordingId:string){setBusy(true);setErr('');try{await authedPost(supabase()!,'/api/ai/analyze',{recordingId});await load()}catch(e){setErr(e instanceof Error?e.message:String(e))}setBusy(false)}
 async function remove(a:AnalysisRow){if(!confirm(tt("Deze analyse (inclusief transcriptie) definitief verwijderen? De opname zelf blijft bestaan.")))return;const r=await supabase()!.from('lesson_analyses').delete().eq('id',a.id);if(r.error)setErr(r.error.message);await load()}
 const pendingRecs=recs.filter(r=>r.ai&&!rows.some(a=>a.recording_id===r.id));
 return <div className="analyses">
  {err&&<div className="notice">{err}</div>}
  {role==='admin'&&!onlyId&&<div className="row between test-bar"><small className="muted">{tt('Beheerder: test de AI-lesanalyse met een fictief transcript.')}</small><button className="button small secondary" onClick={()=>{setTestMsg('');setImporting(true)}}><FlaskConical size={14}/> {tt('Testtranscript importeren')}</button></div>}
  {testMsg&&<p className="muted" role="status">{testMsg}</p>}
  {importing&&<TestTranscriptImport defaultStudent={studentId} onClose={()=>setImporting(false)} onStarted={sid=>{setImporting(false);setTestMsg(sid===studentId?tt('Test-analyse gestart. Het resultaat verschijnt hieronder met het label TEST (dit duurt meestal minder dan een minuut).'):tt('Test-analyse gestart bij een andere leerling. Open die leerling, tab Lesanalyses, om het resultaat te zien.'));void load()}}/>}
  {(onlyId?[]:pendingRecs).map(r=><div className="analysis-card" key={r.id}><div className="row between"><span><b>{tt("Opname")} {niceDate(r.created_at)}</b> <small className="muted">{tt("toestemming voor AI-analyse gegeven")}</small></span><button className="button small" disabled={busy} onClick={()=>void start(r.id)}><Sparkles size={14}/> {tt("Analyse starten")}</button></div></div>)}
  {!rows.length&&!pendingRecs.length&&<p className="muted">{tt("Nog geen lesanalyses. Start een opname in het live klaslokaal en vink “AI-lesanalyse” aan; als je leerling ook toestemming geeft, verschijnt de analyse hier automatisch ter controle.")}</p>}
  {(onlyId?rows.filter(r=>r.id===onlyId):rows).map(a=><div className="analysis-card" key={a.id} id={'an-'+a.id}>{/* v44: onlyId = inside the page of one lesson */}
   <div className="row between"><button className="analysis-head" onClick={()=>setOpen(open===a.id?null:a.id)}>{a.is_test&&<span className="test-badge">{'TEST'}</span>}<b>{niceDate(a.lesson_date)}</b><StatusChip status={a.status}/></button>
    <div className="row">{a.status==='failed'&&a.recording_id&&!isV2(a as V2Row)&&<button className="button small secondary" disabled={busy} onClick={()=>void start(a.recording_id!)}><RotateCcw size={14}/> {tt("Opnieuw")}</button>}<button className="iconbtn danger" title={tt("Analyse verwijderen")} onClick={()=>void remove(a)}><Trash2 size={15}/></button></div></div>
   {isV2(a as V2Row)?<>
    {(a.status==='processing'||a.status==='queued'||a.status==='failed')&&<StageProgress a={a as V2Row} onChange={()=>void load()}/>}
    {open===a.id&&(a.status==='approved'||a.status==='ready'||(a.status==='failed'&&(a.draft as {steps?:{synthesis?:boolean}}|null)?.steps?.synthesis))&&(a.final||a.draft)&&<TeacherAnalysisV2 key={a.id} a={a as V2Row} lessonLang={lessonLang} onChange={()=>void load()}/>}
    {open!==a.id&&(a.status==='approved'||a.status==='ready')&&<p className="muted small-print">{a.is_test?tt('TEST-analyse: klik om het resultaat te bekijken. Wordt nooit gedeeld.'):tt('Klik om het verslag, de foutenanalyse en de voorstellen te bekijken en aan te passen.')}</p>}
   </>:<>
   {a.status==='failed'&&<p className="muted">{a.error}</p>}
   {open===a.id&&a.status==='ready'&&a.draft&&<Editor a={a} onDone={()=>void load()}/>}
   {open===a.id&&a.status==='approved'&&a.final&&<AnalysisView doc={a.final}/>}
   {open!==a.id&&(a.status==='ready')&&<p className="muted small-print">{a.is_test?tt('TEST-analyse: klik om het resultaat te bekijken. Wordt nooit gedeeld.'):tt("Klik om het concept te controleren en goed te keuren. De leerling ziet nog niets.")}</p>}
   </>}
  </div>)}
 </div>
}

/* v40: bilingual summaries — translations are fetched per card, only for the language chosen in the switch, and
   cached on the server per language and content version (and here for this page view). Examples are never translated. */
const trCache=new Map<string,string[]|null>();
function SummaryCard({r,studentId,lang,open,lessonLang}:{r:{id:string;lesson_date:string;final:AnalysisDoc};studentId:string;lang:string;open:boolean;lessonLang?:string}){
 const v2=(r.final as unknown as {version?:number}).version===2;const doc=r.final as unknown as AnalysisV2;
 const src=v2?doc.explanation_language:'';const need=v2&&!!lang&&lang!==src;const key=r.id+'|'+lang;
 const [texts,setTexts]=useState<string[]|null|undefined>(()=>trCache.get(key));const [state,setState]=useState<'idle'|'busy'|'err'>('idle');const [shown,setShown]=useState(open);
 useEffect(()=>{setTexts(trCache.get(key))},[key]);
 useEffect(()=>{if(!need||!shown||trCache.has(key))return;let c=false;setState('busy');
  void authedPost<{texts:string[]|null}>(supabase()!,'/api/ai/translate-summary',{studentId,analysisId:r.id,lang}).then(x=>{trCache.set(key,x.texts);if(!c){setTexts(x.texts);setState('idle')}},()=>{if(!c)setState('err')});return()=>{c=true}},[need,shown,key,studentId,r.id,lang]);
 const shownDoc=need&&texts?applyTexts(doc,extractTexts(doc),texts):r.final;
 useEffect(()=>{if(open)document.getElementById('an-'+r.id)?.scrollIntoView({block:'start'})},[open,r.id]);
 return <details className="analysis-card" id={'an-'+r.id} open={open} onToggle={e=>{if((e.currentTarget as HTMLDetailsElement).open)setShown(true)}}><summary className="analysis-head"><b>{niceDate(r.lesson_date)}</b>{v2?<span className="status-chip st-approved"><Sparkles size={13}/> {tt("AI-lesverslag")}</span>:<span className="status-chip st-approved"><CheckCircle2 size={13}/> {tt("Goedgekeurd door docent")}</span>}{need&&state==='busy'&&<Loader2 size={14} className="spin" aria-label={tt("Vertalen…")}/>}</summary>
  {need&&state==='err'&&<p className="muted small">{tt("Vertalen lukte niet; je ziet de oorspronkelijke tekst.")}</p>}
  {v2?<LessonReport doc={shownDoc as unknown as AnalysisV2} studentId={studentId} lessonLang={lessonLang}/>:<CompactAnalysis doc={shownDoc as unknown as AnalysisV2|AnalysisDoc} details={<AnalysisView doc={r.final}/>}/>}</details>
}
/** Compact switch "🇧🇷 Portugees | 🇳🇱 Nederlands": lesson language first, then the student's own language. Remembered per student. */
function SummaryLangSwitch({langs,value,onChange}:{langs:string[];value:string;onChange:(l:string)=>void}){
 if(langs.length<2)return null;
 return <div className="sum-switch" role="group" aria-label={tt("Taal van de lessamenvatting")}>{langs.map(l=><button key={l} type="button" aria-pressed={value===l} onClick={()=>onChange(l)}><Flag code={l} size={16}/>{languageName(l)}</button>)}</div>
}

export function StudentSummaries({studentId,lessonLang,focusId}:{studentId:string;lessonLang?:string;focusId?:string|null}){
 const langs=switchLanguages(lessonLang||'',getLang());const store='teachy-sum-lang-'+studentId;
 const [lang,setLangState]=useState<string>(()=>{try{const v=localStorage.getItem(store);if(v&&langs.includes(v))return v}catch{}return ''});
 const pick=(l:string)=>{setLangState(l);try{localStorage.setItem(store,l)}catch{}};
 const [rows,setRows]=useState<{id:string;lesson_date:string;final:AnalysisDoc}[]|null>(null);const [err,setErr]=useState('');
 useEffect(()=>{void supabase()!.rpc('student_lesson_summaries',{sid:studentId}).then(({data,error})=>{if(error)setErr(error.message.includes('student_lesson_summaries')?tt("Nog niet beschikbaar (database-update v28 ontbreekt)."):error.message);setRows((data||[]) as {id:string;lesson_date:string;final:AnalysisDoc}[])})},[studentId]);
 if(err)return <p className="muted">{err}</p>;
 if(!rows)return <div className="loader small"/>;
 if(!rows.length)return <p className="muted">{tt("Nog geen lessamenvattingen. Na een opgenomen les (met jouw toestemming voor AI-analyse) verschijnt hier een kort lesverslag met je foutenanalyse. Je docent kan het aanpassen.")}</p>;
 // until a language is chosen, each summary shows in the language it was written in (no translation, no AI call)
 return <div className="analyses"><SummaryLangSwitch langs={langs} value={lang||((rows[0].final as unknown as AnalysisV2).explanation_language||'')} onChange={pick}/>
  {rows.map(r=><SummaryCard key={r.id} r={r} studentId={studentId} lang={lang} lessonLang={lessonLang} open={focusId?r.id===focusId:r===rows[0]}/>)}</div>
}
