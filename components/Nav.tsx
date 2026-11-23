'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {LayoutDashboard,UsersRound,Video,CalendarDays,Sparkles,Library,GraduationCap,Languages,ShieldCheck,BookOpen,Menu,LogOut,Presentation,Home,Route,Gamepad2} from 'lucide-react';
import {LanguagePicker} from './I18n';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';
import {AssistantLauncher} from './Assistant';
import {Avatar} from './Avatar';
import {SideLanguages} from './Languages';
import {Suspense} from 'react';
import {t as tt} from '../lib/i18n';

function Frame({children}:{children:React.ReactNode}){
 const {user,role,mode,setMode,canTeach,studentLinks}=useAuth();
 const path=usePathname()||'/';const router=useRouter();const [open,setOpen]=useState(false);const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('teachy-side')==='collapsed')}catch{}},[]);
 const isMobile=()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 900px)').matches;
 function persist(v:boolean){setCollapsed(v);try{localStorage.setItem('teachy-side',v?'collapsed':'open')}catch{}}
 /** The menu button is the only toggle: desktop collapses fully (no reserved space), mobile opens/closes the drawer (also closes on outside click / Esc). */
 function toggleSide(){if(isMobile())setOpen(o=>!o);else persist(!collapsed)}
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open]);
 const teacherLinks=[{href:'/',icon:LayoutDashboard,label:tt('Dashboard')},{href:'/leerlingen',icon:UsersRound,label:tt('Leerlingen')},{href:'/klaslokaal/live',icon:Video,label:tt('Klaslokaal')},{href:'/leerlijnen',icon:Route,label:tt('Leerlijnen')},{href:'/agenda',icon:CalendarDays,label:tt('Agenda')},{href:'/tools',icon:Sparkles,label:tt('AI & tools')},{href:'/bibliotheek',icon:Library,label:tt('Bibliotheek')}];
 const studentNav=[{href:'/',icon:Home,label:tt('Overzicht')},{href:'/mijn-profiel',icon:BookOpen,label:tt('Mijn lessen')},{href:'/oefenen',icon:Gamepad2,label:tt('Oefenen')},{href:'/agenda',icon:CalendarDays,label:tt('Agenda')},{href:'/klaslokaal/live',icon:Video,label:tt('Klaslokaal')}];
 const links=mode==='teacher'?teacherLinks:studentNav;
 const both=canTeach&&studentLinks.length>0;
 const meta=(user?.user_metadata||{}) as {avatar_url?:string;picture?:string};const avatar=meta.avatar_url||meta.picture||'';
 const active=(href:string)=>href==='/'?path==='/':path.startsWith(href);
 function switchTo(m:'teacher'|'student'){setMode(m);setOpen(false);router.push('/')}
 return <div className={'shell'+(collapsed?' side-collapsed':'')}>
  <aside className={'side'+(open?' open':'')}>
   <div className="side-head"><Link className="brand" href="/" onClick={()=>setOpen(false)}><span className="brandmark"><GraduationCap size={20}/></span><span>{tt("TeachyRooms")}</span></Link></div>
   <div className="navlabel">{mode==='teacher'?tt('Docent'):tt('Mijn leeromgeving')}</div>
   <nav className="navlinks">{links.map(({href,icon:Icon,label})=><Link className={active(href)?'active':''} href={href} key={href} onClick={()=>setOpen(false)}><Icon size={18}/>{label}</Link>)}
    {mode==='teacher'&&role==='admin'&&<Link href="/beheer" className={active('/beheer')?'active':''} onClick={()=>setOpen(false)}><ShieldCheck size={18}/>{tt('Docenten beheren')}</Link>}</nav>
   {mode!=='teacher'&&<Suspense fallback={null}><SideLanguages onNavigate={()=>setOpen(false)}/></Suspense>}
   <div className="buildinfo" title={tt("Welke versie draait hier (branch · commit)")}>{process.env.NEXT_PUBLIC_BUILD_ENV==='production'?tt("Productie"):tt("Preview")} · {process.env.NEXT_PUBLIC_BUILD_REF} · {process.env.NEXT_PUBLIC_BUILD_SHA}</div>
   <div className="sidebottom"><Link className="sideaccount" href="/account" title={tt("Mijn profiel en profielfoto")} onClick={()=>setOpen(false)}><Avatar className="teacheravatar" userId={user?.id} name={user?.email||'?'} size={34} google={avatar}/><div className="sideuser"><strong>{mode==='teacher'?(role==='admin'?tt("Beheerder"):tt('Docent')):tt('Leerling')}</strong><small>{user?.email||''}</small></div></Link><button className="iconbtn" title={tt('Uitloggen')} aria-label={tt('Uitloggen')} onClick={()=>void supabase()?.auth.signOut()}><LogOut size={17}/></button></div>
  </aside>
  {open&&<div className="side-scrim" onClick={()=>setOpen(false)}/>}
  <main className="main">
   <header className="topbar">
    <button className="iconbtn menu-btn" aria-label={tt("Menu openen of sluiten")} title={tt("Menu openen of sluiten")} aria-expanded={open||!collapsed} onClick={toggleSide}><Menu size={20}/></button>
    <span className="topbar-title">{mode==='teacher'?tt('Jouw onderwijsruimte'):tt('Jouw leeromgeving')}</span>
    <div className="topbar-actions">
     {both&&<div className="mode-switch" role="group" aria-label={tt("Profiel kiezen")}><button aria-pressed={mode==='teacher'} onClick={()=>switchTo('teacher')}><Presentation size={15}/><span>{tt('Docent')}</span></button><button aria-pressed={mode==='student'} onClick={()=>switchTo('student')}><BookOpen size={15}/><span>{tt('Mijn leeromgeving')}</span></button></div>}
     <LanguagePicker/>
    </div>
   </header>
   <div className="page">{children}</div>
  </main>
  <AssistantLauncher/>
  <nav className="bottomnav" aria-label={tt("Snelmenu")}>{links.slice(0,4).map(({href,icon:Icon,label})=><Link key={href} href={href} className={active(href)?'active':''}><Icon size={20}/><span>{label}</span></Link>)}<button onClick={()=>setOpen(true)}><Menu size={20}/><span>{tt("Meer")}</span></button></nav>
 </div>
}
export default function Nav({children}:{children:React.ReactNode}){return <Frame>{children}</Frame>}
