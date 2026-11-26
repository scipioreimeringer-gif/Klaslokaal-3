'use client';
// v73: compact building blocks for the two dashboards. They reuse the existing task list (lib/tasks via useTasks), the
// daily practice (useDaily: completion stored as a 'daily' practice session per day) and existing tables — no second system.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ListTodo,CheckCircle2,Play,Flame,Sparkles,AlertTriangle,CalendarClock,Hand,ChevronRight} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {useTasks,tasksChanged} from './Tasks';
import {useDaily} from './DailyPractice';
import {browserTimeZone,dayKey} from '../lib/lessons';
import {isOverdue,type Task,type TaskRole} from '../lib/tasks';

/** "Mijn taken": the open tasks of ONE role (urgent first, max `max`, more on request) and a compact history. */
export function TasksMini({role,max=4,title}:{role:TaskRole;max?:number;title?:string}){
 const {user}=useAuth();const {state,reload}=useTasks();const [more,setMore]=useState(false);const [msg,setMsg]=useState('');
 if(!state)return <section className="card mini-tasks"><div className="loader small"/></section>;
 const now=Date.now(),tz=browserTimeZone();const mine=state.tasks.filter(x=>x.role===role);
 const open=mine.filter(x=>!x.done);const done=mine.filter(x=>x.done).slice(0,8);
 if(!open.length&&!done.length)return null;
 const shown=more?open:open.slice(0,max);
 async function finish(x:Task){const db=supabase()!;setMsg('');
  const {error}=x.source==='manual'?await db.from('tasks').update({done_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',x.id!)
   :await db.from('task_dismissals').upsert({owner_id:user!.id,task_key:x.key},{onConflict:'owner_id,task_key'});
  if(error){setMsg(error.message);return}tasksChanged();reload()}
 const due=(d:string)=>dayKey(d,tz)===dayKey(now,tz)?t('vandaag'):new Date(d).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short',timeZone:tz});
 return <section className="card mini-tasks" aria-label={title||t('Mijn taken')}>
  <div className="mini-head"><h3><ListTodo size={16}/> {title||t('Mijn taken')} {open.length>0&&<span className="chip-count">{open.length}</span>}</h3><Link className="textlink" href="/taken">{t('Alle taken')} <ChevronRight size={14}/></Link></div>
  {!open.length?<p className="muted small"><CheckCircle2 size={14}/> {t('Je bent helemaal bij.')}</p>:
  <ul className="mini-list">{shown.map(x=>{const over=isOverdue(x,now);return <li key={x.key} className={'p-'+x.priority+(over?' overdue':'')}>
   <button className="mini-check" title={t('Als afgerond markeren')} aria-label={t('Als afgerond markeren')} onClick={()=>void finish(x)}/>
   <span className="mini-main"><b>{x.source==='manual'?x.title:t(x.title,x.arg??'')}</b>{x.due&&<small className={over?'danger-text':'muted'}>{over?<AlertTriangle size={11}/>:<CalendarClock size={11}/>} {due(x.due)}</small>}</span>
   {x.href&&<Link className="button small secondary" href={x.href}>{t(x.action||'Openen')}</Link>}
  </li>})}</ul>}
  {open.length>max&&<button className="linklike" onClick={()=>setMore(m=>!m)}>{more?t('Minder tonen'):t('Nog {0} taken tonen',open.length-max)}</button>}
  {done.length>0&&<details className="mini-done"><summary>{t('Afgerond ({0})',done.length)}</summary><ul>{done.map(x=><li key={x.key}><CheckCircle2 size={12}/> {x.source==='manual'?x.title:t(x.title,x.arg??'')}</li>)}</ul></details>}
  {msg&&<p className="notice">{msg}</p>}
 </section>
}

/** Daily practice on the dashboard: a compact card while today's practice is open; once done only a small confirmation.
 *  Completion is the stored 'daily' practice session of today (local day of the student), so a refresh or a new login
 *  never shows it as open again, and the next day a new one appears by itself. */
export function DailyMini({studentId,level,lang}:{studentId:string;level?:string|null;lang?:string}){
 const {d}=useDaily(studentId,level,lang);
 if(!d||!d.hasMaterial)return null;
 const href='/oefenen/dagelijks?student='+encodeURIComponent(studentId);
 if(d.doneToday)return <p className="daily-done"><CheckCircle2 size={15}/> {t('Vandaag geoefend ({0}/{1} goed)',d.doneToday.score,d.doneToday.total)} · <Flame size={14}/> {t('{0} dagen op rij',d.streak)} · <Link href="/oefenen">{t('Verder oefenen')}</Link></p>;
 return <section className="card daily-mini"><span className="dp-ico" aria-hidden><Sparkles size={18}/></span>
  <div className="grow"><b>{t('Dagelijkse oefening')}</b> <span className="muted">· {t('ongeveer {0} minuten',Math.max(3,d.set.minutes))}</span>{d.streak>0&&<small className="muted block"><Flame size={12}/> {t('{0} dagen op rij',d.streak)}</small>}</div>
  <Link className="button" href={href}><Play size={15}/> {t('Beginnen')}</Link></section>
}

/** Teacher: open "Graag behandelen" requests of all own students (RLS: only the teacher's own students). */
export function TopicRequestsMini({names}:{names:Map<string,string>}){
 const [rows,setRows]=useState<{id:string;student_id:string;title:string}[]|null>(null);
 useEffect(()=>{const ids=[...names.keys()];if(!ids.length){setRows([]);return}let off=false;
  void supabase()!.from('topic_requests').select('id,student_id,curriculum_goals(title)').eq('status','open').in('student_id',ids).order('created_at',{ascending:false}).limit(20)
   .then(r=>{if(!off)setRows(r.error?[]:((r.data||[]) as unknown as {id:string;student_id:string;curriculum_goals:{title:string}|null}[]).map(x=>({id:x.id,student_id:x.student_id,title:x.curriculum_goals?.title||''})))});return()=>{off=true}},[names]);
 if(!rows?.length)return null;
 return <section className="card mini-tasks"><div className="mini-head"><h3><Hand size={16}/> {t('Aangevraagd door je leerlingen')} <span className="chip-count">{rows.length}</span></h3></div>
  <ul className="mini-list">{rows.slice(0,5).map(r=><li key={r.id}><span className="mini-main"><b>{r.title}</b><small className="muted">{names.get(r.student_id)}</small></span><Link className="button small secondary" href={'/leerlingen?student='+r.student_id+'&tab=doelen'}>{t('Bekijken')}</Link></li>)}</ul></section>
}
