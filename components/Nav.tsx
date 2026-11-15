'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {LayoutDashboard,UsersRound,Video,CalendarDays,Sparkles,Library,GraduationCap,Languages,ShieldCheck,BookOpen,Menu,X,LogOut,Presentation,Home,Route,Gamepad2} from 'lucide-react';
import {LanguageProvider,labels,extra,useLanguage,Lang} from './I18n';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';
import {AssistantLauncher} from './Assistant';

function Frame({children}:{children:React.ReactNode}){
 const {lang,setLang}=useLanguage();const {user,role,mode,setMode,canTeach,studentLinks}=useAuth();const t=labels[lang],x=extra[lang];
 const path=usePathname()||'/';const router=useRouter();const [open,setOpen]=useState(false);const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('teachy-side')==='collapsed')}catch{}},[]);
 const isMobile=()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 900px)').matches;
 function persist(v:boolean){setCollapsed(v);try{localStorage.setItem('teachy-side',v?'collapsed':'open')}catch{}}
 /** X: on desktop collapse the sidebar (no reserved space); on mobile close the drawer. */
 function closeSide(){if(isMobile())setOpen(false);else persist(true)}
 function openSide(){if(isMobile())setOpen(true);else persist(false)}
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open]);
 const teacherLinks=[{href:'/',icon:LayoutDashboard,label:t[0]},{href:'/leerlingen',icon:UsersRound,label:t[1]},{href:'/klaslokaal/live',icon:Video,label:t[2]},{href:'/leerlijnen',icon:Route,label:x[7]},{href:'/agenda',icon:CalendarDays,label:t[3]},{href:'/tools',icon:Sparkles,label:t[4]},{href:'/bibliotheek',icon:Library,label:t[5]}];
 const studentNav=[{href:'/',icon:Home,label:x[0]},{href:'/mijn-profiel',icon:BookOpen,label:x[1]},{href:'/oefenen',icon:Gamepad2,label:x[8]},{href:'/klaslokaal/live',icon:Video,label:t[2]},{href:'/portugees',icon:Languages,label:x[2]}];
 const links=mode==='teacher'?teacherLinks:studentNav;
 const both=canTeach&&studentLinks.length>0;
 const meta=(user?.user_metadata||{}) as {avatar_url?:string;picture?:string};const avatar=meta.avatar_url||meta.picture||'';
 function changeLang(l:Lang){setLang(l);void supabase()?.rpc('set_my_language',{lang:l})}
 const active=(href:string)=>href==='/'?path==='/':path.startsWith(href);
 function switchTo(m:'teacher'|'student'){setMode(m);setOpen(false);router.push('/')}
 return <div className={'shell'+(collapsed?' side-collapsed':'')}>
  <aside className={'side'+(open?' open':'')}>
   <div className="side-head"><Link className="brand" href="/" onClick={()=>setOpen(false)}><span className="brandmark"><GraduationCap size={20}/></span><span>TeachyRooms</span></Link><button className="iconbtn side-close" aria-label="Menu inklappen" title="Menu inklappen" onClick={closeSide}><X size={20}/></button></div>
   <div className="navlabel">{mode==='teacher'?x[3]:x[4]}</div>
   <nav className="navlinks">{links.map(({href,icon:Icon,label})=><Link className={active(href)?'active':''} href={href} key={href} onClick={()=>setOpen(false)}><Icon size={18}/>{label}</Link>)}
    {mode==='teacher'&&role==='admin'&&<Link href="/beheer" className={active('/beheer')?'active':''} onClick={()=>setOpen(false)}><ShieldCheck size={18}/>{x[6]}</Link>}</nav>
   <div className="sidebottom">{avatar?<img className="teacheravatar" src={avatar} alt="" referrerPolicy="no-referrer"/>:<div className="teacheravatar">{(user?.email||'?')[0].toUpperCase()}</div>}<div className="sideuser"><strong>{mode==='teacher'?(role==='admin'?'Beheerder':x[3]):x[4]}</strong><small>{user?.email||''}</small></div><button className="iconbtn" title={x[5]} aria-label={x[5]} onClick={()=>void supabase()?.auth.signOut()}><LogOut size={17}/></button></div>
  </aside>
  {open&&<div className="side-scrim" onClick={()=>setOpen(false)}/>}
  <main className="main">
   <header className="topbar">
    <button className="iconbtn menu-btn" aria-label="Menu openen" title="Menu openen" onClick={openSide}><Menu size={20}/></button>
    <span className="topbar-title">{t[7]}</span>
    <div className="topbar-actions">
     {both&&<div className="mode-switch" role="group" aria-label="Profiel kiezen"><button aria-pressed={mode==='teacher'} onClick={()=>switchTo('teacher')}><Presentation size={15}/><span>{x[3]}</span></button><button aria-pressed={mode==='student'} onClick={()=>switchTo('student')}><BookOpen size={15}/><span>{x[4]}</span></button></div>}
     <label className="lang-select"><Languages size={15}/><select aria-label="Interface language" value={lang} onChange={e=>changeLang(e.target.value as Lang)}>{[['nl','NL'],['en','EN'],['es','ES'],['pt','PT'],['de','DE'],['fr','FR']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
    </div>
   </header>
   <div className="page">{children}</div>
  </main>
  <AssistantLauncher/>
  <nav className="bottomnav" aria-label="Snelmenu">{links.slice(0,4).map(({href,icon:Icon,label})=><Link key={href} href={href} className={active(href)?'active':''}><Icon size={20}/><span>{label}</span></Link>)}<button onClick={()=>setOpen(true)}><Menu size={20}/><span>Meer</span></button></nav>
 </div>
}
export default function Nav({children}:{children:React.ReactNode}){return <LanguageProvider><Frame>{children}</Frame></LanguageProvider>}
