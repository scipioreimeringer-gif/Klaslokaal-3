'use client';
// v60: "AI-geheugen" tab (teacher only): compact profile, development, max 3 recommendations, proposals to approve,
// all records (correct / hide / delete, each with its source lessons) and "Volgende les voorbereiden".
import {useCallback,useEffect,useState} from 'react';
import {Brain,Sparkles,Check,X,EyeOff,Eye,Trash2,Loader2,TrendingUp,AlertTriangle} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {authFetch} from '../lib/authFetch';
import {t,getLang} from '../lib/i18n';
import {profileOf,recommendations,type Pattern,type Status} from '../lib/memory/merge';

type Row=Pattern&{id:string};type Proposal={id:string;field:string;current_value:string|null;proposed_value:string;reason:string|null};
type PlanT={review:string;focus:string;repetition:string[];new_topic:string;speaking:string[];homework:string};
const STATUS:Record<Status,string>={new:'Nieuw',learning:'Aan het leren',fair:'Redelijk beheerst',mastered:'Beheerst',review:'Herhaling nodig'};
const st=(p:Row)=>p.teacher_status||p.status;
async function api<T>(body:unknown):Promise<T>{const r=await authFetch(supabase()!,'/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error((j as {error?:string}).error||t('Fout {0}',r.status));return j as T}

export function MemoryPanel({studentId}:{studentId:string}){
 const [rows,setRows]=useState<Row[]|null>(null);const [props,setProps]=useState<Proposal[]>([]);const [info,setInfo]=useState<{level:string|null;goals:string|null;processed:number}>({level:null,goals:null,processed:0});
 const [msg,setMsg]=useState('');const [plan,setPlan]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [migration,setMigration]=useState(false);
 const load=useCallback(async()=>{const db=supabase()!;
  const [p,m,pr,s]=await Promise.all([db.from('memory_patterns').select('*').eq('student_id',studentId).order('updated_at',{ascending:false}),
   db.from('student_memory').select('profile,lessons_processed').eq('student_id',studentId).maybeSingle(),
   db.from('memory_proposals').select('id,field,current_value,proposed_value,reason').eq('student_id',studentId).eq('status','pending'),
   db.from('students').select('level,goals').eq('id',studentId).maybeSingle()]);
  if(p.error){setMigration(/memory_patterns/.test(p.error.message));setRows([]);return}
  setRows((p.data||[]) as Row[]);setProps((pr.data||[]) as Proposal[]);
  const prof=((m.data as {profile?:{goals?:string}}|null)?.profile)||{};const sd=(s.data||{}) as {level?:string|null;goals?:string|null};
  setInfo({level:sd.level||null,goals:prof.goals||sd.goals||null,processed:(m.data as {lessons_processed?:number}|null)?.lessons_processed||0})},[studentId]);
 // catch up first (published reports not yet in the memory; no AI call), then show
 useEffect(()=>{void api<{applied:number;migration?:boolean}>({studentId,action:'sync'}).then(r=>{if(r.migration)setMigration(true)},()=>{}).finally(()=>void load())},[studentId,load]);
 async function upd(id:string,patch:Partial<Row>){const {error}=await supabase()!.from('memory_patterns').update(patch).eq('id',id);if(error)setMsg(error.message);await load()}
 async function del(id:string){if(!confirm(t('Dit geheugenrecord verwijderen? De lessen en verslagen zelf blijven bewaard.')))return;const {error}=await supabase()!.from('memory_patterns').delete().eq('id',id);if(error)setMsg(error.message);await load()}
 async function decide(id:string,ok:boolean){const {error}=await supabase()!.rpc('memory_decide',{p_id:id,p_accept:ok});if(error)setMsg(error.message);await load()}
 async function prepare(){setBusy(true);setMsg('');try{const p=await api<PlanT>({studentId,action:'prepare',uiLang:getLang()});
  setPlan([`${t('Terugblik')}: ${p.review}`,`${t('Belangrijkste verbeterpunt')}: ${p.focus}`,`${t('Herhaling')}:\n- ${p.repetition.join('\n- ')}`,`${t('Nieuw onderwerp')}: ${p.new_topic}`,`${t('Spreekopdrachten')}:\n- ${p.speaking.join('\n- ')}`,`${t('Huiswerk')}: ${p.homework}`].join('\n\n'));await load()}
  catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy(false)}
 if(migration)return <p className="notice">{t('Het AI-geheugen is nog niet ingesteld: voer supabase/v60.sql uit.')}</p>;
 if(!rows)return <div className="loader small"/>;
 const vis=rows.filter(r=>!r.hidden);const prof=profileOf(vis);const recs=recommendations(vis);
 const errs=vis.filter(r=>r.kind==='error'&&r.confidence!=='low');const topics=vis.filter(r=>r.kind==='topic');
 const List=({items}:{items:string[]})=>items.length?<ul className="mem-list">{items.map(x=><li key={x}>{x}</li>)}</ul>:<p className="muted small">—</p>;
 return <div className="memory">
  <p className="muted small"><AlertTriangle size={13}/> {t('AI-observaties kunnen fouten bevatten. Alleen jij ziet dit geheugen; het wordt na elk lesverslag vanzelf bijgewerkt ({0} lessen verwerkt).',info.processed)}</p>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  {props.map(p=><div key={p.id} className="mem-proposal"><Sparkles size={15}/><div><strong>{p.field==='level'?t('Voorstel: niveau {0} → {1}',p.current_value||'?',p.proposed_value):t('Voorstel: nieuwe leerdoelen')}</strong>{p.field!=='level'&&<p>{p.proposed_value}</p>}{p.reason&&<p className="muted small">{p.reason}</p>}</div>
   <div className="row"><button className="button small" onClick={()=>void decide(p.id,true)}><Check size={14}/> {t('Overnemen')}</button><button className="button small secondary" onClick={()=>void decide(p.id,false)}><X size={14}/> {t('Afwijzen')}</button></div></div>)}
  <div className="grid2">
   <section className="card"><h3><Brain size={16}/> {t('Leerlingprofiel')}</h3>
    <dl className="mem-dl"><dt>{t('Niveau')}</dt><dd>{info.level||'—'}</dd><dt>{t('Leerdoelen')}</dt><dd>{info.goals||'—'}</dd></dl>
    <h4>{t('Sterke punten')}</h4><List items={prof.strengths.concat(prof.improved).slice(0,5)}/><h4>{t('Werkpunten')}</h4><List items={prof.weaknesses}/></section>
   <section className="card"><h3><TrendingUp size={16}/> {t('Leerontwikkeling')}</h3>
    <h4>{t('Behandelde onderwerpen')}</h4><List items={topics.slice(0,8).map(x=>`${x.label} · ${t(STATUS[st(x)])}`)}/>
    <h4>{t('Herhaling nodig')}</h4><List items={errs.filter(x=>st(x)==='review').map(x=>x.label)}/>
    <h4>{t('Terugkerende fouten')}</h4><List items={prof.recurring}/>
    <h4>{t('Recente verbeteringen')}</h4><List items={prof.improved}/></section>
  </div>
  <section className="card"><h3><Sparkles size={16}/> {t('Aanbevolen volgende les')}</h3>
   {recs.length?<ol className="mem-list">{recs.map(r=><li key={r}>{r}</li>)}</ol>:<p className="muted small">{t('Nog te weinig lessen voor een aanbeveling.')}</p>}
   <button className="button" disabled={busy} onClick={()=>void prepare()}>{busy?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>} {t('Volgende les voorbereiden')}</button>
   {plan!==null&&<label className="stack"><span className="label">{t('Lesvoorstel (pas het gerust aan)')}</span><textarea className="field" rows={14} value={plan} onChange={e=>setPlan(e.target.value)}/></label>}</section>
  <details className="card mem-records"><summary>{t('Alle geheugenrecords ({0})',rows.length)}</summary>
   <ul className="mem-rows">{rows.map(r=><li key={r.id} className={r.hidden?'hidden':''}>
    <div className="mem-head"><strong>{r.label}</strong><span className="muted small">{r.kind==='topic'?t('onderwerp'):t('foutpatroon')} · {t('betrouwbaarheid')}: {r.confidence==='high'?t('hoog'):r.confidence==='medium'?t('gemiddeld'):t('laag (mogelijk transcriptiefout)')}</span>
     <select className="field inline" value={st(r)} aria-label={t('Status')} onChange={e=>void upd(r.id,{teacher_status:e.target.value as Status})}>{(Object.keys(STATUS) as Status[]).map(s=><option key={s} value={s}>{t(STATUS[s])}</option>)}</select>
     <button className="iconbtn" title={r.hidden?t('Weer tonen'):t('Verbergen')} aria-label={r.hidden?t('Weer tonen'):t('Verbergen')} onClick={()=>void upd(r.id,{hidden:!r.hidden})}>{r.hidden?<Eye size={15}/>:<EyeOff size={15}/>}</button>
     <button className="iconbtn" title={t('Verwijderen')} aria-label={t('Verwijderen')} onClick={()=>void del(r.id)}><Trash2 size={15}/></button></div>
    <p className="muted small">{t('{0} lessen met deze fout, {1} keer goed daarna',r.lessons_seen,r.clean_lessons)}{r.slips?' · '+t('{0} versprekingen',r.slips):''}{r.uncertain?' · '+t('{0} onzeker',r.uncertain):''}{r.teacher_status&&r.teacher_status!==r.status?' · '+t('AI ziet nu: {0}',t(STATUS[r.status])):''}</p>
    {r.examples.length>0&&<ul className="mem-ex">{r.examples.slice(0,3).map((x,i)=><li key={i}>“{x.original}” → “{x.corrected}” <span className="muted small">({t('les van {0}',x.lesson_date)}{x.certain?'':', '+t('onzeker')})</span></li>)}</ul>}
    {r.kind==='topic'&&r.history.length>0&&<p className="muted small">{t('Lessen')}: {r.history.slice(-5).map(h=>h.lesson_date).join(', ')}</p>}
   </li>)}</ul>
   {!rows.length&&<p className="muted small">{t('Nog geen geheugen: dit vult zich vanzelf na het eerste AI-lesverslag.')}</p>}
  </details>
 </div>
}
