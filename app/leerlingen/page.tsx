'use client';
import {useCallback,useEffect,useRef,useState,Suspense} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Video,Link2,ArrowLeft,Plus,Copy,FileText,UserCheck,UserX} from 'lucide-react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {StudentWorkspace} from '../../components/StudentData';
import {supabase} from '../../lib/supabase';
import {useQueryParam} from '../../lib/useQuery';
import {loadStudents,MIGRATION_HINT,type StudentRecord} from '../../lib/data';

type Field='notes'|'goals'|'homework'|'history';
const FIELDS:[Field,string,string][]=[['goals','Leerdoelen','Wat wil deze leerling bereiken?'],['notes','Algemene notities en feedback','Zichtbaar voor de leerling'],['homework','Algemeen huiswerk','Zichtbaar voor de leerling'],['history','Lesgeschiedenis (vrije tekst)','Oudere aantekeningen; nieuwe lessen worden automatisch per datum bewaard']];

function Page(){
 const {user,mode,canTeach}=useAuth();const router=useRouter();const selected=useQueryParam('student')||'';const wantNew=useQueryParam('nieuw')==='1';const tab=useQueryParam('tab');
 const [items,setItems]=useState<StudentRecord[]>([]);const [name,setName]=useState('');const [email,setEmail]=useState('');const [subject,setSubject]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [inviteLink,setInviteLink]=useState('');const [saveState,setSaveState]=useState('');
 const timers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});const nameRef=useRef<HTMLInputElement>(null);const [showArchived,setShowArchived]=useState(false);
 async function setArchived(s:StudentRecord,archive:boolean){const {error}=await supabase()!.from('students').update({archived_at:archive?new Date().toISOString():null}).eq('id',s.id);if(error){setMessage(/archived_at/.test(error.message)?'Database-update v28 ontbreekt: voer supabase/v28.sql uit.':error.message);return}setMessage(archive?`${s.name} is gearchiveerd. Alle gegevens blijven bewaard.`:`${s.name} is weer actief.`);await load();if(archive)select('')}
 async function unlink(s:StudentRecord){if(!confirm(`De koppeling met het account van ${s.name} beëindigen?\n\nJij houdt alle lesgegevens; de leerling ziet dit profiel niet meer. Je kunt later opnieuw uitnodigen.`))return;const {error}=await supabase()!.rpc('teacher_unlink_student',{target:s.id});setMessage(error?error.message:'Koppeling beëindigd.');await load()}
 async function hardDelete(s:StudentRecord){const typed=prompt(`DEFINITIEF VERWIJDEREN\n\nDit verwijdert bij jou: lesnotities, bord en canvas, woordenlijst, leerdoelen, huiswerk, oefenresultaten, analyses en opnames van ${s.name}. Dit kan niet ongedaan worden gemaakt.\nHet Google-account van de leerling en gegevens bij andere docenten blijven bestaan.\n\nTyp de naam "${s.name}" om te bevestigen:`);if(typed===null)return;if(typed.trim()!==s.name.trim()){setMessage('Naam kwam niet overeen; niets verwijderd.');return}
  const db=supabase()!;let recs=await db.from('lesson_recordings').select('storage_path,teacher_track_path,student_track_path').eq('student_id',s.id);if(recs.error)recs=await db.from('lesson_recordings').select('storage_path').eq('student_id',s.id) as typeof recs;const files=(recs.data||[]).flatMap(r=>[r.storage_path,r.teacher_track_path,r.student_track_path]).filter(Boolean) as string[];if(files.length)await db.storage.from('recordings').remove(files);
  const {error}=await db.from('students').delete().eq('id',s.id);setMessage(error?'Verwijderen mislukt: '+error.message:`${s.name} en alle bijbehorende lesgegevens zijn verwijderd.`);if(!error){select('');await load()}}
 const load=useCallback(async()=>{const db=supabase();if(!db||!user)return;const r=await loadStudents(db,{teacherId:user.id});if(r.error)setMessage(r.error);else if(!r.v27)setMessage(MIGRATION_HINT);setItems(r.data)},[user]);
 useEffect(()=>{void load()},[load]);useEffect(()=>{setInviteLink('');setSaveState('')},[selected]);useEffect(()=>{if(wantNew)nameRef.current?.focus()},[wantNew]);
 const current=items.find(x=>x.id===selected);
 const select=(id:string)=>router.push(id?'/leerlingen?student='+id:'/leerlingen');
 async function add(){const db=supabase();if(!db||!user||!name.trim()||!email.trim())return;setBusy(true);const {data,error}=await db.from('students').insert({teacher_id:user.id,name:name.trim(),email:email.trim().toLowerCase(),subject:subject.trim()}).select('id').single();setBusy(false);if(error){setMessage(error.message.includes('duplicate')?'Deze leerling (dit e-mailadres) staat al in je lijst.':error.message);return}setMessage('Leerling opgeslagen. Als dit e-mailadres al een account heeft, ziet de leerling na inloggen een uitnodiging om te accepteren.');setName('');setEmail('');setSubject('');await load();if(data)select(data.id)}
 async function invite(){if(!current)return;setBusy(true);const {data,error}=await supabase()!.rpc('create_student_invitation',{target_student:current.id});setBusy(false);if(error){setMessage('Uitnodiging mislukt: '+error.message);return}setInviteLink(window.location.origin+'/uitnodiging?token='+encodeURIComponent(data));}
 function edit(field:Field,value:string){if(!current)return;const id=current.id;setItems(a=>a.map(x=>x.id===id?{...x,[field]:value}:x));setSaveState('Wijzigingen…');clearTimeout(timers.current[field]);timers.current[field]=setTimeout(async()=>{const {error}=await supabase()!.from('students').update({[field]:value,updated_at:new Date().toISOString()}).eq('id',id);setSaveState(error?'Opslaan mislukt: '+error.message:'Opgeslagen ✓')},700)}
 if(!canTeach||mode!=='teacher')return <div className="notice">Leerlingbeheer is alleen beschikbaar in je docentprofiel{canTeach?' — wissel rechtsboven naar "Docent".':'.'}</div>;
 if(current)return <>
  <div className="page-head"><div><button className="backlink" onClick={()=>select('')}><ArrowLeft size={15}/> Alle leerlingen</button><h1>{current.name}</h1><p className="muted">{[current.subject,current.level,current.email].filter(Boolean).join(' · ')}</p></div>
   <div className="row"><Link className="button" href={'/klaslokaal/live?student='+encodeURIComponent(current.id)}><Video size={16}/> Live les starten</Link><Link className="button secondary" href={'/lesruimte?student='+encodeURIComponent(current.id)}><FileText size={16}/> Tekstbord</Link>{!current.user_id&&<button className="button secondary" disabled={busy} onClick={()=>void invite()}><Link2 size={16}/> Uitnodigingslink</button>}</div></div>
  <div className={'link-state '+(current.user_id?'ok':'wait')}>{current.user_id?<><UserCheck size={16}/> Gekoppeld aan het account van de leerling.</>:<><UserX size={16}/> Nog niet gekoppeld. De leerling ziet een uitnodiging zodra hij of zij inlogt met <b>{current.email}</b>. Je kunt ook een uitnodigingslink sturen.</>}</div>
  {message&&<p className="muted" role="status">{message}</p>}
  {inviteLink&&<section className="card invite"><h3>Persoonlijke uitnodigingslink</h3><p className="muted">7 dagen geldig en één keer te gebruiken. De leerling logt in met {current.email}. Deel de link niet openbaar.</p><div className="row"><input className="field grow" readOnly value={inviteLink} onFocus={e=>e.target.select()}/><button className="button" onClick={()=>void navigator.clipboard.writeText(inviteLink)}><Copy size={15}/> Kopieer</button></div></section>}
  {current.archived_at&&<div className="notice">Deze leerling is gearchiveerd en staat niet in je actieve lijst. <button className="button small" onClick={()=>void setArchived(current,false)}>Herstellen</button></div>}
  <StudentWorkspace studentId={current.id} viewer="teacher" student={current} initialTab={tab} intro={<section className="card"><div className="row between"><h3>Profielgegevens</h3><small className="muted" role="status">{saveState}</small></div><div className="grid2">{FIELDS.map(([f,l,ph])=><label key={f} className="stack"><span className="label">{l}</span><textarea className="field" rows={4} placeholder={ph} value={current[f]||''} onChange={e=>edit(f,e.target.value)}/></label>)}</div></section>}/>
  <section className="card danger-zone"><h3>Leerling beheren</h3><div className="manage-grid">
   <div><b>{current.archived_at?'Herstellen':'Archiveren'}</b><p className="muted">{current.archived_at?'Zet de leerling terug in je actieve lijst.':'Haalt de leerling uit je actieve lijst. Alle gegevens blijven bewaard en de leerling houdt toegang.'}</p><button className="button secondary small" onClick={()=>void setArchived(current,!current.archived_at)}>{current.archived_at?'Herstellen':'Archiveren'}</button></div>
   <div><b>Ontkoppelen</b><p className="muted">Beëindigt de koppeling met het account van de leerling. Jij houdt de lesgegevens; de leerling ziet dit profiel niet meer.</p><button className="button secondary small" disabled={!current.user_id} onClick={()=>void unlink(current)}>Ontkoppelen</button></div>
   <div><b>Definitief verwijderen</b><p className="muted">Verwijdert alle lesgegevens van deze leerling bij jou, inclusief opnames. Het account van de leerling en relaties met andere docenten blijven bestaan. Huiswerkbijlagen die de leerling zelf uploadde, blijven in de opslag van de leerling.</p><button className="button danger small" onClick={()=>void hardDelete(current)}>Definitief verwijderen…</button></div>
  </div></section>
 </>;
 const active=items.filter(s=>!s.archived_at),archived=items.filter(s=>s.archived_at),listed=showArchived?archived:active;
 return <>
  <div className="page-head"><div><h1>Mijn leerlingen</h1><p className="muted">Elke leerling heeft een eigen klaslokaal met bord, notities, woorden, huiswerk en opnames.</p></div></div>
  {message&&<p className="muted" role="status">{message}</p>}
  <section className="card"><h3><Plus size={17}/> Leerling toevoegen</h3><p className="muted">Gebruik het e-mailadres waarmee de leerling inlogt (bijvoorbeeld Google). Iemand die zelf docent is, kan zo ook bij jou leerling zijn met hetzelfde account.</p>
   <form className="row" onSubmit={e=>{e.preventDefault();void add()}}><input ref={nameRef} className="field" placeholder="Naam" value={name} onChange={e=>setName(e.target.value)} required/><input className="field" type="email" placeholder="E-mailadres" value={email} onChange={e=>setEmail(e.target.value)} required/><input className="field" placeholder="Vak / niveau, bijv. Nederlands B1" value={subject} onChange={e=>setSubject(e.target.value)}/><button className="button" disabled={busy} type="submit">Toevoegen</button></form></section>
  <div className="chipbar list-toggle"><button aria-pressed={!showArchived} onClick={()=>setShowArchived(false)}>Actief ({active.length})</button><button aria-pressed={showArchived} onClick={()=>setShowArchived(true)}>Gearchiveerd ({archived.length})</button></div>
  <div className="profile-grid">{listed.map(s=><button className={'profile-student'+(s.archived_at?' archived':'')} key={s.id} onClick={()=>select(s.id)}><span className="avatar">{s.name[0]?.toUpperCase()}</span><span className="grow"><strong>{s.name}</strong><small>{s.subject||'Geen vak'} · {s.user_id?'gekoppeld':'niet gekoppeld'}</small></span><span aria-hidden>›</span></button>)}</div>
  {!listed.length&&<p className="muted">{showArchived?'Geen gearchiveerde leerlingen.':'Nog geen actieve leerlingen.'}</p>}
 </>
}
export default function Students(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
