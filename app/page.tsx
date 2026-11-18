'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Nav from '../components/Nav';
import {useAuth,PendingLinks} from '../components/Auth';
import {BarChart,CHART,ChartCard,HBars,LineChart,ProgressRing,StatTile} from '../components/Charts';
import {supabase} from '../lib/supabase';
import {loadStudents,isMissingMigration,MIGRATION_HINT,type StudentRecord} from '../lib/data';
import {activeStudents,cumulativeWords,groupCount,homeworkProgress,isEmptySeries,lessonsPerMonth,wordsPerMonth,type LessonLike} from '../lib/stats';
import {sessionsPerWeek} from '../lib/answers';
import {purgeExpired} from '../lib/learning';
import {StatusChip} from '../components/Analysis';
import {MyLanguages} from '../components/Languages';
import {NextLessonPanel} from '../components/Agenda';
import {ReadyForYou} from '../components/ReadyForYou';
import {readyFor} from '../lib/ready';
import {Avatar} from '../components/Avatar';
import {Flag} from '../components/Flag';
import {subjectOf as langOf} from '../lib/learning';
import {languageName} from '../lib/languages';
import {CATEGORY_LABEL,type AnalysisDoc,type AnalysisStatus,type CorrectionCategory} from '../lib/analysisTypes';
import {UsersRound,BookOpenCheck,Languages,ClipboardList,Video,Plus,ChevronRight,BookOpen,Presentation,Activity,Mic,CalendarCheck,Sparkles} from 'lucide-react';
import {t, locale} from '../lib/i18n';

type V28={vocab:{student_id:string;status:string;due_at?:string|null;translation?:string|null}[];progress:{student_id:string;status:string;goal_id:string;curriculum_goals:{level:string}|null}[];practice:{student_id:string;kind:string;score:number;total:number;created_at:string}[];analyses:{id:string;student_id:string;lesson_date:string;status:string}[];summaries:{id:string;student_id:string;lesson_date:string;final:AnalysisDoc}[]};
type Dash={students:StudentRecord[];lessons:LessonLike[];assignments:{id:string;student_id:string;title:string;published_at:string|null}[];submissions:{assignment_id:string}[];error:string;loaded:boolean}&V28;
const EMPTY:Dash={students:[],lessons:[],assignments:[],submissions:[],error:'',loaded:false,vocab:[],progress:[],practice:[],analyses:[],summaries:[]};

/** Loads the real stored data for the dashboard (RLS limits it to what this user may see). */
function useDashboard(filter:{teacherId?:string;userId?:string}|null){
 const [d,setD]=useState<Dash>(EMPTY);
 const key=filter?JSON.stringify(filter):'';
 useEffect(()=>{if(!filter)return;let cancelled=false;void(async()=>{
  const db=supabase()!;const r=await loadStudents(db,filter);let error=r.error||(!r.v27?t(MIGRATION_HINT):'');const ids=r.data.map(s=>s.id);
  if(!ids.length){if(!cancelled)setD({...EMPTY,students:r.data,error,loaded:true});return}
  const [l,a]=await Promise.all([db.from('lesson_entries').select('student_id,lesson_date,words').in('student_id',ids),db.from('assignments').select('id,student_id,title,published_at').in('student_id',ids)]);
  if(l.error&&!isMissingMigration(l.error))error=l.error.message;
  const A=(a.data||[]) as Dash['assignments'];const pub=A.filter(x=>x.published_at).map(x=>x.id);
  const s=pub.length?await db.from('homework_submissions').select('assignment_id').in('assignment_id',pub):{data:[]};
  let v28:V28={vocab:[],progress:[],practice:[],analyses:[],summaries:[]};
  if(r.v28){const [vv,pp,pr,an]=await Promise.all([db.from('vocab_items').select('student_id,status,due_at,translation').in('student_id',ids),db.from('student_goal_progress').select('student_id,status,goal_id,curriculum_goals(level)').in('student_id',ids),db.from('practice_sessions').select('student_id,kind,score,total,created_at').in('student_id',ids).order('created_at',{ascending:false}).limit(500),filter.teacherId?db.from('lesson_analyses').select('*').in('student_id',ids).in('status',['ready','processing','failed']).order('created_at',{ascending:false}):Promise.resolve({data:[]})]);
   v28={vocab:(vv.data||[]) as V28['vocab'],progress:(pp.data||[]) as unknown as V28['progress'],practice:(pr.data||[]) as V28['practice'],analyses:(an.data||[]) as V28['analyses'],summaries:filter.userId?(await Promise.all(ids.map(id=>db.rpc('student_lesson_summaries',{sid:id}).then(x=>((x.data||[]) as Omit<V28['summaries'][number],'student_id'>[]).map(s=>({...s,student_id:id})))))).flat():[]};}
  if(!cancelled)setD({students:r.data,lessons:(l.data||[]) as LessonLike[],assignments:A,submissions:(s.data||[]) as Dash['submissions'],error,loaded:true,...v28});
 })();return()=>{cancelled=true}},[key]);// eslint-disable-line react-hooks/exhaustive-deps
 return d;
}

function SpeakingCard(){
 return <ChartCard title={t("Spreektijd en spreekvaardigheid")} subtitle={t("Per les")} empty emptyText={t("Spreektijd wordt alleen gemeten bij opnames met aparte sporen (opname met AI-analyse). Per leerling zie je hem in de lesanalyse en op het leerlingdashboard. Spreekvaardigheid wordt niet als cijfer berekend.")}><span/></ChartCard>
}

function TeacherHome(){
 const {user,role}=useAuth();const d=useDashboard(user?{teacherId:user.id}:null);
 const nameOf=useMemo(()=>{const m=new Map(d.students.map(s=>[s.id,s]));return {subject:(id:string)=>m.get(id)?.subject||'',name:(id:string)=>m.get(id)?.name||''}},[d.students]);
 const perMonth=lessonsPerMonth(d.lessons,6),words=wordsPerMonth(d.lessons,6),hw=homeworkProgress(d.assignments,d.submissions);
 const bySubject=groupCount(d.lessons,nameOf.subject,5),byStudent=groupCount(d.lessons,nameOf.name,5);
 const goalsPerStudent=d.students.filter(s=>!s.archived_at).map(s=>({key:s.id,label:s.name,value:d.progress.filter(p=>p.student_id===s.id&&(p.status==='covered'||p.status==='mastered')).length})).filter(p=>p.value>0).sort((a,b)=>b.value-a.value).slice(0,6);
 const practiceScore=d.students.map(s=>{const ps=d.practice.filter(p=>p.student_id===s.id&&p.total>0);const sc=ps.reduce((n,p)=>n+p.score,0),tot=ps.reduce((n,p)=>n+p.total,0);return {key:s.id,label:s.name,value:tot?Math.round(sc/tot*100):-1}}).filter(p=>p.value>=0).slice(0,6);
 const review=d.analyses;
 useEffect(()=>{try{if(sessionStorage.getItem('teachy-purged'))return;sessionStorage.setItem('teachy-purged','1')}catch{}void purgeExpired(supabase()!).catch(()=>{})},[]);
 return <><NextLessonPanel mode="teacher"/>{role==='admin'&&<div className="hint">{t("Je bent beheerder. Docentaanvragen beoordeel je via")} <Link href="/beheer">{t("Docenten beheren")}</Link>.</div>}
  <PendingLinks/>
  <div className="hero"><div><div className="eyebrow">{t("DOCENTDASHBOARD")}</div><h1>{t("Welkom terug 👋")}</h1><p>{t("Elke leerling heeft een eigen klaslokaal: bord, notities, woorden en huiswerk worden per leerling bewaard.")}</p><div className="heroactions"><Link className="button light" href="/klaslokaal/live"><Video size={17}/> {t("Les starten")}</Link><Link className="button ghost-light" href="/leerlingen?nieuw=1"><Plus size={17}/> {t("Leerling toevoegen")}</Link></div></div><div className="hero-art" aria-hidden><Presentation size={76}/></div></div>
  {d.error&&<div className="notice">{d.error}</div>}
  <div className="statgrid">
   <StatTile icon={UsersRound} value={d.loaded?d.students.length:'…'} label={t("Leerlingen")} hint={t("{0} met gekoppeld account", d.students.filter(s=>s.user_id).length)}/>
   <StatTile icon={BookOpenCheck} tone="mint" value={d.loaded?d.lessons.length:'…'} label={t("Gegeven lessen")} hint={t("{0} deze maand", perMonth[perMonth.length-1].value)}/>
   <StatTile icon={Activity} tone="sky" value={d.loaded?activeStudents(d.lessons,30):'…'} label={t("Actieve leerlingen")} hint={t("les in de laatste 30 dagen")}/>
   <StatTile icon={ClipboardList} tone="coral" value={d.loaded?hw.open:'…'} label={t("Huiswerk open")} hint={t("{0} gepubliceerd", hw.published)}/>
  </div>
  {review.length>0&&<section className="panel review-panel"><div className="panelheader"><div><h2><Sparkles size={18}/> {t("AI-analyses")}</h2><p>{t("Concepten die op jouw controle wachten; leerlingen zien niets tot jij goedkeurt")}</p></div></div><div className="studentrows">{review.map(a=><div className="studentrow" key={a.id}><div className="avatar">{nameOf.name(a.student_id)[0]?.toUpperCase()||'?'}</div><Link className="studentrow-main" href={'/leerlingen?student='+a.student_id+'&tab=analyses'}><strong>{nameOf.name(a.student_id)}</strong><small>{t("Les van")} {new Date(a.lesson_date+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'long'})}</small></Link>{(a as {is_test?:boolean}).is_test&&<span className="test-badge">{'TEST'}</span>}<StatusChip status={a.status as AnalysisStatus}/></div>)}</div></section>}
  <div className="chart-grid">
   <ChartCard className="span2" title={t("Lesactiviteit")} subtitle={t("Gegeven lessen per maand, afgelopen 6 maanden")} empty={d.loaded&&isEmptySeries(perMonth)} emptyText={t("Nog geen lessen opgeslagen. Lessen verschijnen hier zodra je in het live klaslokaal notities, woorden of huiswerk vastlegt.")} table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>
   <ChartCard title={t("Huiswerkvoortgang")} subtitle={t("Ingeleverd van gepubliceerd")} empty={d.loaded&&hw.pct===null} emptyText={t("Nog geen gepubliceerd huiswerk.")}>{hw.pct!==null&&<ProgressRing pct={hw.pct} label={t("ingeleverd")} detail={t("{0} van {1} opdrachten ingeleverd", hw.submitted, hw.published)}/>}</ChartCard>
   <ChartCard className="span2" title={t("Nieuwe woorden")} subtitle={t("Woorden toegevoegd per maand, alle leerlingen")} empty={d.loaded&&isEmptySeries(words)} emptyText={t("Nog geen woorden vastgelegd.")} table={words}><LineChart data={words} color={CHART.violet}/></ChartCard>
   <ChartCard title={t("Lessen per vak")} subtitle={t("Totaal")} empty={d.loaded&&!bySubject.length} emptyText={t("Nog geen lessen.")} table={bySubject}><HBars data={bySubject} color={CHART.teal}/></ChartCard>
   <ChartCard title={t("Leerdoelen per leerling")} subtitle={t("Behandeld of beheerst · docentbeoordeling")} empty={d.loaded&&!goalsPerStudent.length} emptyText={t("Nog geen leerdoelen bijgehouden. Zet ze in het leerlingprofiel, tab Leerdoelen.")} table={goalsPerStudent}><HBars data={goalsPerStudent} color={CHART.ochre}/></ChartCard>
   <ChartCard title={t("Oefenresultaten")} subtitle={t("Gemiddelde score in % · gemeten")} empty={d.loaded&&!practiceScore.length} emptyText={t("Nog geen oefenresultaten van leerlingen.")} table={practiceScore}><HBars data={practiceScore} color={CHART.violet} unit="%"/></ChartCard>
   <ChartCard title={t("Meest actieve leerlingen")} subtitle={t("Aantal lessen")} empty={d.loaded&&!byStudent.length} emptyText={t("Nog geen lessen.")} table={byStudent}><HBars data={byStudent} color={CHART.coral}/></ChartCard>
   <SpeakingCard/>
  </div>
  <section className="panel"><div className="panelheader"><div><h2>{t("Leerlingen")}</h2><p>{t("Open direct de live les of het profiel")}</p></div><Link className="textlink" href="/leerlingen">{t("Alles beheren")} <ChevronRight size={15}/></Link></div>
   {d.loaded&&d.students.length===0?<div className="emptystate"><UsersRound size={30}/><strong>{t("Nog geen leerlingen")}</strong><p>{t("Voeg je eerste leerling toe met het e-mailadres van de leerling.")}</p><Link className="button" href="/leerlingen?nieuw=1"><Plus size={16}/> {t("Leerling toevoegen")}</Link></div>:
   <div className="studentrows">{d.students.filter(s=>!s.archived_at).map(s=><div className="studentrow" key={s.id}><div className="avatar">{s.name[0]?.toUpperCase()}</div><Link href={'/leerlingen?student='+s.id} className="studentrow-main"><strong>{s.name}</strong><small>{[s.subject,s.level].filter(Boolean).join(' · ')||t("Geen vak")}{s.user_id?t(" · account gekoppeld"):t(" · nog niet gekoppeld")}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> {t("Les starten")}</Link></div>)}</div>}
  </section></>
}

function StudentHome(){
 const {user,studentLinks,role,refresh}=useAuth();const d=useDashboard(user?{userId:user.id}:null);
 const subjectOf=useMemo(()=>{const m=new Map(d.students.map(s=>[s.id,s.subject]));return (id:string)=>m.get(id)||''},[d.students]);
 const perMonth=lessonsPerMonth(d.lessons,6),growth=cumulativeWords(d.lessons,6),hw=homeworkProgress(d.assignments,d.submissions),bySubject=groupCount(d.lessons,subjectOf,5);
 const words=d.lessons.reduce((n,l)=>n+(Array.isArray(l.words)?l.words.length:0),0);
 const last=d.lessons.map(l=>l.lesson_date).sort().pop();
 const perWeek=sessionsPerWeek(d.practice,8);const vstat=[{key:'new',label:t("Nieuw"),value:d.vocab.filter(v=>v.status==='new').length},{key:'practicing',label:t("Aan het oefenen"),value:d.vocab.filter(v=>v.status==='practicing').length},{key:'mastered',label:t("Beheerst"),value:d.vocab.filter(v=>v.status==='mastered').length}];
 const perLevel=['A0','A1','A2','B1','B2','C1','C2'].map(l=>({key:l,label:l,value:d.progress.filter(p=>p.curriculum_goals?.level===l&&(p.status==='covered'||p.status==='mastered')).length})).filter(x=>x.value>0);
 const catCount=new Map<string,number>();d.summaries.forEach(s=>(s.final?.corrections||[]).filter(c=>c.certainty!=='uncertain').forEach(c=>{const k=CATEGORY_LABEL[(c.category||'other') as CorrectionCategory];catCount.set(k,(catCount.get(k)||0)+1)}));
 const errorsByCat=Array.from(catCount.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({key:k,label:k,value:v}));
 const speaking=d.summaries.filter(s=>s.final?.student_speaking_seconds!=null).sort((a,b)=>a.lesson_date<b.lesson_date?-1:1).slice(-8).map(s=>({key:s.lesson_date,label:new Date(s.lesson_date+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short'}),value:Math.round((s.final.student_speaking_seconds||0)/60)}));
 const pr=d.practice.filter(p=>p.total>0);const avg=pr.length?Math.round(pr.reduce((n,p)=>n+p.score,0)/Math.max(1,pr.reduce((n,p)=>n+p.total,0))*100):null;
 return <><PendingLinks/><NextLessonPanel mode="student"/>
  <ReadyForYou items={d.loaded?readyFor(d):null} relations={studentLinks.map(s=>{const rec=d.students.find(x=>x.id===s.id);return {id:s.id,label:[s.subject||t("Les"),s.teacher_name].filter(Boolean).join(' · '),lang:rec?langOf(rec):undefined,level:rec?.level||null,teacher:s.teacher_name||undefined}})}/>
  <div className="hero mint"><div><div className="eyebrow">{t("LEERLINGDASHBOARD")}</div><h1>{t("Mijn lessen")}</h1><p>{t("Je voortgang, woorden en huiswerk bij al je docenten op één plek.")}</p><div className="heroactions"><Link className="button light" href="/mijn-profiel"><BookOpen size={17}/> {t("Mijn lessen")}</Link><Link className="button ghost-light" href="/portugees"><Languages size={17}/> {t("Portugees voorbereiden")}</Link></div></div><div className="hero-art" aria-hidden><BookOpen size={76}/></div></div>
  {d.error&&<div className="notice">{d.error}</div>}
  <MyLanguages students={d.students} lessons={d.lessons as {student_id:string}[]} vocab={d.vocab} loaded={d.loaded} teacherName={id=>studentLinks.find(l=>l.id===id)?.teacher_name||''}/>
  <div className="statgrid">
   <StatTile icon={BookOpenCheck} value={d.loaded?d.lessons.length:'…'} label={t("Gevolgde lessen")} hint={t("{0} deze maand", perMonth[perMonth.length-1].value)}/>
   <StatTile icon={Languages} tone="mint" value={d.loaded?words:'…'} label={t("Woorden geleerd")}/>
   <StatTile icon={ClipboardList} tone="sky" value={d.loaded?`${hw.submitted}/${hw.published}`:'…'} label={t("Huiswerk ingeleverd")}/>
   <StatTile icon={CalendarCheck} tone="coral" value={last?new Date(last+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short'}):'—'} label={t("Laatste les")}/>
  </div>
  <div className="chart-grid">
   <ChartCard className="span2" title={t("Mijn woordenschat groeit")} subtitle={t("Totaal aantal woorden, afgelopen 6 maanden")} empty={d.loaded&&growth[growth.length-1].value===0} emptyText={t("Nog geen woorden. Woorden die je docent tijdens de les toevoegt, verschijnen hier.")} table={growth}><LineChart data={growth} color={CHART.violet}/></ChartCard>
   <ChartCard title={t("Huiswerk")} subtitle={t("Ingeleverd van gepubliceerd")} empty={d.loaded&&hw.pct===null} emptyText={t("Nog geen huiswerk ontvangen.")}>{hw.pct!==null&&<ProgressRing pct={hw.pct} label={t("ingeleverd")} detail={t("{0} opdracht(en) open", hw.open)}/>}</ChartCard>
   <ChartCard className="span2" title={t("Lesactiviteit")} subtitle={t("Gevolgde lessen per maand")} empty={d.loaded&&isEmptySeries(perMonth)} emptyText={t("Nog geen lessen opgeslagen.")} table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>
   <ChartCard className="span2" title={t("Oefenactiviteit")} subtitle={t("Oefensessies per week · gemeten")} empty={d.loaded&&isEmptySeries(perWeek)} emptyText={t("Nog niet geoefend. Probeer de spelletjes bij Oefenen!")} table={perWeek}><BarChart data={perWeek} color={CHART.coral}/></ChartCard>
   <ChartCard title={t("Mijn woorden")} subtitle={avg!==null?t("Gemiddelde oefenscore % · gemeten"):t("Status · gemeten")} empty={d.loaded&&!d.vocab.length} emptyText={t("Nog geen woorden in je lijst.")} table={vstat}><HBars data={vstat} color={CHART.teal}/></ChartCard>
   <ChartCard title={t("Terugkerende fouten")} subtitle={t("Uit goedgekeurde lesanalyses · AI, gecontroleerd door docent")} empty={d.loaded&&!errorsByCat.length} emptyText={t("Nog geen goedgekeurde lesanalyses met correcties.")} table={errorsByCat}><HBars data={errorsByCat} color={CHART.coral}/></ChartCard>
   <ChartCard title={t("Mijn spreektijd")} subtitle={t("Minuten per opgenomen les · gemeten")} empty={d.loaded&&!speaking.length} emptyText={t("Nog niet gemeten. Spreektijd wordt alleen gemeten bij opnames met aparte sporen (AI-analyse aan).")} table={speaking}><BarChart data={speaking} color={CHART.teal} unit=" min"/></ChartCard>
   <ChartCard title={t("Leerdoelen per niveau")} subtitle={t("Behandeld of beheerst · docentbeoordeling")} empty={d.loaded&&!perLevel.length} emptyText={t("Je docent heeft nog geen leerdoelen bijgehouden.")} table={perLevel}><HBars data={perLevel} color={CHART.ochre}/></ChartCard>
   <ChartCard title={t("Voortgang per taal of vak")} subtitle={t("Aantal lessen")} empty={d.loaded&&!bySubject.length} emptyText={t("Nog geen lessen.")} table={bySubject}><HBars data={bySubject} color={CHART.ochre}/></ChartCard>
  </div>
  <section className="panel"><div className="panelheader"><div><h2>{t("Mijn docenten")}</h2><p>{t("Alleen jij en je docent zien deze gegevens")}</p></div></div>
   {studentLinks.length===0?<div className="emptystate"><BookOpen size={30}/><strong>{t("Nog geen leerlingprofiel gekoppeld")}</strong><p>{t("Vraag je docent om je toe te voegen met het e-mailadres van dit account. De uitnodiging verschijnt dan hierboven.")}</p></div>:
   <div className="studentrows">{studentLinks.map(s=>{const rec=d.students.find(x=>x.id===s.id);const lang=rec?langOf(rec):'';return <div className="studentrow" key={s.id}><Avatar userId={rec?.teacher_id} name={s.teacher_name||'D'} size={40}/><Link className="studentrow-main" href={'/mijn-profiel?'+(lang?'taal='+lang+'&':'')+'student='+s.id}><strong>{s.teacher_name||t("Docent")}</strong><small>{lang&&<Flag code={lang} size={16}/>} {lang?languageName(lang):(s.subject||t("Les"))}{rec?.level?' · '+rec.level:''}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> {t("Naar de les")}</Link></div>})}</div>}
  </section>
  {(role==='student'||role==='rejected_teacher'||role==='pending_teacher')&&<section className="panel soft"><h2>{t("Zelf lesgeven?")}</h2><p className="muted">{role==='pending_teacher'?t("Je aanvraag voor een docentprofiel wacht op goedkeuring door de beheerder."):role==='rejected_teacher'?t("Je vorige aanvraag is niet goedgekeurd. Je kunt opnieuw een aanvraag indienen."):t("Vraag een docentprofiel aan. Na goedkeuring gebruik je hetzelfde account als docent én als leerling.")}</p>{role!=='pending_teacher'&&<button className="button" onClick={async()=>{const {error}=await supabase()!.rpc('request_teacher_access');if(error)alert(error.message);else await refresh()}}>{t("Docentprofiel aanvragen")}</button>}</section>}
  <p className="small-print muted"><Mic size={12}/> {t("Opnames van je lessen vind je bij Mijn lessen → Opnames.")}</p></>
}

export default function Home(){const {mode}=useAuth();return <Nav>{mode==='teacher'?<TeacherHome/>:<StudentHome/>}</Nav>}
