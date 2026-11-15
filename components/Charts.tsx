'use client';
import {useId,useState} from 'react';
import {BarChart3} from 'lucide-react';
import type {Point} from '../lib/stats';
import {t as tt} from '../lib/i18n';

/* Validated categorical chart palette (validate_palette.js, light mode: all checks pass).
   Brand teal #168F91 is too grey for data marks, so charts use its more saturated sibling. */
export const CHART={teal:'#0F9A90',coral:'#E0674A',violet:'#7B72D6',ochre:'#B8891F'};

export function ChartCard({title,subtitle,children,empty,emptyText,table,className}:{title:string;subtitle?:string;children:React.ReactNode;empty?:boolean;emptyText?:string;table?:Point[];className?:string}){
 const [showTable,setShowTable]=useState(false);
 return <section className={'chart-card '+(className||'')}>
  <header className="chart-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{table&&!empty&&<button className="chart-toggle" onClick={()=>setShowTable(!showTable)} aria-pressed={showTable}>{showTable?tt("Grafiek"):tt("Tabel")}</button>}</header>
  {empty?<div className="chart-empty"><BarChart3 size={26}/><span>{emptyText||tt("Nog geen gegevens")}</span></div>
   :showTable&&table?<table className="vocab chart-table"><tbody>{table.map(p=><tr key={p.key}><td>{p.label}</td><td className="num">{p.value}</td></tr>)}</tbody></table>
   :children}
 </section>
}

const W=560,H=200,PAD={l:30,r:10,t:18,b:26};
function niceMax(v:number){if(v<=4)return 4;const step=Math.pow(10,Math.floor(Math.log10(v)))/2;return Math.ceil(v/step)*step}
function Grid({max}:{max:number}){const ticks=Number.isInteger(max/2)?[0,max/2,max]:[0,max];const ih=H-PAD.t-PAD.b;return <g className="chart-gridlines">{ticks.map(t=>{const y=PAD.t+ih-(t/max)*ih;return <g key={t}><line x1={PAD.l} x2={W-PAD.r} y1={y} y2={y}/><text x={PAD.l-6} y={y} dy="0.32em" textAnchor="end">{Number.isInteger(t)?t:t.toFixed(1)}</text></g>})}</g>}

export function BarChart({data,color=CHART.teal,unit=''}:{data:Point[];color?:string;unit?:string}){
 const [hover,setHover]=useState<number|null>(null);const max=niceMax(Math.max(1,...data.map(d=>d.value)));
 const iw=W-PAD.l-PAD.r,ih=H-PAD.t-PAD.b,slot=iw/data.length,bw=Math.min(36,slot*0.56);
 const last=data.length-1;
 return <div className="chart-wrap"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={data.map(d=>`${d.label}: ${d.value}${unit}`).join(', ')}>
  <Grid max={max}/>
  {data.map((d,i)=>{const h=(d.value/max)*ih;const x=PAD.l+slot*i+(slot-bw)/2;const y=PAD.t+ih-h;const r=Math.min(4,h/2,bw/2);
   const path=h>0?`M${x},${PAD.t+ih} V${y+r} Q${x},${y} ${x+r},${y} H${x+bw-r} Q${x+bw},${y} ${x+bw},${y+r} V${PAD.t+ih} Z`:'';
   return <g key={d.key} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} tabIndex={0}>
    <rect x={PAD.l+slot*i} y={PAD.t} width={slot} height={ih} fill="transparent"/>
    {path&&<path d={path} fill={color} className="bar" style={{animationDelay:i*60+'ms',opacity:hover===null||hover===i?1:.55}}/>}
    {(i===last||hover===i)&&d.value>0&&<text className="chart-value" x={x+bw/2} y={y-6} textAnchor="middle">{d.value}{unit}</text>}
    <text className="chart-axis" x={x+bw/2} y={H-8} textAnchor="middle">{d.label}</text></g>})}
 </svg>{hover!==null&&<div className="chart-tip" style={{left:`${((PAD.l+slot*hover+slot/2)/W)*100}%`}}><b>{data[hover].label}</b>{data[hover].value}{unit}</div>}</div>
}

export function LineChart({data,color=CHART.violet,unit=''}:{data:Point[];color?:string;unit?:string}){
 const gid=useId().replace(/:/g,'');const [hover,setHover]=useState<number|null>(null);const max=niceMax(Math.max(1,...data.map(d=>d.value)));
 const iw=W-PAD.l-PAD.r,ih=H-PAD.t-PAD.b;const step=data.length>1?iw/(data.length-1):0;
 const pts=data.map((d,i)=>[PAD.l+step*i,PAD.t+ih-(d.value/max)*ih] as const);
 const line=pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ');const area=line+` L${pts[pts.length-1][0]},${PAD.t+ih} L${pts[0][0]},${PAD.t+ih} Z`;
 const last=data.length-1;
 return <div className="chart-wrap"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={data.map(d=>`${d.label}: ${d.value}${unit}`).join(', ')}
   onMouseLeave={()=>setHover(null)} onMouseMove={e=>{const r=(e.currentTarget as SVGSVGElement).getBoundingClientRect();const x=((e.clientX-r.left)/r.width)*W;setHover(Math.max(0,Math.min(last,Math.round((x-PAD.l)/(step||1)))))}}>
  <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
  <Grid max={max}/>
  <path d={area} fill={`url(#${gid})`} className="area"/>
  <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="line" pathLength={1}/>
  {hover!==null&&<line className="crosshair" x1={pts[hover][0]} x2={pts[hover][0]} y1={PAD.t} y2={PAD.t+ih}/>}
  {pts.map((p,i)=>(i===last||i===hover)&&<circle key={i} cx={p[0]} cy={p[1]} r={4.5} fill={color} stroke="#fff" strokeWidth={2}/>)}
  <text className="chart-value" x={pts[last][0]} y={pts[last][1]-10} textAnchor="end">{data[last].value}{unit}</text>
  {data.map((d,i)=><text key={d.key} className="chart-axis" x={pts[i][0]} y={H-8} textAnchor="middle">{d.label}</text>)}
 </svg>{hover!==null&&<div className="chart-tip" style={{left:`${(pts[hover][0]/W)*100}%`}}><b>{data[hover].label}</b>{data[hover].value}{unit}</div>}</div>
}

/** Progress ring (a single share), e.g. homework handed in. */
export function ProgressRing({pct,label,detail,color=CHART.teal}:{pct:number;label:string;detail?:string;color?:string}){
 const r=46,c=2*Math.PI*r;
 return <div className="ring"><svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${pct}%`}><circle cx="60" cy="60" r={r} className="ring-track"/><circle cx="60" cy="60" r={r} className="ring-value" stroke={color} strokeDasharray={c} strokeDashoffset={c*(1-pct/100)} transform="rotate(-90 60 60)"/><text x="60" y="58" textAnchor="middle" className="ring-pct">{pct}%</text><text x="60" y="76" textAnchor="middle" className="ring-label">{label}</text></svg>{detail&&<p className="muted">{detail}</p>}</div>
}

/** Horizontal bars with direct labels (lessons per subject / per student). */
export function HBars({data,color=CHART.teal,unit=''}:{data:Point[];color?:string;unit?:string}){
 const max=Math.max(1,...data.map(d=>d.value));
 return <ul className="hbars">{data.map((d,i)=><li key={d.key}><span className="hbar-label">{d.label}</span><span className="hbar-track"><span className="hbar-fill" style={{width:`${(d.value/max)*100}%`,background:color,animationDelay:i*70+'ms'}}/></span><span className="hbar-value">{d.value}{unit}</span></li>)}</ul>
}

export function StatTile({icon:Icon,value,label,hint,tone='teal'}:{icon:React.ComponentType<{size?:number}>;value:React.ReactNode;label:string;hint?:string;tone?:'teal'|'mint'|'sky'|'coral'|'yellow'}){
 return <div className={'statcard tone-'+tone}><div className="stat-icon"><Icon size={19}/></div><strong>{value}</strong><span>{label}</span>{hint&&<small>{hint}</small>}</div>
}
