'use client';
// v73: two compact daily start pages. Teacher: today / next lesson, open tasks, reports and requests, students; the overall
// statistics are folded away and only load when opened. Student: welcome + active language, next lesson, daily practice
// (only while open), my tasks, a one-line progress summary; details live in Oefenen and Voortgang.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Nav from '../components/Nav';
import {useAuth,PendingLinks} from '../components/Auth';
import {BarChart,CHART,ChartCard,HBars,LineChart,ProgressRing,StatTile} from '../components/Charts';
import {supabase} from '../lib/supabase';
import {loadStudents,type StudentRecord} from '../lib/data';
import {activeStudents,groupCount,homeworkProgress,isEmptySeries,lessonsPerMonth,wordsPerMonth} from '../lib/stats';
import {purgeExpired} from '../lib/learning';
import {StatusChip} from '../components/Analysis';
import {NextLessonPanel} from '../components/Agenda';
import {StudentPayments} from '../components/Payments';
import {TeacherFigures,StudentHighlights} from '../components/TeacherOverview';
import {Avatar} from '../components/Avatar';
import {Flag} from '../components/Flag';
import {useDashboard} from '../components/DashData';
import {useMyLanguageCards} from '../components/Languages';
import {useLearnerPrefs} from '../components/LearnerPrefs';
import {TasksMini,TopicRequestsMini} from '../components/Overview';
import {StudentDash} from '../components/StudentDash';
import {subjectOf as langOf} from '../lib/learning';
import {languageName,pickRelation} from '../lib/languages';
import {type AnalysisStatus} from '../lib/analysisTypes';
import {UsersRound,BookOpenCheck,ClipboardList,Video,Plus,ChevronRight,BookOpen,Activity,Sparkles,Unlink,BarChart3} from 'lucide-react';
import {t, locale} from '../lib/i18n';

/** The former dashboard charts (all students together) — mounted, and therefore loaded, only when opened. */
function TeacherStats(){
 const {user}=useAuth();const d=useDashboard(user?{teacherId:user.id}:null);
 const nameOf=useMemo(()=>{const m=new Map(d.students.map(s=>[s.id,s]));return {subject:(id:string)=>m.get(id)?.subject||'',name:(id:string)=>m.get(id)?.name||''}},[d.students]);
 const perMonth=lessonsPerMonth(d.lessons,6),words=wordsPerMonth(d.lessons,6),hw=homeworkProgress(d.assignments,d.submissions);
 const bySubject=groupCount(d.lessons,nameOf.subject,5),byStudent=groupCount(d.lessons,nameOf.name,5);
 const goalsPerStudent=d.students.filter(s=>!s.archived_at).map(s=>({key:s.id,label:s.name,value:d.progress.filter(p=>p.student_id===s.id&&(p.status==='covered'||p.status==='mastered')).length})).filter(p=>p.value>0).sort((a,b)=>b.value-a.value).slice(0,6);
 const practiceScore=d.students.map(s=>{const ps=d.practice.filter(p=>p.student_id===s.id&&p.total>0);const sc=ps.reduce((n,p)=>n+p.score,0),tot=ps.reduce((n,p)=>n+p.total,0);return {key:s.id,label:s.name,value:tot?Math.round(sc/tot*100):-1}}).filter(p=>p.value>=0).slice(0,6);
 if(!d.loaded)return <div className="loader small"/>;
 return <>{d.error&&<div className="notice">{d.error}</div>}
  <div className="statgrid compact">
   <StatTile icon={UsersRound} value={d.students.length} label={t("Leerlingen")} hint={t("{0} met gekoppeld account", d.students.filter(s=>s.user_id).length)}/>
   <StatTile icon={BookOpenCheck} tone="mint" value={d.lessons.length} label={t("Gegeven lessen")} hint={t("{0} deze maand", perMonth[perMonth.length-1].value)}/>
   <StatTile icon={Activity} tone="sky" value={activeStudents(d.lessons,30)} label={t("Actieve leerlingen")} hint={t("les in de laatste 30 dagen")}/>
   <StatTile icon={ClipboardList} tone="coral" value={hw.open} label={t("Huiswerk open")} hint={t("{0} gepubliceerd", hw.published)}/>
  </div>
  <div className="chart-grid">
   <ChartCard className="span2" title={t("Lesactiviteit")} subtitle={t("Gegeven lessen per maand, afgelopen 6 maanden")} empty={isEmptySeries(perMonth)} emptyText={t("Nog geen lessen. Een les telt automatisch zodra jij en je leerling minstens 2 minuten samen in het klaslokaal zijn.")} table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>
   <ChartCard title={t("Huiswerkvoortgang")} subtitle={t("Ingeleverd van gepubliceerd")} empty={hw.pct===null} emptyText={t("Nog geen gepubliceerd huiswerk.")}>{hw.pct!==null&&<ProgressRing pct={hw.pct} label={t("ingeleverd")} detail={t("{0} van {1} opdrachten ingeleverd", hw.submitted, hw.published)}/>}</ChartCard>
   <ChartCard className="span2" title={t("Nieuwe woorden")} subtitle={t("Woorden toegevoegd per maand, alle leerlingen")} empty={isEmptySeries(words)} emptyText={t("Nog geen woorden vastgelegd.")} table={words}><LineChart data={words} color={CHART.violet}/></ChartCard>
   <ChartCard title={t("Lessen per vak")} subtitle={t("Totaal")} empty={!bySubject.length} emptyText={t("Nog geen lessen.")} table={bySubject}><HBars data={bySubject} color={CHART.teal}/></ChartCard>
   <ChartCard title={t("Leerdoelen per leerling")} subtitle={t("Behandeld of beheerst · docentbeoordeling")} empty={!goalsPerStudent.length} emptyText={t("Nog geen leerdoelen bijgehouden. Zet ze in het leerlingprofiel, tab Leerdoelen.")} table={goalsPerStudent}><HBars data={goalsPerStudent} color={CHART.ochre}/></ChartCard>
   <ChartCard title={t("Oefenresultaten")} subtitle={t("Gemiddelde score in % · gemeten")} empty={!practiceScore.length} emptyText={t("Nog geen oefenresultaten van leerlingen.")} table={practiceScore}><HBars data={practiceScore} color={CHART.violet} unit="%"/></ChartCard>
   <ChartCard title={t("Meest actieve leerlingen")} subtitle={t("Aantal lessen")} empty={!byStudent.length} emptyText={t("Nog geen lessen.")} table={byStudent}><HBars data={byStudent} color={CHART.coral}/></ChartCard>
  </div></>
}

function TeacherHome(){
 const {user,role}=useAuth();const [students,setStudents]=useState<StudentRecord[]|null>(null);const [review,setReview]=useState<{id:string;student_id:string;lesson_date:string;status:string;is_test?:boolean}[]>([]);const [stats,setStats]=useState(false);
 useEffect(()=>{if(!user)return;let off=false;const db=supabase()!;void loadStudents(db,{teacherId:user.id}).then(async r=>{if(off)return;setStudents(r.data);const ids=r.data.map(s=>s.id);
  if(ids.length){const a=await db.from('lesson_analyses').select('id,student_id,lesson_date,status,is_test').in('student_id',ids).in('status',['ready','processing']).order('created_at',{ascending:false}).limit(10);if(!off)setReview((a.data||[]) as typeof review)}})
  return()=>{off=true}},[user?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{try{if(sessionStorage.getItem('teachy-purged'))return;sessionStorage.setItem('teachy-purged','1')}catch{}void purgeExpired(supabase()!).catch(()=>{})},[]);
 const names=useMemo(()=>new Map((students||[]).map(s=>[s.id,s.name])),[students]);const active=(students||[]).filter(s=>!s.archived_at);
 return <div className="home compact-home">
  <div className="page-head"><div><p className="eyebrow-dark">{t("DOCENTDASHBOARD")}</p><h1>{t("Welkom terug 👋")}</h1></div>
   <div className="row"><Link className="button" href="/klaslokaal/live"><Video size={16}/> {t("Les starten")}</Link><Link className="button secondary" href="/leerlingen?nieuw=1"><Plus size={16}/> {t("Leerling toevoegen")}</Link></div></div>
  <PendingLinks/>
  {role==='admin'&&<div className="hint">{t("Je bent beheerder. Docentaanvragen beoordeel je via")} <Link href="/beheer">{t("Docenten beheren")}</Link>.</div>}
  {students&&<TeacherFigures ids={active.map(s=>s.id)}/>}
  <NextLessonPanel mode="teacher"/>
  <div className="home-grid">
   <TasksMini role="teacher" max={5} title={t('Openstaande taken')}/>
   <div className="stack-col">
    <TopicRequestsMini names={names}/>
    {review.length>0&&<section className="card mini-tasks"><div className="mini-head"><h3><Sparkles size={16}/> {t("AI-lesverslagen")}</h3></div><ul className="mini-list">{review.map(a=><li key={a.id}>
     <Link className="mini-main" href={'/leerlingen?student='+a.student_id+'&tab=analyses'}><b>{names.get(a.student_id)}</b><small className="muted">{t("Les van")} {new Date(a.lesson_date+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'long'})}</small></Link>{a.is_test&&<span className="test-badge">{'TEST'}</span>}<StatusChip status={a.status as AnalysisStatus}/></li>)}</ul></section>}
    <StudentHighlights names={names}/>
   </div>
  </div>
  <section className="panel"><div className="panelheader"><div><h2>{t("Leerlingen")}</h2></div><Link className="textlink" href="/leerlingen">{t("Alles beheren")} <ChevronRight size={15}/></Link></div>
   {students&&!students.length?<div className="emptystate"><UsersRound size={30}/><strong>{t("Nog geen leerlingen")}</strong><p>{t("Voeg je eerste leerling toe met het e-mailadres van de leerling.")}</p><Link className="button" href="/leerlingen?nieuw=1"><Plus size={16}/> {t("Leerling toevoegen")}</Link></div>:
   <div className="studentrows">{active.slice(0,8).map(s=><div className="studentrow" key={s.id}><div className="avatar">{s.name[0]?.toUpperCase()}</div><Link href={'/leerlingen?student='+s.id} className="studentrow-main"><strong>{s.name}</strong><small>{[s.subject,s.level].filter(Boolean).join(' · ')||t("Geen vak")}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> {t("Les starten")}</Link></div>)}
    {active.length>8&&<Link className="textlink" href="/leerlingen">{t("Alle {0} leerlingen",active.length)} →</Link>}</div>}
  </section>
  <details className="fold-stats" onToggle={e=>setStats((e.currentTarget as HTMLDetailsElement).open)}><summary><BarChart3 size={16}/> {t("Statistieken van al je lessen")}</summary>{stats&&<TeacherStats/>}</details>
 </div>
}

function StudentHome(){
 const {user,studentLinks,role,refresh}=useAuth();const mine=useMyLanguageCards();const prefs=useLearnerPrefs();
 const cards=mine.cards;const code=(cards.some(c=>c.code===prefs.active)?prefs.active:cards[0]?.code)||'';const card=cards.find(c=>c.code===code);
 const rel=pickRelation(card,null);
 const meta=(user?.user_metadata||{}) as {full_name?:string;name?:string};const first=(meta.full_name||meta.name||'').split(' ')[0];
 const [unlinkMsg,setUnlinkMsg]=useState('');
 async function leave(id:string,name:string){if(!confirm(t("Weet je zeker dat je deze docent wilt ontkoppelen?")+'\n\n'+name+'\n'+t("Er wordt niets verwijderd. Je ziet de lessen van deze docent niet meer en kunt niet meer in dit klaslokaal. Je docent kan je later opnieuw uitnodigen.")))return;
  const {error}=await supabase()!.rpc('student_leave_teacher',{target:id});setUnlinkMsg(error?error.message:t("Koppeling beëindigd."));if(!error)await refresh()}
 return <div className="home compact-home student-home">
  <PendingLinks/>
  {/* v75: one compact daily start page; Voortgang keeps the extended statistics, the full learning line and all achievements */}
  {rel?<StudentDash key={rel.id} studentId={rel.id} lang={langOf(rel)} level={rel.level||null} first={first}/>
   :<div className="page-head"><div><h1>{first?t("Hoi {0} 👋",first):t("Welkom terug 👋")}</h1>{code&&<p className="muted"><Flag code={code} size={16}/> {languageName(code)}</p>}</div></div>}
  <TasksMini role="student" max={4}/>
  <StudentPayments/>
  {studentLinks.length===0&&mine.loaded&&<div className="emptystate"><BookOpen size={30}/><strong>{t("Nog geen leerlingprofiel gekoppeld")}</strong><p>{t("Vraag je docent om je toe te voegen met het e-mailadres van dit account. De uitnodiging verschijnt dan hierboven.")}</p></div>}
  {studentLinks.length>0&&<details className="fold-stats"><summary><UsersRound size={16}/> {t("Mijn docenten")} <span className="chip-count">{studentLinks.length}</span></summary>{unlinkMsg&&<p className="muted" role="status">{unlinkMsg}</p>}
   <div className="studentrows">{studentLinks.map(s=>{const rec=cards.flatMap(c=>c.relations).find(x=>x.id===s.id);const lang=rec?langOf(rec):'';return <div className="studentrow" key={s.id}><Avatar userId={rec?.teacher_id} name={s.teacher_name||'D'} size={36}/><Link className="studentrow-main" href={'/mijn-profiel?'+(lang?'taal='+lang+'&':'')+'student='+s.id}><strong>{s.teacher_name||t("Docent")}</strong><small>{lang&&<Flag code={lang} size={16}/>} {lang?languageName(lang):(s.subject||t("Les"))}{rec?.level?' · '+rec.level:''}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> {t("Naar de les")}</Link>
    <button className="iconbtn" title={t("Ontkoppelen")} aria-label={t("Ontkoppelen")} onClick={()=>void leave(s.id,s.teacher_name||t("Docent"))}><Unlink size={16}/></button></div>})}</div>
   {(role==='student'||role==='rejected_teacher'||role==='pending_teacher')&&<div className="soft-note"><b>{t("Zelf lesgeven?")}</b> <span className="muted">{role==='pending_teacher'?t("Je aanvraag voor een docentprofiel wacht op goedkeuring door de beheerder."):role==='rejected_teacher'?t("Je vorige aanvraag is niet goedgekeurd. Je kunt opnieuw een aanvraag indienen."):t("Vraag een docentprofiel aan. Na goedkeuring gebruik je hetzelfde account als docent én als leerling.")}</span>
    {role!=='pending_teacher'&&<button className="button small secondary" onClick={async()=>{const {error}=await supabase()!.rpc('request_teacher_access');if(error)alert(error.message);else await refresh()}}>{t("Docentprofiel aanvragen")}</button>}</div>}
  </details>}
 </div>
}

export default function Home(){const {mode}=useAuth();return <Nav>{mode==='teacher'?<TeacherHome/>:<StudentHome/>}</Nav>}
