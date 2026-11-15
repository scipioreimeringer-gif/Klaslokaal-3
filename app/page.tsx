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
import type {AnalysisStatus} from '../lib/analysisTypes';
import {UsersRound,BookOpenCheck,Languages,ClipboardList,Video,Plus,ChevronRight,BookOpen,Presentation,Activity,Mic,CalendarCheck,Sparkles} from 'lucide-react';

type V28={vocab:{student_id:string;status:string}[];progress:{student_id:string;status:string;goal_id:string;curriculum_goals:{level:string}|null}[];practice:{student_id:string;kind:string;score:number;total:number;created_at:string}[];analyses:{id:string;student_id:string;lesson_date:string;status:string}[]};
type Dash={students:StudentRecord[];lessons:LessonLike[];assignments:{id:string;published_at:string|null}[];submissions:{assignment_id:string}[];error:string;loaded:boolean}&V28;
const EMPTY:Dash={students:[],lessons:[],assignments:[],submissions:[],error:'',loaded:false,vocab:[],progress:[],practice:[],analyses:[]};

/** Loads the real stored data for the dashboard (RLS limits it to what this user may see). */
function useDashboard(filter:{teacherId?:string;userId?:string}|null){
 const [d,setD]=useState<Dash>(EMPTY);
 const key=filter?JSON.stringify(filter):'';
 useEffect(()=>{if(!filter)return;let cancelled=false;void(async()=>{
  const db=supabase()!;const r=await loadStudents(db,filter);let error=r.error||(!r.v27?MIGRATION_HINT:'');const ids=r.data.map(s=>s.id);
  if(!ids.length){if(!cancelled)setD({...EMPTY,students:r.data,error,loaded:true});return}
  const [l,a]=await Promise.all([db.from('lesson_entries').select('student_id,lesson_date,words').in('student_id',ids),db.from('assignments').select('id,published_at').in('student_id',ids)]);
  if(l.error&&!isMissingMigration(l.error))error=l.error.message;
  const A=(a.data||[]) as Dash['assignments'];const pub=A.filter(x=>x.published_at).map(x=>x.id);
  const s=pub.length?await db.from('homework_submissions').select('assignment_id').in('assignment_id',pub):{data:[]};
  let v28:V28={vocab:[],progress:[],practice:[],analyses:[]};
  if(r.v28){const [vv,pp,pr,an]=await Promise.all([db.from('vocab_items').select('student_id,status').in('student_id',ids),db.from('student_goal_progress').select('student_id,status,goal_id,curriculum_goals(level)').in('student_id',ids),db.from('practice_sessions').select('student_id,kind,score,total,created_at').in('student_id',ids).order('created_at',{ascending:false}).limit(500),filter.teacherId?db.from('lesson_analyses').select('id,student_id,lesson_date,status').in('student_id',ids).in('status',['ready','processing','failed']).order('created_at',{ascending:false}):Promise.resolve({data:[]})]);
   v28={vocab:(vv.data||[]) as V28['vocab'],progress:(pp.data||[]) as unknown as V28['progress'],practice:(pr.data||[]) as V28['practice'],analyses:(an.data||[]) as V28['analyses']};}
  if(!cancelled)setD({students:r.data,lessons:(l.data||[]) as LessonLike[],assignments:A,submissions:(s.data||[]) as Dash['submissions'],error,loaded:true,...v28});
 })();return()=>{cancelled=true}},[key]);// eslint-disable-line react-hooks/exhaustive-deps
 return d;
}

function SpeakingCard(){
 return <ChartCard title="Spreektijd en spreekvaardigheid" subtitle="Per les" empty emptyText="Nog niet gemeten. TeachyRooms registreert spreektijd en spreekvaardigheid nog niet, dus hier worden geen cijfers verzonnen."><span/></ChartCard>
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
 return <>{role==='admin'&&<div className="hint">Je bent beheerder. Docentaanvragen beoordeel je via <Link href="/beheer">Docenten beheren</Link>.</div>}
  <PendingLinks/>
  <div className="hero"><div><div className="eyebrow">DOCENTDASHBOARD</div><h1>Welkom terug 👋</h1><p>Elke leerling heeft een eigen klaslokaal: bord, notities, woorden en huiswerk worden per leerling bewaard.</p><div className="heroactions"><Link className="button light" href="/klaslokaal/live"><Video size={17}/> Les starten</Link><Link className="button ghost-light" href="/leerlingen?nieuw=1"><Plus size={17}/> Leerling toevoegen</Link></div></div><div className="hero-art" aria-hidden><Presentation size={76}/></div></div>
  {d.error&&<div className="notice">{d.error}</div>}
  <div className="statgrid">
   <StatTile icon={UsersRound} value={d.loaded?d.students.length:'…'} label="Leerlingen" hint={`${d.students.filter(s=>s.user_id).length} met gekoppeld account`}/>
   <StatTile icon={BookOpenCheck} tone="mint" value={d.loaded?d.lessons.length:'…'} label="Gegeven lessen" hint={`${perMonth[perMonth.length-1].value} deze maand`}/>
   <StatTile icon={Activity} tone="sky" value={d.loaded?activeStudents(d.lessons,30):'…'} label="Actieve leerlingen" hint="les in de laatste 30 dagen"/>
   <StatTile icon={ClipboardList} tone="coral" value={d.loaded?hw.open:'…'} label="Huiswerk open" hint={`${hw.published} gepubliceerd`}/>
  </div>
  {review.length>0&&<section className="panel review-panel"><div className="panelheader"><div><h2><Sparkles size={18}/> AI-analyses</h2><p>Concepten die op jouw controle wachten; leerlingen zien niets tot jij goedkeurt</p></div></div><div className="studentrows">{review.map(a=><div className="studentrow" key={a.id}><div className="avatar">{nameOf.name(a.student_id)[0]?.toUpperCase()||'?'}</div><Link className="studentrow-main" href={'/leerlingen?student='+a.student_id+'&tab=analyses'}><strong>{nameOf.name(a.student_id)}</strong><small>Les van {new Date(a.lesson_date+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'long'})}</small></Link><StatusChip status={a.status as AnalysisStatus}/></div>)}</div></section>}
  <div className="chart-grid">
   <ChartCard className="span2" title="Lesactiviteit" subtitle="Gegeven lessen per maand, afgelopen 6 maanden" empty={d.loaded&&isEmptySeries(perMonth)} emptyText="Nog geen lessen opgeslagen. Lessen verschijnen hier zodra je in het live klaslokaal notities, woorden of huiswerk vastlegt." table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>
   <ChartCard title="Huiswerkvoortgang" subtitle="Ingeleverd van gepubliceerd" empty={d.loaded&&hw.pct===null} emptyText="Nog geen gepubliceerd huiswerk.">{hw.pct!==null&&<ProgressRing pct={hw.pct} label="ingeleverd" detail={`${hw.submitted} van ${hw.published} opdrachten ingeleverd`}/>}</ChartCard>
   <ChartCard className="span2" title="Nieuwe woorden" subtitle="Woorden toegevoegd per maand, alle leerlingen" empty={d.loaded&&isEmptySeries(words)} emptyText="Nog geen woorden vastgelegd." table={words}><LineChart data={words} color={CHART.violet}/></ChartCard>
   <ChartCard title="Lessen per vak" subtitle="Totaal" empty={d.loaded&&!bySubject.length} emptyText="Nog geen lessen." table={bySubject}><HBars data={bySubject} color={CHART.teal}/></ChartCard>
   <ChartCard title="Leerdoelen per leerling" subtitle="Behandeld of beheerst · docentbeoordeling" empty={d.loaded&&!goalsPerStudent.length} emptyText="Nog geen leerdoelen bijgehouden. Zet ze in het leerlingprofiel, tab Leerdoelen." table={goalsPerStudent}><HBars data={goalsPerStudent} color={CHART.ochre}/></ChartCard>
   <ChartCard title="Oefenresultaten" subtitle="Gemiddelde score in % · gemeten" empty={d.loaded&&!practiceScore.length} emptyText="Nog geen oefenresultaten van leerlingen." table={practiceScore}><HBars data={practiceScore} color={CHART.violet} unit="%"/></ChartCard>
   <ChartCard title="Meest actieve leerlingen" subtitle="Aantal lessen" empty={d.loaded&&!byStudent.length} emptyText="Nog geen lessen." table={byStudent}><HBars data={byStudent} color={CHART.coral}/></ChartCard>
   <SpeakingCard/>
  </div>
  <section className="panel"><div className="panelheader"><div><h2>Leerlingen</h2><p>Open direct de live les of het profiel</p></div><Link className="textlink" href="/leerlingen">Alles beheren <ChevronRight size={15}/></Link></div>
   {d.loaded&&d.students.length===0?<div className="emptystate"><UsersRound size={30}/><strong>Nog geen leerlingen</strong><p>Voeg je eerste leerling toe met het e-mailadres van de leerling.</p><Link className="button" href="/leerlingen?nieuw=1"><Plus size={16}/> Leerling toevoegen</Link></div>:
   <div className="studentrows">{d.students.filter(s=>!s.archived_at).map(s=><div className="studentrow" key={s.id}><div className="avatar">{s.name[0]?.toUpperCase()}</div><Link href={'/leerlingen?student='+s.id} className="studentrow-main"><strong>{s.name}</strong><small>{[s.subject,s.level].filter(Boolean).join(' · ')||'Geen vak'}{s.user_id?' · account gekoppeld':' · nog niet gekoppeld'}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> Les starten</Link></div>)}</div>}
  </section></>
}

function StudentHome(){
 const {user,studentLinks,role,refresh}=useAuth();const d=useDashboard(user?{userId:user.id}:null);
 const subjectOf=useMemo(()=>{const m=new Map(d.students.map(s=>[s.id,s.subject]));return (id:string)=>m.get(id)||''},[d.students]);
 const perMonth=lessonsPerMonth(d.lessons,6),growth=cumulativeWords(d.lessons,6),hw=homeworkProgress(d.assignments,d.submissions),bySubject=groupCount(d.lessons,subjectOf,5);
 const words=d.lessons.reduce((n,l)=>n+(Array.isArray(l.words)?l.words.length:0),0);
 const last=d.lessons.map(l=>l.lesson_date).sort().pop();
 const perWeek=sessionsPerWeek(d.practice,8);const vstat=[{key:'new',label:'Nieuw',value:d.vocab.filter(v=>v.status==='new').length},{key:'practicing',label:'Aan het oefenen',value:d.vocab.filter(v=>v.status==='practicing').length},{key:'mastered',label:'Beheerst',value:d.vocab.filter(v=>v.status==='mastered').length}];
 const perLevel=['A0','A1','A2','B1','B2','C1','C2'].map(l=>({key:l,label:l,value:d.progress.filter(p=>p.curriculum_goals?.level===l&&(p.status==='covered'||p.status==='mastered')).length})).filter(x=>x.value>0);
 const pr=d.practice.filter(p=>p.total>0);const avg=pr.length?Math.round(pr.reduce((n,p)=>n+p.score,0)/Math.max(1,pr.reduce((n,p)=>n+p.total,0))*100):null;
 return <><PendingLinks/>
  <div className="hero mint"><div><div className="eyebrow">LEERLINGDASHBOARD</div><h1>Mijn lessen</h1><p>Je voortgang, woorden en huiswerk bij al je docenten op één plek.</p><div className="heroactions"><Link className="button light" href="/mijn-profiel"><BookOpen size={17}/> Mijn lessen</Link><Link className="button ghost-light" href="/portugees"><Languages size={17}/> Portugees voorbereiden</Link></div></div><div className="hero-art" aria-hidden><BookOpen size={76}/></div></div>
  {d.error&&<div className="notice">{d.error}</div>}
  <div className="statgrid">
   <StatTile icon={BookOpenCheck} value={d.loaded?d.lessons.length:'…'} label="Gevolgde lessen" hint={`${perMonth[perMonth.length-1].value} deze maand`}/>
   <StatTile icon={Languages} tone="mint" value={d.loaded?words:'…'} label="Woorden geleerd"/>
   <StatTile icon={ClipboardList} tone="sky" value={d.loaded?`${hw.submitted}/${hw.published}`:'…'} label="Huiswerk ingeleverd"/>
   <StatTile icon={CalendarCheck} tone="coral" value={last?new Date(last+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}):'—'} label="Laatste les"/>
  </div>
  <div className="chart-grid">
   <ChartCard className="span2" title="Mijn woordenschat groeit" subtitle="Totaal aantal woorden, afgelopen 6 maanden" empty={d.loaded&&growth[growth.length-1].value===0} emptyText="Nog geen woorden. Woorden die je docent tijdens de les toevoegt, verschijnen hier." table={growth}><LineChart data={growth} color={CHART.violet}/></ChartCard>
   <ChartCard title="Huiswerk" subtitle="Ingeleverd van gepubliceerd" empty={d.loaded&&hw.pct===null} emptyText="Nog geen huiswerk ontvangen.">{hw.pct!==null&&<ProgressRing pct={hw.pct} label="ingeleverd" detail={`${hw.open} opdracht(en) open`}/>}</ChartCard>
   <ChartCard className="span2" title="Lesactiviteit" subtitle="Gevolgde lessen per maand" empty={d.loaded&&isEmptySeries(perMonth)} emptyText="Nog geen lessen opgeslagen." table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>
   <ChartCard className="span2" title="Oefenactiviteit" subtitle="Oefensessies per week · gemeten" empty={d.loaded&&isEmptySeries(perWeek)} emptyText="Nog niet geoefend. Probeer de spelletjes bij Oefenen!" table={perWeek}><BarChart data={perWeek} color={CHART.coral}/></ChartCard>
   <ChartCard title="Mijn woorden" subtitle={avg!==null?`Gemiddelde oefenscore % · gemeten`:'Status · gemeten'} empty={d.loaded&&!d.vocab.length} emptyText="Nog geen woorden in je lijst." table={vstat}><HBars data={vstat} color={CHART.teal}/></ChartCard>
   <ChartCard title="Leerdoelen per niveau" subtitle="Behandeld of beheerst · docentbeoordeling" empty={d.loaded&&!perLevel.length} emptyText="Je docent heeft nog geen leerdoelen bijgehouden." table={perLevel}><HBars data={perLevel} color={CHART.ochre}/></ChartCard>
   <ChartCard title="Voortgang per taal of vak" subtitle="Aantal lessen" empty={d.loaded&&!bySubject.length} emptyText="Nog geen lessen." table={bySubject}><HBars data={bySubject} color={CHART.ochre}/></ChartCard>
   <SpeakingCard/>
  </div>
  <section className="panel"><div className="panelheader"><div><h2>Mijn docenten</h2><p>Alleen jij en je docent zien deze gegevens</p></div></div>
   {studentLinks.length===0?<div className="emptystate"><BookOpen size={30}/><strong>Nog geen leerlingprofiel gekoppeld</strong><p>Vraag je docent om je toe te voegen met het e-mailadres van dit account. De uitnodiging verschijnt dan hierboven.</p></div>:
   <div className="studentrows">{studentLinks.map(s=><div className="studentrow" key={s.id}><div className="avatar mint">{(s.subject||s.name)[0]?.toUpperCase()}</div><Link className="studentrow-main" href={'/mijn-profiel?student='+s.id}><strong>{s.subject||'Les'}</strong><small>Docent: {s.teacher_name||'onbekend'}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> Naar de les</Link></div>)}</div>}
  </section>
  {(role==='student'||role==='rejected_teacher'||role==='pending_teacher')&&<section className="panel soft"><h2>Zelf lesgeven?</h2><p className="muted">{role==='pending_teacher'?'Je aanvraag voor een docentprofiel wacht op goedkeuring door de beheerder.':role==='rejected_teacher'?'Je vorige aanvraag is niet goedgekeurd. Je kunt opnieuw een aanvraag indienen.':'Vraag een docentprofiel aan. Na goedkeuring gebruik je hetzelfde account als docent én als leerling.'}</p>{role!=='pending_teacher'&&<button className="button" onClick={async()=>{const {error}=await supabase()!.rpc('request_teacher_access');if(error)alert(error.message);else await refresh()}}>Docentprofiel aanvragen</button>}</section>}
  <p className="small-print muted"><Mic size={12}/> Opnames van je lessen vind je bij Mijn lessen → Opnames.</p></>
}

export default function Home(){const {mode}=useAuth();return <Nav>{mode==='teacher'?<TeacherHome/>:<StudentHome/>}</Nav>}
