'use client';
// v74: the teacher's dashboard figures — registered data only (RLS: the teacher's own students). Money stays per currency
// (never added across currencies), received = confirmed payments only, planned lessons are counted, never valued as income.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Wallet,Hourglass,Clock3,UsersRound,CalendarClock,Target,Sparkles,GraduationCap,ClipboardCheck,Dumbbell,Pencil,Check} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {useFinanceSummary} from './Payments';
import {fmtMoney,type Money} from '../lib/billing';

type Fig={minutes:number;lessons:number;active:number;planned:number};
const monthStart=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString()};
function useFigures(ids:string[]){
 const {user}=useAuth();const [f,setF]=useState<Fig|null>(null);const key=ids.join(',');
 useEffect(()=>{if(!user||!ids.length){setF(ids.length?null:{minutes:0,lessons:0,active:0,planned:0});return}let off=false;const db=supabase()!;const now=Date.now();
  void Promise.all([
   db.from('lesson_sessions').select('student_id,started_at,joint_seconds').in('student_id',ids).gte('started_at',new Date(now-31*86400e3).toISOString()).limit(3000),
   db.from('lessons').select('id',{count:'exact',head:true}).eq('teacher_id',user.id).neq('status','cancelled').gte('starts_at',new Date(now).toISOString()).lt('starts_at',new Date(now+14*86400e3).toISOString())])
  .then(([s,l])=>{if(off)return;const rows=(s.error?[]:s.data||[]) as {student_id:string;started_at:string;joint_seconds:number}[];const ms=monthStart();
   const month=rows.filter(r=>r.started_at>=ms&&r.joint_seconds>=120);
   setF({minutes:Math.round(month.reduce((n,r)=>n+r.joint_seconds,0)/60),lessons:month.length,active:new Set(rows.filter(r=>r.joint_seconds>=120).map(r=>r.student_id)).size,planned:l.count||0})});
  return()=>{off=true}},[key,user?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 return f;
}
const hm=(m:number)=>t('{0} u {1} min',Math.floor(m/60),m%60);

/** Compact figures at the top + private month goals with a progress bar. */
export function TeacherFigures({ids}:{ids:string[]}){
 const f=useFigures(ids);const fin=useFinanceSummary();const loc=locale();
 const {user}=useAuth();const meta=(user?.user_metadata||{}) as {teacher_goals?:{hours?:number;lessons?:number;revenue?:number;currency?:string}};
 const [goals,setGoals]=useState(meta.teacher_goals||{});const [edit,setEdit]=useState(false);
 const save=(g:typeof goals)=>{setGoals(g);setEdit(false);void supabase()?.auth.updateUser({data:{teacher_goals:g}}).catch(()=>{})};
 const tiles:[typeof Wallet,string,string,string][]=[];
 if(fin){tiles.push([Wallet,fmtMoney(fin.received,loc),t('Ontvangen deze maand'),'tone-green']);tiles.push([Hourglass,fmtMoney(fin.outstanding,loc),t('Openstaande betalingen'),'tone-gold'])}
 tiles.push([Clock3,f?hm(f.minutes):'…',t('Lesuren deze maand'),'tone-blue'],[UsersRound,f?String(f.active):'…',t('Actieve leerlingen (30 dagen)'),'tone-teal'],[CalendarClock,f?String(f.planned):'…',t('Geplande lessen (14 dagen)'),'tone-violet']);
 const cur=goals.currency||Object.keys(fin?.received||{})[0]||'EUR';const rec=(fin?.received as Money|undefined)?.[cur]||0;
 const bars:[string,number,number,string][]=[];
 if(f&&goals.hours)bars.push([t('Lesuren'),f.minutes/60,goals.hours,hm(f.minutes)+' / '+goals.hours+' u']);
 if(f&&goals.lessons)bars.push([t('Gegeven lessen'),f.lessons,goals.lessons,f.lessons+' / '+goals.lessons]);
 if(fin&&goals.revenue)bars.push([t('Omzet (bevestigd)'),rec/100,goals.revenue,fmtMoney({[cur]:rec},loc)+' / '+fmtMoney({[cur]:goals.revenue*100},loc)]);
 return <section className="t-figs">
  <div className="fig-row">{tiles.map(([I,v,l,tone])=><div key={l} className={'fig '+tone}><I size={16}/><b>{v}</b><span>{l}</span></div>)}</div>
  <div className="card t-goals"><div className="row between"><h3><Target size={15}/> {t('Mijn maanddoelen')} <small className="muted">{t('(alleen voor jou)')}</small></h3><button className="iconbtn" title={t('Doelen instellen')} aria-label={t('Doelen instellen')} onClick={()=>setEdit(e=>!e)}><Pencil size={14}/></button></div>
   {edit?<GoalForm g={goals} currency={cur} onSave={save}/>:bars.length?<div className="goal-bars">{bars.map(([l,v,goal,txt])=><div key={l} className="gbar"><div className="row between"><span>{l}</span><small className="muted">{txt}</small></div><div className="bar"><span style={{width:Math.min(100,v/goal*100)+'%'}}/></div></div>)}</div>
   :<p className="muted small">{t('Stel optioneel een doel in voor lesuren, lessen of omzet deze maand.')}</p>}
   {fin&&goals.revenue&&Object.keys(fin.received).length>1?<p className="muted small">{t('Omzet in andere valuta telt niet mee voor dit doel.')}</p>:null}</div>
 </section>
}
function GoalForm({g,currency,onSave}:{g:{hours?:number;lessons?:number;revenue?:number;currency?:string};currency:string;onSave:(g:{hours?:number;lessons?:number;revenue?:number;currency?:string})=>void}){
 const [x,setX]=useState({hours:g.hours||'',lessons:g.lessons||'',revenue:g.revenue||'',currency:g.currency||currency});
 const num=(v:unknown)=>{const n=Number(v);return n>0?n:undefined};
 return <div className="goal-form">
  <label>{t('Lesuren')}<input className="field" type="number" min={0} value={x.hours} onChange={e=>setX({...x,hours:e.target.value})}/></label>
  <label>{t('Lessen')}<input className="field" type="number" min={0} value={x.lessons} onChange={e=>setX({...x,lessons:e.target.value})}/></label>
  <label>{t('Omzet')}<span className="row"><input className="field" type="number" min={0} value={x.revenue} onChange={e=>setX({...x,revenue:e.target.value})}/><input className="field cur" maxLength={3} value={x.currency} onChange={e=>setX({...x,currency:e.target.value.toUpperCase()})} aria-label={t('Valuta')}/></span></label>
  <button className="button small" onClick={()=>onSave({hours:num(x.hours),lessons:num(x.lessons),revenue:num(x.revenue),currency:/^[A-Z]{3}$/.test(x.currency)?x.currency:currency})}><Check size={14}/> {t('Opslaan')}</button>
 </div>
}

/** Positive developments of the last two weeks (real events only). */
export function StudentHighlights({names}:{names:Map<string,string>}){
 const [rows,setRows]=useState<{key:string;icon:'gram'|'hw'|'prac';text:string;who:string;sid:string;at:string}[]|null>(null);const ids=[...names.keys()];const key=ids.join(',');
 useEffect(()=>{if(!ids.length){setRows([]);return}let off=false;const db=supabase()!;const since=new Date(Date.now()-14*86400e3).toISOString();
  void Promise.all([
   db.from('student_goal_progress').select('student_id,updated_at,curriculum_goals(title),title_override').in('student_id',ids).eq('status','mastered').gte('updated_at',since).limit(20),
   db.from('homework_submissions').select('submitted_at,assignments!inner(title,student_id)').in('assignments.student_id',ids).gte('submitted_at',since).limit(20),
   db.from('practice_sessions').select('student_id,created_at').in('student_id',ids).gte('created_at',new Date(Date.now()-7*86400e3).toISOString()).limit(2000)])
  .then(([g,h,p])=>{if(off)return;const out:NonNullable<typeof rows>=[];
   for(const x of (g.data||[]) as unknown as {student_id:string;updated_at:string;title_override:string|null;curriculum_goals:{title:string}|null}[])out.push({key:'g'+x.student_id+x.updated_at,icon:'gram',text:t('beheerst nu: {0}',x.title_override||x.curriculum_goals?.title||''),who:names.get(x.student_id)||'',sid:x.student_id,at:x.updated_at});
   for(const x of (h.data||[]) as unknown as {submitted_at:string;assignments:{title:string;student_id:string}|{title:string;student_id:string}[]}[]){const a=Array.isArray(x.assignments)?x.assignments[0]:x.assignments;if(a)out.push({key:'h'+a.student_id+x.submitted_at,icon:'hw',text:t('rondde huiswerk af: {0}',a.title),who:names.get(a.student_id)||'',sid:a.student_id,at:x.submitted_at})}
   const per=new Map<string,{n:number;at:string}>();for(const x of (p.data||[]) as {student_id:string;created_at:string}[]){const c=per.get(x.student_id)||{n:0,at:''};c.n++;if(x.created_at>c.at)c.at=x.created_at;per.set(x.student_id,c)}
   for(const [sid,c] of per)out.push({key:'p'+sid,icon:'prac',text:t('oefende {0}× zelfstandig deze week',c.n),who:names.get(sid)||'',sid,at:c.at});
   setRows(out.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8))});
  return()=>{off=true}},[key]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!rows?.length)return null;
 const I={gram:GraduationCap,hw:ClipboardCheck,prac:Dumbbell};
 return <section className="card mini-tasks highlights"><div className="mini-head"><h3><Sparkles size={16}/> {t('Positieve ontwikkelingen')}</h3><small className="muted">{t('laatste 2 weken')}</small></div>
  <ul className="mini-list">{rows.map(r=>{const Ic=I[r.icon];return <li key={r.key} className={'hl-'+r.icon}><span className="hl-ic"><Ic size={14}/></span><Link className="mini-main" href={'/leerlingen?student='+r.sid}><b>{r.who}</b><small className="muted">{r.text}</small></Link></li>})}</ul></section>
}
