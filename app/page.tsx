'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Nav from '../components/Nav';
import {useAuth,PendingLinks} from '../components/Auth';
import {supabase} from '../lib/supabase';
import {loadStudents,isMissingMigration,MIGRATION_HINT,type StudentRecord} from '../lib/data';
import {UsersRound,BookOpenCheck,Languages,ClipboardList,Video,Plus,ChevronRight,BookOpen,Presentation} from 'lucide-react';

function TeacherHome(){
 const {user,role}=useAuth();const [students,setStudents]=useState<StudentRecord[]>([]);const [error,setError]=useState('');const [stats,setStats]=useState({month:0,words:0,open:0});
 useEffect(()=>{if(!user)return;void(async()=>{const db=supabase()!;const r=await loadStudents(db,{teacherId:user.id});if(r.error)setError(r.error);else if(!r.v27)setError(MIGRATION_HINT);setStudents(r.data);const ids=r.data.map(s=>s.id);if(!ids.length)return;
  const month=new Date().toISOString().slice(0,7)+'-01';
  const [l,a]=await Promise.all([db.from('lesson_entries').select('lesson_date,words').in('student_id',ids),db.from('assignments').select('id,published_at').in('student_id',ids)]);
  if(l.error&&!isMissingMigration(l.error))setError(l.error.message);
  const L=(l.data||[]) as {lesson_date:string;words:unknown[]|null}[];const A=((a.data||[]) as {id:string;published_at:string|null}[]).filter(x=>x.published_at);
  const subs=A.length?await db.from('homework_submissions').select('assignment_id').in('assignment_id',A.map(x=>x.id)):{data:[]};
  const done=new Set(((subs.data||[]) as {assignment_id:string}[]).map(s=>s.assignment_id));
  setStats({month:L.filter(x=>x.lesson_date>=month).length,words:L.reduce((n,x)=>n+(Array.isArray(x.words)?x.words.length:0),0),open:A.filter(x=>!done.has(x.id)).length});
 })()},[user?.id]);
 const cards=[{label:'Mijn leerlingen',value:students.length,icon:UsersRound,c:'teal'},{label:'Lessen deze maand',value:stats.month,icon:BookOpenCheck,c:'mint'},{label:'Woorden geleerd',value:stats.words,icon:Languages,c:'sky'},{label:'Huiswerk open',value:stats.open,icon:ClipboardList,c:'sand'}];
 return <>{role==='admin'&&<div className="hint">Je bent beheerder. Docentaanvragen beoordeel je via <Link href="/beheer">Docenten beheren</Link>.</div>}
  <PendingLinks/>
  <div className="hero"><div><div className="eyebrow">DOCENTPROFIEL</div><h1>Welkom terug 👋</h1><p>Kies een leerling om zijn of haar eigen klaslokaal te openen: bord, notities, woorden en huiswerk worden per leerling bewaard.</p><div className="heroactions"><Link className="button light" href="/leerlingen"><UsersRound size={17}/> Mijn leerlingen</Link><Link className="button ghost-light" href="/leerlingen?nieuw=1"><Plus size={17}/> Leerling toevoegen</Link></div></div><div className="hero-art" aria-hidden><Presentation size={84}/></div></div>
  {error&&<div className="notice">{error}</div>}
  <div className="statgrid">{cards.map(({label,value,icon:Icon,c})=><div className="statcard" key={label}><div className={'stat-icon '+c}><Icon size={20}/></div><strong>{value}</strong><span>{label}</span></div>)}</div>
  <section className="panel"><div className="panelheader"><div><h2>Leerlingen</h2><p>Open direct de live les of het profiel</p></div><Link className="textlink" href="/leerlingen">Alles beheren <ChevronRight size={15}/></Link></div>
   {students.length===0?<div className="emptystate"><UsersRound size={30}/><strong>Nog geen leerlingen</strong><p>Voeg je eerste leerling toe met het Google-e-mailadres van de leerling.</p><Link className="button" href="/leerlingen?nieuw=1"><Plus size={16}/> Leerling toevoegen</Link></div>:
   <div className="studentrows">{students.map(s=><div className="studentrow" key={s.id}><div className="avatar">{s.name[0]?.toUpperCase()}</div><Link href={'/leerlingen?student='+s.id} className="studentrow-main"><strong>{s.name}</strong><small>{[s.subject,s.level].filter(Boolean).join(' · ')||'Geen vak'}{s.user_id?' · account gekoppeld':' · nog niet gekoppeld'}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> Les starten</Link></div>)}</div>}
  </section></>
}

function StudentHome(){
 const {studentLinks,role,refresh}=useAuth();
 return <><PendingLinks/>
  <div className="hero mint"><div><div className="eyebrow">LEERLINGPROFIEL</div><h1>Mijn lessen</h1><p>Je woorden, lesnotities, huiswerk, voortgang en opnames per docent.</p><div className="heroactions"><Link className="button light" href="/mijn-profiel"><BookOpen size={17}/> Open mijn lessen</Link><Link className="button ghost-light" href="/portugees"><Languages size={17}/> Portugees voorbereiden</Link></div></div><div className="hero-art" aria-hidden><BookOpen size={84}/></div></div>
  <section className="panel"><div className="panelheader"><div><h2>Mijn docenten</h2><p>Alleen jij en je docent zien deze gegevens</p></div></div>
   {studentLinks.length===0?<div className="emptystate"><BookOpen size={30}/><strong>Nog geen leerlingprofiel gekoppeld</strong><p>Vraag je docent om je toe te voegen met het e-mailadres van dit account. De uitnodiging verschijnt dan hierboven, of open de uitnodigingslink die je kreeg.</p></div>:
   <div className="studentrows">{studentLinks.map(s=><div className="studentrow" key={s.id}><div className="avatar mint">{(s.subject||s.name)[0]?.toUpperCase()}</div><Link className="studentrow-main" href={'/mijn-profiel?student='+s.id}><strong>{s.subject||'Les'}</strong><small>Docent: {s.teacher_name||'onbekend'}</small></Link><Link className="button small" href={'/klaslokaal/live?student='+s.id}><Video size={15}/> Naar de les</Link></div>)}</div>}
  </section>
  {(role==='student'||role==='rejected_teacher'||role==='pending_teacher')&&<section className="panel soft"><h2>Zelf lesgeven?</h2><p className="muted">{role==='pending_teacher'?'Je aanvraag voor een docentprofiel wacht op goedkeuring door de beheerder.':role==='rejected_teacher'?'Je vorige aanvraag is niet goedgekeurd. Je kunt opnieuw een aanvraag indienen.':'Vraag een docentprofiel aan. Na goedkeuring gebruik je hetzelfde account als docent én als leerling.'}</p>{role!=='pending_teacher'&&<button className="button" onClick={async()=>{const {error}=await supabase()!.rpc('request_teacher_access');if(error)alert(error.message);else await refresh()}}>Docentprofiel aanvragen</button>}</section>}</>
}

export default function Home(){const {mode}=useAuth();return <Nav>{mode==='teacher'?<TeacherHome/>:<StudentHome/>}</Nav>}
