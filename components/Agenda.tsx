'use client';
// Lesson agenda (v30): planned lessons per teacher–student relation, shown in each viewer's own time zone.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {LessonTopics} from './LessonTopics';
import {Check,CalendarDays,CalendarPlus,ChevronLeft,ChevronRight,Clock,Video,X,Repeat,Sparkles,Mic,FileText,ClipboardList,Pencil,Ban,Presentation,GraduationCap,UserRound,Plus,Trash2} from 'lucide-react';
import {mergeAgenda,applyFilter,readFilter,overlaps,spreadByDay,FILTERS,PERSONAL_COLUMNS,type AgendaItem,type AgendaKind,type AgendaFilter,type PersonalEvent} from '../lib/agenda';
import {googleTemplateUrl,outlookUrl,icsFile,type ExtraItem} from '../lib/gcal/items';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {Avatar} from './Avatar';
import {Flag} from './Flag';
import {GoogleCalendarPanel,requestCalendarSync} from './GoogleCalendar';
import {PayIcon,LessonPayment} from './Payments';
import {loadStudents,type StudentRecord} from '../lib/data';
import {languageName,relationLanguage} from '../lib/languages';
import {LESSON_COLUMNS,type Lesson,type LessonState,type View,lessonState,stateLabel,browserTimeZone,dayKey,addDays,clock,fmtDay,fmtWhen,minutesOf,gridDays,shift,byDay,nextLesson,countdown,planningError,classroomHref,timeZones} from '../lib/lessons';

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
/** v45: the existing profile of the relation (teacher: student profile; student: own lessons with this teacher). */
export const profileHref=(l:Pick<Lesson,'student_id'>,mode:'teacher'|'student')=>mode==='teacher'?'/leerlingen?student='+encodeURIComponent(l.student_id):'/mijn-profiel?student='+encodeURIComponent(l.student_id);
/** v45: the existing lesson details (agenda dialog) for one lesson. */
export const lessonHref=(l:Pick<Lesson,'id'>)=>'/agenda?les='+encodeURIComponent(l.id);

/* ---------------- dashboard: next lesson + today + this week ---------------- */
export function NextLessonPanel({mode}:{mode:'teacher'|'student'}){
 const {studentLinks}=useAuth();useSyncTimeZone();const now=useNow();const tz=browserTimeZone();
 const range=useMemo(()=>({from:new Date(Date.now()-12*3600e3).toISOString(),to:new Date(Date.now()+60*86400e3).toISOString()}),[]);
 const {lessons,relations,ready,loaded,error}=useLessons(range,mode);
 const teacherName=(sid:string)=>studentLinks.find(x=>x.id===sid)?.teacher_name||'';
 const next=nextLesson(lessons,now);
 // v43: "DAARNA" = the next three lessons after the next one (any day), compact
 const after=lessons.filter(l=>l.status!=='cancelled'&&l.status!=='completed'&&Date.parse(l.ends_at)>now&&l.id!==next?.id).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,3);
 if(!ready)return <section className="panel next-lesson"><p className="muted">{t('De agenda is nog niet ingesteld: voer supabase/v30.sql uit.')}</p></section>;
 if(!loaded)return <section className="panel next-lesson"><div className="loader small"/></section>;
 const rel=next?relations.get(next.student_id):undefined;const lang=next?langOf(next,rel):'';
 return <section className="panel next-lesson" aria-label={t('Volgende les')}>
  {error&&<p className="notice">{error}</p>}
  {!next?<div className="next-empty"><CalendarDays size={28}/><div><strong>{t('Geen lessen gepland')}</strong><p className="muted">{mode==='teacher'?t('Plan een les in de agenda; je leerling ziet hem dan meteen in de eigen tijdzone.'):t('Zodra je docent een les inplant, zie je die hier.')}</p></div>{mode==='teacher'?<Link className="button" href="/agenda?nieuw=1"><CalendarPlus size={16}/> {t('Les inplannen')}</Link>:<Link className="button small" href="/agenda?boeken=1"><CalendarPlus size={15}/> {t('Les boeken')}</Link>}</div>:
  <div className="next-main">
   <div className="next-head"><p className="eyebrow-dark">{t('VOLGENDE LES')}</p><StatusChip state={lessonState(next,now)}/></div>
   <div className="next-body">
    <Link className="next-who who-link" href={profileHref(next,mode)} title={mode==='teacher'?t('Leerlingprofiel openen'):t('Mijn lessen openen')}><Who l={next} rel={rel} mode={mode} teacherName={teacherName} size={52}/></Link>
    <div className="next-info">
     <div className="next-lang">{lang&&<Flag code={lang} size={20}/>} {lang?languageName(lang):''}{rel?.level?' · '+rel.level:''}</div>
     <Link className="next-when when-link" href={lessonHref(next)} title={t('Lesdetails openen')}><Clock size={15}/> {fmtWhen(next,tz)}</Link>
     <div className="next-count">{countdown(next.starts_at,now)} · {t('{0} min',Math.round((Date.parse(next.ends_at)-Date.parse(next.starts_at))/60000))}</div>
     <PlannedTopics studentId={next.student_id} day={dayKey(next.starts_at,tz)}/>
    </div>
    <Link className="button next-open" href={classroomHref(next,mode)}><Video size={16}/> {t('Klaslokaal openen')}</Link>
   </div>
  </div>}
  {next&&after.length>0&&<div className="next-after"><h4>{t('DAARNA')}</h4><ul className="after-rows">{after.map(l=>{const r=relations.get(l.student_id);const lg=langOf(l,r);return <li key={l.id}>
   <div className="after-row">
    <Link className="ar-who who-link" href={profileHref(l,mode)} title={mode==='teacher'?t('Leerlingprofiel openen'):t('Mijn lessen openen')}><Who l={l} rel={r} mode={mode} teacherName={teacherName} size={26}/></Link>
    <Link className="ar-lesson" href={lessonHref(l)} title={t('Lesdetails openen')}>{lg&&<Flag code={lg} size={16}/>}<span className="ar-when">{fmtDay(dayKey(l.starts_at,tz),{weekday:'short',day:'numeric',month:'short'})} · {clock(l.starts_at,tz)}</span><span className="ar-count">{countdown(l.starts_at,now)}</span></Link>
    <Link className="iconbtn ar-open" href={classroomHref(l,mode)} title={t('Klaslokaal openen')} aria-label={t('Klaslokaal openen')}><Video size={15}/></Link>
   </div></li>})}</ul></div>}
  {next&&<div className="next-foot"><Link href="/agenda">{t('Naar de agenda')} →</Link></div>}
 </section>
}

/* ---------------- central agenda (v57): every lesson I give or follow + my personal appointments ---------------- */
type AgendaCtx={items:AgendaItem[];relations:Map<string,StudentRecord>;learnerIds:Set<string>;ready:boolean;personalReady:boolean;error:string;loaded:boolean;reload:()=>void};
/** One query per role, always restricted to MY involvement (teacher_id = me / my learner profiles / my appointments):
 *  an admin's wider read rights never put other people's lessons in this agenda. */
export function useAgenda(range:{from:string;to:string}|null):AgendaCtx{
 const {user,canTeach}=useAuth();const [st,setSt]=useState<Omit<AgendaCtx,'reload'>>({items:[],relations:new Map(),learnerIds:new Set(),ready:true,personalReady:true,error:'',loaded:false});const [tick,setTick]=useState(0);
 const key=range?range.from+range.to:'';
 useEffect(()=>{if(!user||!range)return;let off=false;void(async()=>{const db=supabase()!;
  const [teachRel,learnRel]=await Promise.all([canTeach?loadStudents(db,{teacherId:user.id}):Promise.resolve({data:[] as StudentRecord[]}),loadStudents(db,{userId:user.id})]);
  const mine=learnRel.data.filter(s=>s.user_id===user.id);const learnerIds=new Set(mine.map(s=>s.id));
  const rel=new Map<string,StudentRecord>([...teachRel.data,...mine].map(s=>[s.id,s]));
  const base=()=>db.from('lessons').select(LESSON_COLUMNS).gte('ends_at',range.from).lt('starts_at',range.to).order('starts_at');
  const [a,b,p]=await Promise.all([canTeach?base().eq('teacher_id',user.id):Promise.resolve({data:[],error:null}),learnerIds.size?base().in('student_id',[...learnerIds]):Promise.resolve({data:[],error:null}),
   db.from('personal_events').select(PERSONAL_COLUMNS).eq('owner_id',user.id).gte('ends_at',range.from).lt('starts_at',range.to).order('starts_at')]);
  if(off)return;const err=a.error||b.error;
  if(err){const missing=/lessons|schema cache|does not exist/i.test(err.message);setSt({items:[],relations:rel,learnerIds,ready:!missing,personalReady:!p.error,error:missing?'':err.message,loaded:true});return}
  setSt({items:mergeAgenda(user.id,[(a.data||[]) as Lesson[],(b.data||[]) as Lesson[]],learnerIds,p.error?[]:(p.data||[]) as PersonalEvent[]),relations:rel,learnerIds,ready:true,personalReady:!p.error,error:'',loaded:true})})();return()=>{off=true}},[user?.id,canTeach,key,tick]);// eslint-disable-line react-hooks/exhaustive-deps
 return {...st,reload:useCallback(()=>setTick(x=>x+1),[])};
}
const KIND_ICON={teach:Presentation,learn:GraduationCap,personal:UserRound};
export const kindLabel=(k:AgendaKind)=>k==='teach'?t('Docent'):k==='learn'?t('Leerling'):t('Persoonlijk');
/** "Docent · Nederlands met Madison" / "Leerling · Portugees met Esther" / "Persoonlijk · Tandarts" */
function itemText(i:AgendaItem,rel:StudentRecord|undefined,teacherName:(sid:string)=>string){
 if(i.kind==='personal')return i.event.title;
 const lang=langOf(i.lesson,rel);const other=i.kind==='teach'?(rel?.name||t('Leerling')):(teacherName(i.lesson.student_id)||t('Docent'));
 return (lang?languageName(lang)+' ':t('Les')+' ')+t('met {0}',other);
}
function useStoredTz(){const [tz,setTz]=useState(()=>{try{return localStorage.getItem('teachy-agenda-tz')||browserTimeZone()}catch{return browserTimeZone()}});
 return [tz,(z:string)=>{setTz(z);try{if(z===browserTimeZone())localStorage.removeItem('teachy-agenda-tz');else localStorage.setItem('teachy-agenda-tz',z)}catch{}}] as const}

export function AgendaView({openNew,openId,openBooking}:{openNew?:boolean;openId?:string|null;openBooking?:boolean}){
 const {user,canTeach,studentLinks}=useAuth();useSyncTimeZone();const now=useNow();const [tz,setTz]=useStoredTz();
 const [view,setView]=useState<View>(()=>{try{return (localStorage.getItem('teachy-agenda-view') as View)||'week'}catch{return 'week'}});
 const [filter,setFilterState]=useState<AgendaFilter>(()=>{try{return readFilter(localStorage.getItem('teachy-agenda-filter'),true)}catch{return 'all'}});
  function setFilter(f:AgendaFilter){setFilterState(f);try{localStorage.setItem('teachy-agenda-filter',f)}catch{}}
 const [anchor,setAnchor]=useState(()=>dayKey(Date.now(),tz));
 const days=gridDays(anchor,view);
 const range=useMemo(()=>({from:new Date(Date.parse(days[0]+'T00:00:00Z')-86400e3).toISOString(),to:new Date(Date.parse(days[days.length-1]+'T00:00:00Z')+2*86400e3).toISOString()}),[days[0],days[days.length-1]]);// eslint-disable-line react-hooks/exhaustive-deps
 const {items,relations,learnerIds,ready,personalReady,error,loaded,reload}=useAgenda(range);
 const isLearner=learnerIds.size>0;const multi=canTeach&&isLearner;const shown:AgendaFilter=multi?readFilter(filter,canTeach):'all';
 const [open,setOpen]=useState<AgendaItem|null>(null);const [form,setForm]=useState<{lesson?:Lesson;day?:string}|null>(openNew&&canTeach?{}:null);
 const [pform,setPform]=useState<{event?:PersonalEvent;day?:string;block?:boolean}|null>(null);
 const [showCancelled,setShowCancelled]=useState(false);
 // v45: /agenda?les=<id> opens the details of that lesson — only when I give or follow it
 useEffect(()=>{if(!openId||!/^[0-9a-f-]{36}$/i.test(openId)||!user||!loaded)return;let off=false;void supabase()?.from('lessons').select(LESSON_COLUMNS).eq('id',openId).maybeSingle().then(({data})=>{if(off||!data)return;const it=mergeAgenda(user.id,[[data as Lesson]],learnerIds)[0];if(it){setOpen(it);setAnchor(dayKey(it.starts_at,tz))}});return()=>{off=true}},[openId,user?.id,loaded]);// eslint-disable-line react-hooks/exhaustive-deps
 const teacherName=(sid:string)=>studentLinks.find(x=>x.id===sid)?.teacher_name||'';
 const visible=applyFilter(items,shown).filter(i=>showCancelled||i.kind==='personal'||i.lesson.status!=='cancelled');
 const groups=spreadByDay(visible,tz,dayKey,addDays);const today=dayKey(now,tz);
 function setV(v:View){setView(v);try{localStorage.setItem('teachy-agenda-view',v)}catch{}}
 const title=view==='month'?new Date(anchor+'T12:00:00Z').toLocaleDateString(locale(),{month:'long',year:'numeric',timeZone:'UTC'}):view==='week'?`${fmtDay(days[0],{day:'numeric',month:'short'})} – ${fmtDay(days[6],{day:'numeric',month:'short',year:'numeric'})}`:fmtDay(anchor,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const zones=useMemo(()=>timeZones(),[]);const changed=()=>{reload();requestCalendarSync()};
 // v59: simple per role — filters only for someone who both teaches and learns; teachers: "+ Toevoegen" +
 // "Beschikbaarheid instellen"; learners: "Les boeken"; everything else (time zone, cancelled, Google) under "Meer opties"
 const filters=FILTERS.filter(f=>f!=='teach'||canTeach);
 const [add,setAdd]=useState(false);const [avail,setAvail]=useState(false);const [booking,setBooking]=useState(!!openBooking);
 const learnRels=[...relations.values()].filter(r=>learnerIds.has(r.id));
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t('MIJN AGENDA')}</p><h1>{t('Agenda')}</h1></div>
   <div className="row">
    {canTeach&&<div className="add-menu"><button className="button" aria-expanded={add} onClick={()=>setAdd(a=>!a)}><Plus size={16}/> {t('Toevoegen')}</button>
     {add&&<div className="add-cal-menu" role="menu" onClick={()=>setAdd(false)}>
      <button type="button" role="menuitem" onClick={()=>setForm({})}><CalendarPlus size={15}/> {t('Les plannen')}</button>
      {personalReady&&<button type="button" role="menuitem" onClick={()=>setPform({})}><UserRound size={15}/> {t('Persoonlijke afspraak')}</button>}
      {personalReady&&<button type="button" role="menuitem" onClick={()=>setPform({block:true})}><Ban size={15}/> {t('Tijd blokkeren')}</button>}
      {isLearner&&<button type="button" role="menuitem" onClick={()=>setBooking(true)}><GraduationCap size={15}/> {t('Les boeken')}</button>}</div>}</div>}
    {canTeach?<button className="button secondary" onClick={()=>setAvail(true)}><Clock size={16}/> {t('Beschikbaarheid instellen')}</button>
     :isLearner&&<button className="button" onClick={()=>setBooking(true)}><CalendarPlus size={16}/> {t('Les boeken')}</button>}</div></div>
  {!ready&&<div className="notice">{t('De agenda is nog niet ingesteld: voer supabase/v30.sql uit.')}</div>}
  {error&&<div className="notice">{error}</div>}
  {multi&&<div className="agenda-filters chipbar" role="group" aria-label={t('Filter')}>{filters.map(f=>{const I=f==='all'?CalendarDays:KIND_ICON[f];return <button key={f} className={'af-'+f} aria-pressed={shown===f} onClick={()=>setFilter(f)}><I size={14} aria-hidden/> {f==='all'?t('Alles'):f==='teach'?t('Ik geef les'):f==='learn'?t('Ik volg les'):t('Persoonlijk')}</button>})}</div>}
  <div className="agenda-bar">
   <div className="row"><button className="iconbtn" aria-label={t('Vorige')} title={t('Vorige')} onClick={()=>setAnchor(shift(anchor,view,-1))}><ChevronLeft size={18}/></button><button className="button small secondary" onClick={()=>setAnchor(today)}>{t('Vandaag')}</button><button className="iconbtn" aria-label={t('Volgende')} title={t('Volgende')} onClick={()=>setAnchor(shift(anchor,view,1))}><ChevronRight size={18}/></button><strong className="agenda-title">{title}</strong></div>
   <div className="chipbar" role="group" aria-label={t('Weergave')}>{(['day','week','month'] as View[]).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setV(v)}>{v==='day'?t('Dag'):v==='week'?t('Week'):t('Maand')}</button>)}</div>
  </div>
  {!loaded?<div className="loader small"/>:<div className={'agenda-grid '+view}>
   {view==='month'&&[1,2,3,4,5,6,7].map(i=><div key={i} className="agenda-dow">{fmtDay(days[i-1],{weekday:'short'})}</div>)}
   {days.map(d=>{const list=groups.get(d)||[];const out=view==='month'&&d.slice(0,7)!==anchor.slice(0,7);return <div key={d} className={'agenda-day'+(d===today?' today':'')+(out?' out':'')}>
    <div className="agenda-dhead"><span>{view==='month'?Number(d.slice(8)):fmtDay(d,{weekday:'short',day:'numeric',month:'short'})}</span>{canTeach&&ready&&<button className="iconbtn tiny" title={t('Les inplannen')} aria-label={t('Les inplannen')} onClick={()=>setForm({day:d})}>+</button>}</div>
    {list.map(i=>{const blk=i.kind==='personal'&&i.event.kind==='block';const I=blk?Ban:KIND_ICON[i.kind];const lbl=blk?t('Geblokkeerd'):kindLabel(i.kind);const rel=i.kind==='personal'?undefined:relations.get(i.lesson.student_id);const st=i.kind==='personal'?(Date.parse(i.ends_at)<=now?'completed':'scheduled'):lessonState(i.lesson,now);const lang=i.kind==='personal'?'':langOf(i.lesson,rel);const text=itemText(i,rel,teacherName);
     return <button key={i.key} className={'agenda-item k-'+i.kind+(blk?' k-block':'')+(i.kind==='teach'?' pay-'+(i.lesson.payment_status==='paid'?'paid':i.lesson.payment_status==='open'||i.lesson.payment_status==='reported'?'open':'unknown'):'')+(i.kind!=='personal'&&i.lesson.status==='completed'?' is-done':'')+' '+st} onClick={()=>setOpen(i)} title={lbl+' · '+text} aria-label={lbl+' · '+text+' · '+clock(i.starts_at,tz)}>
     <span className="ai-time">{blk&&(dayKey(i.starts_at,tz)<d||clock(i.starts_at,tz)==='00:00')&&(dayKey(Date.parse(i.ends_at)-1,tz)>d||clock(i.ends_at,tz)==='00:00')?t('Hele dag'):<>{clock(i.starts_at,tz)}{view!=='month'&&'–'+clock(i.ends_at,tz)}</>}</span>
     <span className="ai-who"><I size={13} aria-hidden className="ai-kind"/>{view!=='month'&&<span className="ai-role">{lbl} ·</span>} {lang&&<Flag code={lang} size={14}/>} {text}</span>
     {i.kind!=='personal'&&i.lesson.series_id&&view!=='month'&&<Repeat size={12} aria-label={t('Wekelijks')}/>}{i.kind!=='personal'&&i.lesson.payment_status==='reported'&&<PayIcon status="reported"/>}{i.kind!=='personal'&&i.lesson.status==='completed'&&<span className="done-check" title={t('Les afgerond')} aria-label={t('Les afgerond')}><Check size={16} strokeWidth={3.4}/></span>}</button>})}
    {!list.length&&view!=='month'&&<p className="agenda-none">{t('Geen afspraken')}</p>}
   </div>})}
  </div>}
  {loaded&&ready&&!visible.length&&<div className="emptystate"><CalendarDays size={30}/><strong>{t('Geen afspraken in deze periode')}</strong>{canTeach?<button className="button small" onClick={()=>setForm({})}><CalendarPlus size={15}/> {t('Les inplannen')}</button>:<p className="muted">{t('Zodra je docent een les inplant, zie je die hier.')}</p>}</div>}
  {open&&open.kind!=='personal'&&<LessonDetail lesson={open.lesson} rel={relations.get(open.lesson.student_id)} mode={open.kind==='teach'?'teacher':'student'} teacherName={teacherName} onClose={()=>setOpen(null)} onEdit={()=>{setForm({lesson:open.lesson});setOpen(null)}} onChanged={()=>{setOpen(null);changed()}}/>}
  {open&&open.kind==='personal'&&<PersonalDetail ev={open.event} tz={tz} onClose={()=>setOpen(null)} onEdit={()=>{setPform({event:open.event});setOpen(null)}} onChanged={()=>{setOpen(null);changed()}}/>}
  {form&&canTeach&&<LessonForm initial={form.lesson} day={form.day} relations={[...relations.values()].filter(r=>!r.archived_at&&r.teacher_id===user?.id)} busy={items} onClose={()=>setForm(null)} onSaved={()=>{setForm(null);changed()}}/>}
  {pform&&(pform.block||pform.event?.kind==='block'?<BlockForm initial={pform.event} tz={tz} onClose={()=>setPform(null)} onSaved={()=>{setPform(null);changed()}}/>
   :<PersonalForm initial={pform.event} day={pform.day} tz={tz} busy={items} onClose={()=>setPform(null)} onSaved={()=>{setPform(null);changed()}}/>)}
  {avail&&<AvailabilityForm onClose={()=>setAvail(false)}/>}
  {booking&&<BookingForm relations={learnRels} teacherName={teacherName} tz={tz} onClose={()=>setBooking(false)} onBooked={()=>{setBooking(false);changed()}}/>}
  <details className="agenda-more"><summary>{t('Meer opties')}</summary>
   <label className="row small muted"><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> {t('Geannuleerde tonen')}</label>
   <label className="muted small agenda-tz">{t('Tijdzone')}: <select className="field inline" value={tz} onChange={e=>setTz(e.target.value)}>{(zones.includes(tz)?zones:[tz,...zones]).map(z=><option key={z} value={z}>{z.replace(/_/g,' ')}</option>)}</select></label>
   {ready&&<GoogleCalendarPanel onSynced={reload}/>}
  </details>
 </>
}

/* ---------------- v59: time block (holiday / private), weekly availability, booking by the learner ---------------- */
function useEsc(onClose:()=>void){useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose])}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){useEsc(onClose);
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-form" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}>
  <div className="row between"><h3>{title}</h3><button className="iconbtn" aria-label={t('Sluiten')} onClick={onClose}><X size={18}/></button></div>{children}</div></div>}

function BlockForm({initial,tz,onClose,onSaved}:{initial?:PersonalEvent;tz:string;onClose:()=>void;onSaved:()=>void}){
 const today=dayKey(Date.now(),tz);
 const [from,setFrom]=useState(initial?dayKey(initial.starts_at,tz):today);const [to,setTo]=useState(initial?dayKey(Date.parse(initial.ends_at)-1,tz):today);
 const [allDay,setAllDay]=useState(initial?clock(initial.starts_at,tz)==='00:00'&&clock(initial.ends_at,tz)==='00:00':true);
 const [t1,setT1]=useState(initial&&!allDay?clock(initial.starts_at,tz):'09:00');const [t2,setT2]=useState(initial&&!allDay?clock(initial.ends_at,tz):'17:00');
 const [title,setTitle]=useState(initial?.title||'');const [msg,setMsg]=useState('');const [saving,setSaving]=useState(false);
 async function save(){const s=localToInstant(from,allDay?'00:00':t1,tz),e=allDay?localToInstant(addDays(to<from?from:to,1),'00:00',tz):localToInstant(to<from?from:to,t2,tz);
  if(Number.isNaN(s)||Number.isNaN(e)||e<=s){setMsg(t('Kies een eindtijd na de begintijd.'));return}
  setSaving(true);const db=supabase()!;const row={title:title.trim().slice(0,200)||t('Geblokkeerd'),kind:'block',blocks_lessons:true,starts_at:new Date(s).toISOString(),ends_at:new Date(e).toISOString(),timezone:tz,updated_at:new Date().toISOString()};
  const {error}=initial?await db.from('personal_events').update(row).eq('id',initial.id):await db.from('personal_events').insert(row);setSaving(false);
  if(error){setMsg(/kind|personal_events_length/.test(error.message)?t('Voer eerst supabase/v59.sql uit.'):error.message);return}onSaved()}
 return <Modal title={t('Tijd blokkeren')} onClose={onClose}>
  <p className="muted small">{t('Voor vakantie of privétijd: in deze tijd kunnen geen lessen worden geboekt of gepland.')}</p>
  <div className="grid2"><label className="stack"><span className="label">{t('Van')}</span><input className="field" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="stack"><span className="label">{t('Tot en met')}</span><input className="field" type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label>
   {!allDay&&<><label className="stack"><span className="label">{t('Begintijd')}</span><input className="field" type="time" step={300} value={t1} onChange={e=>setT1(e.target.value)}/></label>
    <label className="stack"><span className="label">{t('Eindtijd')}</span><input className="field" type="time" step={300} value={t2} onChange={e=>setT2(e.target.value)}/></label></>}</div>
  <label className="row small"><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)}/> {t('Hele dag(en)')}</label>
  <label className="stack"><span className="label">{t('Omschrijving (optioneel)')}</span><input className="field" value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} placeholder={t('Bijvoorbeeld: vakantie')}/></label>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={saving} onClick={()=>void save()}>{saving?t('Opslaan…'):t('Opslaan')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div>
 </Modal>
}

const WEEKDAYS=[1,2,3,4,5,6,7];
type Slot={start:string;end:string};
function AvailabilityForm({onClose}:{onClose:()=>void}){
 const tz=browserTimeZone();const [week,setWeek]=useState<Record<number,Slot[]>|null>(null);const [msg,setMsg]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{void supabase()!.from('teacher_availability').select('weekday,start_time,end_time').order('start_time').then(({data,error})=>{
  if(error){setMsg(/teacher_availability/.test(error.message)?t('Voer eerst supabase/v59.sql uit.'):error.message)}
  const w:Record<number,Slot[]>={};for(const d of WEEKDAYS)w[d]=[];for(const r of (data||[]) as {weekday:number;start_time:string;end_time:string}[])w[r.weekday].push({start:r.start_time.slice(0,5),end:r.end_time.slice(0,5)});setWeek(w)})},[]);
 const dayName=(d:number)=>new Date(Date.UTC(2024,0,d)).toLocaleDateString(locale(),{weekday:'long',timeZone:'UTC'}); // 1 Jan 2024 = Monday
 function upd(d:number,f:(l:Slot[])=>Slot[]){setWeek(w=>w?{...w,[d]:f(w[d])}:w)}
 async function save(){if(!week)return;const blocks=WEEKDAYS.flatMap(d=>week[d].map(s=>({weekday:d,start:s.start,end:s.end})));
  if(blocks.some(b=>!b.start||!b.end||b.end<=b.start)){setMsg(t('Elke eindtijd moet na de begintijd liggen.'));return}
  setSaving(true);const {error}=await supabase()!.rpc('save_availability',{p_tz:tz,p_blocks:blocks});setSaving(false);
  if(error){setMsg(/save_availability/.test(error.message)?t('Voer eerst supabase/v59.sql uit.'):error.message);return}onClose()}
 return <Modal title={t('Mijn wekelijkse beschikbaarheid')} onClose={onClose}>
  <p className="muted small">{t('Leerlingen kunnen alleen binnen deze tijden een les boeken. Tijden in {0}.',tz.replace(/_/g,' '))}</p>
  {!week?<div className="loader small"/>:<div className="avail-week">{WEEKDAYS.map(d=><div key={d} className="avail-day">
   <strong>{dayName(d)}</strong>
   <div className="avail-slots">{week[d].length?week[d].map((s,i)=><span key={i} className="avail-slot">
    <input className="field" type="time" step={900} value={s.start} aria-label={t('Begintijd')} onChange={e=>upd(d,l=>l.map((x,j)=>j===i?{...x,start:e.target.value}:x))}/>–
    <input className="field" type="time" step={900} value={s.end} aria-label={t('Eindtijd')} onChange={e=>upd(d,l=>l.map((x,j)=>j===i?{...x,end:e.target.value}:x))}/>
    <button className="iconbtn tiny" aria-label={t('Verwijderen')} title={t('Verwijderen')} onClick={()=>upd(d,l=>l.filter((_,j)=>j!==i))}><X size={14}/></button></span>):<span className="muted small">{t('Niet beschikbaar')}</span>}
    <button className="iconbtn tiny" aria-label={t('Tijdsblok toevoegen')} title={t('Tijdsblok toevoegen')} onClick={()=>upd(d,l=>[...l,l.length?{start:l[l.length-1].end,end:l[l.length-1].end<'21:00'?String(Math.min(23,+l[l.length-1].end.slice(0,2)+2)).padStart(2,'0')+':00':'23:00'}:{start:'09:00',end:'17:00'}])}><Plus size={14}/></button></div>
  </div>)}</div>}
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={saving||!week} onClick={()=>void save()}>{saving?t('Opslaan…'):t('Opslaan')}</button></div>
 </Modal>
}

function BookingForm({relations,teacherName,tz,onClose,onBooked}:{relations:StudentRecord[];teacherName:(sid:string)=>string;tz:string;onClose:()=>void;onBooked:()=>void}){
 const [sid,setSid]=useState(relations[0]?.id||'');const [date,setDate]=useState(()=>dayKey(Date.now()+86400e3,tz));const [minutes,setMinutes]=useState(60);
 const [slots,setSlots]=useState<string[]|null>(null);const [pick,setPick]=useState('');const [weekly,setWeekly]=useState(false);const [weeks,setWeeks]=useState(4);
 const [msg,setMsg]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{if(!sid||!date)return;let off=false;setSlots(null);setPick('');setMsg('');void supabase()!.rpc('free_slots',{p_student:sid,p_day:date,p_minutes:minutes,p_tz:tz}).then(({data,error})=>{if(off)return;
  if(error){setMsg(/free_slots/.test(error.message)?t('Boeken is nog niet beschikbaar.'):planningError(error.message));setSlots([]);return}
  setSlots(((data||[]) as {starts_at:string}[]).map(r=>r.starts_at))});return()=>{off=true}},[sid,date,minutes,tz]);
 async function book(){if(!pick)return;setSaving(true);setMsg('');const {error}=await supabase()!.rpc('book_lesson',{p_student:sid,p_start:pick,p_minutes:minutes,p_weeks:weekly?weeks:1});setSaving(false);
  if(error){setMsg(planningError(error.message));return}onBooked()}
 if(!relations.length)return <Modal title={t('Les boeken')} onClose={onClose}><p className="muted">{t('Je bent nog niet gekoppeld aan een docent.')}</p></Modal>;
 return <Modal title={t('Les boeken')} onClose={onClose}>
  {relations.length>1&&<label className="stack"><span className="label">{t('Bij')}</span><select className="field" value={sid} onChange={e=>setSid(e.target.value)}>{relations.map(r=><option key={r.id} value={r.id}>{(teacherName(r.id)||t('Docent'))+' — '+languageName(relationLanguage(r))}</option>)}</select></label>}
  <label className="stack"><span className="label">{t('Datum')}</span><input className="field" type="date" value={date} min={dayKey(Date.now(),tz)} onChange={e=>setDate(e.target.value)}/></label>
  <div className="stack"><span className="label">{t('Tijd')}</span>
   {slots===null?<div className="loader small"/>:slots.length?<div className="slot-grid">{slots.map(s=><button key={s} type="button" className={'slot'+(pick===s?' on':'')} aria-pressed={pick===s} onClick={()=>setPick(s)}>{clock(s,tz)}</button>)}</div>
    :<p className="muted small">{t('Geen vrije tijden op deze dag. Kies een andere datum.')}</p>}</div>
  <label className="row small"><input type="checkbox" checked={weekly} onChange={e=>setWeekly(e.target.checked)}/> <Repeat size={14}/> {t('Elke week op dit moment')}</label>
  {weekly&&<label className="row small">{t('Aantal weken')} <input className="field inline" type="number" min={2} max={12} value={weeks} onChange={e=>setWeeks(Math.max(2,Math.min(12,+e.target.value||2)))}/></label>}
  <details className="agenda-more"><summary>{t('Meer opties')}</summary><label className="row small">{t('Lesduur')} <DurationPicker value={minutes} onChange={setMinutes} min={15} max={240} startMs={pick?Date.parse(pick):undefined} tz={tz}/></label></details>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={saving||!pick} onClick={()=>void book()}>{saving?t('Opslaan…'):weekly?t('{0} lessen boeken',weeks):t('Les boeken')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div>
 </Modal>
}

/* ---------------- add to my own calendar without connecting Google (v57) ---------------- */
function AddToCalendar({item}:{item:ExtraItem}){
 const origin=typeof window!=='undefined'?window.location.origin:'';
 function ics(){const blob=new Blob([icsFile(item,origin)],{type:'text/calendar;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='teachyrooms-'+item.starts_at.slice(0,10)+'.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
 return <details className="add-cal"><summary className="button small secondary"><CalendarPlus size={14}/> {t('Toevoegen aan mijn agenda')}</summary>
  <div className="add-cal-menu"><a href={googleTemplateUrl(item,origin)} target="_blank" rel="noopener noreferrer">{t('Google Agenda')}</a><a href={outlookUrl(item,origin)} target="_blank" rel="noopener noreferrer">{t('Outlook')}</a><button type="button" className="linklike" onClick={ics}>{t('Apple / andere (.ics)')}</button></div></details>
}

/* ---------------- personal appointments (v57) ---------------- */
function PersonalDetail({ev,tz,onClose,onEdit,onChanged}:{ev:PersonalEvent;tz:string;onClose:()=>void;onEdit:()=>void;onChanged:()=>void}){
 const [msg,setMsg]=useState('');
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 async function remove(){if(!confirm(t('Deze afspraak verwijderen?')))return;const {error}=await supabase()!.from('personal_events').delete().eq('id',ev.id);if(error){setMsg(error.message);return}onChanged()}
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-detail k-personal" role="dialog" aria-modal="true" aria-label={t('Afspraak')} onClick={e=>e.stopPropagation()}>
  <div className="row between"><div className="row"><span className="kind-badge k-personal"><UserRound size={14}/> {t('Persoonlijk')}</span><strong>{ev.title}</strong></div><button className="iconbtn" aria-label={t('Sluiten')} onClick={onClose}><X size={18}/></button></div>
  <p className="ld-when"><Clock size={15}/> {fmtWhen(ev,tz)} <small className="muted">({minutesOf(ev)} {t('min')})</small></p>
  {ev.notes&&<p className="muted">{ev.notes}</p>}
  <p className="muted small">{ev.blocks_lessons?t('Telt als bezet bij het plannen van lessen.'):t('Telt niet als bezet bij het plannen van lessen.')}</p>
  <AddToCalendar item={{kind:'personal',item_id:ev.id,starts_at:ev.starts_at,ends_at:ev.ends_at,timezone:ev.timezone,title:ev.title}}/>
  {msg&&<p className="notice">{msg}</p>}
  <div className="row ld-actions"><button className="button small secondary" onClick={onEdit}><Pencil size={14}/> {t('Wijzigen')}</button><button className="button small secondary danger-text" onClick={()=>void remove()}><Trash2 size={14}/> {t('Verwijderen')}</button></div>
 </div></div>
}
function PersonalForm({initial,day,tz,busy,onClose,onSaved}:{initial?:PersonalEvent;day?:string;tz:string;busy:AgendaItem[];onClose:()=>void;onSaved:()=>void}){
 const [title,setTitle]=useState(initial?.title||'');const [date,setDate]=useState(initial?dayKey(initial.starts_at,tz):(day||dayKey(Date.now(),tz)));
 const [time,setTime]=useState(initial?clock(initial.starts_at,tz):'12:00');const [minutes,setMinutes]=useState(initial?minutesOf(initial):60);
 const [notes,setNotes]=useState(initial?.notes||'');const [blocks,setBlocks]=useState(initial?.blocks_lessons??true);const [msg,setMsg]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 const start=useMemo(()=>localToInstant(date,time,tz),[date,time,tz]);
 const clash=Number.isNaN(start)?[]:overlaps(busy.filter(b=>b.kind!=='personal'||b.event.id!==initial?.id),start,start+minutes*60e3);
 async function save(){if(!title.trim()||Number.isNaN(start))return;setSaving(true);setMsg('');const db=supabase()!;
  const row={title:title.trim().slice(0,200),notes:notes.trim()||null,starts_at:new Date(start).toISOString(),ends_at:new Date(start+minutes*60e3).toISOString(),timezone:tz,blocks_lessons:blocks,updated_at:new Date().toISOString()};
  const {error}=initial?await db.from('personal_events').update(row).eq('id',initial.id):await db.from('personal_events').insert(row);
  setSaving(false);if(error){setMsg(/personal_events/.test(error.message)?t('Voer eerst supabase/v57.sql uit.'):error.message);return}onSaved()}
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-form" role="dialog" aria-modal="true" aria-label={initial?t('Afspraak wijzigen'):t('Nieuwe afspraak')} onClick={e=>e.stopPropagation()}>
  <div className="row between"><h3>{initial?t('Afspraak wijzigen'):t('Nieuwe afspraak')}</h3><button className="iconbtn" aria-label={t('Sluiten')} onClick={onClose}><X size={18}/></button></div>
  <label className="stack"><span className="label">{t('Titel')}</span><input className="field" value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} placeholder={t('Bijvoorbeeld: tandarts')} autoFocus/></label>
  <div className="grid2">
   <label className="stack"><span className="label">{t('Datum')}</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="stack"><span className="label">{t('Begintijd')}</span><input className="field" type="time" value={time} step={300} onChange={e=>setTime(e.target.value)}/></label>
   <label className="stack"><span className="label">{t('Duur')}</span><select className="field" value={minutes} onChange={e=>setMinutes(+e.target.value)}>{[...new Set([15,30,45,60,90,120,180,240,480,minutes])].sort((a,b)=>a-b).map(m=><option key={m} value={m}>{m} {t('min')}</option>)}</select></label>
  </div>
  <label className="stack"><span className="label">{t('Notitie (alleen voor jou)')}</span><textarea className="field" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  <label className="row small"><input type="checkbox" checked={blocks} onChange={e=>setBlocks(e.target.checked)}/> {t('Telt als bezet: tijdens deze afspraak kunnen geen lessen met mij worden gepland')}</label>
  {clash.length>0&&<p className="notice small">{t('Let op: dit overlapt met {0} andere afspraak/afspraken.',clash.length)}</p>}
  <p className="muted small">{t('Tijden in {0}',tz.replace(/_/g,' '))}</p>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={saving||!title.trim()} onClick={()=>void save()}>{saving?t('Opslaan…'):t('Opslaan')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div>
 </div></div>
}
/** Wall time in a zone → instant (DST-safe: corrects with the zone's offset at that moment). */
function localToInstant(date:string,time:string,tz:string){try{const guess=Date.parse(`${date}T${time}:00Z`);if(Number.isNaN(guess))return NaN;const off=(x:number)=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(x));const g=(k:string)=>Number(p.find(q=>q.type===k)?.value);return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'))-x};const first=guess-off(guess);return guess-off(first)}catch{return NaN}}

/* ---------------- details of one lesson ---------------- */
type Links={recordings:number;analysis:{id:string;status:string}|null;homework:number;notes:boolean;joint?:number;recMin?:number};
function LessonDetail({lesson:l,rel,mode,teacherName,onClose,onEdit,onChanged}:{lesson:Lesson;rel?:StudentRecord;mode:'teacher'|'student';teacherName:(id:string)=>string;onClose:()=>void;onEdit:()=>void;onChanged:()=>void}){
 const now=useNow();const tz=browserTimeZone();const people=usePeopleTz();const st=lessonState(l,now);const lang=langOf(l,rel);
 const [notes,setNotes]=useState('');const [savedNotes,setSavedNotes]=useState('');const [msg,setMsg]=useState('');const [links,setLinks]=useState<Links|null>(null);
 const otherTz=mode==='teacher'?(rel?.user_id?people.get(rel.user_id):undefined):people.get(l.teacher_id);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 useEffect(()=>{const db=supabase();if(mode!=='teacher'||!db)return;void db.from('lesson_teacher_notes').select('notes').eq('lesson_id',l.id).maybeSingle().then(({data})=>{const n=(data as {notes?:string}|null)?.notes||'';setNotes(n);setSavedNotes(n)})},[l.id,mode]);
 useEffect(()=>{const db=supabase();if(st==='scheduled'||st==='cancelled'||!db)return;void(async()=>{
  const day=dayKey(l.starts_at,l.timezone);
  const [r,a,h,e,js]=await Promise.all([db.from('lesson_recordings').select('duration_seconds',{count:'exact'}).eq('lesson_id',l.id),mode==='teacher'?db.from('lesson_analyses').select('id,status').eq('lesson_id',l.id).maybeSingle():Promise.resolve({data:null}),db.from('assignments').select('id',{count:'exact',head:true}).eq('lesson_id',l.id),db.from('lesson_entries').select('id').eq('student_id',l.student_id).eq('lesson_date',day).maybeSingle(),db.from('lesson_sessions').select('joint_seconds').eq('lesson_id',l.id)]);
  // v66: planned time, real joint presence and recording length are kept apart
  const joint=((js.data||[]) as {joint_seconds:number}[]).reduce((n,x)=>n+(x.joint_seconds||0),0),recSec=((r.data||[]) as {duration_seconds:number|null}[]).reduce((n,x)=>n+(x.duration_seconds||0),0);
  setLinks({joint:Math.round(joint/60),recMin:Math.round(recSec/60),recordings:r.count||0,analysis:(a.data as Links['analysis'])||null,homework:h.count||0,notes:!!e.data})})()},[l.id,st,mode]);// eslint-disable-line react-hooks/exhaustive-deps
 async function saveNotes(){const {error}=await supabase()!.from('lesson_teacher_notes').upsert({lesson_id:l.id,notes,updated_at:new Date().toISOString()},{onConflict:'lesson_id'});setMsg(error?error.message:t('Opgeslagen ✓'));if(!error)setSavedNotes(notes)}
 async function cancel(all:boolean){if(!confirm(all?t('Deze en alle volgende lessen van deze reeks annuleren?'):t('Deze les annuleren? Je leerling ziet de les als geannuleerd.')))return;
  let q=supabase()!.from('lessons').update({status:'cancelled'});q=all&&l.series_id?q.eq('series_id',l.series_id).gte('starts_at',l.starts_at):q.eq('id',l.id);const {error}=await q;if(error){setMsg(planningError(error.message));return}onChanged()}
 async function restore(){const {error}=await supabase()!.from('lessons').update({status:'scheduled',cancelled_at:null}).eq('id',l.id);if(error){setMsg(planningError(error.message));return}onChanged()}
 const base='/'+(mode==='teacher'?'leerlingen?student=':'mijn-profiel?student=')+l.student_id+'&tab=';
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-detail" role="dialog" aria-modal="true" aria-label={t('Les')} onClick={e=>e.stopPropagation()}>
  <div className="row between"><div className="row"><Who l={l} rel={rel} mode={mode} teacherName={teacherName} size={44}/></div><button className="iconbtn" aria-label={t('Sluiten')} onClick={onClose}><X size={18}/></button></div>
  <div className="ld-meta"><span className={'kind-badge k-'+(mode==='teacher'?'teach':'learn')}>{mode==='teacher'?<Presentation size={14}/>:<GraduationCap size={14}/>} {mode==='teacher'?t('Jij geeft deze les'):t('Jij volgt deze les')}</span><StatusChip state={st}/>{lang&&<span><Flag code={lang} size={16}/> {languageName(lang)}{rel?.level?' · '+rel.level:''}</span>}{(rel?.subject||rel?.curriculum_subject)&&<span>{rel?.subject||languageName(rel?.curriculum_subject||'')}</span>}{l.series_id&&<span><Repeat size={14}/> {t('Wekelijks')}</span>}</div>
  <p className="ld-when"><Clock size={15}/> {fmtWhen(l,tz)} <small className="muted">({minutesOf(l)} {t('min')})</small></p>
  {otherTz&&otherTz!==tz&&<p className="muted small">{mode==='teacher'?t('Voor de leerling: {0} ({1})',clock(l.starts_at,otherTz)+'–'+clock(l.ends_at,otherTz),otherTz.replace(/_/g,' ')):t('Voor je docent: {0} ({1})',clock(l.starts_at,otherTz)+'–'+clock(l.ends_at,otherTz),otherTz.replace(/_/g,' '))}</p>}
  {st==='scheduled'&&<p className="next-count">{countdown(l.starts_at,now)}</p>}
  {st!=='cancelled'&&<div className="row"><Link className="button" href={classroomHref(l,mode)}><Video size={16}/> {t('Naar het klaslokaal')}</Link>
   {st==='scheduled'&&<AddToCalendar item={{kind:mode==='teacher'?'teach':'learn',item_id:l.id,student_id:l.student_id,starts_at:l.starts_at,ends_at:l.ends_at,timezone:l.timezone,language:lang||null,teacher_name:teacherName(l.student_id)||null,student_name:rel?.name||null}}/>}</div>}
  <LessonPayment lesson={l} mode={mode} onChanged={onChanged}/>
  {links&&(links.joint||links.recMin)?<p className="muted small ld-times">{t('Gepland {0} min',minutesOf(l))}{links.joint?' · '+t('samen aanwezig {0} min',links.joint):''}{links.recMin?' · '+t('opname {0} min',links.recMin):''}</p>:null}
  {links&&<div className="ld-links"><h4>{t('Bij deze les')}</h4><ul>
   {mode==='teacher'&&<li><Sparkles size={15}/> {links.analysis?<Link href={base+'analyses'}>{t('Lesanalyse bekijken')} · {links.analysis.status==='approved'?t('Goedgekeurd'):links.analysis.status==='ready'?t('Klaar voor controle'):links.analysis.status==='failed'?t('Verwerking mislukt'):t('In verwerking')}</Link>:<span className="muted">{t('Nog geen lesanalyse')}</span>}</li>}
   <li><Mic size={15}/> {links.recordings?<Link href={base+'opnames'}>{t('{0} opname(s)',links.recordings)}</Link>:<span className="muted">{t('Geen opname')}</span>}</li>
   <li><FileText size={15}/> {links.notes?<Link href={base+'lessen'}>{t('Lesnotities en canvas')}</Link>:<span className="muted">{t('Geen lesnotities')}</span>}</li>
   <li><ClipboardList size={15}/> {links.homework?<Link href={base+'huiswerk'}>{t('{0} huiswerkopdracht(en)',links.homework)}</Link>:<Link href={base+'huiswerk'}>{t('Huiswerk')}</Link>}</li>
  </ul></div>}
  {/* v68: optional lesson topics from the personal learning line (with recommendations) */}
  {mode==='teacher'&&st!=='cancelled'&&<LessonTopics studentId={l.student_id} lessonId={l.id} lessonDate={dayKey(l.starts_at,l.timezone)} collapsed/>}
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
/* v66: lesson length — 30 / 60 / 90 minutes or "Zelf bepalen" (any number of minutes); the end time is shown */
const DURATIONS=[30,60,90];
export function DurationPicker({value,onChange,min=10,max=480,startMs,tz}:{value:number;onChange:(m:number)=>void;min?:number;max?:number;startMs?:number;tz?:string}){
 const [custom,setCustom]=useState(!DURATIONS.includes(value));
 const end=startMs!=null&&!Number.isNaN(startMs)&&tz?clock(startMs+value*60e3,tz):'';
 return <span className="dur-pick"><select className="field" value={custom?'custom':String(value)} aria-label={t('Lesduur')} onChange={e=>{if(e.target.value==='custom'){setCustom(true)}else{setCustom(false);onChange(+e.target.value)}}}>
  {DURATIONS.map(m=><option key={m} value={m}>{m} {t('minuten')}</option>)}<option value="custom">{t('Zelf bepalen')}</option></select>
  {custom&&<input className="field dur-min" type="number" min={min} max={max} step={5} value={value} aria-label={t('Aantal minuten')} onChange={e=>onChange(Math.max(min,Math.min(max,Math.round(+e.target.value||min))))}/>}
  {end&&<small className="muted dur-end">{t('tot {0}',end)}</small>}</span>
}
function LessonForm({initial,day,relations,busy=[],onClose,onSaved}:{initial?:Lesson;day?:string;relations:StudentRecord[];busy?:AgendaItem[];onClose:()=>void;onSaved:()=>void}){
 const people=usePeopleTz();const myTz=browserTimeZone();
 const [student,setStudent]=useState(initial?.student_id||relations[0]?.id||'');
 const rel=relations.find(r=>r.id===student);
 const [tz,setTz]=useState(initial?.timezone||myTz);
 const [date,setDate]=useState(initial?dayKey(initial.starts_at,initial.timezone):(day||dayKey(Date.now()+86400e3,myTz)));
 const [time,setTime]=useState(initial?clock(initial.starts_at,initial.timezone):'10:00');
 const [minutes,setMinutes]=useState(initial?minutesOf(initial):60);
 const [language,setLanguage]=useState(initial?.language||'');
 const [weekly,setWeekly]=useState(false);const [weeks,setWeeks]=useState(8);
 const [notes,setNotes]=useState('');const [saving,setBusy]=useState(false);const [msg,setMsg]=useState('');
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
   <label className="stack"><span className="label">{t('Lesduur')}</span><DurationPicker value={minutes} onChange={setMinutes} startMs={startPreview} tz={tz}/></label>
   <label className="stack"><span className="label">{t('Taal van de les')}</span><select className="field" value={language} onChange={e=>setLanguage(e.target.value)}><option value="">{rel?languageName(relationLanguage(rel)):'—'}</option>{['nl','pt','en','es','fr','de','it'].filter(c=>!rel||c!==relationLanguage(rel)).map(c=><option key={c} value={c}>{languageName(c)}</option>)}</select></label>
  </div>
  <label className="stack"><span className="label">{t('Tijdzone van de begintijd')}</span><select className="field" value={tz} onChange={e=>setTz(e.target.value)}>{(zones.includes(tz)?zones:[tz,...zones]).map(z=><option key={z} value={z}>{z.replace(/_/g,' ')}</option>)}</select></label>
  {studentTz&&studentTz!==tz&&!Number.isNaN(startPreview)&&<p className="muted small">{t('Voor de leerling: {0} ({1})',`${fmtDay(dayKey(startPreview,studentTz),{weekday:'short',day:'numeric',month:'short'})} ${clock(startPreview,studentTz)}`,studentTz.replace(/_/g,' '))}</p>}
  {!initial&&<><label className="row"><input type="checkbox" checked={weekly} onChange={e=>setWeekly(e.target.checked)}/> <Repeat size={15}/> {t('Elke week herhalen')}</label>
   {weekly&&<label className="stack"><span className="label">{t('Aantal weken (inclusief deze)')}</span><input className="field" type="number" min={2} max={52} value={weeks} onChange={e=>setWeeks(Math.max(2,Math.min(52,+e.target.value||2)))}/><small className="muted">{t('Lessen blijven op dezelfde lokale tijd, ook bij zomer- en wintertijd.')}</small></label>}
   <label className="stack"><span className="label">{t('Lesnotities (optioneel, alleen voor jou)')}</span><textarea className="field" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label></>}
  {!weekly&&(()=>{const c=Number.isNaN(startPreview)?[]:overlaps(busy,startPreview,startPreview+minutes*60e3,initial?.id);return c.length>0&&<p className="notice small" role="alert">{t('Je bent dan al bezet: {0}.',c.map(i=>kindLabel(i.kind)+' '+clock(i.starts_at,myTz)).join(', '))}</p>})()}
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={saving||!student} onClick={()=>void save()}>{saving?t('Opslaan…'):initial?t('Wijziging opslaan'):weekly?t('{0} lessen inplannen',weeks):t('Les inplannen')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div></>}
 </div></div>
}

/** v73: grammar topics planned for that lesson day (lesson_goals, same data as the teacher's topic picker); nothing when none. */
function PlannedTopics({studentId,day}:{studentId:string;day:string}){
 const [list,setList]=useState<string[]>([]);
 useEffect(()=>{let off=false;void supabase()!.from('lesson_goals').select('custom_title,curriculum_goals(title)').eq('student_id',studentId).eq('lesson_date',day).limit(8)
  .then(r=>{if(!off&&!r.error)setList(((r.data||[]) as unknown as {custom_title:string|null;curriculum_goals:{title:string}|null}[]).map(g=>g.custom_title||g.curriculum_goals?.title||'').filter(Boolean))});return()=>{off=true}},[studentId,day]);
 return list.length?<div className="next-topics"><Sparkles size={13} aria-hidden/> {list.join(' · ')}</div>:null;
}