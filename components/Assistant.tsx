'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Sparkles,X,CalendarCheck,ClipboardList,FileText,Languages,Wand2,Gamepad2,ArrowRight} from 'lucide-react';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';
import {authedPost} from '../lib/learning';
import {t} from '../lib/i18n';

type Plan={focus:string;warmup:string[];review:string[];activities:{title:string;minutes:number;description:string}[];vocabulary:string[];homework_check:string;goals:string[];data_note:string};

/** The single AI entry point. Opens on demand; never open by default during a lesson. */
export function AssistantPanel({studentId,onClose}:{studentId?:string|null;onClose:()=>void}){
 const {user,mode,studentLinks}=useAuth();const [students,setStudents]=useState<{id:string;name:string}[]>([]);const [sel,setSel]=useState(studentId||'');const [plan,setPlan]=useState<Plan|null>(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const teacher=mode==='teacher';
 useEffect(()=>{if(!user)return;if(teacher)void supabase()!.from('students').select('id,name,archived_at').eq('teacher_id',user.id).order('name').then(({data,error})=>{const rows=(data||[]) as {id:string;name:string;archived_at?:string|null}[];if(error)void supabase()!.from('students').select('id,name').eq('teacher_id',user.id).order('name').then(r=>setStudents((r.data||[]) as {id:string;name:string}[]));else setStudents(rows.filter(r=>!r.archived_at))});else setStudents(studentLinks.map(s=>({id:s.id,name:(s.subject||s.name)+(s.teacher_name?' — '+s.teacher_name:'')})))},[user?.id,teacher,studentLinks]);
 useEffect(()=>{if(!sel&&students[0])setSel(studentId||students[0].id)},[students,sel,studentId]);
 async function prepare(){if(!sel)return;setBusy(true);setErr('');setPlan(null);try{setPlan(await authedPost<Plan>(supabase()!,'/api/ai/prepare',{studentId:sel}))}catch(e){setErr(e instanceof Error?e.message:String(e))}setBusy(false)}
 const base=teacher?`/leerlingen?student=${sel}`:`/mijn-profiel?student=${sel}`;
 return <aside className="assistant" role="dialog" aria-label={t("AI-assistent")}>
  <div className="assistant-head"><span className="assistant-mark"><Sparkles size={16}/></span><b>{t("AI-assistent")}</b><button className="iconbtn" aria-label={t("Sluiten")} onClick={onClose}><X size={16}/></button></div>
  {!studentId&&<select className="field" value={sel} onChange={e=>{setSel(e.target.value);setPlan(null)}} aria-label={teacher?t("Leerling"):t("Les")}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
  {!students.length&&!studentId&&<p className="muted">{teacher?t("Voeg eerst een leerling toe."):t("Nog geen les gekoppeld.")}</p>}
  {(sel||studentId)&&<div className="assistant-actions">
   {teacher?<>
    <button className="assistant-action" disabled={busy} onClick={()=>void prepare()}><CalendarCheck size={17}/><span><b>{t("Bereid volgende les voor")}</b><small>{t("Op basis van goedgekeurde analyses, woorden en leerdoelen")}</small></span></button>
    <Link className="assistant-action" href={`${base}&tab=huiswerk`} onClick={onClose}><ClipboardList size={17}/><span><b>{t("Maak huiswerk")}</b><small>{t("Genereer, pas aan en wijs officieel toe")}</small></span><ArrowRight size={14}/></Link>
    <Link className="assistant-action" href={`${base}&tab=analyses`} onClick={onClose}><FileText size={17}/><span><b>{t("Bekijk lesanalyse")}</b><small>{t("Concepten controleren en goedkeuren")}</small></span><ArrowRight size={14}/></Link>
    <Link className="assistant-action" href={`${base}&tab=woorden`} onClick={onClose}><Languages size={17}/><span><b>{t("Maak vocabulaire")}</b><small>{t("Woordenlijst van deze leerling beheren")}</small></span><ArrowRight size={14}/></Link>
    <Link className="assistant-action" href={`/klaslokaal/live?student=${sel}`} onClick={onClose}><Wand2 size={17}/><span><b>{t("Orden notities")}</b><small>{t("In het klaslokaal via ✨ → Orden notities (eerst voorbeeld)")}</small></span><ArrowRight size={14}/></Link>
   </>:<>
    <Link className="assistant-action" href={`/oefenen?student=${sel}`} onClick={onClose}><ClipboardList size={17}/><span><b>{t("Maak mijn huiswerk")}</b><small>{t("Oefeningen op basis van jouw lessen en fouten")}</small></span><ArrowRight size={14}/></Link>
    <Link className="assistant-action" href={`/oefenen?student=${sel}`} onClick={onClose}><Gamepad2 size={17}/><span><b>{t("Oefen woorden")}</b><small>{t("Spelletjes met je woordenlijst")}</small></span><ArrowRight size={14}/></Link>
    <Link className="assistant-action" href={`${base}&tab=analyses`} onClick={onClose}><FileText size={17}/><span><b>{t("Bekijk lessamenvattingen")}</b><small>{t("Door je docent goedgekeurd")}</small></span><ArrowRight size={14}/></Link>
   </>}
  </div>}
  {busy&&<div className="loader small"/>}
  {err&&<p className="notice">{err}</p>}
  {plan&&<div className="plan"><h4>{t("Focus")}</h4><p>{plan.focus}</p>
   {!!plan.warmup.length&&<><h4>{t("Opwarmen")}</h4><ul>{plan.warmup.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
   {!!plan.review.length&&<><h4>{t("Herhalen")}</h4><ul>{plan.review.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
   {!!plan.activities.length&&<><h4>{t("Lesopbouw")}</h4><ol>{plan.activities.map((a,i)=><li key={i}><b>{a.title}</b> <small className="muted">{a.minutes} {t("min")}</small><br/>{a.description}</li>)}</ol></>}
   {!!plan.vocabulary.length&&<><h4>{t("Woorden")}</h4><p>{plan.vocabulary.join(' · ')}</p></>}
   {plan.homework_check&&<><h4>{t("Huiswerk bespreken")}</h4><p>{plan.homework_check}</p></>}
   <p className="muted small-print">{t("AI-voorstel ·")} {plan.data_note}</p></div>}
 </aside>
}

export function AssistantLauncher(){
 const [open,setOpen]=useState(false);
 return <>{!open&&<button className="assistant-fab" onClick={()=>setOpen(true)} title={t("AI-assistent")} aria-label={t("AI-assistent openen")}><Sparkles size={20}/></button>}{open&&<AssistantPanel onClose={()=>setOpen(false)}/>}</>
}
