'use client';
import {useCallback,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useQueryParam} from '../lib/useQuery';
import {loadStudents} from '../lib/data';
import Link from 'next/link';
import {Plus,ChevronRight,Video,X,BookOpen,Trash2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {useAuth} from './Auth';
import {Flag} from './Flag';
import {Avatar,usePeople} from './Avatar';
import {LANGUAGES,LEVELS,languageName,ownLearningCards,cardStats,type LanguageCard,type SelfLanguage} from '../lib/languages';
import type {StudentRecord} from '../lib/data';
import {t} from '../lib/i18n';

/** Self-study languages of the logged-in account (v29). Missing table → empty list + flag. */
export function useSelfLanguages(){
 const {user}=useAuth();const [items,setItems]=useState<SelfLanguage[]>([]);const [ready,setReady]=useState(true);const [loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{if(!user)return;const {data,error}=await supabase()!.from('student_languages').select('id,language,level').order('created_at');if(error){setReady(false);setItems([])}else{setReady(true);setItems((data||[]) as SelfLanguage[])}setLoaded(true)},[user]);
 useEffect(()=>{void load()},[load]);
 return {items,ready,loaded,reload:load};
}

export function teacherLabel(card:LanguageCard<StudentRecord>,teacherName:(id:string)=>string){
 const names=card.relations.map(r=>teacherName(r.id)).filter(Boolean);
 return names.length?names.join(', '):t('Zelfstudie (nog geen docent)');
}

export function MyLanguages({lessons,vocab,loaded,teacherName}:{students?:StudentRecord[];lessons:{student_id:string}[];vocab:{student_id:string;status:string}[];loaded:boolean;teacherName:(id:string)=>string}){
 // exactly the same list as the sidebar (one source: useMyLanguageCards)
 const mine=useMyLanguageCards();const [adding,setAdding]=useState(false);const cards=mine.cards;const self={loaded:mine.loaded,ready:mine.selfReady};
 return <section className="panel my-languages"><div className="panelheader"><div><h2>{t("Mijn talen")}</h2><p>{t("Elke taal heeft een eigen omgeving. Gegevens per docent blijven gescheiden.")}</p></div><button className="button small" onClick={()=>setAdding(true)}><Plus size={15}/> {t("Taal toevoegen")}</button></div>
  {!loaded||!self.loaded?<div className="loader small"/>:!cards.length?<div className="emptystate"><BookOpen size={30}/><strong>{t("Nog geen talen")}</strong><p>{t("Voeg een taal toe die je leert, of accepteer de uitnodiging van je docent.")}</p></div>:
  <LanguageCards cards={cards} lessons={lessons} vocab={vocab} teacherName={teacherName}/>}
  {!self.ready&&<p className="small-print muted">{t("Zelf talen toevoegen kan zodra de database-update v29 is uitgevoerd.")}</p>}
  {adding&&<AddLanguage existing={cards} onClose={()=>setAdding(false)} onAdded={()=>{setAdding(false);languagesChanged()}} ready={self.ready}/>}
 </section>
}

export function LanguageCards({cards,lessons,vocab,teacherName}:{cards:LanguageCard<StudentRecord>[];lessons:{student_id:string}[];vocab:{student_id:string;status:string}[];teacherName:(id:string)=>string}){
 return <div className="lang-grid">{cards.map(c=>{const st=cardStats(c,lessons,vocab);return <Link className="lang-card" key={c.code} href={'/mijn-profiel?taal='+c.code}>
   <div className="lang-top"><Flag code={c.code} size={40}/><div className="grow"><strong>{languageName(c.code)}</strong><small>{c.level?t("Niveau {0}", c.level):t("Niveau nog onbekend")}</small></div><ChevronRight size={18}/></div>
   <div className="lang-teachers">{c.relations.length?<TeacherFaces card={c} teacherName={teacherName}/>:<span className="muted small">{t("Zelfstudie · nog geen docent")}</span>}</div>
   <div className="lang-stats"><span><b>{st.lessons}</b> {st.lessons===1?t("les"):t("lessen")}</span><span>{st.pct===null?t("Nog geen woorden"):<><b>{st.mastered}</b>/{st.words} {t("woorden beheerst")}</>}</span></div>
   {st.pct!==null&&<div className="lang-progress" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Woorden beheerst")}><span style={{width:st.pct+'%'}}/></div>}
   <span className="button small light lang-open">{t("Openen")}</span>
  </Link>})}</div>
}

function TeacherFaces({card,teacherName}:{card:LanguageCard<StudentRecord>;teacherName:(id:string)=>string}){
 return <span className="faces">{card.relations.map(r=><span key={r.id} className="face"><Avatar userId={r.teacher_id} name={teacherName(r.id)||'D'} size={24}/><span>{teacherName(r.id)||t("Docent")}</span></span>)}</span>
}

export function AddLanguage({existing,onClose,onAdded,ready}:{existing:LanguageCard[];onClose:()=>void;onAdded:()=>void;ready:boolean}){
 const [code,setCode]=useState('');const [level,setLevel]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 const have=new Set(existing.map(c=>c.code));
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
 async function add(){if(!code)return;if(have.has(code)){setMsg(t("{0} staat al in je talen.", languageName(code)));return}setBusy(true);const {error}=await supabase()!.from('student_languages').insert({language:code,level:level||null});setBusy(false);
  if(error){setMsg(/duplicate|unique/i.test(error.message)?t("Deze taal staat al in je talen."):/student_languages/.test(error.message)?t("De database-update v29 is nog niet uitgevoerd."):error.message);return}onAdded()}
 return <div className="modal-scrim" onClick={onClose}><div className="modal card" role="dialog" aria-modal="true" aria-label={t("Taal toevoegen")} onClick={e=>e.stopPropagation()}>
  <div className="row between"><h3>{t("Een taal toevoegen die ik zelf leer")}</h3><button className="iconbtn" aria-label={t("Sluiten")} onClick={onClose}><X size={18}/></button></div>
  <p className="muted">{t("Dit voegt alleen een leertaal toe aan je eigen leerlingprofiel. Talen die je als docent geeft, beheer je in je docentprofiel en verschijnen hier niet.")} {t("Je kunt een taal ook zonder docent toevoegen. Een docent kan je later uitnodigen voor dezelfde taal.")}</p>
  <div className="lang-pick">{LANGUAGES.map(l=><button key={l.code} type="button" aria-pressed={code===l.code} disabled={have.has(l.code)} onClick={()=>{setCode(l.code);setMsg('')}}><Flag code={l.code} size={30}/><span>{l.name}</span>{have.has(l.code)&&<small>{t("al toegevoegd")}</small>}</button>)}</div>
  <label className="stack"><span className="label">{t("Mijn niveau (optioneel)")}</span><select className="field" value={level} onChange={e=>setLevel(e.target.value)}><option value="">{t("Weet ik nog niet")}</option>{LEVELS.map(l=><option key={l} value={l}>{l}</option>)}</select></label>
  {msg&&<p className="notice" role="status">{msg}</p>}
  <div className="row"><button className="button" disabled={!code||busy||!ready} onClick={()=>void add()}>{busy?t("Toevoegen…"):t("Toevoegen")}</button><button className="button secondary" onClick={onClose}>{t("Annuleren")}</button></div>
 </div></div>
}

/** Header of one language environment: flag, level, teachers (switch between relations). */
export function LanguageHeader({card,current,teacherName,onPick}:{card:LanguageCard<StudentRecord>;current:StudentRecord|null;teacherName:(id:string)=>string;onPick:(id:string)=>void}){
 const people=usePeople();
 return <div className="lang-hero">
  <Flag code={card.code} size={52}/>
  <div className="grow"><p className="eyebrow-dark">{t("MIJN TAAL")}</p><h1>{languageName(card.code)}</h1><p className="muted">{card.level?t("Niveau {0}", card.level):t("Niveau nog onbekend")} · {card.relations.length?`${card.relations.length} ${card.relations.length===1?t("docent"):t("docenten")}`:t("zelfstudie")}</p></div>
  {current&&<Link className="button" href={'/klaslokaal/live?student='+current.id}><Video size={16}/> {t("Naar de live les")}</Link>}
  {card.relations.length>1&&<div className="teacher-tabs" role="tablist" aria-label={t("Kies je docent")}>{card.relations.map(r=>{const tp=people.get(r.teacher_id);return <button key={r.id} role="tab" aria-selected={current?.id===r.id} onClick={()=>onPick(r.id)}><Avatar userId={r.teacher_id} name={teacherName(r.id)||'D'} size={26}/><span>{teacherName(r.id)||t("Docent")}</span>{tp?.teaching_languages?.length?<small>{tp.teaching_languages.map(languageName).join(', ')}</small>:null}</button>})}</div>}
 </div>
}

/** A language that is BOTH taught by a teacher and added as self-study: remove only the self-study entry. */
export function SelfStudyExtra({card}:{card:LanguageCard<StudentRecord>}){
 const [msg,setMsg]=useState('');
 if(!card.self||!card.relations.length)return null;
 async function remove(){if(!confirm(t('De zelfstudie-markering voor {0} verwijderen? Je lessen, woorden, huiswerk en opnames bij je docent blijven bewaard.',languageName(card.code))))return;
  const {error}=await supabase()!.from('student_languages').delete().eq('id',card.self!.id);if(error)setMsg(error.message);else languagesChanged()}
 return <div className="notice self-extra"><span>{t('Je hebt {0} ook zelf als zelfstudietaal toegevoegd. Dat is niet nodig: je lessen bij je docent staan hier al.',languageName(card.code))}</span> <button className="button small secondary" onClick={()=>void remove()}><Trash2 size={14}/> {t('Alleen zelfstudie verwijderen')}</button>{msg&&<small className="danger-text">{msg}</small>}</div>
}

/** Language without teacher: level + what to do next. */
export function SelfStudy({card,onChanged}:{card:LanguageCard<StudentRecord>;onChanged:()=>void}){
 const [level,setLevel]=useState(card.self?.level||'');const [msg,setMsg]=useState('');
 async function save(v:string){setLevel(v);const {error}=await supabase()!.from('student_languages').update({level:v||null}).eq('id',card.self!.id);setMsg(error?error.message:t("Niveau opgeslagen."));onChanged()}
 async function remove(){if(!card.self||!confirm(t("{0} uit je talen halen? Lessen bij docenten blijven bestaan.", languageName(card.code))))return;const {error}=await supabase()!.from('student_languages').delete().eq('id',card.self.id);if(error)setMsg(error.message);else{onChanged();languagesChanged()}}
 return <div className="grid2">
  <section className="card"><h3>{t("Zelfstudie")}</h3><p className="muted">{t("Je leert {0} nu zonder docent. Zodra een docent je uitnodigt voor deze taal (met het e-mailadres van dit account), verschijnen hier je lessen, woorden, huiswerk en opnames.", languageName(card.code))}</p>
   <label className="stack"><span className="label">{t("Mijn niveau")}</span><select className="field" value={level} onChange={e=>void save(e.target.value)}><option value="">{t("Weet ik nog niet")}</option>{LEVELS.map(l=><option key={l} value={l}>{l}</option>)}</select></label>
   {msg&&<p className="muted" role="status">{msg}</p>}</section>
  <section className="card"><h3>{t("Oefenen")}</h3><p className="muted">{card.code==='pt'?t("Bereid je voor met de Portugese basis en de werkwoordoefeningen."):t("Oefenmateriaal komt beschikbaar zodra je een docent hebt of woorden toevoegt in een les.")}</p>
   <div className="row">{card.code==='pt'&&<Link className="button small" href="/portugees">{t("Portugees voorbereiden")}</Link>}<Link className="button secondary small" href="/oefenen">{t("Naar Oefenen")}</Link></div>
   {card.self&&<button className="button secondary small danger-text" onClick={()=>void remove()}><Trash2 size={14}/> {t("Taal verwijderen")}</button>}</section>
 </div>
}

/* ---------------- sidebar: the logged-in student's own learning languages ---------------- */
// Same source as "Mijn talen" on the dashboard: the student's linked teacher relations (students.user_id = me,
// RLS-protected) plus self-study languages. Nothing hard-coded: a new language appears automatically.
const LANG_EVENT='teachy-languages-changed';
/** Call after a language was added/removed so the sidebar refreshes at once. */
export const languagesChanged=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event(LANG_EVENT))};
let sideCache:{uid:string;cards:LanguageCard<StudentRecord>[];selfReady:boolean}|null=null;
/** The logged-in account's own learning languages (single source for dashboard cards, sidebar and "Mijn lessen"). */
export function useMyLanguageCards(){
 const {user,studentLinks}=useAuth();
 const cached=user&&sideCache?.uid===user.id?sideCache:null;
 const [cards,setCards]=useState<LanguageCard<StudentRecord>[]>(()=>cached?.cards||[]);const [loaded,setLoaded]=useState(!!cached);const [selfReady,setSelfReady]=useState(cached?cached.selfReady:true);
 const [tick,setTick]=useState(0);
 useEffect(()=>{const f=()=>setTick(x=>x+1);window.addEventListener(LANG_EVENT,f);return()=>window.removeEventListener(LANG_EVENT,f)},[]);
 useEffect(()=>{const db=supabase();if(!user||!db)return;let off=false;void(async()=>{
  const [r,s]=await Promise.all([loadStudents(db,{userId:user.id}),db.from('student_languages').select('id,language,level').order('created_at')]);
  if(off)return;const c=ownLearningCards(r.data,(s.error?[]:(s.data||[])) as SelfLanguage[],user.id);sideCache={uid:user.id,cards:c,selfReady:!s.error};setCards(c);setSelfReady(!s.error);setLoaded(true)})();return()=>{off=true}},[user?.id,studentLinks.length,tick]);
 return {cards,loaded,selfReady,reload:languagesChanged};
}
export function SideLanguages({onNavigate}:{onNavigate:()=>void}){
 const {pendingLinks}=useAuth();const {cards}=useMyLanguageCards();const path=usePathname()||'';const taal=useQueryParam('taal');const sid=useQueryParam('student');
 const onLang=path.startsWith('/mijn-profiel');
 const current=!onLang?'':(taal||cards.find(c=>c.relations.some(r=>r.id===sid))?.code||cards[0]?.code||'');
 if(!cards.length&&!pendingLinks.length)return null;
 return <div className="side-langs">
  <div className="navlabel">{t('Mijn talen')}</div>
  <nav className="navlinks" aria-label={t('Mijn talen')}>
   {cards.map(c=><Link key={c.code} href={'/mijn-profiel?taal='+c.code} className={current===c.code?'active':''} aria-current={current===c.code?'page':undefined} onClick={onNavigate}>
    <Flag code={c.code} size={20}/><span className="grow">{languageName(c.code)}</span>{c.relations.length>1&&<small className="side-count" title={t('{0} docenten',c.relations.length)}>{c.relations.length}</small>}{!c.relations.length&&<small className="side-self">{t('zelfstudie')}</small>}</Link>)}
   {pendingLinks.length>0&&<Link href="/" className="side-invite" onClick={onNavigate}><span className="side-dot" aria-hidden/>{t('{0} uitnodiging(en) om te accepteren',pendingLinks.length)}</Link>}
  </nav>
 </div>
}
