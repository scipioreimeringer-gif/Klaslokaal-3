'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Suspense,useEffect,useState} from 'react';
import {ArrowLeft,Lock,Video,X,GraduationCap,UserRound} from 'lucide-react';
import {useAuth} from '../../../components/Auth';
import Nav from '../../../components/Nav';
import {PrivateNotes} from '../../../components/StudentData';
import {supabase} from '../../../lib/supabase';
import {useQueryParam} from '../../../lib/useQuery';
import {createStudentBridge,createTeacherBridge} from '../../../lib/classroomBridge';
import {isMissingMigration,loadStudents,MIGRATION_HINT,type StudentRecord} from '../../../lib/data';

type Room={student:StudentRecord;as:'teacher'|'student'};

function Picker(){
 const {user,mode,studentLinks}=useAuth();const [items,setItems]=useState<StudentRecord[]>([]);
 useEffect(()=>{if(user&&mode==='teacher')void loadStudents(supabase()!,{teacherId:user.id}).then(r=>setItems(r.data))},[user?.id,mode]);
 const list=mode==='teacher'?items.map(s=>({id:s.id,title:s.name,sub:s.subject})):studentLinks.map(s=>({id:s.id,title:s.subject||'Les',sub:'Docent: '+(s.teacher_name||'onbekend')}));
 return <Nav><div className="page-head"><div><h1>Live klaslokaal</h1><p className="muted">{mode==='teacher'?'Kies de leerling met wie je les hebt. Elke leerling heeft een eigen klaslokaal: bord, canvas, notities, woorden en videoruimte.':'Kies je les.'}</p></div></div>
  <div className="profile-grid">{list.map(s=><Link className="profile-student" key={s.id} href={'/klaslokaal/live?student='+s.id}><span className="avatar">{s.title[0]?.toUpperCase()}</span><span className="grow"><strong>{s.title}</strong><small>{s.sub}</small></span><Video size={18}/></Link>)}</div>
  {!list.length&&<div className="card"><p className="muted">{mode==='teacher'?<>Nog geen leerlingen. <Link href="/leerlingen?nieuw=1">Voeg een leerling toe</Link>.</>:'Nog geen les gekoppeld aan je account.'}</p></div>}
  <p className="muted small-print">Het oude klaslokaal zonder leerlingkoppeling staat nog op <a href="/legacy/index.html">/legacy/index.html</a> (lokale opslag op dit apparaat).</p></Nav>
}

function LiveRoom({studentId}:{studentId:string}){
 const {user,canTeach,mode}=useAuth();const router=useRouter();const [room,setRoom]=useState<Room|null>(null);const [error,setError]=useState('');const [ready,setReady]=useState(false);const [privOpen,setPrivOpen]=useState(false);
 useEffect(()=>{if(!user)return;let cancelled=false;setRoom(null);setReady(false);setError('');void(async()=>{
  const db=supabase()!;const r=await db.from('students').select('id,teacher_id,user_id,name,email,subject,notes,goals,homework,history,level,lesson_language,about,room_code').eq('id',studentId).maybeSingle();
  if(cancelled)return;
  if(r.error){setError(isMissingMigration(r.error)?MIGRATION_HINT:r.error.message);return}
  if(!r.data){setError('Deze les bestaat niet of je hebt er geen toegang toe.');return}
  const s=r.data as StudentRecord;const isTeacher=s.teacher_id===user.id&&canTeach;const isStudent=s.user_id===user.id;
  // Someone who is both (teaching themselves for a test) follows the selected profile.
  const as:Room['as']|null=isTeacher&&isStudent?(mode==='student'?'student':'teacher'):isTeacher?'teacher':isStudent?'student':null;
  if(!as){setError('Geen toegang tot dit klaslokaal.');return}
  if(!s.room_code){setError(MIGRATION_HINT);return}
  window.teachyBridge=as==='teacher'?createTeacherBridge(db,{teacherId:user.id,userId:user.id,studentId:s.id,studentName:s.name,onSwitch:id=>router.push('/klaslokaal/live?student='+id)}):createStudentBridge(db,{studentId:s.id,studentName:s.name});
  setRoom({student:s,as});setReady(true);
 })();return()=>{cancelled=true}},[studentId,user?.id,canTeach,mode,router]);
 useEffect(()=>()=>{delete window.teachyBridge},[]);
 if(error)return <Nav><div className="notice">{error}</div><Link className="button secondary" href="/klaslokaal/live"><ArrowLeft size={15}/> Terug</Link></Nav>;
 if(!room||!ready)return <div className="live-page"><div className="loader"/></div>;
 const s=room.student;const myName=(user?.user_metadata?.full_name as string|undefined)||s.name;
 const src=room.as==='teacher'
  ?`/legacy/index.html?sb=1&kamer=${encodeURIComponent(s.room_code!)}&student=${encodeURIComponent(s.id)}`
  :`/legacy/index.html?sb=1&rol=leerling&kamer=${encodeURIComponent(s.room_code!)}&naam=${encodeURIComponent(myName)}`;
 return <main className="live-page">
  <div className="live-toolbar">
   <div className="live-identity"><Link href={room.as==='teacher'?'/leerlingen?student='+s.id:'/mijn-profiel?student='+s.id} className="live-back" title="Terug naar profiel"><ArrowLeft size={16}/></Link><span className="live-logo"><GraduationCap size={16}/></span><strong>{room.as==='teacher'?s.name:(s.subject||'Mijn les')}</strong><span className="live-tag">{room.as==='teacher'?<><UserRound size={12}/> Docent</>:'Leerling'}</span></div>
   <div className="live-actions">{room.as==='teacher'&&<button className={'live-btn'+(privOpen?' on':'')} onClick={()=>setPrivOpen(!privOpen)}><Lock size={14}/><span>Privénotities</span></button>}<Link href="/" className="live-btn"><span>Dashboard</span></Link></div>
  </div>
  <div className="live-body">
   <iframe key={s.id+room.as} title={'Klaslokaal '+s.name} src={src} allow="camera; microphone; display-capture; fullscreen; autoplay" className="live-frame"/>
   {privOpen&&room.as==='teacher'&&<aside className="live-private"><button className="iconbtn" aria-label="Sluiten" onClick={()=>setPrivOpen(false)}><X size={16}/></button><PrivateNotes studentId={s.id}/></aside>}
  </div>
 </main>;
}

function Live(){const studentId=useQueryParam('student');return studentId?<LiveRoom studentId={studentId}/>:<Picker/>}
export default function LivePage(){return <Suspense fallback={<div className="live-page"><div className="loader"/></div>}><Live/></Suspense>}
