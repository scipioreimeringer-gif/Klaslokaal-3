'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {LayoutDashboard,UsersRound,Video,CalendarDays,Sparkles,Library,GraduationCap,ShieldCheck,BookOpen,Menu,LogOut,Presentation,Home,Route,Gamepad2,ListTodo,Wallet,TrendingUp,ChevronDown,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import {TaskBadge} from './Tasks';
import {LanguagePicker} from './I18n';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';
import {authFetch} from '../lib/authFetch';
import {AssistantLauncher} from './Assistant';
import {Avatar} from './Avatar';
import {SideLanguages} from './Languages';
import {Suspense} from 'react';
import {t as tt} from '../lib/i18n';

function Frame({children}:{children:React.ReactNode}){
 const {user,role,mode,setMode,canTeach,studentLinks}=useAuth();
 // v56: AI lesson reports catch up by themselves — whenever a teacher opens TeachyRooms (at most every 10 minutes per
 // device) recordings with consent but without a report are processed, failed ones retried, waiting drafts published
 useEffect(()=>{if(!user||!canTeach||mode!=='teacher')return;const k='teachy-report-catchup-'+user.id;try{const last=+(localStorage.getItem(k)||0);if(Date.now()-last<10*60e3)return;localStorage.setItem(k,String(Date.now()))}catch{/* private mode */}
  const db=supabase();if(db)void authFetch(db,'/api/ai/backfill',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{/* next visit */})},[user?.id,canTeach,mode]);
 const path=usePathname()||'/';const router=useRouter();const [open,setOpen]=useState(false);const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('teachy-side')==='collapsed')}catch{}},[]);
 const isMobile=()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 900px)').matches;
 function persist(v:boolean){setCollapsed(v);try{localStorage.setItem('teachy-side',v?'collapsed':'open')}catch{}}
 /** The menu button is the only toggle: desktop collapses fully (no reserved space), mobile opens/closes the drawer (also closes on outside click / Esc). */
 function toggleSide(){if(isMobile())setOpen(o=>!o);else persist(!collapsed)}
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open]);
 // v73: compact navigation. Teacher: daily work always visible, the rest in collapsible groups (the group of the active
 // page opens by itself; own choices are remembered). Student: six main items (tasks live on the dashboard).
 const work=[{href:'/',icon:LayoutDashboard,label:tt('Dashboard')},{href:'/leerlingen',icon:UsersRound,label:tt('Leerlingen')},{href:'/klaslokaal/live',icon:Video,label:tt('Klaslokaal')},{href:'/agenda',icon:CalendarDays,label:tt('Agenda')}];
 const groups:{id:string;label:string;items:typeof work}[]=[
  {id:'material',label:tt('Lesmateriaal'),items:[{href:'/leerlijnen',icon:Route,label:tt('Leerlijnen')},{href:'/tools',icon:Sparkles,label:tt('AI & tools')},{href:'/bibliotheek',icon:Library,label:tt('Bibliotheek')}]},
  {id:'admin',label:tt('Administratie'),items:[{href:'/taken',icon:ListTodo,label:tt('Taken')},{href:'/betalingen',icon:Wallet,label:tt('Betalingen')}]},
  ...(role==='admin'?[{id:'beheer',label:tt('Beheer'),items:[{href:'/beheer',icon:ShieldCheck,label:tt('Docenten beheren')}]}]:[])];
 const studentNav=[{href:'/',icon:Home,label:tt('Overzicht')},{href:'/mijn-profiel',icon:BookOpen,label:tt('Mijn lessen')},{href:'/oefenen',icon:Gamepad2,label:tt('Oefenen')},{href:'/voortgang',icon:TrendingUp,label:tt('Voortgang')},{href:'/agenda',icon:CalendarDays,label:tt('Agenda')},{href:'/klaslokaal/live',icon:Video,label:tt('Klaslokaal')}];
 const links=mode==='teacher'?work:studentNav;
 const [gOpen,setGOpen]=useState<Record<string,boolean>>({});
 useEffect(()=>{try{setGOpen(JSON.parse(localStorage.getItem('teachy-nav-groups')||'{}'))}catch{/* private mode */}},[]);
 const flip=(id:string,cur:boolean)=>setGOpen(g=>{const n={...g,[id]:!cur};try{localStorage.setItem('teachy-nav-groups',JSON.stringify(n))}catch{/* private mode */}return n});
 const item=({href,icon:Icon,label}:(typeof work)[number])=><Link className={active(href)?'active':''} href={href} key={href} title={collapsed?label:undefined} aria-label={label} onClick={()=>setOpen(false)}><Icon size={18}/><span className="nl">{label}</span>{href==='/taken'&&user&&<TaskBadge/>}</Link>;
 const both=canTeach&&studentLinks.length>0;
 const meta=(user?.user_metadata||{}) as {avatar_url?:string;picture?:string};const avatar=meta.avatar_url||meta.picture||'';
 const active=(href:string)=>href==='/'?path==='/':path.startsWith(href);
 function switchTo(m:'teacher'|'student'){setMode(m);setOpen(false);router.push('/')}
 return <div className={'shell'+(collapsed?' side-collapsed':'')}>
  <aside className={'side'+(open?' open':'')}>
   <div className="side-head"><Link className="brand" href="/" onClick={()=>setOpen(false)}><span className="brandmark"><GraduationCap size={20}/></span><span>{tt("TeachyRooms")}</span></Link></div>
   <div className="navlabel">{mode==='teacher'?tt('Docent'):tt('Mijn leeromgeving')}</div>
   <nav className="navlinks">{links.map(l=>mode!=='teacher'&&l.href==='/'&&path==='/'&&!collapsed?<div key="home">{item(l)}<SectionLinks/></div>:item(l))}</nav>
   {mode==='teacher'&&groups.map(g=>{const here=g.items.some(i=>active(i.href));const isOpen=collapsed||here||!!gOpen[g.id];
    return <div className={'navgroup'+(isOpen?' open':'')} key={g.id}><button type="button" className="navgroup-head" aria-expanded={isOpen} onClick={()=>flip(g.id,isOpen)} title={collapsed?g.label:undefined}><span className="nl">{g.label}</span>{g.id==='admin'&&!isOpen&&user&&<TaskBadge/>}<ChevronDown size={14} className="chev" aria-hidden/></button>
     {isOpen&&<nav className="navlinks">{g.items.map(item)}</nav>}</div>})}
   {mode!=='teacher'&&<Suspense fallback={null}><SideLanguages onNavigate={()=>setOpen(false)}/></Suspense>}
   <button type="button" className="side-fold" onClick={()=>persist(!collapsed)} title={collapsed?tt('Menu uitklappen'):tt('Menu inklappen tot iconen')} aria-label={collapsed?tt('Menu uitklappen'):tt('Menu inklappen tot iconen')}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}<span className="nl">{tt('Inklappen')}</span></button>
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

/** v74: scrollspy for the student's overview — the four sections under "Overzicht" in the sidebar. The section in view
 *  is marked (IntersectionObserver, no dependency); a click scrolls smoothly (instantly with reduced motion). */
const SECTIONS:[string,string][]=[['vandaag','Vandaag'],['doelen','Mijn doelen'],['voortgang-kort','Mijn voortgang'],['activiteit','Mijn activiteit']];
function SectionLinks(){
 const [cur,setCur]=useState('vandaag');
 useEffect(()=>{let io:IntersectionObserver|null=null;let tries=0;const vis=new Map<string,number>();
  const start=()=>{const els=SECTIONS.map(([id])=>document.getElementById(id)).filter(Boolean) as HTMLElement[];
   if(els.length<2&&tries++<20){window.setTimeout(start,400);return}
   io=new IntersectionObserver(es=>{for(const e of es)vis.set(e.target.id,e.isIntersecting?e.intersectionRatio:0);const best=SECTIONS.map(([id])=>id).find(id=>(vis.get(id)||0)>0.15);if(best)setCur(best)},{rootMargin:'-80px 0px -45% 0px',threshold:[0,.15,.4,.7]});
   els.forEach(el=>io!.observe(el))};
  start();return()=>io?.disconnect()},[]);
 const go=(id:string)=>{const el=document.getElementById(id);if(!el)return;const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;el.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});setCur(id)};
 return <div className="navsub" role="list">{SECTIONS.map(([id,l])=><button type="button" role="listitem" key={id} className={cur===id?'on':''} aria-current={cur===id?'location':undefined} onClick={()=>go(id)}>{tt(l)}</button>)}</div>
}