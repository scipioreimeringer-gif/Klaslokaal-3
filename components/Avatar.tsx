'use client';
// Profile photos: private Supabase Storage bucket "avatars" (v29), path <user_id>/<file>.
// Readable only by the owner and the people they have lessons with (RLS); shown via short-lived signed URLs.
import {useEffect,useRef,useState} from 'react';
import {Camera,Trash2,Upload,ZoomIn} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {useAuth} from './Auth';

export type Person={user_id:string;full_name:string;avatar_path:string|null;google_avatar:string|null;teaching_languages:string[]};
const MAX_INPUT=8*1024*1024, OUT=512, TYPES=['image/jpeg','image/png','image/webp'];

/* ---------- shared cache: who is related to me + signed URLs ---------- */
let peopleP:Promise<Map<string,Person>>|null=null;let peopleFor='';
const listeners=new Set<()=>void>();
const urls=new Map<string,{url:string;exp:number}>();
function loadPeople(uid:string){
 if(peopleFor!==uid){peopleP=null;peopleFor=uid}
 if(!peopleP)peopleP=(async()=>{const db=supabase();if(!db)return new Map();const {data,error}=await db.rpc('related_people');if(error)return new Map();return new Map(((data||[]) as Person[]).map(p=>[p.user_id,p]))})();
 return peopleP;
}
export function refreshPeople(){peopleP=null;listeners.forEach(f=>f())}
async function signed(path:string){
 const hit=urls.get(path);if(hit&&hit.exp>Date.now())return hit.url;
 const {data}=await supabase()!.storage.from('avatars').createSignedUrl(path,3600);
 if(!data?.signedUrl)return '';urls.set(path,{url:data.signedUrl,exp:Date.now()+50*60*1000});return data.signedUrl;
}
export function usePeople(){
 const {user}=useAuth();const uid=user?.id||'';const [m,setM]=useState<Map<string,Person>>(new Map());
 useEffect(()=>{if(!uid){setM(new Map());return}let on=true;const f=()=>void loadPeople(uid).then(x=>{if(on)setM(x)});f();listeners.add(f);return()=>{on=false;listeners.delete(f)}},[uid]);
 return m;
}
/** Photo URL for a user: own upload, else Google photo, else '' (initial is shown). */
export function usePhoto(userId?:string|null,googleFallback?:string){
 const people=usePeople();const p=userId?people.get(userId):undefined;const [url,setUrl]=useState('');
 const path=p?.avatar_path||'';const google=p?.google_avatar||googleFallback||'';
 useEffect(()=>{let on=true;if(path)void signed(path).then(u=>{if(on)setUrl(u||google)});else setUrl(google);return()=>{on=false}},[path,google]);
 return url;
}

export function Avatar({userId,name,size=36,className='',google}:{userId?:string|null;name:string;size?:number;className?:string;google?:string}){
 const url=usePhoto(userId,google);const [broken,setBroken]=useState(false);
 useEffect(()=>setBroken(false),[url]);
 const style={width:size,height:size,fontSize:Math.round(size*0.42)};
 if(url&&!broken)return <img className={'avatar-img '+className} src={url} alt="" style={style} referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>;
 return <span className={'avatar-img initial '+className} style={style} aria-hidden>{(name||'?').trim()[0]?.toUpperCase()||'?'}</span>;
}

/* ---------- editor: choose, crop (square → round), save, replace, remove ---------- */
export function AvatarEditor(){
 const {user}=useAuth();const people=usePeople();const me=user?people.get(user.id):undefined;
 const meta=(user?.user_metadata||{}) as {avatar_url?:string;picture?:string;full_name?:string};
 const [img,setImg]=useState<HTMLImageElement|null>(null);const [zoom,setZoom]=useState(1);const [off,setOff]=useState({x:0,y:0});
 const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);const cv=useRef<HTMLCanvasElement>(null);const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);const file=useRef<HTMLInputElement>(null);
 const VIEW=240;
 /** Geometry shared by preview and export: image covers the square, then zoom + pan. */
 function geom(size:number){if(!img)return null;const base=Math.max(size/img.width,size/img.height)*zoom;const w=img.width*base,h=img.height*base;const k=size/VIEW;
  const maxX=(w-size)/2,maxY=(h-size)/2;const x=Math.max(-maxX,Math.min(maxX,off.x*k)),y=Math.max(-maxY,Math.min(maxY,off.y*k));return {w,h,x:(size-w)/2+x,y:(size-h)/2+y}}
 useEffect(()=>{const c=cv.current;if(!c||!img)return;const g=geom(VIEW)!;const d=c.getContext('2d')!;d.clearRect(0,0,VIEW,VIEW);d.drawImage(img,g.x,g.y,g.w,g.h)},[img,zoom,off]);// eslint-disable-line react-hooks/exhaustive-deps
 function pick(f:File|undefined){setMsg('');if(!f)return;if(!TYPES.includes(f.type)){setMsg('Kies een JPG-, PNG- of WebP-afbeelding.');return}if(f.size>MAX_INPUT){setMsg('Deze afbeelding is groter dan 8 MB. Kies een kleinere foto.');return}
  const u=URL.createObjectURL(f);const i=new Image();i.onload=()=>{setImg(i);setZoom(1);setOff({x:0,y:0})};i.onerror=()=>setMsg('Deze afbeelding kan niet worden gelezen.');i.src=u}
 async function save(){if(!user||!img)return;setBusy(true);setMsg('');
  try{const c=document.createElement('canvas');c.width=c.height=OUT;const g=geom(OUT)!;c.getContext('2d')!.drawImage(img,g.x,g.y,g.w,g.h);
   let blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/webp',0.88));if(!blob||blob.type!=='image/webp')blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',0.9));if(!blob)throw new Error('Afbeelding maken mislukt');
   const ext=blob.type==='image/webp'?'webp':'jpg';const path=`${user.id}/avatar-${Date.now()}.${ext}`;const db=supabase()!;
   const up=await db.storage.from('avatars').upload(path,blob,{contentType:blob.type,upsert:false});if(up.error)throw new Error(/bucket/i.test(up.error.message)?'De opslag voor profielfoto’s ontbreekt nog: voer supabase/v29.sql uit.':up.error.message);
   const r=await db.rpc('set_my_avatar',{path});if(r.error){await db.storage.from('avatars').remove([path]);throw new Error(r.error.message)}
   if(me?.avatar_path&&me.avatar_path!==path)await db.storage.from('avatars').remove([me.avatar_path]);
   setImg(null);setMsg('Profielfoto opgeslagen.');refreshPeople()}catch(e){setMsg(e instanceof Error?e.message:'Opslaan mislukt')}finally{setBusy(false)}}
 async function remove(){if(!user||!me?.avatar_path)return;if(!confirm('Je profielfoto verwijderen? Daarna wordt je Google-foto of je initiaal getoond.'))return;setBusy(true);
  const db=supabase()!;const r=await db.rpc('set_my_avatar',{path:null});if(r.error){setMsg(r.error.message);setBusy(false);return}await db.storage.from('avatars').remove([me.avatar_path]);setBusy(false);setMsg('Profielfoto verwijderd.');refreshPeople()}
 const name=me?.full_name||meta.full_name||user?.email||'';
 return <section className="card avatar-editor"><h3><Camera size={17}/> Profielfoto</h3>
  {!img?<div className="row">
    <Avatar userId={user?.id} name={name} size={88} google={meta.avatar_url||meta.picture}/>
    <div className="stack grow"><p className="muted">{me?.avatar_path?'Je eigen foto wordt getoond aan jou en aan de mensen met wie je les hebt.':(meta.avatar_url||meta.picture)?'Nu wordt je Google-foto gebruikt.':'Nog geen foto: je initiaal wordt getoond.'} JPG, PNG of WebP.</p>
     <div className="row"><button className="button small" disabled={busy} onClick={()=>file.current?.click()}><Upload size={15}/> {me?.avatar_path?'Foto wijzigen':'Foto uploaden'}</button>{me?.avatar_path&&<button className="button secondary small" disabled={busy} onClick={()=>void remove()}><Trash2 size={15}/> Verwijderen</button>}</div></div>
   </div>:<div className="crop">
    <div className="crop-view" style={{width:VIEW,height:VIEW}} onPointerDown={e=>{(e.target as HTMLElement).setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,ox:off.x,oy:off.y}}} onPointerMove={e=>{const d=drag.current;if(d)setOff({x:d.ox+e.clientX-d.x,y:d.oy+e.clientY-d.y})}} onPointerUp={()=>{drag.current=null}}>
     <canvas ref={cv} width={VIEW} height={VIEW}/><span className="crop-ring" aria-hidden/></div>
    <label className="row crop-zoom"><ZoomIn size={16}/><input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e=>setZoom(+e.target.value)} aria-label="Inzoomen"/></label>
    <p className="muted small">Sleep om de uitsnede te kiezen. De foto wordt rond getoond.</p>
    <div className="row"><button className="button small" disabled={busy} onClick={()=>void save()}>{busy?'Opslaan…':'Opslaan'}</button><button className="button secondary small" disabled={busy} onClick={()=>setImg(null)}>Annuleren</button></div>
   </div>}
  <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{pick(e.target.files?.[0]);e.target.value=''}}/>
  {msg&&<p className="muted" role="status">{msg}</p>}
 </section>
}
