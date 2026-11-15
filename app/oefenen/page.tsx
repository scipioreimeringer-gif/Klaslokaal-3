'use client';
import {Suspense} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Gamepad2,Sparkles,ClipboardList} from 'lucide-react';
import Nav from '../../components/Nav';
import {useMyStudentProfiles} from '../../components/StudentPortal';
import {SelfPractice,VocabGames} from '../../components/Learning';
import {useQueryParam} from '../../lib/useQuery';
import {subjectOf} from '../../lib/learning';
import {t} from '../../lib/i18n';

function Page(){
 const router=useRouter();const wanted=useQueryParam('student');const {items,loaded,teacherName}=useMyStudentProfiles();
 const current=items.find(s=>s.id===wanted)||items[0];
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t("ZELFSTANDIG LEREN")}</p><h1>{t("Oefenen & spelletjes")}</h1><p className="muted">{t("Oefen met je eigen woordenlijst en maak extra oefeningen. Je resultaten worden bewaard en tellen mee in je voortgang.")}</p></div>
   {items.length>1&&<select className="field" aria-label={t("Kies je les")} value={current?.id||''} onChange={e=>router.push('/oefenen?student='+e.target.value)}>{items.map(s=><option key={s.id} value={s.id}>{s.subject||s.name} — {teacherName(s.id)}</option>)}</select>}</div>
  {!loaded?<div className="loader small"/>:!current?<section className="card"><p>{t("Nog geen leerlingprofiel gekoppeld. Vraag je docent om je toe te voegen.")}</p></section>:<>
   <section className="card"><h3><Gamepad2 size={17}/> {t("Spelletjes met je woordenlijst")}</h3><VocabGames key={current.id} studentId={current.id} subject={subjectOf(current)}/></section>
   <section className="card"><h3><Sparkles size={17}/> {t("Maak mijn huiswerk")}</h3><p className="muted">{t("Zelfgemaakte oefeningen; dit is geen officieel huiswerk van je docent.")}</p><SelfPractice key={current.id} studentId={current.id} level={current.level}/></section>
   <section className="card"><h3><ClipboardList size={17}/> {t("Officieel huiswerk")}</h3><p className="muted">{t("Huiswerk van je docent staat in je leerlingprofiel.")}</p><Link className="button secondary" href={`/mijn-profiel?student=${current.id}&tab=huiswerk`}>{t("Naar mijn huiswerk")}</Link></section>
  </>}
 </>
}
export default function Oefenen(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
