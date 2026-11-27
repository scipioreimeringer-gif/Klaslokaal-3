'use client';
// v46 phase 3: the daily practice page (student). One relation at a time (language + teacher), own material only.
import {Suspense} from 'react';
import {useRouter} from 'next/navigation';
import Nav from '../../../components/Nav';
import {useAuth} from '../../../components/Auth';
import {useMyStudentProfiles} from '../../../components/StudentPortal';
import {DailyRoute} from '../../../components/DailyRoute';
import {Select} from '../../../components/Select';
import {useQueryParam} from '../../../lib/useQuery';
import {subjectOf} from '../../../lib/learning';
import {languageName} from '../../../lib/languages';
import {t} from '../../../lib/i18n';

function Page(){
 const router=useRouter();const {user}=useAuth();const wanted=useQueryParam('student');const autoStart=useQueryParam('start')==='1';const mix=useQueryParam('mix')==='1';const {items,loaded,teacherName}=useMyStudentProfiles();
 const current=items.find(s=>s.id===wanted)||items[0];
 return <section className="dp-page">
  <div className="page-head"><div><h1 className="h-compact">{t("Dagelijkse leerroute")}</h1></div>
   {items.length>1&&current&&<Select size="sm" label={t("Kies je les")} value={current.id} onChange={v=>router.push('/oefenen/dagelijks?student='+v)} options={items.map(s=>({value:s.id,label:[languageName(subjectOf(s))||s.subject,teacherName(s.id)].filter(Boolean).join(' · ')}))}/>}</div>
  {!loaded||!user?<div className="loader small"/>:!current?<section className="card"><p>{t("Nog geen leerlingprofiel gekoppeld. Vraag je docent om je toe te voegen.")}</p></section>
   :<section className="card"><DailyRoute key={current.id+(mix?'-mix':'')} studentId={current.id} level={current.level} lang={subjectOf(current)} userId={user.id} autoStart={autoStart} mode={mix?'mixed':'daily'}/></section>}
 </section>
}
export default function Dagelijks(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
