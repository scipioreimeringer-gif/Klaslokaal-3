'use client';
// v68: "Lesonderwerpen" — the teacher picks (optional) grammar topics for a planned lesson from the personal learning
// line, with at most five recommendations from plain database queries (no AI). Used in the agenda (before the lesson)
// and in the classroom (during the lesson: add, remove, mark as covered, short observation). Stored in lesson_goals
// (v34; note/sub from v68). Planned ≠ covered: only the teacher (or an accepted AI suggestion) marks a topic covered.
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Plus,X,Check,BookMarked,Sparkles} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,getLang} from '../lib/i18n';
import {GOAL_STATUS_LABEL,shownStatus,subjectOf,type GoalStatus} from '../lib/learning';
import {goalTitle,recommendTopics,REC_LABEL,topicInfo,visibleGoals} from '../lib/curriculum/topics';

type G={id:string;code:string|null;level:string;title:string;sort:number;subject:string};
type P={goal_id:string;status:GoalStatus;updated_at:string;lesson_date:string|null;hidden?:boolean;title_override?:string|null};
type LG={id:string;goal_id:string|null;custom_title:string|null;outcome:'planned'|'covered'|'not_covered';note?:string;sub?:string[]};
const OUT:LG['outcome'][]=['planned','covered','not_covered'];
const OUT_LABEL:Record<LG['outcome'],string>={planned:'Gepland',covered:'Behandeld',not_covered:'Niet behandeld'};

export function LessonTopics({studentId,lessonId,lessonDate,collapsed}:{studentId:string;lessonId:string|null;lessonDate:string;collapsed?:boolean}){
 const [goals,setGoals]=useState<G[]>([]);const [prog,setProg]=useState<Record<string,P>>({});const [errKeys,setErrKeys]=useState<Set<string>>(new Set());const [level,setLevel]=useState('A1');
 const [rows,setRows]=useState<LG[]>([]);const [v68,setV68]=useState(true);const [pick,setPick]=useState('');const [custom,setCustom]=useState('');const [msg,setMsg]=useState('');const ui=getLang();
 const load=useCallback(async()=>{const db=supabase()!;
  const s=await db.from('students').select('level,subject,lesson_language,curriculum_subject').eq('id',studentId).maybeSingle();
  const st=(s.data||{}) as {level?:string|null;subject?:string;lesson_language?:string|null;curriculum_subject?:string|null};setLevel(st.level||'A1');
  const subject=subjectOf({subject:st.subject||'',lesson_language:st.lesson_language||null,curriculum_subject:st.curriculum_subject||null} as Parameters<typeof subjectOf>[0]);
  const sel='id,goal_id,custom_title,outcome,note,sub';const filter=lessonId?`lesson_id.eq.${lessonId},and(lesson_date.eq.${lessonDate},lesson_id.is.null)`:`lesson_date.eq.${lessonDate}`;
  const [g,p,m,l]=await Promise.all([db.from('curriculum_goals').select('id,code,level,title,sort,subject').eq('subject',subject).order('level').order('sort'),
   db.from('student_goal_progress').select('goal_id,status,updated_at,lesson_date,hidden,title_override').eq('student_id',studentId),
   db.from('memory_patterns').select('key,lessons_seen,last_seen,hidden').eq('student_id',studentId).eq('kind','error'),
   db.from('lesson_goals').select(sel).eq('student_id',studentId).or(filter).order('created_at')]);
  let lg=l;if(l.error&&/note|sub/.test(l.error.message)){setV68(false);lg=await db.from('lesson_goals').select('id,goal_id,custom_title,outcome').eq('student_id',studentId).or(filter).order('created_at') as typeof l}
  setGoals(visibleGoals((g.data||[]) as G[],subject));setProg(Object.fromEntries(((p.data||[]) as P[]).map(x=>[x.goal_id,x])));
  const cut=Date.now()-60*86400e3;setErrKeys(new Set(((m.data||[]) as {key:string;lessons_seen:number;last_seen:string|null;hidden?:boolean}[]).filter(x=>!x.hidden&&x.lessons_seen>0&&Date.parse(x.last_seen||'1970')>cut).map(x=>x.key)));
  setRows(((lg.data||[]) as LG[]));if(lg.error)setMsg(lg.error.message)},[studentId,lessonId,lessonDate]);
 useEffect(()=>{void load()},[load]);
 const titleOf=(id:string|null)=>{const g=goals.find(x=>x.id===id);return g?goalTitle(g,prog[g.id]?.title_override,ui):''};
 const chosen=new Set(rows.map(r=>r.goal_id).filter(Boolean) as string[]);
 const recs=useMemo(()=>recommendTopics(goals.map(g=>({id:g.id,code:g.code,level:g.level,sort:g.sort,status:prog[g.id]?.status||'not_started',updated_at:prog[g.id]?.updated_at,lesson_date:prog[g.id]?.lesson_date,hidden:prog[g.id]?.hidden})),{level,errorKeys:errKeys,exclude:chosen},5),[goals,prog,errKeys,level,rows]);// eslint-disable-line react-hooks/exhaustive-deps
 async function add(goalId:string|null,title?:string){setMsg('');const row:Record<string,unknown>={student_id:studentId,lesson_date:lessonDate,lesson_id:lessonId,...(goalId?{goal_id:goalId}:{custom_title:(title||'').trim().slice(0,200)})};
  const r=await supabase()!.from('lesson_goals').insert(row);if(r.error){setMsg(/lesson_goals|PGRST205/.test(r.error.message)?t('Voer eerst supabase/v34.sql uit om het leertraject te gebruiken.'):r.error.message);return}setPick('');setCustom('');await load()}
 async function del(id:string){await supabase()!.from('lesson_goals').delete().eq('id',id);setRows(r=>r.filter(x=>x.id!==id))}
 async function up(id:string,p:Partial<LG>){setRows(r=>r.map(x=>x.id===id?{...x,...p}:x));const r=await supabase()!.from('lesson_goals').update(p).eq('id',id);if(r.error)setMsg(r.error.message)}
 // covered in the lesson: an untouched topic becomes "In ontwikkeling" (teacher action); an existing assessment is never changed
 async function outcome(x:LG,o:LG['outcome']){await up(x.id,{outcome:o});
  if(o==='covered'&&x.goal_id&&(!prog[x.goal_id]||prog[x.goal_id].status==='not_started')){const now=new Date().toISOString();
   const r=await supabase()!.from('student_goal_progress').upsert({student_id:studentId,goal_id:x.goal_id,status:'in_progress',basis:'teacher',lesson_date:lessonDate,updated_at:now},{onConflict:'student_id,goal_id'});
   if(!r.error)setProg(p=>({...p,[x.goal_id!]:{goal_id:x.goal_id!,status:'in_progress',updated_at:now,lesson_date:lessonDate}}))}}
 const body=<div className="lt68">
  {rows.length?<ul className="lt68-list">{rows.map(x=>{const info=topicInfo(goals.find(g=>g.id===x.goal_id)?.code);const st=x.goal_id?shownStatus(prog[x.goal_id]?.status):null;
   return <li key={x.id} className={'lt68-item o-'+x.outcome}>
    <div className="row between wrap"><b>{x.custom_title||titleOf(x.goal_id)||t('(verborgen onderwerp)')}</b>
     <span className="row"><span className="seg lt68-out" role="group" aria-label={t('Lesstatus')}>{OUT.map(o=><button key={o} type="button" aria-pressed={x.outcome===o} onClick={()=>void outcome(x,o)}>{o==='covered'&&<Check size={12}/>}{t(OUT_LABEL[o])}</button>)}</span>
      <button className="iconbtn" aria-label={t('Verwijderen')} onClick={()=>void del(x.id)}><X size={13}/></button></span></div>
    {st&&<small className="muted">{t('Leerlijn')}: <span className={'gstat gs-'+st}>{GOAL_STATUS_LABEL[st]}</span></small>}
    {v68&&info&&info.sub.length>1&&<div className="hw-chips lt68-sub" role="group" aria-label={t('Subonderwerpen')}>{info.sub.slice(0,8).map(s=>{const on=(x.sub||[]).includes(s);return <button type="button" key={s} className={'hw-chip'+(on?' on':'')} aria-pressed={on} onClick={()=>void up(x.id,{sub:on?(x.sub||[]).filter(y=>y!==s):[...(x.sub||[]),s].slice(0,6)})}>{s.length>48?s.slice(0,46)+'…':s}</button>})}</div>}
    {v68&&<input className="field compact" maxLength={500} placeholder={t('Korte notitie of observatie (optioneel)')} defaultValue={x.note||''} onBlur={e=>{if(e.target.value!==(x.note||''))void up(x.id,{note:e.target.value})}} aria-label={t('Notitie')}/>}
   </li>})}</ul>:<p className="muted small">{t('Nog geen lesonderwerpen. Dit is optioneel: je kunt de les ook zo starten.')}</p>}
  {recs.length>0&&<div className="lt68-recs"><small className="muted"><Sparkles size={12}/> {t('Aanbevolen')}</small><div className="hw-chips">{recs.map(r=><button key={r.id} type="button" className="hw-chip" title={t(REC_LABEL[r.reason])} onClick={()=>void add(r.id)}><Plus size={11}/> {titleOf(r.id)} <small className="muted">· {t(REC_LABEL[r.reason])}</small></button>)}</div></div>}
  <form className="row wrap lt68-add" onSubmit={e=>{e.preventDefault();if(pick)void add(pick);else if(custom.trim())void add(null,custom)}}>
   <select className="field grow" value={pick} onChange={e=>{setPick(e.target.value);if(e.target.value)setCustom('')}} aria-label={t('Kies uit het leertraject…')}><option value="">{t('Kies uit het leertraject…')}</option>{goals.filter(g=>!chosen.has(g.id)&&!prog[g.id]?.hidden).map(g=><option key={g.id} value={g.id}>{g.level==='-'?'∞':g.level} · {titleOf(g.id)}</option>)}</select>
   <input className="field grow" placeholder={t('…of een eigen onderwerp')} value={custom} onChange={e=>{setCustom(e.target.value);if(e.target.value)setPick('')}}/>
   <button className="button small" type="submit" disabled={!pick&&!custom.trim()}><Plus size={14}/> {t('Toevoegen')}</button></form>
  {!v68&&<p className="muted small">{t('Voer supabase/v68.sql uit voor notities en subonderwerpen.')}</p>}
  {msg&&<p className="muted small" role="status">{msg}</p>}
 </div>;
 return collapsed?<details className="lt68-box"><summary><BookMarked size={15}/> {t('Lesonderwerpen')}{rows.length?<span className="tag">{rows.length}</span>:null}</summary>{body}</details>
  :<section className="lt68-box open"><h4><BookMarked size={15}/> {t('Lesonderwerpen')}</h4>{body}</section>;
}
