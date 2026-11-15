'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {Plus,ChevronRight,Video,X,BookOpen,Trash2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {useAuth} from './Auth';
import {Flag} from './Flag';
import {Avatar,usePeople} from './Avatar';
import {LANGUAGES,LEVELS,languageName,buildLanguageCards,cardStats,type LanguageCard,type SelfLanguage} from '../lib/languages';
import type {StudentRecord} from '../lib/data';

/** Self-study languages of the logged-in account (v29). Missing table → empty list + flag. */
export function useSelfLanguages(){
 const {user}=useAuth();const [items,setItems]=useState<SelfLanguage[]>([]);const [ready,setReady]=useState(true);const [loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{if(!user)return;const {data,error}=await supabase()!.from('student_languages').select('id,language,level').order('created_at');if(error){setReady(false);setItems([])}else{setReady(true);setItems((data||[]) as SelfLanguage[])}setLoaded(true)},[user]);
 useEffect(()=>{void load()},[load]);
 return {items,ready,loaded,reload:load};
}

export function teacherLabel(card:LanguageCard<StudentRecord>,teacherName:(id:string)=>string){
 const names=card.relations.map(r=>teacherName(r.id)).filter(Boolean);
 return names.length?names.join(', '):'Zelfstudie (nog geen docent)';
}

export function MyLanguages({students,lessons,vocab,loaded,teacherName}:{students:StudentRecord[];lessons:{student_id:string}[];vocab:{student_id:string;status:string}[];loaded:boolean;teacherName:(id:string)=>string}){
 const self=useSelfLanguages();const [adding,setAdding]=useState(false);
 const cards=buildLanguageCards(students,self.items);
 return <section className="panel my-languages"><div className="panelheader"><div><h2>Mijn talen</h2><p>Elke taal heeft een eigen omgeving. Gegevens per docent blijven gescheiden.</p></div><button className="button small" onClick={()=>setAdding(true)}><Plus size={15}/> Taal toevoegen</button></div>
  {!loaded||!self.loaded?<div className="loader small"/>:!cards.length?<div className="emptystate"><BookOpen size={30}/><strong>Nog geen talen</strong><p>Voeg een taal toe die je leert, of accepteer de uitnodiging van je docent.</p></div>:
  <LanguageCards cards={cards} lessons={lessons} vocab={vocab} teacherName={teacherName}/>}
  {!self.ready&&<p className="small-print muted">Zelf talen toevoegen kan zodra de database-update v29 is uitgevoerd.</p>}
  {adding&&<AddLanguage existing={cards} onClose={()=>setAdding(false)} onAdded={()=>{setAdding(false);void self.reload()}} ready={self.ready}/>}
 </section>
}

export function LanguageCards({cards,lessons,vocab,teacherName}:{cards:LanguageCard<StudentRecord>[];lessons:{student_id:string}[];vocab:{student_id:string;status:string}[];teacherName:(id:string)=>string}){
 return <div className="lang-grid">{cards.map(c=>{const st=cardStats(c,lessons,vocab);return <Link className="lang-card" key={c.code} href={'/mijn-profiel?taal='+c.code}>
   <div className="lang-top"><Flag code={c.code} size={40}/><div className="grow"><strong>{languageName(c.code)}</strong><small>{c.level?'Niveau '+c.level:'Niveau nog onbekend'}</small></div><ChevronRight size={18}/></div>
   <div className="lang-teachers">{c.relations.length?<TeacherFaces card={c} teacherName={teacherName}/>:<span className="muted small">Zelfstudie · nog geen docent</span>}</div>
   <div className="lang-stats"><span><b>{st.lessons}</b> {st.lessons===1?'les':'lessen'}</span><span>{st.pct===null?'Nog geen woorden':<><b>{st.mastered}</b>/{st.words} woorden beheerst</>}</span></div>
   {st.pct!==null&&<div className="lang-progress" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Woorden beheerst"><span style={{width:st.pct+'%'}}/></div>}
   <span className="button small light lang-open">Openen</span>
  </Link>})}</div>
}

function TeacherFaces({card,teacherName}:{card:LanguageCard<StudentRecord>;teacherName:(id:string)=>string}){
 return <span className="faces">{card.relations.map(r=><span key={r.id} className="face"><Avatar userId={r.teacher_id} name={teacherName(r.id)||'D'} size={24}/><span>{teacherName(r.id)||'Docent'}</span></span>)}</span>
}

export function AddLanguage({existing,onClose,onAdded,ready}:{existing:LanguageCard[];onClose:()=>void;onAdded:()=>void;ready:boolean}){
 const [code,setCode]=useState('');const [level,setLevel]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 const have=new Set(existing.map(c=>c.code));
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 async function add(){if(!code)return;if(have.has(code)){setMsg(languageName(code)+' staat al in je talen.');return}setBusy(true);const {error}=await supabase()!.from('student_languages').insert({language:code,level:level||null});setBusy(false);
  if(error){setMsg(/duplicate|unique/i.test(error.message)?'Deze taal staat al in je talen.':/student_languages/.test(error.message)?'De database-update v29 is nog niet uitgevoerd.':error.message);return}onAdded()}
 return <div className="modal-scrim" onClick={onClose}><div className="modal card" role="dialog" aria-modal="true" aria-label="Taal toevoegen" onClick={e=>e.stopPropagation()}>
  <div className="row between"><h3>Taal toevoegen</h3><button className="iconbtn" aria-label="Sluiten" onClick={onClose}><X size={18}/></button></div>
  <p className="muted">Je kunt een taal ook zonder docent toevoegen. Een docent kan je later uitnodigen voor dezelfde taal.</p>
  <div className="lang-pick">{LANGUAGES.map(l=><button key={l.code} type="button" aria-pressed={code===l.code} disabled={have.has(l.code)} onClick={()=>{setCode(l.code);setMsg('')}}><Flag code={l.code} size={30}/><span>{l.name}</span>{have.has(l.code)&&<small>al toegevoegd</small>}</button>)}</div>
  <label className="stack"><span className="label">Mijn niveau (optioneel)</span><select className="field" value={level} onChange={e=>setLevel(e.target.value)}><option value="">Weet ik nog niet</option>{LEVELS.map(l=><option key={l} value={l}>{l}</option>)}</select></label>
  {msg&&<p className="notice" role="status">{msg}</p>}
  <div className="row"><button className="button" disabled={!code||busy||!ready} onClick={()=>void add()}>{busy?'Toevoegen…':'Toevoegen'}</button><button className="button secondary" onClick={onClose}>Annuleren</button></div>
 </div></div>
}

/** Header of one language environment: flag, level, teachers (switch between relations). */
export function LanguageHeader({card,current,teacherName,onPick}:{card:LanguageCard<StudentRecord>;current:StudentRecord|null;teacherName:(id:string)=>string;onPick:(id:string)=>void}){
 const people=usePeople();
 return <div className="lang-hero">
  <Flag code={card.code} size={52}/>
  <div className="grow"><p className="eyebrow-dark">MIJN TAAL</p><h1>{languageName(card.code)}</h1><p className="muted">{card.level?'Niveau '+card.level:'Niveau nog onbekend'} · {card.relations.length?`${card.relations.length} ${card.relations.length===1?'docent':'docenten'}`:'zelfstudie'}</p></div>
  {current&&<Link className="button" href={'/klaslokaal/live?student='+current.id}><Video size={16}/> Naar de live les</Link>}
  {card.relations.length>1&&<div className="teacher-tabs" role="tablist" aria-label="Kies je docent">{card.relations.map(r=>{const tp=people.get(r.teacher_id);return <button key={r.id} role="tab" aria-selected={current?.id===r.id} onClick={()=>onPick(r.id)}><Avatar userId={r.teacher_id} name={teacherName(r.id)||'D'} size={26}/><span>{teacherName(r.id)||'Docent'}</span>{tp?.teaching_languages?.length?<small>{tp.teaching_languages.map(languageName).join(', ')}</small>:null}</button>})}</div>}
 </div>
}

/** Language without teacher: level + what to do next. */
export function SelfStudy({card,onChanged}:{card:LanguageCard<StudentRecord>;onChanged:()=>void}){
 const [level,setLevel]=useState(card.self?.level||'');const [msg,setMsg]=useState('');
 async function save(v:string){setLevel(v);const {error}=await supabase()!.from('student_languages').update({level:v||null}).eq('id',card.self!.id);setMsg(error?error.message:'Niveau opgeslagen.');onChanged()}
 async function remove(){if(!card.self||!confirm(`${languageName(card.code)} uit je talen halen? Lessen bij docenten blijven bestaan.`))return;const {error}=await supabase()!.from('student_languages').delete().eq('id',card.self.id);if(error)setMsg(error.message);else onChanged()}
 return <div className="grid2">
  <section className="card"><h3>Zelfstudie</h3><p className="muted">Je leert {languageName(card.code)} nu zonder docent. Zodra een docent je uitnodigt voor deze taal (met het e-mailadres van dit account), verschijnen hier je lessen, woorden, huiswerk en opnames.</p>
   <label className="stack"><span className="label">Mijn niveau</span><select className="field" value={level} onChange={e=>void save(e.target.value)}><option value="">Weet ik nog niet</option>{LEVELS.map(l=><option key={l} value={l}>{l}</option>)}</select></label>
   {msg&&<p className="muted" role="status">{msg}</p>}</section>
  <section className="card"><h3>Oefenen</h3><p className="muted">{card.code==='pt'?'Bereid je voor met de Portugese basis en de werkwoordoefeningen.':'Oefenmateriaal komt beschikbaar zodra je een docent hebt of woorden toevoegt in een les.'}</p>
   <div className="row">{card.code==='pt'&&<Link className="button small" href="/portugees">Portugees voorbereiden</Link>}<Link className="button secondary small" href="/oefenen">Naar Oefenen</Link></div>
   {card.self&&<button className="button secondary small danger-text" onClick={()=>void remove()}><Trash2 size={14}/> Taal verwijderen</button>}</section>
 </div>
}
