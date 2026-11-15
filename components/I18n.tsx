'use client';
import {createContext,useContext,useEffect,useState} from 'react';
export const labels={nl:['Dashboard','Leerlingen','Klaslokaal','Agenda','AI & tools','Bibliotheek','Mijn docentprofiel','Jouw onderwijsruimte','Testomgeving'],en:['Dashboard','Students','Classroom','Calendar','AI & tools','Library','Teacher profile','Your teaching space','Demo environment'],es:['Panel','Estudiantes','Aula','Calendario','IA y herramientas','Biblioteca','Perfil docente','Tu espacio educativo','Entorno de prueba'],pt:['Painel','Alunos','Sala de aula','Agenda','IA e ferramentas','Biblioteca','Perfil do professor','Seu espaço de ensino','Ambiente de teste'],de:['Dashboard','Schüler','Klassenzimmer','Kalender','KI & Tools','Bibliothek','Lehrerprofil','Dein Lernraum','Testumgebung'],fr:['Tableau de bord','Élèves','Salle de classe','Calendrier','IA et outils','Bibliothèque','Profil enseignant','Votre espace pédagogique','Environnement test']} as const;
export type Lang=keyof typeof labels;
/** Labels added in v27: overview, my lessons, Portuguese, teacher, student, sign out, manage teachers. */
export const extra:Record<Lang,[string,string,string,string,string,string,string,string,string]>={
 nl:['Overzicht','Mijn lessen','Portugees','Docent','Leerling','Uitloggen','Docenten beheren','Leerlijnen','Oefenen'],
 en:['Overview','My lessons','Portuguese','Teacher','Student','Sign out','Manage teachers','Learning paths','Practice'],
 es:['Resumen','Mis clases','Portugués','Docente','Alumno','Cerrar sesión','Gestionar docentes','Itinerarios','Practicar'],
 pt:['Visão geral','Minhas aulas','Português','Professor','Aluno','Sair','Gerenciar professores','Trilhas','Praticar'],
 de:['Übersicht','Meine Stunden','Portugiesisch','Lehrkraft','Schüler','Abmelden','Lehrkräfte verwalten','Lernpfade','Üben'],
 fr:['Aperçu','Mes cours','Portugais','Enseignant','Élève','Se déconnecter','Gérer les enseignants','Parcours','S’entraîner'],
};
const Context=createContext<{lang:Lang;setLang:(x:Lang)=>void}>({lang:'nl',setLang:()=>{}});
export function LanguageProvider({children}:{children:React.ReactNode}){const [lang,setLang]=useState<Lang>('nl');useEffect(()=>{const v=localStorage.getItem('klaslokaal-language') as Lang;if(v&&v in labels)setLang(v)},[]);function change(x:Lang){setLang(x);localStorage.setItem('klaslokaal-language',x)}return <Context.Provider value={{lang,setLang:change}}>{children}</Context.Provider>}
export const useLanguage=()=>useContext(Context);
