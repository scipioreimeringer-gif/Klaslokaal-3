'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Languages} from 'lucide-react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {AvatarEditor,usePeople,refreshPeople} from '../../components/Avatar';
import {Flag} from '../../components/Flag';
import {supabase} from '../../lib/supabase';
import {LANGUAGES} from '../../lib/languages';
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

function Page(){
 const {user,canTeach,mode}=useAuth();
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t("ACCOUNT")}</p><h1>{t("Mijn profiel")}</h1><p className="muted">{user?.email}</p></div></div>
  <AvatarEditor/>
  {canTeach&&<TeachingLanguages/>}
  {mode==='student'&&<section className="card"><h3>{t("Mijn talen")}</h3><p className="muted">{t("Je talen, docenten en voortgang staan op je dashboard.")}</p><Link className="button small" href="/">{t("Naar mijn talen")}</Link></section>}
 </>
}
export default function Account(){return <Nav><Page/></Nav>}
