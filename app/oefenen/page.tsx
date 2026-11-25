'use client';
import {Suspense,useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Gamepad2,Sparkles,ClipboardList,Settings2} from 'lucide-react';
import Nav from '../../components/Nav';
import {useMyStudentProfiles} from '../../components/StudentPortal';
import {useMyLanguageCards} from '../../components/Languages';
import {useLearnerPrefs} from '../../components/LearnerPrefs';
import {Flag} from '../../components/Flag';
import {Select} from '../../components/Select';
import {SelfPractice,VocabGames} from '../../components/Learning';
import {useQueryParam} from '../../lib/useQuery';
import {subjectOf} from '../../lib/learning';
import {languageName,pickRelation} from '../../lib/languages';
import {asLvl,isLvl,LVLS,type Lvl} from '../../lib/practice';
import {t} from '../../lib/i18n';

/** v54: practice in the ACTIVE learning language (same choice as "Mijn talen" in the sidebar) at the student's own
 *  level for that language — or, for now, another level (only on this page; the profile level stays the same). */
function Page(){
 const router=useRouter();const wanted=useQueryParam('student');const spel=useQueryParam('spel');const onderwerp=useQueryParam('onderwerp');const {items,loaded,teacherName}=useMyStudentProfiles();
 const mine=useMyLanguageCards();const cards=mine.cards;const prefs=useLearnerPrefs();
 const wantedRel=items.find(s=>s.id===wanted);
 // a link to one lesson relation (?student=) makes that language the active one; otherwise the active language
 useEffect(()=>{if(wantedRel&&prefs.ready)prefs.setActive(subjectOf(wantedRel))},[wantedRel?.id,prefs.ready]);// eslint-disable-line react-hooks/exhaustive-deps
 const code=(wantedRel?subjectOf(wantedRel):'')||(cards.some(c=>c.code===prefs.active)?prefs.active:cards[0]?.code)||'';
 const card=cards.find(c=>c.code===code);
 const rel=pickRelation(card,wantedRel&&subjectOf(wantedRel)===code?wantedRel.id:null);
 const full=rel?items.find(s=>s.id===rel.id)||null:null;
 // own level for this language: the student's choice (settings) → the teacher's / self-study level → A1
 const ownLevel:Lvl=asLvl(prefs.levels[code]||card?.level||full?.level||'A1');
 const tmpKey='teachy-plevel-'+code;
 const [pick,setPick]=useState<'mine'|Lvl>('mine');
 useEffect(()=>{try{const v=sessionStorage.getItem(tmpKey);setPick(isLvl(v)?v:'mine')}catch{setPick('mine')}},[tmpKey]);
 const choose=(v:string)=>{const p=isLvl(v)?v:'mine';setPick(p);try{if(p==='mine')sessionStorage.removeItem(tmpKey);else sessionStorage.setItem(tmpKey,p)}catch{/* private mode */}};
 const level:Lvl=pick==='mine'?ownLevel:pick;
 const switchTo=(c:string)=>{prefs.setActive(c);if(wanted)router.replace('/oefenen')};
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t("ZELFSTANDIG LEREN")}</p><h1>{t("Oefenen & spelletjes")}</h1><p className="muted">{t("Oefen met je eigen woordenlijst en maak extra oefeningen. Je resultaten worden bewaard en tellen mee in je voortgang.")}</p></div></div>
  {!loaded||!mine.loaded?<div className="loader small"/>:!card?<section className="card"><p>{t("Nog geen leerlingprofiel gekoppeld. Vraag je docent om je toe te voegen.")}</p></section>:<>
   <section className="pr-bar" aria-label={t('Taal en niveau')}>
    <div className="pr-pick"><span className="label">{t('Oefenen in')}</span>
     <Select size="sm" label={t('Oefenen in')} value={code} onChange={v=>switchTo(String(v))} icon={<Flag code={code} size={18}/>} options={cards.map(c=>({value:c.code,label:languageName(c.code),icon:<Flag code={c.code} size={18}/>}))}/></div>
    <div className="pr-pick"><span className="label">{t('Niveau')}</span>
     <Select size="sm" label={t('Niveau')} value={pick} onChange={v=>choose(String(v))} options={[{value:'mine',label:t('Voor mijn niveau ({0})',ownLevel)},...LVLS.map(l=>({value:l,label:l}))]}/></div>
    {pick!=='mine'&&<small className="muted pr-tmp">{t('Tijdelijk oefenniveau; je profielniveau blijft {0}.',ownLevel)}</small>}
    <Link className="linklike pr-set" href="/account#talen"><Settings2 size={14}/> {t('Mijn niveaus aanpassen')}</Link>
   </section>
   <section className="card"><h3><Gamepad2 size={17}/> {t("Spelletjes met je woordenlijst")} <span className="tag">{languageName(code)} · {level}</span></h3>
    <VocabGames key={code+'|'+level+'|'+(rel?.id||'self')} studentId={rel?.id||null} lang={code} level={level} start={spel}/></section>
   {/* v71: "Oefenen" from Mijn leerlijn opens this existing generator with that grammar topic as focus */}
   {rel&&<section className="card" id="zelf"><h3><Sparkles size={17}/> {t("Maak mijn huiswerk")}</h3><p className="muted">{t("Zelfgemaakte oefeningen; dit is geen officieel huiswerk van je docent.")}</p><SelfPractice key={rel.id+'|'+(onderwerp||'')} studentId={rel.id} level={level} topic={onderwerp||undefined}/></section>}
   {rel&&<section className="card"><h3><ClipboardList size={17}/> {t("Officieel huiswerk")}</h3><p className="muted">{t("Huiswerk van je docent staat in je leerlingprofiel.")}</p><Link className="button secondary" href={`/mijn-profiel?student=${rel.id}&tab=huiswerk`}>{t("Naar mijn huiswerk")}</Link></section>}
   {card.relations.length>1&&rel&&<p className="muted small">{t('Je oefent bij: {0}',teacherName(rel.id)||t('Docent'))}</p>}
  </>}
 </>
}
export default function Oefenen(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
