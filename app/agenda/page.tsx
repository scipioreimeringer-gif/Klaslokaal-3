'use client';
import {Suspense} from 'react';
import Nav from '../../components/Nav';
import {useAuth} from '../../components/Auth';
import {AgendaView} from '../../components/Agenda';
import {useQueryParam} from '../../lib/useQuery';

function Page(){
 const {mode}=useAuth();const openNew=useQueryParam('nieuw')==='1';const openId=useQueryParam('les');
 return <AgendaView key={mode||'none'} mode={mode==='teacher'?'teacher':'student'} openNew={openNew} openId={openId}/>
}
export default function Agenda(){return <Nav><Suspense fallback={<div className="loader small"/>}><Page/></Suspense></Nav>}
