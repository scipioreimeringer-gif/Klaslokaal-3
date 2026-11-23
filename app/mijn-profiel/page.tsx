'use client';
import {Suspense,useEffect} from 'react';
import {useLearnerPrefs} from '../../components/LearnerPrefs';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import Nav from '../../components/Nav';
import {PendingLinks} from '../../components/Auth';
import {StudentPortal,useMyStudentProfiles} from '../../components/StudentPortal';
import {useMyLanguageCards,LanguageHeader,SelfStudy,SelfStudyExtra} from '../../components/Languages';
import {Flag} from '../../components/Flag';
import {useQueryParam} from '../../lib/useQuery';
import {subjectOf} from '../../lib/learning';
import {languageName,pickRelation} from '../../lib/languages';
import {t} from '../../lib/i18n';

/** One environment per language; inside it the existing tabs per teacher relation (data stays separate). */
function Page(){
 const router=useRouter();const wanted=useQueryParam('student');const taal=useQueryParam('taal');const tab=useQueryParam('tab');
 const {items,error,loaded,teacherName}=useMyStudentProfiles();
 // same list as the dashboard cards and the sidebar: only languages this account learns itself
 const mine=useMyLanguageCards();const cards=mine.cards;
 const wantedRel=items.find(s=>s.id===wanted);
 // v54: without an explicit choice the ACTIVE learning language opens (not always the first one)
 const prefs=useLearnerPrefs();const act=cards.some(c=>c.code===prefs.active)?prefs.active:'';
 const code=taal||(wantedRel?subjectOf(wantedRel):act||cards[0]?.code);
 const card=cards.find(c=>c.code===code);
 useEffect(()=>{if(card&&prefs.ready)prefs.setActive(card.code)},[card?.code,prefs.ready]);// eslint-disable-line react-hooks/exhaustive-deps
 const current=pickRelation(card,wanted);
 const go=(lang:string,student?:string)=>router.push('/mijn-profiel?taal='+lang+(student?'&student='+student:''));
 return <>
  {cards.length>1&&<nav className="lang-switch" aria-label={t("Kies een taal")}>{cards.map(c=><button key={c.code} aria-pressed={c.code===card?.code} onClick={()=>go(c.code)}><Flag code={c.code} size={22}/><span>{languageName(c.code)}</span></button>)}</nav>}
  <PendingLinks/>
  {error&&<div className="notice">{error}</div>}
  {!loaded||!mine.loaded?<div className="loader small"/>:!card?<section className="card"><h2>{t("Nog geen talen")}</h2><p>{t("Voeg op je dashboard een taal toe die je leert, of vraag je docent om je toe te voegen met het e-mailadres van dit account. Daarna verschijnt hier een uitnodiging die je kunt accepteren.")}</p><Link className="button" href="/">{t("Naar mijn dashboard")}</Link></section>:<>
   <LanguageHeader card={card} current={current} teacherName={teacherName} onPick={id=>go(card.code,id)}/>
   <SelfStudyExtra card={card}/>
   <p className="muted small">{t("Alleen jij en je docent kunnen dit zien. Privénotities van je docent zijn nooit zichtbaar.")}</p>
   {current?<StudentPortal key={current.id} profile={current} teacherName={teacherName(current.id)} initialTab={tab} compact/>:<SelfStudy card={card} onChanged={()=>mine.reload()}/>}
  </>}
 </>
}
export default function MyProfile(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
