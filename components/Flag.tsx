// Flags as inline SVG: Windows does not render flag emoji (it shows letters), SVG works everywhere.
import {languageName} from '../lib/languages';

const W = 30, H = 20;
function body(code: string) {
  switch (code) {
    case 'nl': return <><rect width={W} height={H} fill="#21468B"/><rect width={W} height={13.34} fill="#fff"/><rect width={W} height={6.67} fill="#AE1C28"/></>;
    case 'pt': return <><rect width={W} height={H} fill="#009C3B"/><polygon points="3,10 15,2.2 27,10 15,17.8" fill="#FFDF00"/><circle cx={15} cy={10} r={4.6} fill="#002776"/><path d="M10.6 9.1c3-0.9 6.3-0.6 8.9 0.9" stroke="#fff" strokeWidth={0.9} fill="none"/></>;
    case 'en': return <><rect width={W} height={H} fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth={4}/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" strokeWidth={1.6}/><path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth={6}/><path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth={3.4}/></>;
    case 'es': return <><rect width={W} height={H} fill="#AA151B"/><rect y={5} width={W} height={10} fill="#F1BF00"/></>;
    case 'fr': return <><rect width={W} height={H} fill="#EF4135"/><rect width={20} height={H} fill="#fff"/><rect width={10} height={H} fill="#0055A4"/></>;
    case 'de': return <><rect width={W} height={H} fill="#FFCE00"/><rect width={W} height={13.34} fill="#DD0000"/><rect width={W} height={6.67} fill="#000"/></>;
    case 'it': return <><rect width={W} height={H} fill="#CE2B37"/><rect width={20} height={H} fill="#fff"/><rect width={10} height={H} fill="#009246"/></>;
    default: return <><rect width={W} height={H} fill="#E3ECEA"/><text x={15} y={13.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#0C4853">{code.toUpperCase().slice(0, 2)}</text></>;
  }
}

export function Flag({code, size = 28, title}: {code: string; size?: number; title?: string}) {
  const id = 'flagclip-' + code;
  return <svg className="flag" width={size} height={size * H / W} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title || languageName(code)}>
    <defs><clipPath id={id}><rect width={W} height={H} rx={2.5}/></clipPath></defs>
    <g clipPath={`url(#${id})`}>{body(code)}</g>
    <rect width={W} height={H} rx={2.5} fill="none" stroke="rgba(0,0,0,.12)" strokeWidth={0.6}/>
  </svg>;
}
