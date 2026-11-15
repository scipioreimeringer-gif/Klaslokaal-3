'use client';
import {t} from '../../lib/i18n';
import Nav from '../../components/Nav';export default function Tools(){return <Nav><h1>{t("AI & docententools")}</h1><div className="cards">{['AI-huiswerk','Flashcards','Quizzen','Toetsen','Voortgangsrapporten','Lesanalyse'].map(x=><div className="card" key={x}><h3>{t(x)}</h3><p className="muted">{t("Gepland voor de volgende ontwikkelfase. Nog niet actief.")}</p></div>)}</div></Nav>}
