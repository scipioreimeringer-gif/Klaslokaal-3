'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Languages} from 'lucide-react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {AvatarEditor,usePeople,refreshPeople} from '../../components/Avatar';
import {Flag} from '../../components/Flag';
import {supabase} from '../../lib/supabase';
import {LANGUAGES,languageName} from '../../lib/languages';
import {useMyLanguageCards} from '../../components/Languages';
import {useLearnerPrefs} from '../../components/LearnerPrefs';
import {Select} from '../../components/Select';
import {LVLS} from '../../lib/practice';
import {t} from '../../lib/i18n';

/** Teachers choose which languages they offer (a teacher may offer several). */
function TeachingLanguages(){
 const {user}=useAuth();const people=usePeople();const me=user?people.get(user.id):undefined;
 const [sel,setSel]=useState<string[]>([]);const [msg,setMsg]=useState('');
 useEffect(()=>{if(me)setSel(me.teaching_languages||[])},[me]);
 async function toggle(code:string){const next=sel.includes(code)?sel.filter(x=>x!==code):[...sel,code];setSel(next);const {error}=await supabase()!.rpc('set_my_teaching_languages',{langs:next});setMsg(error?(/function/i.test(error.message)?t("De database-update v29 is nog niet uitgevoerd."):error.message):t("Opgeslagen."));if(!error)refreshPeople()}
 return <section className="card"><h3><Languages size={17}/> {t("Talen die ik geef")}</h3><p className="muted">{t("Je leerlingen zien deze talen op je docentkaart. Per leerling kies je de taal bij het toevoegen; één leerling kan bij jou meerdere talen volgen.")}</p>
  <div className="lang-pick">{LANGUAGES.map(l=><button key={l.code} type="button" aria-pressed={sel.includes(l.code)} onClick={()=>void toggle(l.code)}><Flag code={l.code} size={30}/><span>{l.name}</span></button>)}</div>
  {msg&&<p className="muted" role="status">{msg}</p>}</section>
}

/** v54: the student's own level per learning language (used for "Voor mijn niveau" in Oefenen). Stored with the
 *  student's own account; the teacher's level stays visible as a reference and is not changed. */
function MyLevels(){
 const {cards,loaded}=useMyLanguageCards();const prefs=useLearnerPrefs();const [msg,setMsg]=useState('');
 async function save(code:string,v:string,selfId?:string){prefs.setLevel(code,v);
  if(selfId){const {error}=await supabase()!.from('student_languages').update({level:v||null}).eq('id',selfId);if(error){setMsg(error.message);return}}
  setMsg(t('Niveau voor {0} opgeslagen.',languageName(code)))}
 return <section className="card" id="talen"><h3><Languages size={17}/> {t('Mijn talen en niveaus')}</h3><p className="muted">{t('Je niveau per taal bepaalt de oefeningen bij Oefenen. Je kunt daar ook tijdelijk op een ander niveau oefenen.')}</p>
  {!loaded?<div className="loader small"/>:!cards.length?<p className="muted">{t('Nog geen talen.')}</p>:<ul className="lvl-list">{cards.map(c=>{const own=prefs.levels[c.code]||'';const teacher=c.relations.find(r=>r.level)?.level||'';
   return <li key={c.code}><Flag code={c.code} size={26}/><span className="grow"><b>{languageName(c.code)}</b><small className="muted">{teacher?t('Niveau van je docent: {0}',teacher):c.self?.level?t('Zelfstudie · {0}',c.self.level):t('Niveau nog onbekend')}{prefs.active===c.code?' · '+t('actieve leertaal'):''}</small></span>
    <Select size="sm" label={t('Mijn niveau voor {0}',languageName(c.code))} value={own||'auto'} onChange={v=>void save(c.code,v==='auto'?'':String(v),!c.relations.length?c.self?.id:undefined)}
     options={[{value:'auto',label:teacher||c.self?.level?t('Zoals mijn docent ({0})',teacher||c.self?.level||''):t('Weet ik nog niet')},...LVLS.map(l=>({value:l,label:l}))]}/></li>})}</ul>}
  {msg&&<p className="muted" role="status">{msg}</p>}</section>
}

function Page(){
 const {user,canTeach,mode}=useAuth();
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t("ACCOUNT")}</p><h1>{t("Mijn profiel")}</h1><p className="muted">{user?.email}</p></div></div>
  <AvatarEditor/>
  {canTeach&&<TeachingLanguages/>}
  {mode==='student'&&<MyLevels/>}
  {mode==='student'&&<section className="card"><h3>{t("Mijn talen")}</h3><p className="muted">{t("Wissel van leertaal onderaan het menu, bij Mijn talen. Je voortgang per taal staat bij Voortgang.")}</p><Link className="button small" href="/voortgang">{t("Naar Voortgang")}</Link></section>}
  {/* v73: technical build information lives here instead of in the sidebar */}
  <p className="build-meta" title={t("Welke versie draait hier (branch · commit)")}>{process.env.NEXT_PUBLIC_BUILD_ENV==='production'?t("Productie"):t("Preview")} · {process.env.NEXT_PUBLIC_BUILD_REF} · {process.env.NEXT_PUBLIC_BUILD_SHA}</p>
 </>
}
export default function Account(){return <Nav><Page/></Nav>}
