// v57: calendar events for lessons I FOLLOW and PERSONAL appointments (pure, unit-tested; no secrets).
// Used for the one-way Google sync and for "Toevoegen aan agenda" (Google / Outlook / .ics) without any Google login.
// Privacy: only time, language, the other person's name, own title and the classroom link — never notes or analyses.
import {fp} from './map.ts';

const LANG: Record<string, string> = {nl: 'Nederlands', pt: 'Portugees', en: 'Engels', es: 'Spaans', fr: 'Frans', de: 'Duits', it: 'Italiaans'};
export const langLabel = (c: string | null | undefined) => c ? LANG[c] || c.toUpperCase() : '';

export type ExtraItem = {
  kind: 'learn' | 'personal' | 'teach'; item_id: string; starts_at: string; ends_at: string; timezone?: string | null;
  student_id?: string | null; language?: string | null; curriculum_subject?: string | null; lesson_language?: string | null;
  teacher_name?: string | null; student_name?: string | null; title?: string | null;
};

export const itemLanguage = (l: Pick<ExtraItem, 'language' | 'curriculum_subject' | 'lesson_language'>) =>
  [l.language, l.curriculum_subject, l.lesson_language].find(x => !!x && /^[a-z]{2}$/.test(x)) || null;

export const classroomUrl = (l: Pick<ExtraItem, 'item_id' | 'student_id' | 'kind'>, origin: string) =>
  `${origin}/klaslokaal/live?student=${encodeURIComponent(l.student_id || '')}&lesson=${encodeURIComponent(l.item_id)}&als=${l.kind === 'teach' ? 'docent' : 'leerling'}`;

export function itemSummary(l: ExtraItem) {
  if (l.kind === 'personal') return l.title || 'Afspraak';
  const lang = langLabel(itemLanguage(l)), other = l.kind === 'teach' ? l.student_name : l.teacher_name;
  return (lang ? `Les ${lang}` : 'Les') + (other ? ` · ${other}` : '') + ' (TeachyRooms)';
}
export function itemDescription(l: ExtraItem, origin: string) {
  if (l.kind === 'personal') return 'Persoonlijke afspraak in TeachyRooms.';
  const other = l.kind === 'teach' ? l.student_name : l.teacher_name;
  return `TeachyRooms-les${other ? ' met ' + other : ''}.\nKlaslokaal: ${classroomUrl(l, origin)}`;
}

/** Stable Google event ids (base32hex): one per item, never a duplicate; different prefix than given lessons ("tr"). */
export const extraEventId = (l: Pick<ExtraItem, 'kind' | 'item_id'>) => (l.kind === 'personal' ? 'trp' : 'trs') + l.item_id.toLowerCase().replace(/[^0-9a-f]/g, '');

export function extraEventBody(l: ExtraItem, origin: string) {
  const tz = l.timezone || 'Europe/Amsterdam';
  return {
    summary: itemSummary(l), description: itemDescription(l, origin), status: 'confirmed', visibility: 'private',
    start: {dateTime: new Date(l.starts_at).toISOString(), timeZone: tz}, end: {dateTime: new Date(l.ends_at).toISOString(), timeZone: tz},
    extendedProperties: {private: {teachy: '1', teachyKind: l.kind, teachyItemId: l.item_id}},
  };
}
export const extraFingerprint = (l: ExtraItem, origin: string) => fp(JSON.stringify(extraEventBody(l, origin)));

/* ---------------- "Toevoegen aan agenda" without OAuth ---------------- */
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleTemplateUrl(l: ExtraItem, origin: string) {
  const p = new URLSearchParams({action: 'TEMPLATE', text: itemSummary(l), dates: `${utc(l.starts_at)}/${utc(l.ends_at)}`, details: itemDescription(l, origin)});
  if (l.timezone) p.set('ctz', l.timezone);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
export function outlookUrl(l: ExtraItem, origin: string) {
  const p = new URLSearchParams({path: '/calendar/action/compose', rru: 'addevent', subject: itemSummary(l),
    startdt: new Date(l.starts_at).toISOString(), enddt: new Date(l.ends_at).toISOString(), body: itemDescription(l, origin)});
  return 'https://outlook.live.com/calendar/0/deeplink/compose?' + p.toString();
}
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** RFC 5545: lines folded at 75 octets. */
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,74}/g)!.join('\r\n ');
export function icsFile(l: ExtraItem, origin: string, now = new Date()) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeachyRooms//Agenda//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${l.item_id}@teachyrooms`, `DTSTAMP:${utc(now.toISOString())}`, `DTSTART:${utc(l.starts_at)}`, `DTEND:${utc(l.ends_at)}`,
    `SUMMARY:${icsText(itemSummary(l))}`, `DESCRIPTION:${icsText(itemDescription(l, origin))}`,
    ...(l.kind === 'personal' ? [] : [`URL:${classroomUrl(l, origin)}`]),
    'CLASS:PRIVATE', 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
