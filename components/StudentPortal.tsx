'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Video,Target,MessageSquareText} from 'lucide-react';
import {useAuth} from './Auth';
import {StudentWorkspace} from './StudentData';
import {supabase} from '../lib/supabase';
import {loadStudents,type StudentRecord} from '../lib/data';

/** Student profiles linked to the logged-in account (one per teacher/subject). */
export function useMyStudentProfiles(){
 const {user,studentLinks}=useAuth();const [items,setItems]=useState<StudentRecord[]>([]);const [error,setError]=useState('');const [loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!user)return;void loadStudents(supabase()!,{userId:user.id}).then(r=>{if(r.error)setError(r.error);setItems(r.data);setLoaded(true)})},[user?.id,studentLinks.length]);
 const teacherName=(id:string)=>studentLinks.find(l=>l.id===id)?.teacher_name||'';
 return {items,error,loaded,teacherName};
}

export function StudentPortal({profile,teacherName,initialTab}:{profile:StudentRecord;teacherName:string;initialTab?:string|null}){
 return <>
  <div className="profile-hero"><div className="profile-avatar">{(profile.subject||profile.name)[0]?.toUpperCase()}</div><div className="grow"><h2>{profile.subject||'Mijn les'}</h2><p>Docent: {teacherName||'onbekend'}{profile.level?' · niveau '+profile.level:''}</p></div><Link className="button light" href={'/klaslokaal/live?student='+profile.id}><Video size={16}/> Naar de live les</Link></div>
  <StudentWorkspace studentId={profile.id} viewer="student" student={profile} initialTab={initialTab} intro={(profile.goals||profile.notes||profile.homework)?<div className="grid2">{profile.goals&&<section className="card"><h3><Target size={17}/> Mijn leerdoelen</h3><p className="pre">{profile.goals}</p></section>}{(profile.notes||profile.homework)&&<section className="card"><h3><MessageSquareText size={17}/> Van mijn docent</h3>{profile.notes&&<p className="pre">{profile.notes}</p>}{profile.homework&&<><h4>Huiswerk</h4><p className="pre">{profile.homework}</p></>}</section>}</div>:null}/>
 </>
}
