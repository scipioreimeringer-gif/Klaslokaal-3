'use client';
import {useCallback,useEffect,useRef,useState,Suspense} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Video,Link2,ArrowLeft,Plus,Copy,FileText,UserCheck,UserX,Languages as LangIcon} from 'lucide-react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {StudentWorkspace} from '../../components/StudentData';
import {supabase} from '../../lib/supabase';
import {useQueryParam} from '../../lib/useQuery';
import {loadStudents,MIGRATION_HINT,type StudentRecord} from '../../lib/data';
import {Avatar} from '../../components/Avatar';
import {Flag} from '../../components/Flag';
import {LANGUAGES,languageName} from '../../lib/languages';
import {subjectOf} from '../../lib/learning';
import {t} from '../../lib/i18n';

type Field='notes'|'goals'|'homework'|'history';
const FIELDS:[Field,string,string][]=[['goals','Leerdoelen','Wat wil deze leerling bereiken?'],['notes','Algemene notities en feedback','Zichtbaar voor de leerling'],['homework','Algemeen huiswerk','Zichtbaar voor de leerling'],['history','Lesgeschiedenis (vrije tekst)','Oudere aantekeningen; nieuwe lessen worden automatisch per datum bewaard']];


/** Language of one teacher–student relation: shown explicitly, can be fixed, and extra languages can be added (own lesson data each). */
function LanguageSettings({s,onChanged,onOpen}:{s:StudentRecord;onChanged:()=>void;onOpen:(id:string)=>void}){
 const derived=subjectOf(s);const explicit=!!s.curriculum_subject;
 const [msg,setMsg]=useState('');const [add,setAdd]=useState('');const [busy,setBusy]=useState(false);
 async function setLanguage(v:string){if(!v||v===s.curriculum_subject)return;if(explicit&&!confirm(t('De taal van deze leerling wijzigen naar {0}? De bestaande lesgegevens blijven bij deze leerling.',languageName(v))))return;
  const {error}=await supabase()!.from('students').update({curriculum_subject:v,updated_at:new Date().toISOString()}).eq('id',s.id);
  setMsg(error?(/duplicate|unique/i.test(error.message)?t('Deze leerling volgt {0} al bij jou als aparte taal. Open die taal in je leerlingenlijst.',languageName(v)):error.message):t('Taal opgeslagen: {0}. De leerling ziet dit na het (opnieuw) laden van het dashboard.',languageName(v)));if(!error)onChanged()}
 async function addLanguage(){if(!add)return;setBusy(true);const {data,error}=await supabase()!.rpc('teacher_add_language',{p_source:s.id,p_language:add});setBusy(false);
  if(error){setMsg(/LANGUAGE_EXISTS/.test(error.message)?t('Deze leerling volgt {0} al bij jou.',languageName(add)):/teacher_add_language|function/i.test(error.message)?t('Voer eerst supabase/v31.sql uit.'):error.message);return}
  setAdd('');onChanged();onOpen(data as string)}
 return <section className="card lang-settings"><h3><LangIcon size={17}/> {t('Taal van deze lessen')}</h3>
  {!explicit&&<p className="notice">{t('De taal is nog niet vastgezet. Nu wordt {0} getoond (afgeleid van het vak of van de Lestaal in het klaslokaal). Kies hieronder de taal die je deze leerling geeft.',languageName(derived))}</p>}
  <div className="row"><Flag code={derived} size={26}/><select className="field" aria-label={t('Taal van deze lessen')} value={explicit?s.curriculum_subject!:''} onChange={e=>void setLanguage(e.target.value)}>{!explicit&&<option value="">{t('Kies de taal…')}</option>}{LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
  <p className="muted small">{t('De leerling ziet deze taal op het dashboard onder Mijn talen. De taal van de website staat hier los van.')}</p>
  <div className="row"><select className="field" aria-label={t('Nog een taal geven aan deze leerling…')} value={add} onChange={e=>setAdd(e.target.value)}><option value="">{t('Nog een taal geven aan deze leerling…')}</option>{LANGUAGES.filter(l=>l.code!==derived).map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select><button className="button small" disabled={!add||busy} onClick={()=>void addLanguage()}>{t('Taal toevoegen')}</button></div>
  <p className="muted small">{t('Een extra taal krijgt eigen lesgegevens; er wordt niets gekopieerd of verwijderd. Is de leerling al gekoppeld, dan verschijnt de nieuwe taal meteen op het dashboard van de leerling.')}</p>
  {msg&&<p className="muted" role="status">{msg}</p>}</section>
}

function Page(){
 const {user,mode,canTeach}=useAuth();const router=useRouter();const selected=useQueryParam('student')||'';const wantNew=useQueryParam('nieuw')==='1';const tab=useQueryParam('tab');
 const [items,setItems]=useState<StudentRecord[]>([]);const [name,setName]=useState('');const [email,setEmail]=useState('');const [subject,setSubject]=useState('');const [lang,setLangRaw]=useState('nl');const setLang=(v:string)=>setLangRaw(v);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [inviteLink,setInviteLink]=useState('');const [saveState,setSaveState]=useState('');
 const timers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});const nameRef=useRef<HTMLInputElement>(null);const [showArchived,setShowArchived]=useState(false);
 async function setArchived(s:StudentRecord,archive:boolean){const {error}=await supabase()!.from('students').update({archived_at:archive?new Date().toISOString():null}).eq('id',s.id);if(error){setMessage(/archived_at/.test(error.message)?t("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):error.message);return}setMessage(archive?t("{0} is gearchiveerd. Alle gegevens blijven bewaard.", s.name):t("{0} is weer actief.", s.name));await load();if(archive)select('')}
 async function unlink(s:StudentRecord){if(!confirm(t("De koppeling met het account van {0} beëindigen?\n\nJij houdt alle lesgegevens; de leerling ziet dit profiel niet meer. Je kunt later opnieuw uitnodigen.", s.name)))return;const {error}=await supabase()!.rpc('teacher_unlink_student',{target:s.id});setMessage(error?error.message:t("Koppeling beëindigd."));await load()}
 async function hardDelete(s:StudentRecord){const typed=prompt(t("DEFINITIEF VERWIJDEREN\n\nDit verwijdert bij jou: lesnotities, bord en canvas, woordenlijst, leerdoelen, huiswerk, oefenresultaten, analyses en opnames van {0}. Dit kan niet ongedaan worden gemaakt.\nHet Google-account van de leerling en gegevens bij andere docenten blijven bestaan.\n\nTyp de naam \"{1}\" om te bevestigen:", s.name, s.name));if(typed===null)return;if(typed.trim()!==s.name.trim()){setMessage(t("Naam kwam niet overeen; niets verwijderd."));return}
  const db=supabase()!;let recs=await db.from('lesson_recordings').select('storage_path,teacher_track_path,student_track_path').eq('student_id',s.id);if(recs.error)recs=await db.from('lesson_recordings').select('storage_path').eq('student_id',s.id) as typeof recs;const files=(recs.data||[]).flatMap(r=>[r.storage_path,r.teacher_track_path,r.student_track_path]).filter(Boolean) as string[];if(files.length)await db.storage.from('recordings').remove(files);
  const {error}=await db.from('students').delete().eq('id',s.id);setMessage(error?t("Verwijderen mislukt: ")+error.message:t("{0} en alle bijbehorende lesgegevens zijn verwijderd.", s.name));if(!error){select('');await load()}}
 const load=useCallback(async()=>{const db=supabase();if(!db||!user)return;const r=await loadStudents(db,{teacherId:user.id});if(r.error)setMessage(r.error);else if(!r.v27)setMessage(t(MIGRATION_HINT));setItems(r.data)},[user]);
 useEffect(()=>{void load()},[load]);useEffect(()=>{setInviteLink('');setSaveState('')},[selected]);useEffect(()=>{if(wantNew)nameRef.current?.focus()},[wantNew]);
 const current=items.find(x=>x.id===selected);
 const select=(id:string)=>router.push(id?'/leerlingen?student='+id:'/leerlingen');
 async function add(){const db=supabase();if(!db||!user||!name.trim()||!email.trim())return;setBusy(true);const lc=lang==='-'?'':lang;const row:{teacher_id:string;name:string;email:string;subject:string;curriculum_subject?:string}={teacher_id:user.id,name:name.trim(),email:email.trim().toLowerCase(),subject:subject.trim()||(lc?languageName(lc):'')};let {data,error}=await db.from('students').insert(lc?{...row,curriculum_subject:lc}:row).select('id').single();if(error&&/curriculum_subject/.test(error.message))({data,error}=await db.from('students').insert(row).select('id').single());setBusy(false);if(error){setMessage(/duplicate|unique/i.test(error.message)?(lc?t("Deze leerling volgt {0} al bij jou. Kies een andere taal of open de bestaande leerling.", languageName(lc)):t("Deze leerling (dit e-mailadres) staat al in je lijst.")):error.message);return}setMessage(t("Leerling opgeslagen. Als dit e-mailadres al een account heeft, ziet de leerling na inloggen een uitnodiging om te accepteren."));setName('');setEmail('');setSubject('');setLang('nl');await load();if(data)select(data.id)}
 async function invite(){if(!current)return;setBusy(true);const {data,error}=await supabase()!.rpc('create_student_invitation',{target_student:current.id});setBusy(false);if(error){setMessage(t("Uitnodiging mislukt: ")+error.message);return}setInviteLink(window.location.origin+'/uitnodiging?token='+encodeURIComponent(data));}
 function edit(field:Field,value:string){if(!current)return;const id=current.id;setItems(a=>a.map(x=>x.id===id?{...x,[field]:value}:x));setSaveState(t("Wijzigingen…"));clearTimeout(timers.current[field]);timers.current[field]=setTimeout(async()=>{const {error}=await supabase()!.from('students').update({[field]:value,updated_at:new Date().toISOString()}).eq('id',id);setSaveState(error?t("Opslaan mislukt: ")+error.message:t("Opgeslagen ✓"))},700)}
 if(!canTeach||mode!=='teacher')return <div className="notice">{t("Leerlingbeheer is alleen beschikbaar in je docentprofiel")}{canTeach?t(" — wissel rechtsboven naar \"Docent\"."):'.'}</div>;
 if(current)return <>
  <div className="page-head"><div><button className="backlink" onClick={()=>select('')}><ArrowLeft size={15}/> {t("Alle leerlingen")}</button><h1>{current.name}</h1><p className="muted">{[current.subject,current.level,current.email].filter(Boolean).join(' · ')}</p></div>
   <div className="row"><Link className="button" href={'/klaslokaal/live?student='+encodeURIComponent(current.id)}><Video size={16}/> {t("Live les starten")}</Link><Link className="button secondary" href={'/lesruimte?student='+encodeURIComponent(current.id)}><FileText size={16}/> {t("Tekstbord")}</Link>{!current.user_id&&<button className="button secondary" disabled={busy} onClick={()=>void invite()}><Link2 size={16}/> {t("Uitnodigingslink")}</button>}</div></div>
  <div className={'link-state '+(current.user_id?'ok':'wait')}>{current.user_id?<><UserCheck size={16}/> {t("Gekoppeld aan het account van de leerling.")}</>:<><UserX size={16}/> {t("Nog niet gekoppeld. De leerling ziet een uitnodiging zodra hij of zij inlogt met {0}. Je kunt ook een uitnodigingslink sturen.", current.email)}</>}</div>
  <LanguageSettings key={current.id+(current.curriculum_subject||'')} s={current} onChanged={()=>void load()} onOpen={id=>select(id)}/>
  {message&&<p className="muted" role="status">{message}</p>}
  {inviteLink&&<section className="card invite"><h3>{t("Persoonlijke uitnodigingslink")}</h3><p className="muted">{t("7 dagen geldig en één keer te gebruiken. De leerling logt in met {0}. Deel de link niet openbaar.", current.email)}</p><div className="row"><input className="field grow" readOnly value={inviteLink} onFocus={e=>e.target.select()}/><button className="button" onClick={()=>void navigator.clipboard.writeText(inviteLink)}><Copy size={15}/> {t("Kopieer")}</button></div></section>}
  {current.archived_at&&<div className="notice">{t("Deze leerling is gearchiveerd en staat niet in je actieve lijst.")} <button className="button small" onClick={()=>void setArchived(current,false)}>{t("Herstellen")}</button></div>}
  <StudentWorkspace studentId={current.id} viewer="teacher" student={current} initialTab={tab} intro={<section className="card"><div className="row between"><h3>{t("Profielgegevens")}</h3><small className="muted" role="status">{saveState}</small></div><div className="grid2">{FIELDS.map(([f,l,ph])=><label key={f} className="stack"><span className="label">{t(l)}</span><textarea className="field" rows={4} placeholder={ph} value={current[f]||''} onChange={e=>edit(f,e.target.value)}/></label>)}</div></section>}/>
  <section className="card danger-zone"><h3>{t("Leerling beheren")}</h3><div className="manage-grid">
   <div><b>{current.archived_at?t("Herstellen"):t("Archiveren")}</b><p className="muted">{current.archived_at?t("Zet de leerling terug in je actieve lijst."):t("Haalt de leerling uit je actieve lijst. Alle gegevens blijven bewaard en de leerling houdt toegang.")}</p><button className="button secondary small" onClick={()=>void setArchived(current,!current.archived_at)}>{current.archived_at?t("Herstellen"):t("Archiveren")}</button></div>
   <div><b>{t("Ontkoppelen")}</b><p className="muted">{t("Beëindigt de koppeling met het account van de leerling. Jij houdt de lesgegevens; de leerling ziet dit profiel niet meer.")}</p><button className="button secondary small" disabled={!current.user_id} onClick={()=>void unlink(current)}>{t("Ontkoppelen")}</button></div>
   <div><b>{t("Definitief verwijderen")}</b><p className="muted">{t("Verwijdert alle lesgegevens van deze leerling bij jou, inclusief opnames. Het account van de leerling en relaties met andere docenten blijven bestaan. Huiswerkbijlagen die de leerling zelf uploadde, blijven in de opslag van de leerling.")}</p><button className="button danger small" onClick={()=>void hardDelete(current)}>{t("Definitief verwijderen…")}</button></div>
  </div></section>
 </>;
 const active=items.filter(s=>!s.archived_at),archived=items.filter(s=>s.archived_at),listed=showArchived?archived:active;
 return <>
  <div className="page-head"><div><h1>{t("Mijn leerlingen")}</h1><p className="muted">{t("Elke leerling heeft een eigen klaslokaal met bord, notities, woorden, huiswerk en opnames.")}</p></div></div>
  {message&&<p className="muted" role="status">{message}</p>}
  <section className="card"><h3><Plus size={17}/> {t("Leerling toevoegen")}</h3><p className="muted">{t("Gebruik het e-mailadres waarmee de leerling inlogt (bijvoorbeeld Google). Iemand die zelf docent is, kan zo ook bij jou leerling zijn met hetzelfde account.")}</p>
   <form className="row" onSubmit={e=>{e.preventDefault();void add()}}><input ref={nameRef} className="field" placeholder={t("Naam")} value={name} onChange={e=>setName(e.target.value)} required/><input className="field" type="email" placeholder={t("E-mailadres")} value={email} onChange={e=>setEmail(e.target.value)} required/><select className="field" aria-label={t("Taal")} value={lang} onChange={e=>setLang(e.target.value)}><option value="">{t("Taal kiezen…")}</option>{LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}<option value="-">{t("Ander vak (geen taal)")}</option></select><input className="field" placeholder={t("Vak / niveau (optioneel), bijv. B1")} value={subject} onChange={e=>setSubject(e.target.value)}/><button className="button" disabled={busy} type="submit">{t("Toevoegen")}</button></form></section>
  <div className="chipbar list-toggle"><button aria-pressed={!showArchived} onClick={()=>setShowArchived(false)}>{t("Actief ({0})", active.length)}</button><button aria-pressed={showArchived} onClick={()=>setShowArchived(true)}>{t("Gearchiveerd ({0})", archived.length)}</button></div>
  <div className="profile-grid">{listed.map(s=><button className={'profile-student'+(s.archived_at?' archived':'')} key={s.id} onClick={()=>select(s.id)}><Avatar className="avatar" userId={s.user_id} name={s.name} size={40}/><span className="grow"><strong>{s.name}</strong><small><Flag code={subjectOf(s)} size={16}/> {languageName(subjectOf(s))}{!s.curriculum_subject&&<em className="lang-unset"> · {t('taal niet vastgezet')}</em>} · {s.user_id?t("gekoppeld"):t("niet gekoppeld")}</small></span><span aria-hidden>›</span></button>)}</div>
  {!listed.length&&<p className="muted">{showArchived?t("Geen gearchiveerde leerlingen."):t("Nog geen actieve leerlingen.")}</p>}
 </>
}
export default function Students(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
