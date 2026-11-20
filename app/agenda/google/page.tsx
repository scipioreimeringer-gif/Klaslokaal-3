'use client';
// v45: Google sends the teacher back here after the separate calendar consent. The code is handed to the server
// (with the teacher's own session); the server exchanges it, encrypts the token and stores it. Nothing stays in the URL.
import {Suspense,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import Nav from '../../../components/Nav';
import {useAuth} from '../../../components/Auth';
import {calendarApi} from '../../../components/GoogleCalendar';
import {useQueryParam} from '../../../lib/useQuery';
import {t} from '../../../lib/i18n';

function Back(){
 const {user}=useAuth();const router=useRouter();const code=useQueryParam('code'),state=useQueryParam('state'),denied=useQueryParam('error');
 const [msg,setMsg]=useState('');const done=useRef(false);
 useEffect(()=>{if(!user||done.current)return;done.current=true;
  if(denied||!code||!state){setMsg(t('Google Calendar is niet verbonden: de toestemming is niet gegeven.'));return}
  void calendarApi('callback',{code,state}).then(()=>router.replace('/agenda?google=kies'),e=>setMsg(e instanceof Error?e.message:String(e)))},[user,code,state,denied,router]);
 return <section className="card" style={{maxWidth:560}}><h2>{t('Google Calendar verbinden')}</h2>
  {msg?<><p className="notice">{msg}</p><Link className="button" href="/agenda">{t('Terug naar de agenda')}</Link></>:<><div className="loader small"/><p className="muted">{t('Bezig met verbinden…')}</p></>}</section>
}
export default function GoogleBack(){return <Nav><Suspense fallback={<div className="loader small"/>}><Back/></Suspense></Nav>}
