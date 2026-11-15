'use client';
import {t} from '../../lib/i18n';
import Nav from '../../components/Nav';export default function Bibliotheek(){return <Nav><h1>{t("Materialenbibliotheek")}</h1><div className="card"><h3>{t("Jouw lesmateriaal")}</h3><p className="muted">{t("Bestanden, presentaties en gedeelde oefeningen komen hier. De uploadfunctie is nog niet actief.")}</p></div></Nav>}
