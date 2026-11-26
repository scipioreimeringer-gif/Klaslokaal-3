'use client';
// v73: Voortgang — central progress page of the student, for the ACTIVE learning language (same choice as "Mijn talen").
import {Suspense} from 'react';
import Nav from '../../components/Nav';
import {useMyStudentProfiles} from '../../components/StudentPortal';
import {useMyLanguageCards} from '../../components/Languages';
import {useLearnerPrefs} from '../../components/LearnerPrefs';
import {ProgressHub} from '../../components/Progress';
import {Flag} from '../../components/Flag';
import {useQueryParam} from '../../lib/useQuery';
import {languageName,pickRelation} from '../../lib/languages';
import {t} from '../../lib/i18n';

function Page(){
 const {items,loaded,teacherName}=useMyStudentProfiles();const mine=useMyLanguageCards();const prefs=useLearnerPrefs();const tab=useQueryParam('tab');
 const cards=mine.cards;const code=(cards.some(c=>c.code===prefs.active)?prefs.active:cards[0]?.code)||'';const card=cards.find(c=>c.code===code);
 const rel=pickRelation(card,null);const full=rel?items.find(s=>s.id===rel.id)||null:null;
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t('MIJN VOORTGANG')}</p><h1>{t('Voortgang')}</h1>
   {code&&<p className="muted"><Flag code={code} size={16}/> {languageName(code)}{full?.level?' · '+full.level:''}{card&&card.relations.length>1&&rel?' · '+(teacherName(rel.id)||''):''}</p>}</div></div>
  {!loaded||!mine.loaded?<div className="loader small"/>:!full?<section className="card"><p>{t('Nog geen leerlingprofiel gekoppeld. Vraag je docent om je toe te voegen.')}</p></section>
   :<ProgressHub key={full.id} student={full} initial={tab}/>}
 </>
}
export default function Voortgang(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
