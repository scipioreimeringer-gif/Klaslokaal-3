'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';
import {useAuth} from '../../../components/Auth';
import Nav from '../../../components/Nav';

function LivePreview(){
 const q=useSearchParams();const student=q?.get('student') ?? null;
 const {user,role,loading}=useAuth();
 if(loading) return <Nav><p>Lesruimte laden…</p></Nav>;
 if(!user || (role!=='admin' && role!=='teacher')) return <Nav><p>Deze testpagina is alleen voor docenten en beheerders.</p></Nav>;
 return <main className="live-page">
  <div className="live-toolbar">
   <div className="live-identity"><span className="live-logo">✦</span><strong>Klaslokaal</strong><span className="live-tag">Lesruimte</span></div>
   <div className="live-actions">{student&&<Link className="live-back" href={"/lesruimte?student="+encodeURIComponent(student)}>Leerlinggebonden lesruimte ↗</Link>}<details className="live-info"><summary aria-label="Informatie over de testomgeving" title="Informatie over de testomgeving">ⓘ Testversie</summary><div className="live-info-panel"><strong>Let op: testomgeving</strong><p>Dit is de bestaande v16-lesomgeving. De leslinks en opslag zijn nog niet veilig gekoppeld aan afzonderlijke Supabase-leerlingprofielen. Gebruik geen echte leerlinggegevens en deel geen privéleslinks.</p></div></details><Link href="/" className="live-back">← Dashboard</Link></div>
  </div>
  <iframe title="Klaslokaal v16" src="/legacy/index.html" allow="camera; microphone; display-capture; fullscreen" className="live-frame" />
 </main>;
}

export default function LivePage(){return <Suspense fallback={<p>Laden…</p>}><LivePreview/></Suspense>}
