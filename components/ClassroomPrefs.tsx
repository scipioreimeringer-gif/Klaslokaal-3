'use client';
// v74: personal video settings follow the ACCOUNT (not only this device). The classroom keeps reading and writing its own
// localStorage keys (no change to the call, camera or microphone code); this hook (1) copies the account's saved values
// into those keys before the classroom loads and (2) saves changes back to the account's own user metadata (no table, no
// other account affected). Every key is per role (…-t teacher / …-s student), so a teacher's choice never overwrites the
// student's — also when one account is both.
import {useEffect,useState} from 'react';
import {useAuth} from './Auth';
import {supabase} from '../lib/supabase';
import {PREF_KEYS,prefsToApply} from '../lib/classroomPrefs';

const STAMP='klas-prefs-at';

export function useClassroomPrefs(){
 const {user}=useAuth();const [ready,setReady]=useState(false);
 useEffect(()=>{if(!user){setReady(false);return}
  const meta=(user.user_metadata||{}) as {classroom_prefs?:{at?:number;values?:Record<string,unknown>}};
  try{const local=Number(localStorage.getItem(STAMP)||0);const apply=prefsToApply(meta.classroom_prefs,local);
   for(const [k,v] of Object.entries(apply))localStorage.setItem(k,v);if(Object.keys(apply).length)localStorage.setItem(STAMP,String(meta.classroom_prefs!.at))}catch{/* private mode */}
  setReady(true);
  let timer=0;
  const save=()=>{try{const values:Record<string,unknown>={};for(const k of PREF_KEYS){const v=localStorage.getItem(k);if(v!==null)try{values[k]=JSON.parse(v)}catch{/* skip */}}
   const at=Date.now();localStorage.setItem(STAMP,String(at));void supabase()?.auth.updateUser({data:{classroom_prefs:{at,values}}}).catch(()=>{/* offline: the device copy keeps it */})}catch{/* private mode */}};
  // the classroom iframe writes localStorage; the browser tells this (same-origin) parent window via a storage event
  const onStore=(e:StorageEvent)=>{if(!e.key||!PREF_KEYS.includes(e.key))return;clearTimeout(timer);timer=window.setTimeout(save,1200)};
  window.addEventListener('storage',onStore);
  return()=>{window.removeEventListener('storage',onStore);clearTimeout(timer)}},[user?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 return ready;
}
