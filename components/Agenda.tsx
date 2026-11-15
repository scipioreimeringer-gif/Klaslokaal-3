'use client';
// Lesson agenda (v30): planned lessons per teacher–student relation, shown in each viewer's own time zone.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {CalendarDays,CalendarPlus,ChevronLeft,ChevronRight,Clock,Video,X,Repeat,Sparkles,Mic,FileText,ClipboardList,Pencil,Ban} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {Avatar} from './Avatar';
import {Flag} from './Flag';
import {loadStudents,type StudentRecord} from '../lib/data';
import {languageName,relationLanguage} from '../lib/languages';
import {LESSON_COLUMNS,type Lesson,type LessonState,type View,lessonState,stateLabel,browserTimeZone,dayKey,clock,fmtDay,fmtWhen,minutesOf,gridDays,shift,byDay,nextLesson,countdown,planningError,classroomHref,timeZones} from '../lib/lessons';

/* ---------------- data ---------------- */
type Ctx={lessons:Lesson[];relations:Map<string,StudentRecord>;ready:boolean;error:string;loaded:boolean;reload:()=>void};
/** Lessons in [from,to) for the logged-in user in the current profile (teacher: own lessons; student: lessons of own relations). */
export function useLessons(range:{from:string;to:string}|null,mode:'teacher'|'student'):Ctx{
 const {user}=useAuth();const [st,setSt]=useState<Omit<Ctx,'reload'>>({lessons:[],relations:new Map(),ready:true,error:'',loaded:false});const [tick,setTick]=useState(0);
 const key=range?range.from+range.to:'';
 useEffect(()=>{if(!user||!range)return;let off=false;void(async()=>{const db=supabase()!;
  const r=await loadStudents(db,mode==='teacher'?{teacherId:user.id}:{userId:user.id});const rel=new Map(r.data.map(s=>[s.id,s]));
  let q=db.from('lessons').select(LESSON_COLUMNS).gte('ends_at',range.from).lt('starts_at',range.to).order('starts_at');
  q=mode==='teacher'?q.eq('teacher_id',user.id):q.in('student_id',r.data.length?r.data.map(s=>s.id):['00000000-0000-0000-0000-000000000000']);
  const {data,error}=await q;if(off)return;
  if(error){const missing=/lessons|schema cache|does not exist/i.test(error.message);setSt({lessons:[],relations:rel,ready:!missing,error:missing?'':error.message,loaded:true});return}
  setSt({lessons:(data||[]) as Lesson[],relations:rel,ready:true,error:'',loaded:true})})();return()=>{off=true}},[user?.id,key,mode,tick]);// eslint-disable-line react-hooks/exhaustive-deps
 return {...st,reload:useCallback(()=>setTick(x=>x+1),[])};
}
/** Saves the browser time zone in the profile once per session (so the other side can see your local time). */
export function useSyncTimeZone(){
 const {user}=useAuth();
 useEffect(()=>{if(!user)return;const k='teachy-tz-synced-'+user.id;const tz=browserTimeZone();try{if(sessionStorage.getItem(k)===tz)return;sessionStorage.setItem(k,tz)}catch{}void supabase()?.rpc('set_my_timezone',{tz})},[user?.id]);
}
function usePeopleTz(){const {user}=useAuth();const [m,setM]=useState<Map<string,string>>(new Map());
 useEffect(()=>{if(!user)return;void supabase()?.rpc('people_timezones').then(({data})=>setM(new Map(((data||[]) as {user_id:string;timezone:string|null}[]).filter(x=>x.timezone).map(x=>[x.user_id,x.timezone!]))))},[user?.id]);return m}
function useNow(ms=30000){const [n,setN]=useState(()=>Date.now());useEffect(()=>{const i=setInterval(()=>setN(Date.now()),ms);return()=>clearInterval(i)},[ms]);return n}

/* ---------------- small pieces ---------------- */
export function StatusChip({state}:{state:LessonState}){return <span className={'lstate '+state}>{stateLabel(state)}</span>}
const langOf=(l:Lesson,rel?:StudentRecord)=>l.language||(rel?relationLanguage(rel):'');
function Who({l,rel,mode,teacherName,size=36}:{l:Lesson;rel?:StudentRecord;mode:'teacher'|'student';teacherName:(id:string)=>string;size?:number}){
 const name=mode==='teacher'?(rel?.name||t('Leerling')):(teacherName(l.student_id)||t('Docent'));
 return <><Avatar userId={mode==='teacher'?rel?.user_id:l.teacher_id} name={name} size={size}/><span className="who-name">{name}</span></>
}

/* ---------------- dashboard: next lesson + today + this week ---------------- */
export function NextLessonPanel({mode}:{mode:'teacher'|'student'}){
 const {studentLinks}=useAuth();useSyncTimeZone();const now=useNow();const tz=browserTimeZone();
 const range=useMemo(()=>({from:new Date(Date.now()-12*3600e3).toISOString(),to:new Date(Date.now()+60*86400e3).toISOString()}),[]);
 const {lessons,relations,ready,loaded,error}=useLessons(range,mode);
 const teacherName=(sid:string)=>studentLinks.find(x=>x.id===sid)?.teacher_name||'';
 const next=nextLesson(lessons,now);const today=dayKey(now,tz);const weekEnd=new Date(now+7*86400e3).toISOString();
 const upcoming=lessons.filter(l=>l.status!=='cancelled'&&Date.parse(l.ends_at)>now);
 const todays=upcoming.filter(l=>dayKey(l.starts_at,tz)===today&&l.id!==next?.id);
 const week=upcoming.filter(l=>dayKey(l.starts_at,tz)!==today&&l.starts_at<weekEnd&&l.id!==next?.id);
 if(!ready)return <section className="panel next-lesson"><p className="muted">{t('De agenda is nog niet ingesteld: voer supabase/v30.sql uit.')}</p></section>;
 if(!loaded)return <section className="panel next-lesson"><div className="loader small"/></section>;
 const rel=next?relations.get(next.student_id):undefined;const lang=next?langOf(next,rel):'';
 return <section className="panel next-lesson" aria-label={t('Volgende les')}>
  {error&&<p className="notice">{error}</p>}
  {!next?<div className="next-empty"><CalendarDays size={28}/><div><strong>{t('Geen lessen gepland')}</strong><p className="muted">{mode==='teacher'?t('Plan een les in de agenda; je leerling ziet hem dan meteen in de eigen tijdzone.'):t('Zodra je docent een les inplant, zie je die hier.')}</p></div>{mode==='teacher'&&<Link className="button" href="/agenda?nieuw=1"><CalendarPlus size={16}/> {t('Les inplannen')}</Link>}</div>:
  <div className="next-main">
   <div className="next-head"><p className="eyebrow-dark">{t('VOLGENDE LES')}</p><StatusChip state={lessonState(next,now)}/></div>
   <div className="next-body">
    <div className="next-who"><Who l={next} rel={rel} mode={mode} teacherName={teacherName} size={52}/></div>
    <div className="next-info">
     <div className="next-lang">{lang&&<Flag code={lang} size={20}/>} {lang?languageName(lang):''}{rel?.level?' · '+rel.level:''}</div>
     <div className="next-when"><Clock size={15}/> {fmtWhen(next,tz)}</div>
     <div className="next-count">{countdown(next.starts_at,now)}</div>
    </div>
    <Link className="button next-open" href={classroomHref(next)}><Video size={16}/> {t('Klaslokaal openen')}</Link>
   </div>
  </div>}
  {(todays.length>0||week.length>0)&&<div className="next-lists">
   {todays.length>0&&<div><h4>{t('Vandaag')}</h4><LessonRows items={todays} relations={relations} mode={mode} teacherName={teacherName} tz={tz} now={now}/></div>}
   {week.length>0&&<div><h4>{t('Deze week')}</h4><LessonRows items={week} relations={relations} mode={mode} teacherName={teacherName} tz={tz} now={now} withDay/></div>}
  </div>}
  {next&&<div className="next-foot"><Link href="/agenda">{t('Naar de agenda')} →</Link></div>}
 </section>
}
function LessonRows({items,relations,mode,teacherName,tz,now,withDay}:{items:Lesson[];relations:Map<string,StudentRecord>;mode:'teacher'|'student';teacherName:(id:string)=>string;tz:string;now:number;withDay?:boolean}){
 return <ul className="lesson-rows">{items.map(l=>{const rel=relations.get(l.student_id);const lang=langOf(l,rel);return <li key={l.id}>
  <span className="lr-time">{withDay&&<small>{fmtDay(dayKey(l.starts_at,tz),{weekday:'short',day:'numeric',month:'short'})}</small>}{clock(l.starts_at,tz)}–{clock(l.ends_at,tz)}</span>
  <span className="lr-who"><Who l={l} rel={rel} mode={mode} teacherName={teacherName} size={26}/></span>
  <span className="lr-lang">{lang&&<Flag code={lang} size={16}/>}</span><StatusChip state={lessonState(l,now)}/>
  <Link className="iconbtn" href={classroomHref(l)} title={t('Klaslokaal openen')} aria-label={t('Klaslokaal openen')}><Video size={16}/></Link></li>})}</ul>
}

/* ---------------- agenda page ---------------- */
export function AgendaView({mode,openNew}:{mode:'teacher'|'student';openNew?:boolean}){
 const {studentLinks}=useAuth();useSyncTimeZone();const now=useNow();const tz=browserTimeZone();
 const [view,setView]=useState<View>(()=>{try{return (localStorage.getItem('teachy-agenda-view') as View)||'week'}catch{return 'week'}});
 const [anchor,setAnchor]=useState(()=>dayKey(Date.now(),browserTimeZone()));
 const days=gridDays(anchor,view);
 const range=useMemo(()=>({from:new Date(Date.parse(days[0]+'T00:00:00Z')-86400e3).toISOString(),to:new Date(Date.parse(days[days.length-1]+'T00:00:00Z')+2*86400e3).toISOString()}),[days[0],days[days.length-1]]);// eslint-disable-line react-hooks/exhaustive-deps
 const {lessons,relations,ready,error,loaded,reload}=useLessons(range,mode);
 const [open,setOpen]=useState<Lesson|null>(null);const [form,setForm]=useState<{lesson?:Lesson;day?:string}|null>(openNew&&mode==='teacher'?{}:null);
 const [showCancelled,setShowCancelled]=useState(false);
 const teacherName=(sid:string)=>studentLinks.find(x=>x.id===sid)?.teacher_name||'';
 const groups=byDay(lessons.filter(l=>showCancelled||l.status!=='cancelled'),tz);const today=dayKey(now,tz);
 function setV(v:View){setView(v);try{localStorage.setItem('teachy-agenda-view',v)}catch{}}
 const title=view==='month'?new Date(anchor+'T12:00:00Z').toLocaleDateString(locale(),{month:'long',year:'numeric',timeZone:'UTC'}):view==='week'?`${fmtDay(days[0],{day:'numeric',month:'short'})} – ${fmtDay(days[6],{day:'numeric',month:'short',year:'numeric'})}`:fmtDay(anchor,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{mode==='teacher'?t('DOCENT'):t('MIJN LESSEN')}</p><h1>{t('Agenda')}</h1><p className="muted">{t('Tijden in jouw tijdzone: {0}', tz.replace(/_/g,' '))}</p></div>
   {mode==='teacher'&&<button className="button" onClick={()=>setForm({})}><CalendarPlus size={16}/> {t('Les inplannen')}</button>}</div>
  {!ready&&<div className="notice">{t('De agenda is nog niet ingesteld: voer supabase/v30.sql uit.')}</div>}
  {error&&<div className="notice">{error}</div>}
  <div className="agenda-bar">
   <div className="row"><button className="iconbtn" aria-label={t('Vorige')} title={t('Vorige')} onClick={()=>setAnchor(shift(anchor,view,-1))}><ChevronLeft size={18}/></button><button className="button small secondary" onClick={()=>setAnchor(today)}>{t('Vandaag')}</button><button className="iconbtn" aria-label={t('Volgende')} title={t('Volgende')} onClick={()=>setAnchor(shift(anchor,view,1))}><ChevronRight size={18}/></button><strong className="agenda-title">{title}</strong></div>
   <div className="row"><label className="row small muted"><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> {t('Geannuleerde tonen')}</label>
    <div className="chipbar" role="group" aria-label={t('Weergave')}>{(['day','week','month'] as View[]).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setV(v)}>{v==='day'?t('Dag'):v==='week'?t('Week'):t('Maand')}</button>)}</div></div>
  </div>
  {!loaded?<div className="loader small"/>:<div className={'agenda-grid '+view}>
   {view==='month'&&[1,2,3,4,5,6,7].map(i=><div key={i} className="agenda-dow">{fmtDay(days[i-1],{weekday:'short'})}</div>)}
   {days.map(d=>{const items=groups.get(d)||[];const out=view==='month'&&d.slice(0,7)!==anchor.slice(0,7);return <div key={d} className={'agenda-day'+(d===today?' today':'')+(out?' out':'')}>
    <div className="agenda-dhead"><span>{view==='month'?Number(d.slice(8)):fmtDay(d,{weekday:'short',day:'numeric',month:'short'})}</span>{mode==='teacher'&&ready&&<button className="iconbtn tiny" title={t('Les inplannen')} aria-label={t('Les inplannen')} onClick={()=>setForm({day:d})}>+</button>}</div>
    {items.map(l=>{const rel=relations.get(l.student_id);const st=lessonState(l,now);const lang=langOf(l,rel);return <button key={l.id} className={'agenda-item '+st} onClick={()=>setOpen(l)}>
     <span className="ai-time">{clock(l.starts_at,tz)}{view!=='month'&&'–'+clock(l.ends_at,tz)}</span><span className="ai-who">{lang&&<Flag code={lang} size={14}/>} {mode==='teacher'?(rel?.name||t('Leerling')):(teacherName(l.student_id)||t('Docent'))}</span>{l.series_id&&view!=='month'&&<Repeat size={12} aria-label={t('Wekelijks')}/>}</button>})}
    {!items.length&&view!=='month'&&<p className="agenda-none">{t('Geen lessen')}</p>}
   </div>})}
  </div>}
  {loaded&&ready&&!lessons.length&&<div className="emptystate"><CalendarDays size={30}/><strong>{t('Geen lessen in deze periode')}</strong>{mode==='teacher'?<button className="button small" onClick={()=>setForm({})}><CalendarPlus size={15}/> {t('Les inplannen')}</button>:<p className="muted">{t('Zodra je docent een les inplant, zie je die hier.')}</p>}</div>}
  {open&&<LessonDetail lesson={open} rel={relations.get(open.student_id)} mode={mode} teacherName={teacherName} onClose={()=>setOpen(null)} onEdit={()=>{setForm({lesson:open});setOpen(null)}} onChanged={()=>{setOpen(null);reload()}}/>}
  {form&&mode==='teacher'&&<LessonForm initial={form.lesson} day={form.day} relations={[...relations.values()].filter(r=>!r.archived_at)} onClose={()=>setForm(null)} onSaved={()=>{setForm(null);reload()}}/>}
 </>
}

/* ---------------- details of one lesson ---------------- */
type Links={recordings:number;analysis:{id:string;status:string}|null;homework:number;notes:boolean};
function LessonDetail({lesson:l,rel,mode,teacherName,onClose,onEdit,onChanged}:{lesson:Lesson;rel?:StudentRecord;mode:'teacher'|'student';teacherName:(id:string)=>string;onClose:()=>void;onEdit:()=>void;onChanged:()=>void}){
 const now=useNow();const tz=browserTimeZone();const people=usePeopleTz();const st=lessonState(l,now);const lang=langOf(l,rel);
 const [notes,setNotes]=useState('');const [savedNotes,setSavedNotes]=useState('');const [msg,setMsg]=useState('');const [links,setLinks]=useState<Links|null>(null);
 const otherTz=mode==='teacher'?(rel?.user_id?people.get(rel.user_id):undefined):people.get(l.teacher_id);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 useEffect(()=>{const db=supabase();if(mode!=='teacher'||!db)return;void db.from('lesson_teacher_notes').select('notes').eq('lesson_id',l.id).maybeSingle().then(({data})=>{const n=(data as {notes?:string}|null)?.notes||'';setNotes(n);setSavedNotes(n)})},[l.id,mode]);
 useEffect(()=>{const db=supabase();if(st==='scheduled'||st==='cancelled'||!db)return;void(async()=>{
  const day=dayKey(l.starts_at,l.timezone);
  const [r,a,h,e]=await Promise.all([db.from('lesson_recordings').select('id',{count:'exact',head:true}).eq('lesson_id',l.id),mode==='teacher'?db.from('lesson_analyses').select('id,status').eq('lesson_id',l.id).maybeSingle():Promise.resolve({data:null}),db.from('assignments').select('id',{count:'exact',head:true}).eq('lesson_id',l.id),db.from('lesson_entries').select('id').eq('student_id',l.student_id).eq('lesson_date',day).maybeSingle()]);
  setLinks({recordings:r.count||0,analysis:(a.data as Links['analysis'])||null,homework:h.count||0,notes:!!e.data})})()},[l.id,st,mode]);// eslint-disable-line react-hooks/exhaustive-deps
 async function saveNotes(){const {error}=await supabase()!.from('lesson_teacher_notes').upsert({lesson_id:l.id,notes,updated_at:new Date().toISOString()},{onConflict:'lesson_id'});setMsg(error?error.message:t('Opgeslagen ✓'));if(!error)setSavedNotes(notes)}
 async function cancel(all:boolean){if(!confirm(all?t('Deze en alle volgende lessen van deze reeks annuleren?'):t('Deze les annuleren? Je leerling ziet de les als geannuleerd.')))return;
  let q=supabase()!.from('lessons').update({status:'cancelled'});q=all&&l.series_id?q.eq('series_id',l.series_id).gte('starts_at',l.starts_at):q.eq('id',l.id);const {error}=await q;if(error){setMsg(planningError(error.message));return}onChanged()}
 async function restore(){const {error}=await supabase()!.from('lessons').update({status:'scheduled',cancelled_at:null}).eq('id',l.id);if(error){setMsg(planningError(error.message));return}onChanged()}
 const base='/'+(mode==='teacher'?'leerlingen?student=':'mijn-profiel?student=')+l.student_id+'&tab=';
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-detail" role="dialog" aria-modal="true" aria-label={t('Les')} onClick={e=>e.stopPropagation()}>
  <div className="row between"><div className="row"><Who l={l} rel={rel} mode={mode} teacherName={teacherName} size={44}/></div><button className="iconbtn" aria-label={t('Sluiten')} onClick={onClose}><X size={18}/></button></div>
  <div className="ld-meta"><StatusChip state={st}/>{lang&&<span><Flag code={lang} size={16}/> {languageName(lang)}{rel?.level?' · '+rel.level:''}</span>}{l.series_id&&<span><Repeat size={14}/> {t('Wekelijks')}</span>}</div>
  <p className="ld-when"><Clock size={15}/> {fmtWhen(l,tz)} <small className="muted">({minutesOf(l)} {t('min')})</small></p>
  {otherTz&&otherTz!==tz&&<p className="muted small">{mode==='teacher'?t('Voor de leerling: {0} ({1})',clock(l.starts_at,otherTz)+'–'+clock(l.ends_at,otherTz),otherTz.replace(/_/g,' ')):t('Voor je docent: {0} ({1})',clock(l.starts_at,otherTz)+'–'+clock(l.ends_at,otherTz),otherTz.replace(/_/g,' '))}</p>}
  {st==='scheduled'&&<p className="next-count">{countdown(l.starts_at,now)}</p>}
  {st!=='cancelled'&&<Link className="button" href={classroomHref(l)}><Video size={16}/> {t('Klaslokaal openen')}</Link>}
  {links&&<div className="ld-links"><h4>{t('Bij deze les')}</h4><ul>
   {mode==='teacher'&&<li><Sparkles size={15}/> {links.analysis?<Link href={base+'analyses'}>{t('Lesanalyse bekijken')} · {links.analysis.status==='approved'?t('Goedgekeurd'):links.analysis.status==='ready'?t('Klaar voor controle'):links.analysis.status==='failed'?t('Verwerking mislukt'):t('In verwerking')}</Link>:<span className="muted">{t('Nog geen lesanalyse')}</span>}</li>}
   <li><Mic size={15}/> {links.recordings?<Link href={base+'opnames'}>{t('{0} opname(s)',links.recordings)}</Link>:<span className="muted">{t('Geen opname')}</span>}</li>
   <li><FileText size={15}/> {links.notes?<Link href={base+'lessen'}>{t('Lesnotities en canvas')}</Link>:<span className="muted">{t('Geen lesnotities')}</span>}</li>
   <li><ClipboardList size={15}/> {links.homework?<Link href={base+'huiswerk'}>{t('{0} huiswerkopdracht(en)',links.homework)}</Link>:<Link href={base+'huiswerk'}>{t('Huiswerk')}</Link>}</li>
  </ul></div>}
  {mode==='teacher'&&<label className="stack"><span className="label">{t('Lesnotities (alleen voor jou)')}</span><textarea className="field" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder={t('Bijvoorbeeld: herhaal de verleden tijd, neem de tekst over werk mee')}/>{notes!==savedNotes&&<button className="button small secondary" onClick={()=>void saveNotes()}>{t('Opslaan')}</button>}</label>}
  {msg&&<p className="muted" role="status">{msg}</p>}
  {mode==='teacher'&&<div className="row ld-actions">
   {st==='scheduled'&&<button className="button small secondary" onClick={onEdit}><Pencil size={14}/> {t('Wijzigen')}</button>}
   {(st==='scheduled'||st==='live')&&<button className="button small secondary danger-text" onClick={()=>void cancel(false)}><Ban size={14}/> {t('Les annuleren')}</button>}
   {st==='scheduled'&&l.series_id&&<button className="button small secondary danger-text" onClick={()=>void cancel(true)}>{t('Reeks vanaf hier annuleren')}</button>}
   {st==='cancelled'&&Date.parse(l.starts_at)>now&&<button className="button small secondary" onClick={()=>void restore()}>{t('Toch laten doorgaan')}</button>}
  </div>}
 </div></div>
}

/* ---------------- plan / change a lesson (teacher) ---------------- */
const DURATIONS=[30,45,60,75,90,120];
function LessonForm({initial,day,relations,onClose,onSaved}:{initial?:Lesson;day?:string;relations:StudentRecord[];onClose:()=>void;onSaved:()=>void}){
 const people=usePeopleTz();const myTz=browserTimeZone();
 const [student,setStudent]=useState(initial?.student_id||relations[0]?.id||'');
 const rel=relations.find(r=>r.id===student);
 const [tz,setTz]=useState(initial?.timezone||myTz);
 const [date,setDate]=useState(initial?dayKey(initial.starts_at,initial.timezone):(day||dayKey(Date.now()+86400e3,myTz)));
 const [time,setTime]=useState(initial?clock(initial.starts_at,initial.timezone):'10:00');
 const [minutes,setMinutes]=useState(initial?minutesOf(initial):60);
 const [language,setLanguage]=useState(initial?.language||'');
 const [weekly,setWeekly]=useState(false);const [weeks,setWeeks]=useState(8);
 const [notes,setNotes]=useState('');const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 useEffect(()=>{if(!initial)setLanguage(rel?relationLanguage(rel):'')},[student]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 const studentTz=rel?.user_id?people.get(rel.user_id):undefined;
 // preview of the start in the student's zone: the server converts; here only for display
 const startPreview=useMemo(()=>{try{const guess=Date.parse(`${date}T${time}:00Z`);const off=(x:number)=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(x));const g=(k:string)=>Number(p.find(q=>q.type===k)?.value);return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'))-x};return guess-off(guess)}catch{return NaN}},[date,time,tz]);
 async function save(){if(!student||!date||!time)return;setBusy(true);setMsg('');const db=supabase()!;const local=`${date} ${time}`;
  if(initial){const r=await db.rpc('reschedule_lesson',{p_id:initial.id,p_local_start:local,p_tz:tz,p_minutes:minutes});
   if(!r.error&&(language||null)!==(initial.language||null)){const u=await db.from('lessons').update({language:language||null}).eq('id',initial.id);if(u.error){setBusy(false);setMsg(planningError(u.error.message));return}}
   setBusy(false);if(r.error){setMsg(planningError(r.error.message));return}onSaved();return}
  const r=await db.rpc('schedule_lessons',{p_student:student,p_local_start:local,p_tz:tz,p_minutes:minutes,p_weeks:weekly?weeks:1,p_language:language||null,p_notes:notes});
  setBusy(false);if(r.error){setMsg(planningError(r.error.message));return}onSaved()}
 const zones=useMemo(()=>timeZones(),[]);
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-form" role="dialog" aria-modal="true" aria-label={initial?t('Les wijzigen'):t('Les inplannen')} onClick={e=>e.stopPropagation()}>
  <div className="row between"><h3>{initial?t('Les wijzigen'):t('Les inplannen')}</h3><button className="iconbtn" aria-label={t('Sluiten')} onClick={onClose}><X size={18}/></button></div>
  {!relations.length?<p className="muted">{t('Voeg eerst een leerling toe.')} <Link href="/leerlingen?nieuw=1">{t('Leerling toevoegen')}</Link></p>:<>
  <label className="stack"><span className="label">{t('Leerling')}</span><select className="field" value={student} disabled={!!initial} onChange={e=>setStudent(e.target.value)}>{relations.map(r=><option key={r.id} value={r.id}>{r.name} — {languageName(relationLanguage(r))}{r.level?' '+r.level:''}</option>)}</select></label>
  <div className="grid2">
   <label className="stack"><span className="label">{t('Datum')}</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
   <label className="stack"><span className="label">{t('Begintijd')}</span><input className="field" type="time" value={time} step={300} onChange={e=>setTime(e.target.value)} required/></label>
   <label className="stack"><span className="label">{t('Lesduur')}</span><select className="field" value={minutes} onChange={e=>setMinutes(+e.target.value)}>{[...new Set([...DURATIONS,minutes])].sort((a,b)=>a-b).map(m=><option key={m} value={m}>{m} {t('min')}</option>)}</select></label>
   <label className="stack"><span className="label">{t('Taal van de les')}</span><select className="field" value={language} onChange={e=>setLanguage(e.target.value)}><option value="">{rel?languageName(relationLanguage(rel)):'—'}</option>{['nl','pt','en','es','fr','de','it'].filter(c=>!rel||c!==relationLanguage(rel)).map(c=><option key={c} value={c}>{languageName(c)}</option>)}</select></label>
  </div>
  <label className="stack"><span className="label">{t('Tijdzone van de begintijd')}</span><select className="field" value={tz} onChange={e=>setTz(e.target.value)}>{(zones.includes(tz)?zones:[tz,...zones]).map(z=><option key={z} value={z}>{z.replace(/_/g,' ')}</option>)}</select></label>
  {studentTz&&studentTz!==tz&&!Number.isNaN(startPreview)&&<p className="muted small">{t('Voor de leerling: {0} ({1})',`${fmtDay(dayKey(startPreview,studentTz),{weekday:'short',day:'numeric',month:'short'})} ${clock(startPreview,studentTz)}`,studentTz.replace(/_/g,' '))}</p>}
  {!initial&&<><label className="row"><input type="checkbox" checked={weekly} onChange={e=>setWeekly(e.target.checked)}/> <Repeat size={15}/> {t('Elke week herhalen')}</label>
   {weekly&&<label className="stack"><span className="label">{t('Aantal weken (inclusief deze)')}</span><input className="field" type="number" min={2} max={52} value={weeks} onChange={e=>setWeeks(Math.max(2,Math.min(52,+e.target.value||2)))}/><small className="muted">{t('Lessen blijven op dezelfde lokale tijd, ook bij zomer- en wintertijd.')}</small></label>}
   <label className="stack"><span className="label">{t('Lesnotities (optioneel, alleen voor jou)')}</span><textarea className="field" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label></>}
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={busy||!student} onClick={()=>void save()}>{busy?t('Opslaan…'):initial?t('Wijziging opslaan'):weekly?t('{0} lessen inplannen',weeks):t('Les inplannen')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div></>}
 </div></div>
}
