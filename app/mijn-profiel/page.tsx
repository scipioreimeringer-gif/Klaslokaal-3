'use client';
import {Suspense} from 'react';
import {useRouter} from 'next/navigation';
import Nav from '../../components/Nav';
import {PendingLinks} from '../../components/Auth';
import {StudentPortal,useMyStudentProfiles} from '../../components/StudentPortal';
import {useQueryParam} from '../../lib/useQuery';

function Page(){
 const router=useRouter();const wanted=useQueryParam('student');const {items,error,loaded,teacherName}=useMyStudentProfiles();
 const current=items.find(s=>s.id===wanted)||items[0];
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">MIJN LEEROMGEVING</p><h1>Mijn lessen</h1><p className="muted">Alleen jij en je docent kunnen dit zien. Privénotities van je docent zijn nooit zichtbaar.</p></div>
   {items.length>1&&<select className="field" aria-label="Kies je les" value={current?.id||''} onChange={e=>router.push('/mijn-profiel?student='+e.target.value)}>{items.map(s=><option key={s.id} value={s.id}>{s.subject||s.name} — {teacherName(s.id)}</option>)}</select>}</div>
  <PendingLinks/>
  {error&&<div className="notice">{error}</div>}
  {!loaded?<div className="loader small"/>:!current?<section className="card"><h2>Nog geen leerlingprofiel</h2><p>Vraag je docent om je toe te voegen met het e-mailadres van dit account. Daarna verschijnt hier een uitnodiging die je kunt accepteren. Je kunt ook de uitnodigingslink van je docent openen.</p></section>:<StudentPortal profile={current} teacherName={teacherName(current.id)}/>}
 </>
}
export default function MyProfile(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
