'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Video,Target,MessageSquareText} from 'lucide-react';
import {useAuth} from './Auth';
import {StudentWorkspace} from './StudentData';
import {Avatar} from './Avatar';
import {supabase} from '../lib/supabase';
import {loadStudents,type StudentRecord} from '../lib/data';
import {t} from '../lib/i18n';

/** Student profiles linked to the logged-in account (one per teacher/subject). */
export function useMyStudentProfiles(){
 const {user,studentLinks}=useAuth();const [items,setItems]=useState<StudentRecord[]>([]);const [error,setError]=useState('');const [loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!user)return;void loadStudents(supabase()!,{userId:user.id}).then(r=>{if(r.error)setError(r.error);setItems(r.data);setLoaded(true)})},[user?.id,studentLinks.length]);
 const teacherName=(id:string)=>studentLinks.find(l=>l.id===id)?.teacher_name||'';
 return {items,error,loaded,teacherName};
}

export function StudentPortal({profile,teacherName,initialTab,compact}:{profile:StudentRecord;teacherName:string;initialTab?:string|null;compact?:boolean}){
 return <>
  {compact?<div className="teacher-card"><Avatar userId={profile.teacher_id} name={teacherName||'D'} size={44}/><div className="grow"><strong>{teacherName||t("Docent")}</strong><small>{profile.subject||t("Les")}{profile.level?t(" · niveau ")+profile.level:''}</small></div></div>:
  <div className="profile-hero"><Avatar className="profile-avatar" userId={profile.teacher_id} name={teacherName||profile.subject||'D'} size={54}/><div className="grow"><h2>{profile.subject||t("Mijn les")}</h2><p>{t("Docent:")} {teacherName||t("onbekend")}{profile.level?t(" · niveau ")+profile.level:''}</p></div><Link className="button light" href={'/klaslokaal/live?student='+profile.id}><Video size={16}/> {t("Naar de live les")}</Link></div>}
  <StudentWorkspace studentId={profile.id} viewer="student" student={profile} initialTab={initialTab} intro={(profile.goals||profile.notes||profile.homework)?<div className="grid2">{profile.goals&&<section className="card"><h3><Target size={17}/> {t("Mijn leerdoelen")}</h3><p className="pre">{profile.goals}</p></section>}{(profile.notes||profile.homework)&&<section className="card"><h3><MessageSquareText size={17}/> {t("Van mijn docent")}</h3>{profile.notes&&<p className="pre">{profile.notes}</p>}{profile.homework&&<><h4>{t("Huiswerk")}</h4><p className="pre">{profile.homework}</p></>}</section>}</div>:null}/>
 </>
}
