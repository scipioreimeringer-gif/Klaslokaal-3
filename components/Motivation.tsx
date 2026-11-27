'use client';
// v74: "Mijn doelen", "Mijn voortgang" and "Mijn activiteit" on the student's overview, and the full milestone list in
// Voortgang. Everything comes from useStats (the same data as Voortgang) and lib/motivation (derived, idempotent XP).
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Flame,Target,Star,Trophy,BookOpenCheck,Languages,Clock3,Route,CheckCircle2,GraduationCap,ClipboardList,Award} from 'lucide-react';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';
import {useStats,summarize} from './Progress';
import {practiceDays,weekProgress,xpOf,milestones,goalWeeks,localDay,type Milestone} from '../lib/motivation';
import {wordGrowth} from '../lib/progressStats';
import {LineChart,CHART} from './Charts';

const today=()=>new Date().toLocaleDateString('en-CA');
/** The personal week goal (days per week) per learning language, stored with the student's own account. */
export function useWeekGoal(lang:string){
 const {user}=useAuth();const meta=(user?.user_metadata||{}) as {week_goals?:Record<string,number>};
 const [goal,setG]=useState<number>(meta.week_goals?.[lang]||3);
 useEffect(()=>{setG(meta.week_goals?.[lang]||3)},[lang,meta.week_goals?.[lang]]);// eslint-disable-line react-hooks/exhaustive-deps
 const set=(n:number)=>{setG(n);void supabase()?.auth.updateUser({data:{week_goals:{...(meta.week_goals||{}),[lang]:n}}}).catch(()=>{})};
 return [goal,set] as const;
}

type Raw=NonNullable<ReturnType<typeof useStats>['d']>;
export function motivationOf(d:Raw,goal:number){
 const days=practiceDays(d.practice);const s=summarize(d,'all');
 const xp=xpOf({practice:d.practice,homeworkDone:s.hw.done,lessons:s.les.count,goal});
 const ms=milestones({lessonDates:d.lessons.map(l=>l.lesson_date),lessonMinutes:d.lessons.filter(l=>l.session?.joint_seconds).map(l=>({date:l.lesson_date,minutes:Math.round((l.session!.joint_seconds||0)/60)})),
  homeworkDates:d.submittedAt,practisedWords:s.voc.practised,masteredDates:d.progress.filter(p=>p.status==='mastered').map(p=>p.updated_at||'').filter(Boolean),goalWeeks:goalWeeks(days,goal)});
 return {s,xp,week:weekProgress(days,goal,today()),ms,days};
}

const ICON:Record<Milestone['icon'],typeof Star>={lesson:BookOpenCheck,homework:ClipboardList,words:Languages,goal:Target,grammar:GraduationCap,time:Clock3};
function MilestoneItem({m,fresh}:{m:Milestone;fresh?:boolean}){const I=ICON[m.icon];
 return <li className={'ms'+(fresh?' fresh':'')}><span className="ms-ic"><I size={15}/></span><span><b>{t(m.label)}</b>{m.date&&<small className="muted"> · {new Date(m.date+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'})}</small>}</span></li>}

/** The three dashboard sections below "Vandaag". */
export function StudentMotivation({studentId,lang,level}:{studentId:string;lang:string;level?:string|null}){
 const {d}=useStats([studentId]);const [goal,setGoal]=useWeekGoal(lang);
 const m=useMemo(()=>d?motivationOf(d,goal):null,[d,goal]);
 // a milestone reached for the first time gets one short celebration (remembered per relation on this device)
 const [fresh,setFresh]=useState<string[]>([]);
 useEffect(()=>{if(!m)return;const k='teachy-ms-seen-'+studentId;try{const seen=new Set(JSON.parse(localStorage.getItem(k)||'null')||[]);const first=localStorage.getItem(k)===null;
  const now=m.ms.map(x=>x.key);const nw=first?[]:now.filter(x=>!seen.has(x));setFresh(nw);localStorage.setItem(k,JSON.stringify(now))}catch{/* private mode */}},[m,studentId]);
 if(!d||!m)return <section className="dash-sec"><div className="loader small"/></section>;
 const {s,xp,week}=m;const growth=wordGrowth(d.vocab,6);
 const last14=Array.from({length:14},(_,i)=>{const x=new Date(Date.now()-(13-i)*86400e3).toLocaleDateString('en-CA');return {day:x,n:d.practice.filter(r=>(r.kind==='daily'&&r.details?.day?r.details.day:localDay(r.created_at))===x).length}});
 const max=Math.max(1,...last14.map(x=>x.n));const recent=d.practice.slice(0,3);
 const DOW=['ma','di','wo','do','vr','za','zo'];
 return <>
  <section className="dash-sec" id="doelen" aria-labelledby="h-doelen"><h2 id="h-doelen" className="sec-h">{t('Mijn doelen')}</h2>
   <div className="goal-grid">
    <div className="mcard tone-gold"><Flame size={18}/><div><b className="big">{s.st.current}</b><span>{t('dagen op rij')}</span><small className="muted">{t('Langste reeks: {0}',s.st.longest)}</small></div></div>
    <div className="mcard tone-teal week">
     <div className="row between"><span className="lbl"><Target size={15}/> {t('Weekdoel')}</span>
      <select className="cell" aria-label={t('Weekdoel')} value={goal} onChange={e=>setGoal(Number(e.target.value))}>{[3,5,7].map(n=><option key={n} value={n}>{n===7?t('Elke dag'):t('{0} dagen per week',n)}</option>)}</select></div>
     <div className="week-dots">{week.week.map((x,i)=><span key={x.day} className={'wd'+(x.done?' on':'')+(x.future?' fut':'')} title={x.day}>{t(DOW[i])}</span>)}</div>
     <div className="bar"><span style={{width:Math.min(100,week.done/goal*100)+'%'}}/></div>
     <small className={week.reached?'ok-text':'muted'}>{week.reached?t('Weekdoel gehaald! 🎉'):t('{0} van {1} dagen deze week',week.done,goal)}</small></div>
    <div className="mcard tone-violet" title={t('Lessen {0} · dagelijkse oefening {1} · spelletjes {2} · huiswerk {3} · weekdoelen {4}',xp.lessons,xp.daily,xp.games,xp.homework,xp.weeks)}><Star size={18}/><div><b className="big">{xp.total}</b><span>{t('XP')}</span><small className="muted">{t('Uit je lessen, oefeningen en huiswerk')}</small></div></div>
   </div>
   {m.ms.length>0&&<div className="ms-recent"><h3><Trophy size={15}/> {t('Recente mijlpalen')}</h3><ul className="ms-list">{m.ms.slice(0,3).map(x=><MilestoneItem key={x.key} m={x} fresh={fresh.includes(x.key)}/>)}</ul>
    <Link className="textlink" href="/voortgang">{t('Alle mijlpalen')} →</Link></div>}
  </section>
  <section className="dash-sec" id="voortgang-kort" aria-labelledby="h-vg"><h2 id="h-vg" className="sec-h">{t('Mijn voortgang')}</h2>
   <div className="kpi-grid">
    <div className="kpi tone-teal"><GraduationCap size={16}/><b>{level||'—'}</b><span>{t('Niveau')}</span></div>
    <div className="kpi tone-teal"><Languages size={16}/><b>{s.voc.total}</b><span>{t('Woorden in je woordenbank')}</span></div>
    <div className="kpi tone-green"><CheckCircle2 size={16}/><b>{s.voc.mastered}</b><span>{t('Aantoonbaar beheerst')}</span></div>
    <div className="kpi tone-blue"><Clock3 size={16}/><b>{s.les.measured?t('{0} u {1} min',Math.floor(s.les.minutes/60),s.les.minutes%60):'—'}</b><span>{t('Gevolgde lestijd')}</span></div>
    <div className="kpi tone-violet"><Route size={16}/><b>{s.gr.mastered}/{s.gr.covered}</b><span>{t('Grammatica beheerst / behandeld')}</span></div>
    <div className="kpi tone-gold"><Award size={16}/><b>{s.pr.pct!==null?s.pr.pct+'%':'—'}</b><span>{t('Correct bij oefenen')}</span></div>
   </div>
   <Link className="textlink" href="/voortgang">{t('Alle statistieken')} →</Link>
  </section>
  <section className="dash-sec" id="activiteit" aria-labelledby="h-act"><h2 id="h-act" className="sec-h">{t('Mijn activiteit')}</h2>
   <div className="act-grid">
    <div className="card act-days"><h3>{t('Oefenen, laatste 14 dagen')}</h3><div className="days14">{last14.map(x=><span key={x.day} title={x.day+': '+x.n}><i style={{height:(x.n/max*100)+'%'}} className={x.n?'on':''}/></span>)}</div>
     {!d.practice.length&&<p className="muted small">{t('Nog niet geoefend. Begin met de dagelijkse oefening!')}</p>}</div>
    <div className="card"><h3>{t('Recente resultaten')}</h3>{recent.length?<ul className="recent-list">{recent.map((r,i)=><li key={i}><span>{new Date(r.created_at).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'})}</span><b>{r.total?`${r.score}/${r.total}`:'—'}</b></li>)}</ul>:<p className="muted small">{t('Nog geen oefenresultaten.')}</p>}</div>
    <div className="card"><h3>{t('Groei van je woordenbank')}</h3>{d.vocab.length?<LineChart data={growth} color={CHART.violet}/>:<p className="muted small">{t('Nog geen woorden in je woordenbank.')}</p>}</div>
   </div>
  </section>
 </>
}

/** Voortgang → Statistieken: the full milestone list (real data only). */
export function MilestoneList({studentId,lang}:{studentId:string;lang:string}){
 const {d}=useStats([studentId]);const [goal]=useWeekGoal(lang);const m=useMemo(()=>d?motivationOf(d,goal):null,[d,goal]);
 if(!m)return null;
 return <div className="ms-all"><h4 className="stats-h">{t('Mijlpalen')}</h4>{m.ms.length?<ul className="ms-list grid">{m.ms.map(x=><MilestoneItem key={x.key} m={x}/>)}</ul>:<p className="muted small">{t('Nog geen mijlpalen. Je eerste les of huiswerk is de eerste!')}</p>}
  <p className="muted small">{t('XP: {0} · alleen uit echte activiteiten; XP verandert nooit je niveau of je leerlijn.',m.xp.total)}</p></div>
}
