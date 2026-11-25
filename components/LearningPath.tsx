'use client';
// "Leertraject": the personal checklist per student (per teacher relation and language).
// Standard curriculum + own topics, with per-student status, rename, level move, hide, note, lesson references,
// bulk marking / intake, lesson goals ("Vandaag werken we aan…") and a progress overview.
// Statuses are set by the teacher only; AI suggestions are accepted in the analysis (never automatic).
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Plus,Search,Target,EyeOff,Eye,Pencil,X,CalendarDays,ListChecks,Check,Hand,Dumbbell} from 'lucide-react';
import {InfoTip} from './InfoTip';
import {supabase} from '../lib/supabase';
import Link from 'next/link';
import {NT2,NT2_STAGES} from '../lib/curriculum/nt2';
const NT2_BIG=new Set(NT2.filter(t=>t.big).map(t=>t.code));
import {goalTitle,stagedPrefix,topicInfo,visibleGoals} from '../lib/curriculum/topics';
import {getLang} from '../lib/i18n';
import {GOAL_STATUSES,shownStatus,GOAL_STATUS_LABEL,LEVELS,SKILLS,SKILL_LABEL,SUBJECTS,subjectOf,type Goal,type GoalProgress,type GoalStatus} from '../lib/learning';
import {niceDate} from '../lib/data';
import {t as tt} from '../lib/i18n';

type Student={id:string;subject:string;level:string|null;lesson_language:string|null;curriculum_subject?:string|null};
type LessonGoal={id:string;lesson_date:string;goal_id:string|null;custom_title:string|null};
/** v71: "Graag behandelen" — a student's request; the teacher accepts (linked to a lesson) or declines. Never a status change. */
type Req={id:string;goal_id:string;status:'open'|'accepted'|'declined';lesson_goal_id:string|null};
const V71=tt('Voer eerst supabase/v71.sql uit om onderwerpen aan te vragen.');
const STATUSES=GOAL_STATUSES;   // v64: Nog niet behandeld · In ontwikkeling · Extra oefenen · Beheerst
type MemRow={kind:string;key:string;label:string;status:string;teacher_status:string|null;lessons_seen:number;clean_lessons:number;first_seen:string|null;last_seen:string|null;last_clean:string|null;hidden:boolean};
const today=()=>new Date().toISOString().slice(0,10);
const V34=tt('Voer eerst supabase/v34.sql uit om het leertraject te gebruiken.');
const v34Error=(m:string)=>/hidden|title_override|level_override|lesson_refs|target_level|lesson_goals|basis_check|PGRST204|PGRST205/.test(m);

export function LearningPath({student,viewer}:{student:Student;viewer:'teacher'|'student'}){
 const teacher=viewer==='teacher';
 const [subject,setSubject]=useState(subjectOf(student));const [goals,setGoals]=useState<Goal[]>([]);const [prog,setProg]=useState<Record<string,GoalProgress>>({});
 const [err,setErr]=useState('');const [msg,setMsg]=useState('');const [level,setLevel]=useState(student.level||'A1');const [target,setTarget]=useState<string>('');
 const [q,setQ]=useState('');const [fLevel,setFLevel]=useState('all');const [fSkill,setFSkill]=useState('all');const [fStatus,setFStatus]=useState<'all'|GoalStatus>('all');const [showHidden,setShowHidden]=useState(false);
 const [sel,setSel]=useState<Set<string>>(new Set());const [bulk,setBulk]=useState<GoalStatus>('in_progress');const [mem,setMem]=useState<MemRow[]>([]);const [edit,setEdit]=useState<string|null>(null);
 const [nt,setNt]=useState({title:'',level:student.level||'A1',skill:'grammatica'});
 const [day,setDay]=useState(today());const [lgoals,setLgoals]=useState<LessonGoal[]>([]);const [lgPick,setLgPick]=useState('');const [lgCustom,setLgCustom]=useState('');
 const [intakeTo,setIntakeTo]=useState(student.level||'A1');const [reqs,setReqs]=useState<Req[]>([]);const [reqOk,setReqOk]=useState(false);

 const load=useCallback(async()=>{const db=supabase()!;
  const [g,p,s]=await Promise.all([db.from('curriculum_goals').select('*').eq('subject',subject).order('level').order('sort'),db.from('student_goal_progress').select('*').eq('student_id',student.id),db.from('students').select('level,target_level').eq('id',student.id).maybeSingle()]);
  if(g.error){setErr(/curriculum_goals/.test(g.error.message)||g.error.code==='PGRST205'?tt("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):g.error.message);return}
  // v64/v68: Dutch = NT2 (nt2-*), Portuguese = the Brazilian-Portuguese curriculum (ptbr-*), + own topics; older
  // standard goals of that language stay stored (their progress was carried over by v68.sql) but are not shown
  setGoals(visibleGoals((g.data||[]) as Goal[],subject));
  if(teacher){const m=await db.from('memory_patterns').select('kind,key,label,status,teacher_status,lessons_seen,clean_lessons,first_seen,last_seen,last_clean,hidden').eq('student_id',student.id);setMem(m.error?[]:((m.data||[]) as MemRow[]).filter(x=>!x.hidden))}setProg(Object.fromEntries(((p.data||[]) as GoalProgress[]).map(x=>[x.goal_id,x])));
  const rq=await db.from('topic_requests').select('id,goal_id,status,lesson_goal_id').eq('student_id',student.id);setReqOk(!rq.error);setReqs(rq.error?[]:(rq.data||[]) as Req[]);
  const st=s.data as {level?:string|null;target_level?:string|null}|null;if(st){if(st.level)setLevel(st.level);setTarget(st.target_level||'')}else if(s.error&&v34Error(s.error.message))setErr(V34);
 },[subject,student.id,teacher]);
 const loadDay=useCallback(async()=>{const r=await supabase()!.from('lesson_goals').select('id,lesson_date,goal_id,custom_title').eq('student_id',student.id).eq('lesson_date',day).order('created_at');if(r.error){if(teacher&&v34Error(r.error.message))setErr(V34);return}setLgoals((r.data||[]) as LessonGoal[])},[student.id,day,teacher]);
 useEffect(()=>{void load()},[load]);useEffect(()=>{void loadDay()},[loadDay]);

 const ui=getLang();
 const view=(g:Goal)=>{const p=prog[g.id];return {title:goalTitle(g,p?.title_override,ui),level:p?.level_override||g.level,status:shownStatus(p?.status),hidden:!!p?.hidden,p}};
 const all=useMemo(()=>goals.map(g=>({g,...view(g)})),[goals,prog]);
 const shown=all.filter(x=>(showHidden&&teacher||!x.hidden)&&(fLevel==='all'||x.level===fLevel)&&(fSkill==='all'||(fSkill==='own'?!!x.g.owner_teacher:x.g.skill===fSkill))&&(fStatus==='all'||x.status===fStatus)&&(x.title+' '+(x.g.description||'')).toLowerCase().includes(q.toLowerCase()));
 const active=all.filter(x=>!x.hidden);
 const count=(s:GoalStatus,list=active)=>list.filter(x=>x.status===s).length;

 /** One write path for every change; status changes record the date. */
 async function patch(ids:string[],change:Partial<GoalProgress>,basis:GoalProgress['basis']='teacher'){
  setErr('');const t0=new Date().toISOString();
  const rows=ids.map(id=>{const cur=prog[id];const statusChanged=change.status&&change.status!==(cur?.status||'not_started');
   return {student_id:student.id,goal_id:id,status:cur?.status||'not_started',basis:cur?.basis||'teacher',note:cur?.note||'',lesson_date:cur?.lesson_date||null,
    hidden:cur?.hidden||false,title_override:cur?.title_override||null,level_override:cur?.level_override||null,lesson_refs:cur?.lesson_refs||[],
    ...change,...(statusChanged?{basis,lesson_date:today()}:{}),updated_at:t0}});
  setProg(p=>({...p,...Object.fromEntries(rows.map(r=>[r.goal_id,r as GoalProgress]))}));
  const r=await supabase()!.from('student_goal_progress').upsert(rows,{onConflict:'student_id,goal_id'});
  if(r.error){setErr(v34Error(r.error.message)?V34:r.error.message);await load()}
 }
 async function applyBulk(){const ids=[...sel];if(!ids.length)return;await patch(ids,{status:bulk});setMsg(tt('{0} onderwerpen op “{1}” gezet.',ids.length,GOAL_STATUS_LABEL[bulk]));setSel(new Set())}
 async function intake(){const li=LEVELS.indexOf(intakeTo as typeof LEVELS[number]);const ids=active.filter(x=>x.status==='not_started'&&LEVELS.indexOf(x.level as typeof LEVELS[number])<=li).map(x=>x.g.id);
  if(!ids.length){setMsg(tt('Er zijn geen onbehandelde onderwerpen tot en met {0}.',intakeTo));return}
  if(!confirm(tt('Intake: {0} onderwerpen tot en met {1} als “Behandeld” markeren? Je kunt dit per onderwerp weer aanpassen.',ids.length,intakeTo)))return;
  await patch(ids,{status:'covered'},'intake');setMsg(tt('{0} onderwerpen gemarkeerd via intake.',ids.length))}
 async function addGoal(){if(!nt.title.trim())return;const {data:{user}}=await supabase()!.auth.getUser();const r=await supabase()!.from('curriculum_goals').insert({subject,level:nt.level,skill:nt.skill,title:nt.title.trim(),owner_teacher:user!.id,sort:999});if(r.error)setErr(r.error.message);else{setNt({...nt,title:''});await load()}}
 async function saveSubject(v:string){setSubject(v);setSel(new Set());if(teacher)await supabase()!.from('students').update({curriculum_subject:v}).eq('id',student.id)}
 async function saveStudent(p:{level?:string;target_level?:string|null}){if(p.level)setLevel(p.level);if('target_level' in p)setTarget(p.target_level||'');const r=await supabase()!.from('students').update(p).eq('id',student.id);if(r.error)setErr(v34Error(r.error.message)?V34:r.error.message)}
 async function addLessonGoal(){const row=lgPick?{goal_id:lgPick}:lgCustom.trim()?{custom_title:lgCustom.trim()}:null;if(!row)return;
  const r=await supabase()!.from('lesson_goals').insert({student_id:student.id,lesson_date:day,...row});if(r.error){setErr(v34Error(r.error.message)?V34:r.error.message);return}setLgPick('');setLgCustom('');await loadDay()}
 async function delLessonGoal(id:string){await supabase()!.from('lesson_goals').delete().eq('id',id);await loadDay()}
 /** v68: put a topic on the next planned lesson (agenda) — the teacher still decides what is really covered */
 async function toNextLesson(goalId:string,title:string){const db=supabase()!;
  const n=await db.from('lessons').select('id,starts_at').eq('student_id',student.id).neq('status','cancelled').gt('starts_at',new Date().toISOString()).order('starts_at').limit(1);
  const l=((n.data||[]) as {id:string;starts_at:string}[])[0];const date=l?new Date(l.starts_at).toLocaleDateString('en-CA'):today();
  const r=await db.from('lesson_goals').insert({student_id:student.id,lesson_date:date,lesson_id:l?.id||null,goal_id:goalId}).select('id').single();
  if(r.error){setErr(v34Error(r.error.message)?V34:r.error.message);return null}
  setMsg(l?tt('“{0}” staat bij de volgende les ({1}).',title,niceDate(date)):tt('Geen geplande les gevonden; “{0}” staat bij vandaag.',title));if(date===day)await loadDay();return (r.data as {id:string}).id}
 /** v71: the student asks for a topic or withdraws an open request (one row per topic: no doubles, no notifications) */
 async function request(goalId:string){const db=supabase()!;setErr('');const cur=reqs.find(r=>r.goal_id===goalId);
  if(cur){if(cur.status!=='open')return;const r=await db.from('topic_requests').delete().eq('id',cur.id);if(r.error){setErr(r.error.message);return}setReqs(x=>x.filter(y=>y.id!==cur.id));setMsg(tt('Aanvraag ingetrokken.'));return}
  const r=await db.from('topic_requests').insert({student_id:student.id,goal_id:goalId}).select('id,goal_id,status,lesson_goal_id').single();
  if(r.error){setErr(/topic_requests/.test(r.error.message)?V71:r.error.message);return}setReqs(x=>[...x,r.data as Req]);setMsg(tt('Aangevraagd. Je docent beslist of en wanneer dit onderwerp aan bod komt.'))}
 /** v71: the teacher accepts (the topic becomes a planned lesson topic of the next lesson) or declines */
 async function decide(rq:Req,accept:boolean){const db=supabase()!;const now=new Date().toISOString();
  if(accept){const id=await toNextLesson(rq.goal_id,titleOf(rq.goal_id));if(!id)return;await db.from('topic_requests').update({status:'accepted',lesson_goal_id:id,updated_at:now}).eq('id',rq.id)}
  else await db.from('topic_requests').update({status:'declined',updated_at:now}).eq('id',rq.id);
  setReqs(x=>x.map(y=>y.id===rq.id?{...y,status:accept?'accepted':'declined'}:y))}
 const reqOf=(id:string)=>reqs.find(r=>r.goal_id===id);
 const REQ_LABEL={open:tt('aangevraagd'),accepted:tt('aanvraag geaccepteerd'),declined:tt('aanvraag niet ingepland')};
 const reqTag=(id:string)=>{const r=reqOf(id);return r?<span className={'tag req-'+r.status}>{REQ_LABEL[r.status]}</span>:null};
 /** student: ask for a topic · practise it (the existing self-practice with this topic as focus) */
 const studentActs=(g:Goal,title:string,grammar:boolean)=>{if(teacher)return null;const r=reqOf(g.id);
  return <div className="row wrap nt2-acts lp-sacts">
   {reqOk&&<button type="button" className={'button small '+(r?'':'secondary')} aria-pressed={!!r} disabled={!!r&&r.status!=='open'} onClick={()=>void request(g.id)} title={r?.status==='open'?tt('Klik om de aanvraag in te trekken'):undefined}>{r?<><Check size={13}/> {tt('Aangevraagd')}</>:<><Hand size={13}/> {tt('Graag behandelen')}</>}</button>}
   {grammar&&<Link className="button small secondary" href={`/oefenen?student=${student.id}&onderwerp=${encodeURIComponent(title)}#zelf`}><Dumbbell size={13}/> {tt('Oefenen')}</Link>}</div>}
 const titleOf=(id:string|null)=>{const x=all.find(a=>a.g.id===id);return x?x.title:''};
 const toggle=(id:string)=>setSel(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n});

 const byLevel=LEVELS.map(l=>({l,items:shown.filter(x=>x.level===l)})).filter(x=>x.items.length);
 const levelStats=LEVELS.map(l=>{const its=active.filter(x=>x.level===l);return {l,n:its.length,c:count('review',its),p:count('in_progress',its),m:count('mastered',its)}}).filter(x=>x.n);
 const pre=stagedPrefix(subject);const nt2=!!pre&&goals.some(g=>(g as {code?:string|null}).code?.startsWith(pre));
 const info=(g:Goal)=>topicInfo((g as {code?:string|null}).code);
 const memFor=(code:string|null|undefined)=>{const t=topicInfo(code);if(!t?.keys.length)return {topic:[] as MemRow[],errors:[] as MemRow[]};return {topic:mem.filter(m=>m.kind==='topic'&&t.keys!.includes(m.key)),errors:mem.filter(m=>m.kind==='error'&&t.keys!.includes(m.key)&&m.lessons_seen>0)}};
 return <div className="goals learning-path">
  {err&&<div className="notice">{err}</div>}
  {msg&&<p className="muted" role="status">{msg}</p>}
  <div className="row between wrap">
   <div className="row wrap">
    <label className="row"><span className="label">{tt("Leerlijn")}</span>{teacher?<select className="field" value={subject} onChange={e=>void saveSubject(e.target.value)}>{Object.entries(SUBJECTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:<b>{SUBJECTS[subject]||subject}</b>}</label>
    <label className="row"><span className="label">{tt("Huidig niveau")}</span>{teacher?<select className="field" value={level} onChange={e=>void saveStudent({level:e.target.value})}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select>:<b>{level}</b>}</label>
    <label className="row"><span className="label">{tt("Doelniveau")}</span>{teacher?<select className="field" value={target} onChange={e=>void saveStudent({target_level:e.target.value||null})}><option value="">{tt("—")}</option>{LEVELS.map(l=><option key={l}>{l}</option>)}</select>:<b>{target||tt("—")}</b>}</label>
   </div>
  </div>

  {/* progress overview */}
  <section className="lp-overview" aria-label={tt("Voortgang")}>
   <div className="lp-bar" role="img" aria-label={tt("{0} in ontwikkeling, {1} extra oefenen, {2} beheerst van {3}",count('in_progress'),count('review'),count('mastered'),active.length)}>
    {(['mastered','in_progress','review'] as GoalStatus[]).map(s=><span key={s} className={'seg gs-'+s} style={{width:`${active.length?count(s)/active.length*100:0}%`}}/>)}
   </div>
   <div className="chipbar">{STATUSES.map(s=><button key={s} aria-pressed={fStatus===s} onClick={()=>setFStatus(fStatus===s?'all':s)}><span className={'dot gs-'+s}/>{GOAL_STATUS_LABEL[s]} ({count(s)})</button>)}</div>
   <table className="lp-levels"><thead><tr><th>{tt("Niveau")}</th><th>{GOAL_STATUS_LABEL.in_progress}</th><th>{GOAL_STATUS_LABEL.review}</th><th>{GOAL_STATUS_LABEL.mastered}</th><th>{tt("Totaal")}</th></tr></thead>
    <tbody>{levelStats.map(x=><tr key={x.l} className={x.l===level?'current':''}><td><b>{x.l}</b></td><td>{x.p}</td><td>{x.c}</td><td>{x.m}</td><td className="muted">{x.n}</td></tr>)}</tbody></table>
  </section>

  {/* v71: the student's requests (never planned or covered automatically) */}
  {teacher&&reqs.some(r=>r.status==='open')&&<section className="lp-reqs"><h4><Hand size={15}/> {tt('Aangevraagd door je leerling')}</h4>
   <ul>{reqs.filter(r=>r.status==='open').map(r=><li key={r.id}><b className="grow">{titleOf(r.goal_id)||tt('(verborgen onderwerp)')}</b>
    <button className="button small" onClick={()=>void decide(r,true)}><CalendarDays size={13}/> {tt('Accepteren: naar de volgende les')}</button>
    <button className="button small secondary" onClick={()=>void decide(r,false)}>{tt('Niet nu')}</button></li>)}</ul>
   <p className="muted small">{tt('Een aanvraag is een wens: pas wanneer je het onderwerp in de les behandelt, markeer je het als behandeld.')}</p></section>}
  {/* today's lesson goals */}
  <section className="lp-today">
   <div className="row between wrap"><h4><CalendarDays size={15}/> {tt("Vandaag werken we aan…")}</h4><input className="field" type="date" value={day} onChange={e=>setDay(e.target.value||today())} aria-label={tt("Lesdatum")}/></div>
   {lgoals.length?<ul className="chips">{lgoals.map(g=><li key={g.id}><b>{g.custom_title||titleOf(g.goal_id)||tt("(verborgen onderwerp)")}</b>{teacher&&<button className="iconbtn" aria-label={tt("Verwijderen")} onClick={()=>void delLessonGoal(g.id)}><X size={12}/></button>}</li>)}</ul>:<p className="muted">{teacher?tt("Nog geen lesdoelen voor deze datum. De AI-analyse gebruikt ze om te bepalen wat vandaag centraal stond."):tt("Je docent heeft voor deze datum nog geen lesdoelen gekozen.")}</p>}
   {teacher&&<form className="row wrap" onSubmit={e=>{e.preventDefault();void addLessonGoal()}}>
    <select className="field grow" value={lgPick} onChange={e=>{setLgPick(e.target.value);if(e.target.value)setLgCustom('')}}><option value="">{tt("Kies uit het leertraject…")}</option>{active.filter(x=>!lgoals.some(l=>l.goal_id===x.g.id)).map(x=><option key={x.g.id} value={x.g.id}>{x.level} · {x.title}</option>)}</select>
    <input className="field grow" placeholder={tt("…of een eigen lesdoel")} value={lgCustom} onChange={e=>{setLgCustom(e.target.value);if(e.target.value)setLgPick('')}}/>
    <button className="button small" type="submit" disabled={!lgPick&&!lgCustom.trim()}><Plus size={14}/> {tt("Toevoegen")}</button></form>}
  </section>

  {/* filters */}
  <div className="row wrap lp-filters">
   <label className="searchbox grow"><Search size={16}/><input placeholder={tt("Zoeken…")} value={q} onChange={e=>setQ(e.target.value)}/></label>
   <select className="field" value={fLevel} onChange={e=>setFLevel(e.target.value)} aria-label={tt("Niveau")}><option value="all">{tt("Alle niveaus")}</option>{LEVELS.map(l=><option key={l}>{l}</option>)}</select>
   <select className="field" value={fSkill} onChange={e=>setFSkill(e.target.value)} aria-label={tt("Categorie")}><option value="all">{tt("Alle categorieën")}</option>{SKILLS.filter(s=>goals.some(g=>g.skill===s)).map(s=><option key={s} value={s}>{SKILL_LABEL[s]}</option>)}<option value="own">{tt("Eigen onderwerpen")}</option></select>
   {teacher&&<label className="row small"><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/> {tt("Verborgen tonen")}</label>}
  </div>

  {teacher&&<div className="row wrap lp-bulk">
   <ListChecks size={16}/><span className="muted">{tt("{0} geselecteerd",sel.size)}</span>
   <button className="button small secondary" onClick={()=>setSel(new Set(shown.map(x=>x.g.id)))}>{tt("Alles in deze lijst selecteren")}</button>
   {!!sel.size&&<button className="button small secondary" onClick={()=>setSel(new Set())}>{tt("Selectie wissen")}</button>}
   <select className="field" value={bulk} onChange={e=>setBulk(e.target.value as GoalStatus)}>{STATUSES.map(s=><option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}</select>
   <button className="button small" disabled={!sel.size} onClick={()=>void applyBulk()}>{tt("Status toepassen")}</button>
   <span className="sep"/>
   <span className="label">{tt("Intake tot en met")}</span><select className="field" value={intakeTo} onChange={e=>setIntakeTo(e.target.value)}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select>
   <button className="button small secondary" onClick={()=>void intake()}>{tt("Markeer als behandeld")}</button>
  </div>}

  <p className="muted small-print">{tt("Leerlijn volgens ERK/CEFR")} <InfoTip text={tt("Standaardleerlijn op basis van het ERK/CEFR (A0 is een optionele voorbereidende fase). Niveaus zijn richtpunten. Alleen de docent stelt de status vast; AI-voorstellen uit lesanalyses moet de docent eerst accepteren.")}/></p>
  {!byLevel.length&&<p className="muted">{tt("Geen onderwerpen gevonden met deze filters.")}</p>}
  {nt2&&<p className="lp-levelnote">{tt('Het taalniveau ({0}) is het algemene niveau. De status per onderwerp is de beheersing van die grammatica — ook een B1-leerling kan nog A1-grammatica oefenen.',level)}</p>}
  {nt2?<>{NT2_STAGES.map(stage=>{const its=shown.filter(x=>info(x.g)?.stage===stage).sort((a,b)=>info(a.g)!.n-info(b.g)!.n);if(!its.length)return null;
   const done=its.filter(x=>x.status==='mastered').length;
   return <details key={stage} className="nt2-stage" open={stage.endsWith(level)||stage.startsWith(level)}><summary><span className="nt2-stage-t">{tt(stage)}</span><span className="nt2-stage-n">{tt('{0} van {1} beheerst',done,its.length)}</span></summary>
    <ol className="nt2-list">{its.map(x=>{const {g,p,status}=x;const t=info(g)!;const m=memFor(t.code);const lines=(g.description||'').split('\n').filter(Boolean);
     const extra=/^(Didactiek|Voorbeeld|Veelgemaakte fout):/;
     return <li key={g.id} className={'nt2-topic st-'+status}>
      <div className="nt2-head">{teacher&&<input type="checkbox" checked={sel.has(g.id)} onChange={()=>toggle(g.id)} aria-label={tt("Selecteren")}/>}<span className="nt2-num">{t.continuous?'∞':t.n}</span>
       <details className="nt2-more grow"><summary><b>{x.title}</b>{t.pt&&ui!=='pt'&&!p?.title_override&&<small className="muted"> · {t.pt}</small>}{(NT2_BIG.has(t.code))&&<span className="tag">{tt('groot onderwerp')}</span>}{reqTag(g.id)}</summary>
        <ul className="nt2-sub">{lines.filter(l=>!extra.test(l)).map(l=><li key={l}>{l.replace(/^• /,'')}</li>)}</ul>
        {lines.filter(l=>/^Voorbeeld:/.test(l)).length>0&&<p className="nt2-ex"><b>{tt('Voorbeelden')}:</b> {lines.filter(l=>/^Voorbeeld:/.test(l)).map(l=>l.replace(/^Voorbeeld:\s*/,'')).join(' · ')}</p>}
        {lines.filter(l=>/^Veelgemaakte fout:/.test(l)).length>0&&<p className="nt2-errs"><b>{tt('Veelgemaakte fouten')}:</b> {lines.filter(l=>/^Veelgemaakte fout:/.test(l)).map(l=>l.replace(/^Veelgemaakte fout:\s*/,'')).join(' · ')}</p>}
        {lines.filter(l=>l.startsWith('Didactiek:')).map(l=><p key={l} className="nt2-did">{l}</p>)}
        {t.continuous&&<p className="muted small">{tt('Doorlopende leerlijn: geen eindstatus, blijft periodiek terugkomen.')}</p>}
        {studentActs(g,x.title,true)}
        {teacher&&<div className="row wrap nt2-acts"><button type="button" className="button small secondary" onClick={()=>void toNextLesson(g.id,x.title)}><CalendarDays size={13}/> {tt('Naar de volgende les')}</button>
         <Link className="button small secondary" href={`/leerlingen?student=${student.id}&tab=huiswerk&onderwerp=${encodeURIComponent(x.title)}`}>{tt('Huiswerk over dit onderwerp')}</Link></div>}</details>
       {teacher?<select className={'cell gsel gs-'+status} value={status} onChange={e=>void patch([g.id],{status:e.target.value as GoalStatus})} aria-label={tt("Status")}>{STATUSES.map(st=><option key={st} value={st}>{GOAL_STATUS_LABEL[st]}</option>)}</select>:<span className={'gstat gs-'+status}>{GOAL_STATUS_LABEL[status]}</span>}</div>
      {(p&&status!=='not_started'||m.topic.length>0||m.errors.length>0)&&<div className="nt2-meta">
       {p&&status!=='not_started'&&<span>{p.basis==='ai_confirmed'?tt("AI-voorstel, bevestigd door docent"):p.basis==='intake'?tt("Intake"):tt("Docent")}{p.lesson_date?' · '+niceDate(p.lesson_date):''}</span>}
       {p?.lesson_refs?.length?<span>{tt("lessen: {0}",p.lesson_refs.slice(-3).map(d=>niceDate(d)).join(', '))}</span>:null}
       {m.topic.map(z=><span key={z.key}>{tt('behandeld in {0} les(sen)',z.lessons_seen+z.clean_lessons)}{z.last_seen?' · '+tt('laatst {0}',niceDate(z.last_seen)):''}</span>)}
       {m.errors.map(z=><span key={z.key} className="nt2-err">{tt('terugkerende fout: {0} ({1} lessen)',z.label,z.lessons_seen)}{z.last_clean?' · '+tt('daarna goed: {0}',niceDate(z.last_clean)):''}</span>)}
      </div>}
      {teacher&&p?.note&&<small className="block lp-note">{p.note}</small>}
     </li>})}</ol></details>})}
   {shown.some(x=>!(x.g as {code?:string}).code)&&<section className="goal-level"><h4>{tt('Eigen onderwerpen')}</h4><ul>{shown.filter(x=>!(x.g as {code?:string}).code).map(x=><li key={x.g.id} className={'goal st-'+x.status}>{teacher&&<input type="checkbox" checked={sel.has(x.g.id)} onChange={()=>toggle(x.g.id)} aria-label={tt("Selecteren")}/>}<span className="grow"><b>{x.title}</b> <small className="muted">{x.level}</small></span>{teacher?<select className="cell" value={x.status} onChange={e=>void patch([x.g.id],{status:e.target.value as GoalStatus})}>{STATUSES.map(st=><option key={st} value={st}>{GOAL_STATUS_LABEL[st]}</option>)}</select>:<span className={'gstat gs-'+x.status}>{GOAL_STATUS_LABEL[x.status]}</span>}</li>)}</ul></section>}</>:
  byLevel.map(({l,items})=><section key={l} className="goal-level"><h4>{l}{l==='A0'&&<small className="muted"> {tt("(voorbereidend)")}</small>}{l===level&&<span className="tag">{tt("huidig niveau")}</span>}</h4>
   {[...SKILLS].map(sk=>{const its=items.filter(x=>x.g.skill===sk);if(!its.length)return null;return <div key={sk} className="goal-skill"><span className="tag">{SKILL_LABEL[sk]}</span><ul>{its.map(x=>{const {g,p,status}=x;return <li key={g.id} className={'goal st-'+status+(x.hidden?' hidden-topic':'')}>
    {teacher&&<input type="checkbox" checked={sel.has(g.id)} onChange={()=>toggle(g.id)} aria-label={tt("Selecteren")}/>}
    <span className="grow"><b>{x.title}</b>{p?.title_override&&<small className="muted"> ({g.title})</small>}{g.owner_teacher&&<span className="tag own">{tt("eigen onderwerp")}</span>}{p?.level_override&&p.level_override!==g.level&&<span className="tag">{tt("verplaatst van {0}",g.level)}</span>}{x.hidden&&<span className="tag">{tt("verborgen")}</span>}
     {g.description&&<small className="muted block">{g.description}</small>}
     {p&&status!=='not_started'&&<small className="basis block">{p.basis==='ai_confirmed'?tt("AI-voorstel, bevestigd door docent"):p.basis==='intake'?tt("Intake"):tt("Docent")}{p.lesson_date?' · '+niceDate(p.lesson_date):''}{p.lesson_refs?.length?' · '+tt("lessen: {0}",p.lesson_refs.slice(-3).map(d=>niceDate(d)).join(', ')):''}</small>}
     {teacher&&p?.note&&<small className="block lp-note">{p.note}</small>}{reqTag(g.id)}{studentActs(g,x.title,g.skill==='grammatica')}</span>
    {teacher?<select className="cell" value={status} onChange={e=>void patch([g.id],{status:e.target.value as GoalStatus})} aria-label={tt("Status")}>{STATUSES.map(s=><option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}</select>:<span className={'gstat gs-'+status}>{GOAL_STATUS_LABEL[status]}</span>}
    {teacher&&<button className="iconbtn" title={tt("Aanpassen")} onClick={()=>setEdit(edit===g.id?null:g.id)}><Pencil size={14}/></button>}
    {teacher&&edit===g.id&&<TopicEditor title={x.title} original={g.title} origLevel={g.level} level={x.level} note={p?.note||''} hidden={x.hidden} updated={p?.updated_at||null}
      onSave={c=>{void patch([g.id],c);setEdit(null)}} onClose={()=>setEdit(null)}/>}
   </li>})}</ul></div>})}
  </section>)}
  {teacher&&<form className="row goal-add" onSubmit={e=>{e.preventDefault();void addGoal()}}><Target size={16}/><input className="field grow" placeholder={tt("Eigen onderwerp toevoegen, bijv. 'Telefoongesprek met de huisarts'")} value={nt.title} onChange={e=>setNt({...nt,title:e.target.value})}/><select className="field" value={nt.level} onChange={e=>setNt({...nt,level:e.target.value})}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select><select className="field" value={nt.skill} onChange={e=>setNt({...nt,skill:e.target.value})}>{SKILLS.map(s=><option key={s} value={s}>{SKILL_LABEL[s]}</option>)}</select><button className="button small" type="submit"><Plus size={15}/> {tt("Toevoegen")}</button></form>}
 </div>
}

function TopicEditor({title,original,origLevel,level,note,hidden,updated,onSave,onClose}:{title:string;original:string;origLevel:string;level:string;note:string;hidden:boolean;updated:string|null;onSave:(c:Partial<GoalProgress>)=>void;onClose:()=>void}){
 const [ti,setTi]=useState(title);const [lv,setLv]=useState(level);const [no,setNo]=useState(note);
 return <div className="lp-editor">
  <label className="stack"><span className="label">{tt("Naam voor deze leerling")}</span><input className="field" value={ti} onChange={e=>setTi(e.target.value)}/></label>
  <div className="row wrap"><label className="row"><span className="label">{tt("Niveau")}</span><select className="field" value={lv} onChange={e=>setLv(e.target.value)}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select></label>
   {updated&&<small className="muted">{tt("Laatst gewijzigd: {0}",niceDate(updated))}</small>}</div>
  <label className="stack"><span className="label">{tt("Notitie")}</span><textarea className="field" rows={2} value={no} onChange={e=>setNo(e.target.value)}/></label>
  <div className="row wrap">
   <button className="button small" onClick={()=>onSave({title_override:ti.trim()&&ti.trim()!==original?ti.trim().slice(0,200):null,level_override:lv===origLevel?null:lv,note:no})}>{tt("Opslaan")}</button>
   <button className="button small secondary" onClick={()=>onSave({hidden:!hidden})}>{hidden?<><Eye size={14}/> {tt("Weer tonen")}</>:<><EyeOff size={14}/> {tt("Verbergen voor deze leerling")}</>}</button>
   <button className="button small secondary" onClick={onClose}>{tt("Annuleren")}</button>
  </div>
 </div>
}
