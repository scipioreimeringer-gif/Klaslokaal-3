'use client';
import {t} from '../../lib/i18n';
import Nav from '../../components/Nav';export default function Agenda(){return <Nav><h1>{t("Lesagenda")}</h1><div className="card"><h3>{t("Agenda in ontwikkeling")}</h3><p className="muted">{t("Hier komen geplande lessen, herinneringen en een kalender. Er worden nog geen afspraken opgeslagen.")}</p></div></Nav>}
