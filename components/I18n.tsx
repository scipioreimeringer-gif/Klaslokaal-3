'use client';
// Interface language for the whole app (separate from the language someone learns or teaches).
// Order of preference: the user's profile (restored after logging in) → this device → the browser → Dutch.
// A change applies at once (the subtree re-renders in the new language) and is saved to the profile.
import {createContext,Fragment,useContext,useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {Check,ChevronDown} from 'lucide-react';
import {useAuth} from './Auth';
import {Flag} from './Flag';
import {supabase} from '../lib/supabase';
import {LANGS,NATIVE,isLang,setCurrentLang,getLang,loadMessages,messagesLoaded,t,type Lang} from '../lib/i18n';
export type {Lang} from '../lib/i18n';

const KEY='klaslokaal-language';
const Context=createContext<{lang:Lang;setLang:(x:Lang)=>void}>({lang:'nl',setLang:()=>{}});
/** Flag per interface language (English → UK flag, Portuguese → Brazilian flag). */
export const LANG_FLAG:Record<Lang,string>={nl:'nl',en:'en',pt:'pt',es:'es',fr:'fr',de:'de'};

export function LanguageProvider({children}:{children:React.ReactNode}){
 const {user}=useAuth();const [lang,setState]=useState<Lang>(getLang());const path=usePathname()||'';
 // the live classroom is never remounted on a language change (that would interrupt the lesson); it re-translates itself
 const remountKey=path.startsWith('/klaslokaal/live')?'live':lang;
 setCurrentLang(lang);
 // v40: another language first loads its translations (once), then switches — no half-translated screen
 const wanted=useRef<Lang>(lang);
 function apply(x:Lang){wanted.current=x;try{localStorage.setItem(KEY,x)}catch{}
  const go=()=>{if(wanted.current!==x)return;setCurrentLang(x);setState(x);if(typeof document!=='undefined')document.documentElement.lang=x==='pt'?'pt-BR':x};
  if(x==='nl'||messagesLoaded())go();else void loadMessages().then(go,()=>{/* offline: stay in the current language */})}
 // this device / browser
 useEffect(()=>{let v:string|null=null;try{v=localStorage.getItem(KEY)}catch{}if(!isLang(v)){const b=(navigator.language||'').slice(0,2).toLowerCase();v=isLang(b)?b:'nl'}if(isLang(v))apply(v)},[]);// eslint-disable-line react-hooks/exhaustive-deps
 // restore the saved choice after logging in
 useEffect(()=>{if(!user)return;void supabase()?.from('profiles').select('preferred_language').eq('id',user.id).maybeSingle().then(({data})=>{const p=(data as {preferred_language?:string}|null)?.preferred_language;if(isLang(p)&&p!==getLang())apply(p)})},[user?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 function change(x:Lang){apply(x);if(user)void supabase()?.rpc('set_my_language',{lang:x})}
 return <Context.Provider value={{lang,setLang:change}}><Fragment key={remountKey}>{children}</Fragment></Context.Provider>
}
export const useLanguage=()=>useContext(Context);

/** Language picker with SVG flags (emoji flags do not render on Windows). */
export function LanguagePicker({compact=false}:{compact?:boolean}){
 const {lang,setLang}=useLanguage();const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('mousedown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key)}},[open]);
 return <div className="langpick" ref={ref}>
  <button type="button" className="langpick-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={t('Taal van de website')} title={t('Taal van de website')} onClick={()=>setOpen(o=>!o)}><Flag code={LANG_FLAG[lang]} size={22}/>{!compact&&<span>{lang.toUpperCase()}</span>}<ChevronDown size={14}/></button>
  {open&&<ul className="langpick-menu" role="listbox" aria-label={t('Taal van de website')}>{LANGS.map(l=><li key={l}><button type="button" role="option" aria-selected={l===lang} onClick={()=>{setOpen(false);if(l!==lang)setLang(l)}}><Flag code={LANG_FLAG[l]} size={22}/><span>{NATIVE[l]}</span>{l===lang&&<Check size={15}/>}</button></li>)}</ul>}
 </div>
}
