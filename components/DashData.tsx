'use client';
// v73: the dashboard data loader, shared by the overview, Oefenen ("Voor jou") and Voortgang (statistics).
// One query per table for all relations the user may see (RLS decides); no AI.
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {loadStudents,isMissingMigration,MIGRATION_HINT,type StudentRecord} from '../lib/data';
import {mergeLessons,type LessonLike,type MergedLesson,type SessionLike} from '../lib/stats';
import {type AnalysisDoc} from '../lib/analysisTypes';
import {t} from '../lib/i18n';
export type V28={vocab:{student_id:string;status:string;due_at?:string|null;translation?:string|null;term?:string|null}[];progress:{student_id:string;status:string;goal_id:string;curriculum_goals:{level:string}|null}[];practice:{student_id:string;kind:string;score:number;total:number;created_at:string}[];analyses:{id:string;student_id:string;lesson_date:string;status:string}[];summaries:{id:string;student_id:string;lesson_date:string;final:AnalysisDoc}[]};
export type Dash={students:StudentRecord[];lessons:MergedLesson[];sessions:SessionLike[]|null;assignments:{id:string;student_id:string;title:string;published_at:string|null}[];submissions:{assignment_id:string}[];error:string;loaded:boolean}&V28;
const EMPTY:Dash={students:[],lessons:[],sessions:null,assignments:[],submissions:[],error:'',loaded:false,vocab:[],progress:[],practice:[],analyses:[],summaries:[]};

/** Loads the real stored data for the dashboard (RLS limits it to what this user may see). */
export function useDashboard(filter:{teacherId?:string;userId?:string}|null){
 const [d,setD]=useState<Dash>(EMPTY);
 const key=filter?JSON.stringify(filter):'';
 useEffect(()=>{if(!filter)return;let cancelled=false;void(async()=>{
  const db=supabase()!;const r=await loadStudents(db,filter);let error=r.error||(!r.v27?t(MIGRATION_HINT):'');const ids=r.data.map(s=>s.id);
  if(!ids.length){if(!cancelled)setD({...EMPTY,students:r.data,error,loaded:true});return}
  const [l,a,ss]=await Promise.all([db.from('lesson_entries').select('student_id,lesson_date,words').in('student_id',ids),db.from('assignments').select('id,student_id,title,published_at').in('student_id',ids),db.from('lesson_sessions').select('id,student_id,lesson_date,started_at,ended_at,joint_seconds,registered_at,lesson_id,recording_id,language').in('student_id',ids).order('started_at',{ascending:false}).limit(2000)]);
  const sessions=ss.error?null:(ss.data||[]) as SessionLike[];// v43: null = migration not run yet → old count per lesson day
  if(l.error&&!isMissingMigration(l.error))error=l.error.message;
  const A=(a.data||[]) as Dash['assignments'];const pub=A.filter(x=>x.published_at).map(x=>x.id);
  const s=pub.length?await db.from('homework_submissions').select('assignment_id').in('assignment_id',pub):{data:[]};
  let v28:V28={vocab:[],progress:[],practice:[],analyses:[],summaries:[]};
  if(r.v28){const [vv,pp,pr,an]=await Promise.all([db.from('vocab_items').select('student_id,status,due_at,translation,term').in('student_id',ids),db.from('student_goal_progress').select('student_id,status,goal_id,curriculum_goals(level)').in('student_id',ids),db.from('practice_sessions').select('student_id,kind,score,total,created_at').in('student_id',ids).order('created_at',{ascending:false}).limit(500),filter.teacherId?db.from('lesson_analyses').select('*').in('student_id',ids).in('status',['ready','processing','failed']).order('created_at',{ascending:false}):Promise.resolve({data:[]})]);
   v28={vocab:(vv.data||[]) as V28['vocab'],progress:(pp.data||[]) as unknown as V28['progress'],practice:(pr.data||[]) as V28['practice'],analyses:(an.data||[]) as V28['analyses'],summaries:filter.userId?(await Promise.all(ids.map(id=>db.rpc('student_lesson_summaries',{sid:id}).then(x=>((x.data||[]) as Omit<V28['summaries'][number],'student_id'>[]).map(s=>({...s,student_id:id})))))).flat():[]};}
  if(!cancelled)setD({students:r.data,lessons:mergeLessons((l.data||[]) as LessonLike[],sessions),sessions,assignments:A,submissions:(s.data||[]) as Dash['submissions'],error,loaded:true,...v28});
 })();return()=>{cancelled=true}},[key]);// eslint-disable-line react-hooks/exhaustive-deps
 return d;
}
