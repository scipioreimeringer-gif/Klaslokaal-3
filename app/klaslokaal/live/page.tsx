'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Suspense,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Video,X} from 'lucide-react';
import {useAuth} from '../../../components/Auth';
import Nav from '../../../components/Nav';
import {PrivateNotes} from '../../../components/StudentData';
import {AssistantPanel} from '../../../components/Assistant';
import {GamesPanel} from '../../../components/Games';
import {usePhoto} from '../../../components/Avatar';
import {supabase} from '../../../lib/supabase';
import {useQueryParam} from '../../../lib/useQuery';
import {createStudentBridge,createTeacherBridge} from '../../../lib/classroomBridge';
import {isMissingMigration,loadStudents,MIGRATION_HINT,type StudentRecord} from '../../../lib/data';
import {t, getLang, isLang} from '../../../lib/i18n';
import {useLanguage} from '../../../components/I18n';

type Room={student:StudentRecord;as:'teacher'|'student'};
/** The planned lesson this classroom belongs to: the one in the link, else one happening now (15 min margin). Without one the classroom still works. */
async function findLesson(db:ReturnType<typeof supabase>&{},sid:string,param:string|null){
 if(param&&/^[0-9a-f-]{36}$/i.test(param)){const r=await db.from('lessons').select('id').eq('id',param).eq('student_id',sid).maybeSingle();if(r.data)return (r.data as {id:string}).id}
 const now=Date.now();const r=await db.from('lessons').select('id').eq('student_id',sid).neq('status','cancelled').lte('starts_at',new Date(now+15*60e3).toISOString()).gte('ends_at',new Date(now-15*60e3).toISOString()).order('starts_at').limit(1);
 return r.error?null:((r.data||[])[0] as {id:string}|undefined)?.id||null;
}

function Picker(){
 const {user,mode,studentLinks}=useAuth();const [items,setItems]=useState<StudentRecord[]>([]);
 useEffect(()=>{if(user&&mode==='teacher')void loadStudents(supabase()!,{teacherId:user.id}).then(r=>setItems(r.data))},[user?.id,mode]);
 const list=mode==='teacher'?items.map(s=>({id:s.id,title:s.name,sub:s.subject})):studentLinks.map(s=>({id:s.id,title:s.subject||t("Les"),sub:t("Docent: ")+(s.teacher_name||t("onbekend"))}));
 return <Nav><div className="page-head"><div><h1>{t("Live klaslokaal")}</h1><p className="muted">{mode==='teacher'?t("Kies de leerling met wie je les hebt. Elke leerling heeft een eigen klaslokaal: bord, canvas, notities, woorden en videoruimte."):t("Kies je les.")}</p></div></div>
  <div className="profile-grid">{list.map(s=><Link className="profile-student" key={s.id} href={'/klaslokaal/live?student='+s.id}><span className="avatar">{s.title[0]?.toUpperCase()}</span><span className="grow"><strong>{s.title}</strong><small>{s.sub}</small></span><Video size={18}/></Link>)}</div>
  {!list.length&&<div className="card"><p className="muted">{mode==='teacher'?<>{t("Nog geen leerlingen.")} <Link href="/leerlingen?nieuw=1">{t("Voeg een leerling toe")}</Link>.</>:t("Nog geen les gekoppeld aan je account.")}</p></div>}
  <p className="muted small-print">{t("Het oude klaslokaal zonder leerlingkoppeling staat nog op")} <a href="/legacy/index.html">{'/legacy/index.html'}</a> {t("(lokale opslag op dit apparaat).")}</p></Nav>
}

function LiveRoom({studentId,lessonParam}:{studentId:string;lessonParam:string|null}){
 const {user,canTeach,mode}=useAuth();const router=useRouter();const [room,setRoom]=useState<Room|null>(null);const [error,setError]=useState('');const [ready,setReady]=useState(false);const [privOpen,setPrivOpen]=useState(false);
 const [assistOpen,setAssistOpen]=useState(false);const [gamesOpen,setGamesOpen]=useState(false);
 useEffect(()=>{if(!user)return;let cancelled=false;setRoom(null);setReady(false);setError('');void(async()=>{
  const db=supabase()!;const r=await db.from('students').select('id,teacher_id,user_id,name,email,subject,notes,goals,homework,history,level,lesson_language,about,room_code').eq('id',studentId).maybeSingle();
  if(cancelled)return;
  if(r.error){setError(isMissingMigration(r.error)?t(MIGRATION_HINT):r.error.message);return}
  if(!r.data){setError(t("Deze les bestaat niet of je hebt er geen toegang toe."));return}
  const s=r.data as StudentRecord;const isTeacher=s.teacher_id===user.id&&canTeach;const isStudent=s.user_id===user.id;
  // Someone who is both (teaching themselves for a test) follows the selected profile.
  const as:Room['as']|null=isTeacher&&isStudent?(mode==='student'?'student':'teacher'):isTeacher?'teacher':isStudent?'student':null;
  if(!as){setError(t("Geen toegang tot dit klaslokaal."));return}
  if(!s.room_code){setError(t(MIGRATION_HINT));return}
  const lessonId=as==='teacher'?await findLesson(db,s.id,lessonParam):null;if(cancelled)return;
  window.teachyBridge=as==='teacher'?createTeacherBridge(db,{teacherId:user.id,userId:user.id,studentId:s.id,studentName:s.name,lessonId,onSwitch:id=>router.push('/klaslokaal/live?student='+id)}):createStudentBridge(db,{studentId:s.id,studentName:s.name});
  // One combined top bar: page actions are offered inside the classroom's own ⋯ menu.
  window.teachyBridge.uiLang=getLang();
  window.teachyBridge.ui={setLang:(l:string)=>{if(isLang(l))setLangRef.current(l)},back:()=>router.push(as==='teacher'?'/leerlingen?student='+s.id:'/mijn-profiel?student='+s.id),dashboard:()=>router.push('/'),privateNotes:as==='teacher'?()=>setPrivOpen(o=>!o):undefined,assistant:()=>setAssistOpen(true),games:()=>setGamesOpen(o=>!o)};
  setRoom({student:s,as});setReady(true);
 })();return()=>{cancelled=true}},[studentId,lessonParam,user?.id,canTeach,mode,router]);
 useEffect(()=>()=>{delete window.teachyBridge},[]);
 // interface language: app → classroom (the classroom page is not reloaded, so a running lesson continues)
 const {lang,setLang}=useLanguage();const setLangRef=useRef(setLang);setLangRef.current=setLang;
 useEffect(()=>{if(window.teachyBridge)window.teachyBridge.uiLang=lang;const f=document.querySelector('iframe.live-frame') as HTMLIFrameElement|null;try{(f?.contentWindow as unknown as {__klasSetLang?:(l:string)=>void}|null)?.__klasSetLang?.(lang)}catch{/* not loaded yet: it reads bridge.uiLang */}},[lang]);
 // photo of the other participant in the classroom top bar
 const peerId=room?(room.as==='teacher'?room.student.user_id:room.student.teacher_id):null;const peerPhoto=usePhoto(peerId);
 useEffect(()=>{if(!ready||!window.teachyBridge)return;window.teachyBridge.peerAvatar=peerPhoto;const f=document.querySelector('iframe.live-frame') as HTMLIFrameElement|null;try{(f?.contentWindow as unknown as {__klasAvatar?:(u:string)=>void}|null)?.__klasAvatar?.(peerPhoto)}catch{/* frame not ready: it reads bridge.peerAvatar at start */}},[peerPhoto,ready]);
 if(error)return <Nav><div className="notice">{error}</div><Link className="button secondary" href="/klaslokaal/live"><ArrowLeft size={15}/> {t("Terug")}</Link></Nav>;
 if(!room||!ready)return <div className="live-page"><div className="loader"/></div>;
 const s=room.student;const myName=(user?.user_metadata?.full_name as string|undefined)||s.name;
 // b=<commit>: every deploy gets a new classroom URL, so no browser can keep showing an old cached copy
 const build=encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_SHA||'');
 const src=room.as==='teacher'
  ?`/legacy/index.html?sb=1&b=${build}&kamer=${encodeURIComponent(s.room_code!)}&student=${encodeURIComponent(s.id)}`
  :`/legacy/index.html?sb=1&b=${build}&rol=leerling&kamer=${encodeURIComponent(s.room_code!)}&naam=${encodeURIComponent(myName)}`;
 return <main className="live-page bar-hidden">
  <div className="live-body">
   <iframe key={s.id+room.as} title={t("Klaslokaal ")+s.name} src={src} allow="camera; microphone; display-capture; fullscreen; autoplay" className="live-frame"/>
   {privOpen&&room.as==='teacher'&&<aside className="live-private"><button className="iconbtn" aria-label={t("Sluiten")} onClick={()=>setPrivOpen(false)}><X size={16}/></button><PrivateNotes studentId={s.id}/></aside>}
   {assistOpen&&<div className="live-assistant"><AssistantPanel studentId={s.id} onClose={()=>setAssistOpen(false)}/></div>}
   {/* always mounted: receives the game state even while closed (the student's panel opens when a game starts) */}
   <GamesPanel studentId={s.id} role={room.as} open={gamesOpen} onOpen={()=>setGamesOpen(true)} onClose={()=>setGamesOpen(false)}/>
  </div>
 </main>;
}

function Live(){const studentId=useQueryParam('student');const lesson=useQueryParam('lesson');return studentId?<LiveRoom studentId={studentId} lessonParam={lesson}/>:<Picker/>}
export default function LivePage(){return <Suspense fallback={<div className="live-page"><div className="loader"/></div>}><Live/></Suspense>}
