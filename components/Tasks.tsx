'use client';
// v57: smart task list for teacher and learner. Automatic tasks come from existing data (homework to check or to make,
// failed reports, lessons to plan or to attend, consent requests) and close by themselves; manual tasks are private rows.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ListTodo,Plus,Trash2,Presentation,BookOpen,AlertTriangle,CalendarClock,RotateCcw} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {loadStudents} from '../lib/data';
import {browserTimeZone,dayKey} from '../lib/lessons';
import {teacherTasks,studentTasks,manualTasks,combine,sortTasks,filterTasks,badgeCount,isOverdue,type Task,type TaskFilter,type TaskRole,type Priority,type ManualRow,type TeacherInput,type StudentInput} from '../lib/tasks';

type Loaded={tasks:Task[];ready:boolean;roles:TaskRole[];at:number};
let cache:{uid:string;data:Loaded}|null=null;
export const tasksChanged=()=>{cache=null;if(typeof window!=='undefined')window.dispatchEvent(new Event('teachy-tasks-changed'))};

async function loadTasks(uid:string,canTeach:boolean,teacherName:(sid:string)=>string):Promise<Loaded>{
 const db=supabase()!;const now=Date.now();const tz=browserTimeZone();const lists:Task[][]=[];const roles:TaskRole[]=[];
 const [manual,dis]=await Promise.all([db.from('tasks').select('id,title,notes,priority,due_at,role,student_id,done_at').eq('owner_id',uid).order('created_at',{ascending:false}).limit(300),
  db.from('task_dismissals').select('task_key').eq('owner_id',uid).limit(1000)]);
 const ready=!manual.error;
 if(canTeach){roles.push('teacher');
  const st=(await loadStudents(db,{teacherId:uid})).data;const ids=st.map(s=>s.id);
  if(ids.length){
   const [les,subs,fail]=await Promise.all([
    db.from('lessons').select('student_id,starts_at,status').eq('teacher_id',uid).gte('starts_at',new Date(now).toISOString()).lt('starts_at',new Date(now+14*86400e3).toISOString()),
    db.from('homework_submissions').select('id,assignment_id,submitted_at,feedback_published_at,assignments!inner(title,student_id)').is('feedback_published_at',null).in('assignments.student_id',ids).order('submitted_at').limit(100),
    db.from('lesson_analyses').select('id,student_id,lesson_date,is_test').eq('status','failed').in('student_id',ids).limit(50)]);
   const input:TeacherInput={students:st,upcomingLessons:(les.data||[]) as TeacherInput['upcomingLessons'],
    submissions:((subs.data||[]) as unknown as {id:string;assignment_id:string;submitted_at:string;feedback_published_at:string|null;assignments:{title:string;student_id:string}|{title:string;student_id:string}[]}[]).map(s=>{const a=Array.isArray(s.assignments)?s.assignments[0]:s.assignments;return {id:s.id,assignment_id:s.assignment_id,submitted_at:s.submitted_at,feedback_published_at:s.feedback_published_at,title:a?.title||'',student_id:a?.student_id||''}}),
    failedReports:((fail.data||[]) as {id:string;student_id:string;lesson_date:string;is_test?:boolean}[]).filter(a=>!a.is_test)};
   lists.push(teacherTasks(input,now,tz))}}
 const mine=(await loadStudents(db,{userId:uid})).data.filter(s=>s.user_id===uid);
 if(mine.length){roles.push('student');const ids=mine.map(s=>s.id);
  const [as,subs,les,...cons]=await Promise.all([
   db.from('assignments').select('id,title,student_id,due_at,published_at').in('student_id',ids).not('published_at','is',null).order('created_at',{ascending:false}).limit(200),
   db.from('homework_submissions').select('assignment_id').eq('student_user_id',uid).limit(1000),
   db.from('lessons').select('id,student_id,starts_at,ends_at,status').in('student_id',ids).gte('ends_at',new Date(now).toISOString()).lt('starts_at',new Date(now+86400e3).toISOString()),
   ...ids.map(id=>db.rpc('student_analysis_status',{sid:id}).then(r=>({id,rows:(r.data||[]) as {recording_id:string;lesson_date:string|null;state:string;updated_at:string}[]})))]);
  const input:StudentInput={assignments:(as.data||[]) as StudentInput['assignments'],submittedAssignmentIds:((subs.data||[]) as {assignment_id:string}[]).map(x=>x.assignment_id),
   nextLessons:((les.data||[]) as StudentInput['nextLessons']).map(l=>({...l,teacher_name:teacherName(l.student_id)||null})),
   pendingConsents:cons.flatMap(c=>c.rows.filter(r=>r.state==='no_consent'&&now-Date.parse(r.updated_at)<30*86400e3).map(r=>({id:r.recording_id,student_id:c.id,lesson_date:r.lesson_date})))};
  lists.push(studentTasks(input,now))}
 if(ready)lists.push(manualTasks((manual.data||[]) as ManualRow[]));
 return {tasks:sortTasks(combine(lists,((dis.data||[]) as {task_key:string}[]).map(d=>d.task_key))),ready,roles,at:now};
}

export function useTasks(){
 const {user,canTeach,studentLinks}=useAuth();const [st,setSt]=useState<Loaded|null>(null);const [tick,setTick]=useState(0);
 const tn=useCallback((sid:string)=>studentLinks.find(x=>x.id===sid)?.teacher_name||'',[studentLinks]);
 useEffect(()=>{const h=()=>setTick(x=>x+1);window.addEventListener('teachy-tasks-changed',h);return()=>window.removeEventListener('teachy-tasks-changed',h)},[]);
 useEffect(()=>{if(!user)return;let off=false;
  if(cache&&cache.uid===user.id&&Date.now()-cache.data.at<120e3){setSt(cache.data);return}
  void loadTasks(user.id,canTeach,tn).then(d=>{cache={uid:user.id,data:d};if(!off)setSt(d)},()=>{if(!off)setSt({tasks:[],ready:false,roles:[],at:Date.now()})});return()=>{off=true}},[user?.id,canTeach,tick]);// eslint-disable-line react-hooks/exhaustive-deps
 return {state:st,reload:()=>{cache=null;setTick(x=>x+1)}};
}

/** Sidebar badge: open tasks for today (overdue, due today, or urgent). */
export function TaskBadge(){const {state}=useTasks();const n=state?badgeCount(state.tasks,Date.now(),browserTimeZone()):0;
 return n>0?<span className="nav-badge" aria-label={t('{0} taken voor vandaag',n)}>{n>99?'99+':n}</span>:null}

const PRIO:Record<Priority,string>={high:'Hoog',normal:'Normaal',low:'Laag'};
export function TasksPage(){
 const {user,canTeach}=useAuth();const {state,reload}=useTasks();const tz=browserTimeZone();const now=Date.now();
 const [filter,setFilterState]=useState<TaskFilter>(()=>{try{return (localStorage.getItem('teachy-task-filter') as TaskFilter)||'all'}catch{return 'all'}});
 const [role,setRole]=useState<'all'|TaskRole>('all');const [adding,setAdding]=useState(false);const [msg,setMsg]=useState('');
 function setFilter(f:TaskFilter){setFilterState(f);try{localStorage.setItem('teachy-task-filter',f)}catch{}}
 const roles=state?.roles||[];const both=roles.length>1;
 const list=useMemo(()=>state?filterTasks(state.tasks,filter,now,tz).filter(x=>role==='all'||x.role===role):[],[state,filter,role]);// eslint-disable-line react-hooks/exhaustive-deps
 const counts=useMemo(()=>state?{all:filterTasks(state.tasks,'all',now,tz).length,today:filterTasks(state.tasks,'today',now,tz).length,week:filterTasks(state.tasks,'week',now,tz).length,done:filterTasks(state.tasks,'done',now,tz).length}:null,[state]);// eslint-disable-line react-hooks/exhaustive-deps
 async function toggle(x:Task){const db=supabase()!;setMsg('');let error;
  if(x.source==='manual')({error}=await db.from('tasks').update({done_at:x.done?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',x.id!));
  else if(x.done)({error}=await db.from('task_dismissals').delete().eq('owner_id',user!.id).eq('task_key',x.key));
  else ({error}=await db.from('task_dismissals').upsert({owner_id:user!.id,task_key:x.key},{onConflict:'owner_id,task_key'}));
  if(error){setMsg(/task/.test(error.message)?t('Voer eerst supabase/v57.sql uit.'):error.message);return}tasksChanged();reload()}
 async function remove(x:Task){if(!confirm(t('Deze taak verwijderen?')))return;const {error}=await supabase()!.from('tasks').delete().eq('id',x.id!);if(error){setMsg(error.message);return}tasksChanged();reload()}
 const fmtDue=(d:string)=>{const k=dayKey(d,tz),today=dayKey(now,tz);return k===today?t('vandaag')+' '+new Date(d).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',timeZone:tz}):new Date(d).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short',timeZone:tz})};
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t('OVERZICHT')}</p><h1>{t('Taken')}</h1><p className="muted">{t('Automatische taken verdwijnen vanzelf zodra ze klaar zijn. Eigen taken zie alleen jij.')}</p></div>
   <button className="button" disabled={state?.ready===false} onClick={()=>setAdding(true)}><Plus size={16}/> {t('Taak toevoegen')}</button></div>
  {state&&!state.ready&&<div className="notice">{t('Eigen taken zijn nog niet beschikbaar: voer supabase/v57.sql uit. Automatische taken werken wel.')}</div>}
  <div className="row task-filters"><div className="chipbar" role="group" aria-label={t('Filter')}>{(['all','today','week','done'] as TaskFilter[]).map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='all'?t('Alles'):f==='today'?t('Vandaag'):f==='week'?t('Deze week'):t('Afgerond')}{counts&&<span className="chip-count">{counts[f]}</span>}</button>)}</div>
   {both&&<div className="chipbar" role="group" aria-label={t('Rol')}>{(['all','teacher','student'] as const).map(r=><button key={r} aria-pressed={role===r} onClick={()=>setRole(r)}>{r==='all'?t('Beide rollen'):r==='teacher'?t('Docent'):t('Leerling')}</button>)}</div>}</div>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  {adding&&<TaskForm roles={roles.length?roles:[canTeach?'teacher':'student']} onClose={()=>setAdding(false)} onSaved={()=>{setAdding(false);tasksChanged();reload()}}/>}
  {!state?<div className="loader small"/>:!list.length?<div className="emptystate"><ListTodo size={30}/><strong>{filter==='done'?t('Nog niets afgerond'):t('Niets te doen')}</strong><p className="muted">{filter==='done'?'':t('Je bent helemaal bij.')}</p></div>:
  <ul className="task-list">{list.map(x=>{const over=isOverdue(x,now);return <li key={x.key} className={'task-row p-'+x.priority+(x.done?' done':'')+(over?' overdue':'')}>
   <input type="checkbox" checked={x.done} onChange={()=>void toggle(x)} aria-label={x.done?t('Als niet afgerond markeren'):t('Als afgerond markeren')}/>
   <div className="task-main"><strong>{x.source==='manual'?x.title:t(x.title,x.arg??'')}</strong>
    <div className="task-meta">{both&&<span className={'kind-badge k-'+(x.role==='teacher'?'teach':'learn')}>{x.role==='teacher'?<Presentation size={12}/>:<BookOpen size={12}/>} {x.role==='teacher'?t('Docent'):t('Leerling')}</span>}
     <span className={'prio p-'+x.priority}>{t(PRIO[x.priority])}</span>
     {x.due&&<span className={over?'danger-text':''}>{over?<AlertTriangle size={12}/>:<CalendarClock size={12}/>} {fmtDue(x.due)}</span>}
     {x.detail&&<span className="muted">{x.key.startsWith('plan:')?t(x.detail):x.detail}</span>}{x.source==='auto'&&<span className="muted small">{t('automatisch')}</span>}</div></div>
   <div className="task-actions">{x.href&&!x.done&&<Link className="button small secondary" href={x.href}>{t(x.action||'Openen')}</Link>}
    {x.done&&x.source==='auto'&&<button className="iconbtn" title={t('Terugzetten')} aria-label={t('Terugzetten')} onClick={()=>void toggle(x)}><RotateCcw size={15}/></button>}
    {x.source==='manual'&&<button className="iconbtn" title={t('Verwijderen')} aria-label={t('Verwijderen')} onClick={()=>void remove(x)}><Trash2 size={15}/></button>}</div>
  </li>})}</ul>}
 </>
}

function TaskForm({roles,onClose,onSaved}:{roles:TaskRole[];onClose:()=>void;onSaved:()=>void}){
 const [title,setTitle]=useState('');const [priority,setPriority]=useState<Priority>('normal');const [due,setDue]=useState('');const [role,setRole]=useState<TaskRole>(roles[0]);const [notes,setNotes]=useState('');const [msg,setMsg]=useState('');const [saving,setSaving]=useState(false);
 async function save(){if(!title.trim())return;setSaving(true);const {error}=await supabase()!.from('tasks').insert({title:title.trim().slice(0,300),notes:notes.trim()||null,priority,role,due_at:due?new Date(due+'T23:59').toISOString():null});
  setSaving(false);if(error){setMsg(/tasks/.test(error.message)?t('Voer eerst supabase/v57.sql uit.'):error.message);return}onSaved()}
 return <section className="card task-form"><div className="grid2">
  <label className="stack"><span className="label">{t('Taak')}</span><input className="field" value={title} maxLength={300} autoFocus onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void save()}} placeholder={t('Bijvoorbeeld: materiaal voorbereiden voor Madison')}/></label>
  <label className="stack"><span className="label">{t('Deadline (optioneel)')}</span><input className="field" type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
  <label className="stack"><span className="label">{t('Prioriteit')}</span><select className="field" value={priority} onChange={e=>setPriority(e.target.value as Priority)}>{(['high','normal','low'] as Priority[]).map(p=><option key={p} value={p}>{t(PRIO[p])}</option>)}</select></label>
  {roles.length>1&&<label className="stack"><span className="label">{t('Rol')}</span><select className="field" value={role} onChange={e=>setRole(e.target.value as TaskRole)}><option value="teacher">{t('Docent')}</option><option value="student">{t('Leerling')}</option></select></label>}
 </div>
  <label className="stack"><span className="label">{t('Notitie (optioneel)')}</span><textarea className="field" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  {msg&&<p className="notice">{msg}</p>}
  <div className="row"><button className="button" disabled={saving||!title.trim()} onClick={()=>void save()}>{saving?t('Opslaan…'):t('Toevoegen')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div>
 </section>
}
