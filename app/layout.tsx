import './style.css';
import type {Metadata,Viewport} from 'next';
import {Plus_Jakarta_Sans} from 'next/font/google';
import {AuthProvider,AuthGate} from '../components/Auth';
import {LanguageProvider} from '../components/I18n';
// v40: Plus Jakarta Sans replaces Inter (one font family, self-hosted by next/font: no extra requests)
const sans=Plus_Jakarta_Sans({subsets:['latin','latin-ext'],display:'swap',variable:'--font-sans'});
export const metadata:Metadata={title:'TeachyRooms',description:'Jouw online klaslokaal: per leerling een eigen bord, notities, woorden en huiswerk.',
 icons:{icon:'/icons/icon-192.png',apple:'/icons/apple-touch-icon.png'},appleWebApp:{capable:true,title:'TeachyRooms',statusBarStyle:'default'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#0C4853'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="nl" className={sans.variable}><body><AuthProvider><LanguageProvider><AuthGate>{children}</AuthGate></LanguageProvider></AuthProvider></body></html>}
