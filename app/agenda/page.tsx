'use client';
import {Suspense} from 'react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {AgendaView} from '../../components/Agenda';
import {useQueryParam} from '../../lib/useQuery';

function Page(){
 // v57: one central agenda for every role (lessons I give + lessons I follow + personal), independent of the profile switch
 const {user}=useAuth();const openNew=useQueryParam('nieuw')==='1';const openId=useQueryParam('les');const openBooking=useQueryParam('boeken')==='1';
 return <AgendaView key={user?.id||'none'} openNew={openNew} openId={openId} openBooking={openBooking}/>
}
export default function Agenda(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
