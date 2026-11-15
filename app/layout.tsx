import './style.css';
import type {Metadata,Viewport} from 'next';
import {Inter} from 'next/font/google';
import {AuthProvider,AuthGate} from '../components/Auth';
const inter=Inter({subsets:['latin'],display:'swap',variable:'--font-inter'});
export const metadata:Metadata={title:'TeachyRooms',description:'Jouw online klaslokaal: per leerling een eigen bord, notities, woorden en huiswerk.',
 icons:{icon:'/icons/icon-192.png',apple:'/icons/apple-touch-icon.png'},appleWebApp:{capable:true,title:'TeachyRooms',statusBarStyle:'default'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#0C4853'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="nl" className={inter.variable}><body><AuthProvider><AuthGate>{children}</AuthGate></AuthProvider></body></html>}
