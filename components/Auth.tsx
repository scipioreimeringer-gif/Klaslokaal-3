'use client';
import {createContext,useCallback,useContext,useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {GraduationCap,Presentation,BookOpen,Mail,Check} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t as tt} from '../lib/i18n';
import {LanguagePicker} from './I18n';

export type Role='admin'|'teacher'|'student'|'pending_teacher'|'rejected_teacher';
export type Mode='teacher'|'student';
export type StudentLink={id:string;name:string;subject:string;teacher_name:string};
export type PendingLink={student_id:string;student_name:string;subject:string;teacher_name:string};
type Auth={
 user:User|null;role:Role|null;loading:boolean;refresh:()=>Promise<void>;
 /** Approved teacher or admin: may use the teacher profile. */
 canTeach:boolean;
 /** Student profiles (from any teacher) linked to this same account. */
 studentLinks:StudentLink[];
 pendingLinks:PendingLink[];
 /** The profile the user is currently working in. */
 mode:Mode|null;setMode:(m:Mode)=>void;
};
const C=createContext<Auth>({user:null,role:null,loading:true,refresh:async()=>{},canTeach:false,studentLinks:[],pendingLinks:[],mode:null,setMode:()=>{}});
export const useAuth=()=>useContext(C);
const MODE_KEY='teachyrooms-mode';

export function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null);const [role,setRole]=useState<Role|null>(null);const [loading,setLoading]=useState(true);
 const [studentLinks,setLinks]=useState<StudentLink[]>([]);const [pendingLinks,setPending]=useState<PendingLink[]>([]);const [mode,setModeState]=useState<Mode|null>(null);
 const load=useCallback(async()=>{const db=supabase();if(!db){setLoading(false);return}
  try{const {data:{user:u}}=await db.auth.getUser();setUser(u);
   if(!u){setRole(null);setLinks([]);setPending([]);return}
   const [{data:p},{data:links},teachers,pending]=await Promise.all([
    db.from('profiles').select('role').eq('id',u.id).maybeSingle(),
    db.from('students').select('id,name,subject').eq('user_id',u.id).order('name'),
    db.rpc('my_teachers'),
    db.rpc('my_pending_student_links'),
   ]);
   const r=(['admin','teacher','pending_teacher','rejected_teacher'].includes(p?.role??'')?p?.role:'student') as Role;setRole(r);
   const names=new Map<string,string>(((teachers.data||[]) as {student_id:string;teacher_name:string}[]).map(t=>[t.student_id,t.teacher_name]));
   setLinks(((links||[]) as {id:string;name:string;subject:string}[]).map(l=>({...l,teacher_name:names.get(l.id)||''})));
   setPending(pending.error?[]:((pending.data||[]) as PendingLink[]));
  }catch{setUser(null);setRole(null)}finally{setLoading(false)}},[]);
 useEffect(()=>{try{const m=sessionStorage.getItem(MODE_KEY);if(m==='teacher'||m==='student')setModeState(m)}catch{}
  void load();const db=supabase();const {data}=db?.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){try{sessionStorage.removeItem(MODE_KEY)}catch{}setModeState(null)}setTimeout(()=>{void load()},0)})||{};return()=>data?.subscription.unsubscribe()},[load]);
 const canTeach=role==='teacher'||role==='admin';
 const setMode=useCallback((m:Mode)=>{setModeState(m);try{sessionStorage.setItem(MODE_KEY,m)}catch{}},[]);
 // Single-role accounts never need to choose.
 const effective:Mode|null=!user?null:canTeach&&studentLinks.length===0?'teacher':!canTeach?'student':mode;
 return <C.Provider value={{user,role,loading,refresh:load,canTeach,studentLinks,pendingLinks,mode:effective,setMode}}>{children}</C.Provider>
}

export function PendingLinks({compact}:{compact?:boolean}){
 const {pendingLinks,refresh}=useAuth();const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 if(!pendingLinks.length)return null;
 return <section className={'pending-links'+(compact?' compact':'')}><div className="pending-icon"><Mail size={20}/></div><div><strong>{tt("Uitnodiging als leerling")}</strong>{pendingLinks.map(p=><div className="pending-row" key={p.student_id}><span>{tt("{0} wil je toevoegen als leerling{1}.", p.teacher_name, p.subject?` (${p.subject})`:'')}</span><button className="button small" disabled={busy} onClick={async()=>{setBusy(true);const {error}=await supabase()!.rpc('accept_student_link',{target:p.student_id});setBusy(false);if(error)setMsg(error.message);else{setMsg(tt("Gekoppeld aan je account ✓"));await refresh()}}}><Check size={15}/> {tt("Accepteren")}</button></div>)}{msg&&<small role="status">{msg}</small>}<small>{tt("Je gebruikt hiervoor hetzelfde account. Je docent ziet alleen jouw leerlingprofiel, niet je eigen leerlingen.")}</small></div></section>
}

function ProfileChooser(){
 const {user,studentLinks,setMode}=useAuth();
 return <div className="auth-wrap"><section className="auth-card chooser"><div className="auth-top"><div className="auth-logo"><span className="brandmark"><GraduationCap size={20}/></span> {tt("TeachyRooms")}</div><LanguagePicker/></div><h1>{tt("Welk profiel wil je openen?")}</h1><p>{tt("Je bent ingelogd als {0}. Je kunt later wisselen via de bovenbalk.", user?.email||'')}</p>
  <div className="chooser-grid">
   <button className="chooser-option" onClick={()=>setMode('teacher')}><span className="chooser-icon teal"><Presentation size={26}/></span><strong>{tt("Mijn docentprofiel")}</strong><small>{tt("Leerlingen, lessen en het live klaslokaal")}</small></button>
   <button className="chooser-option" onClick={()=>setMode('student')}><span className="chooser-icon mint"><BookOpen size={26}/></span><strong>{tt("Mijn leerlingprofiel")}</strong><small>{studentLinks.map(s=>s.subject||s.teacher_name).filter(Boolean).join(' · ')||tt("Mijn lessen als leerling")}</small></button>
  </div><PendingLinks compact/></section></div>
}

export function AuthGate({children}:{children:React.ReactNode}){
 const {user,loading,mode}=useAuth();
 const [email,setEmail]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const db=supabase();
 if(!db)return <div className="auth-wrap"><section className="auth-card"><h1>{tt("Configuratie ontbreekt")}</h1><p>{tt("Controleer de Supabase-omgevingsvariabelen")} <code>{tt("NEXT_PUBLIC_SUPABASE_URL")}</code> {tt("en")} <code>{tt("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")}</code> {tt("in Vercel.")}</p></section></div>;
 if(loading)return <div className="auth-wrap"><div className="loader" aria-label={tt("Account laden")}/></div>;
 if(!user)return <div className="auth-wrap"><section className="auth-card">
  <div className="auth-top"><div className="auth-logo"><span className="brandmark"><GraduationCap size={20}/></span> {tt("TeachyRooms")}</div><LanguagePicker/></div><h1>{tt("Welkom")}</h1>
  <p>{tt("Log in met je Google-account. Daarna kies je je docent- of leerlingprofiel. Beide werken met hetzelfde account.")}</p>
  <p className="muted small" title={tt("Branch en commit van deze versie")}>{tt("Versie:")} {process.env.NEXT_PUBLIC_BUILD_ENV==='production'?tt("productie"):tt("preview")} · {process.env.NEXT_PUBLIC_BUILD_REF} · {process.env.NEXT_PUBLIC_BUILD_SHA}</p>
  <button className="button auth-google" disabled={busy} onClick={async()=>{setBusy(true);const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href}});if(error){setMessage(error.message);setBusy(false)}}}>{tt("Inloggen met Google")}</button>
  <div className="auth-divider"><span>{tt("of ontvang een inloglink")}</span></div>
  <form className="auth-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');const {error}=await db.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{emailRedirectTo:window.location.href,shouldCreateUser:true}});setBusy(false);setMessage(error?error.message:tt("Controleer je e-mail en klik op de inloglink."));}}>
   <input className="field" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={tt("jij@voorbeeld.com")}/>
   <button className="button secondary" disabled={busy} type="submit">{tt("Stuur link")}</button>
  </form>{message&&<p role="status">{message}</p>}
  <small>{tt("Je sessie wordt op dit apparaat onthouden. Log uit op een gedeelde computer.")}</small>
 </section></div>;
 if(!mode)return <ProfileChooser/>;
 return <>{children}</>;
}
