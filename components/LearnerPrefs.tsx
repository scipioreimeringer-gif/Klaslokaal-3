'use client';
// v54: ONE active learning language and the student's own level per language — shared by the sidebar ("Mijn talen"),
// the practice page and the settings. Stored with the student's own account (Supabase auth user metadata: no extra
// table, other accounts are never affected) plus a per-account copy on this device, so the choice survives navigation,
// refresh, logging in again and other devices. This is NOT the interface language (that stays separate).
import {useCallback,useEffect,useState} from 'react';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';

type Prefs={active:string;levels:Record<string,string>};
const EV='teachy-learner-prefs';
const lsKey=(uid:string)=>'teachy-learner-'+uid;
function readLocal(uid:string):Partial<Prefs>{try{return JSON.parse(localStorage.getItem(lsKey(uid))||'{}') as Partial<Prefs>}catch{return {}}}
function writeLocal(uid:string,p:Prefs){try{localStorage.setItem(lsKey(uid),JSON.stringify(p))}catch{/* private mode */}}

/** The active learning language (code) and own levels per language for the logged-in account. */
export function useLearnerPrefs(){
 const {user}=useAuth();const uid=user?.id||'';
 const meta=(user?.user_metadata||{}) as {active_language?:string;levels?:Record<string,string>};
 const merge=useCallback(():Prefs=>{const l=uid?readLocal(uid):{};return {active:l.active||meta.active_language||'',levels:{...(meta.levels||{}),...(l.levels||{})}}},[uid,meta.active_language,meta.levels]);
 const [p,setP]=useState<Prefs>(()=>({active:'',levels:{}}));
 useEffect(()=>{setP(merge())},[merge]);
 useEffect(()=>{const f=()=>setP(merge());window.addEventListener(EV,f);window.addEventListener('storage',f);return()=>{window.removeEventListener(EV,f);window.removeEventListener('storage',f)}},[merge]);
 const save=useCallback((next:Prefs)=>{if(!uid)return;writeLocal(uid,next);setP(next);window.dispatchEvent(new Event(EV));
  void supabase()?.auth.updateUser({data:{active_language:next.active,levels:next.levels}}).catch(()=>{/* offline: the device copy keeps it */})},[uid]);
 const setActive=useCallback((code:string)=>{const cur=merge();if(!code||cur.active===code)return;save({...cur,active:code})},[merge,save]);
 const setLevel=useCallback((lang:string,level:string)=>{const cur=merge();const levels={...cur.levels};if(level)levels[lang]=level;else delete levels[lang];save({...cur,levels})},[merge,save]);
 return {active:p.active,levels:p.levels,setActive,setLevel,ready:!!uid};
}
