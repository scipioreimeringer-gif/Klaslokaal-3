'use client';
import {useCallback,useEffect,useState} from 'react';
import {Plus,Trash2,Route} from 'lucide-react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {supabase} from '../../lib/supabase';
import {LEVELS,SKILLS,SUBJECTS,type Goal} from '../../lib/learning';
import {t} from '../../lib/i18n';

export default function Leerlijnen(){
 const {user,canTeach,mode}=useAuth();const [subject,setSubject]=useState('nl');const [goals,setGoals]=useState<Goal[]>([]);const [err,setErr]=useState('');const [nt,setNt]=useState({title:'',description:'',level:'A1',skill:'grammatica'});
 const load=useCallback(async()=>{const r=await supabase()!.from('curriculum_goals').select('*').eq('subject',subject).order('sort');if(r.error){setErr(/curriculum_goals/.test(r.error.message)||r.error.code==='PGRST205'?t("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):r.error.message);return}setErr('');setGoals((r.data||[]) as Goal[])},[subject]);
 useEffect(()=>{void load()},[load]);
 async function add(){if(!nt.title.trim()||!user)return;const r=await supabase()!.from('curriculum_goals').insert({subject,level:nt.level,skill:nt.skill,title:nt.title.trim(),description:nt.description.trim(),owner_teacher:user.id,sort:999});if(r.error)setErr(r.error.message);else{setNt({...nt,title:'',description:''});await load()}}
 async function del(g:Goal){if(!confirm(t("Eigen leerdoel \"{0}\" verwijderen? De voortgang van leerlingen op dit doel wordt ook verwijderd.", g.title)))return;await supabase()!.from('curriculum_goals').delete().eq('id',g.id);await load()}
 async function rename(g:Goal,title:string){if(!title.trim()||title===g.title)return;await supabase()!.from('curriculum_goals').update({title:title.trim()}).eq('id',g.id);await load()}
 if(!canTeach||mode!=='teacher')return <Nav><div className="notice">{t("Leerlijnen beheer je in je docentprofiel.")}</div></Nav>;
 return <Nav>
  <div className="page-head"><div><p className="eyebrow-dark">{t("DOCENT")}</p><h1><Route size={24}/> {t("Leerlijnen")}</h1><p className="muted">{t("Standaardleerlijn op basis van het ERK/CEFR (A0 optioneel, voorbereidend) aangevuld met je eigen leerdoelen. Voortgang per leerling zet je in het leerlingprofiel, tab Leerdoelen.")}</p></div>
   <select className="field" value={subject} onChange={e=>setSubject(e.target.value)}>{Object.entries(SUBJECTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {err&&<div className="notice">{err}</div>}
  <section className="card"><h3><Plus size={17}/> {t("Eigen leerdoel toevoegen")}</h3>
   <form className="row" onSubmit={e=>{e.preventDefault();void add()}}><input className="field grow" placeholder={t("Titel, bijv. 'Gesprek bij de huisarts'")} value={nt.title} onChange={e=>setNt({...nt,title:e.target.value})}/><input className="field grow" placeholder={t("Toelichting (optioneel)")} value={nt.description} onChange={e=>setNt({...nt,description:e.target.value})}/><select className="field" value={nt.level} onChange={e=>setNt({...nt,level:e.target.value})}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select><select className="field" value={nt.skill} onChange={e=>setNt({...nt,skill:e.target.value})}>{SKILLS.map(s=><option key={s}>{s}</option>)}</select><button className="button" type="submit">{t("Toevoegen")}</button></form></section>
  {LEVELS.map(l=>{const its=goals.filter(g=>g.level===l);if(!its.length)return null;return <section key={l} className="card goal-level"><h3>{l}{l==='A0'&&<small className="muted"> {t("· voorbereidend, geen officieel ERK-niveau")}</small>}</h3>
   {SKILLS.map(sk=>{const s=its.filter(g=>g.skill===sk);if(!s.length)return null;return <div key={sk} className="goal-skill"><span className="tag">{sk}</span><ul>{s.map(g=><li key={g.id} className="goal">
    {g.owner_teacher===user?.id?<input className="cell grow" defaultValue={g.title} onBlur={e=>void rename(g,e.target.value)}/>:<span className="grow"><b>{g.title}</b>{g.description&&<small className="muted block">{g.description}</small>}</span>}
    {g.owner_teacher?<><span className="tag own">{t("eigen doel")}</span><button className="iconbtn danger" title={t("Verwijderen")} onClick={()=>void del(g)}><Trash2 size={14}/></button></>:<span className="tag">{t("standaard")}</span>}</li>)}</ul></div>})}
  </section>})}
 </Nav>
}
