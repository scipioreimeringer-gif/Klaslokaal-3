// Pure helpers (no imports) for speaker-separated transcripts. Unit-tested.
export type Segment = {start: number; end: number; text: string};
export type Line = {speaker: 'DOCENT' | 'LEERLING' | 'ONBEKEND'; start: number; text: string};

/** mm:ss, or h:mm:ss from one hour (parseUtterances reads both). */
const mmss = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };

/** Merge two per-speaker segment lists into one chronological dialogue. Drops empty/very short noise segments. */
export function mergeSpeakers(teacher: Segment[], student: Segment[]): Line[] {
  const clean = (segs: Segment[], speaker: Line['speaker']) => (segs || [])
    .map(s => ({speaker, start: Number(s.start) || 0, text: String(s.text || '').trim()}))
    .filter(s => s.text.replace(/\[onduidelijk\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length >= 2);
  return [...clean(teacher, 'DOCENT'), ...clean(student, 'LEERLING')].sort((a, b) => a.start - b.start || (a.speaker === 'DOCENT' ? -1 : 1));
}
/** v72: one mixed recording (no separate tracks): timestamped lines with an UNKNOWN speaker instead of one huge text
 *  block — so the analysis can be split into parts and never attributes speech to the student with certainty. */
export function unknownLines(segs: Segment[], offset = 0): Line[] {
  return (segs || []).map(s => ({speaker: 'ONBEKEND' as const, start: (Number(s.start) || 0) + offset, text: String(s.text || '').trim()}))
    .filter(s => s.text.replace(/\[onduidelijk\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length >= 2);
}

export function formatDialogue(lines: Line[], maxChars = 60000) {
  let out = '';
  for (const l of lines) { const row = `[${mmss(l.start)}] ${l.speaker}: ${l.text}\n`; if (out.length + row.length > maxChars) { out += '[… transcript ingekort …]\n'; break; } out += row; }
  return out.trim();
}

/** Seconds of speech per speaker (sum of segment durations) — a measured, not estimated, figure. */
export function speakingTime(segs: Segment[]) {
  return Math.round((segs || []).reduce((n, s) => n + Math.max(0, (Number(s.end) || 0) - (Number(s.start) || 0)), 0));
}

/* ---------------- v72: transcription quality ---------------- */
export const TRANSCRIBE_PROMPT = 'Verbatim transcript of a language lesson between a teacher and a language learner. Write exactly what is said, including grammar mistakes, wrong word forms, hesitations, repetitions and self-corrections. Do not correct or improve the learner. Keep words in the language they are spoken in.';
/** Whisper segment confidence → "[onduidelijk]" prefix, so no certain error is ever registered on it. */
export function unclearMark(text: string, avgLogprob?: number, noSpeech?: number) {
  const lp = Number(avgLogprob), ns = Number(noSpeech);
  const low = avgLogprob != null && Number.isFinite(lp) && (lp < -1 || (noSpeech != null && Number.isFinite(ns) && ns > 0.6 && lp < -0.6));
  return low && text.trim() ? '[onduidelijk] ' + text.trim() : text;
}

/* ---------------- v72: importing an external transcript (TXT / SRT / VTT) ---------------- */
export type ImportedLine = {start: number | null; label: string | null; text: string};
const clock = (s: string) => { const p = s.trim().replace(',', '.').split(':').map(Number); if (p.some(n => !Number.isFinite(n))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null; };
/** Reads TXT ("Name: text", optionally "[mm:ss]"), SRT and WebVTT (incl. "<v Name>"). Speaker labels and times are kept. */
export function parseImported(raw: string): ImportedLine[] {
  const text = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cue = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
  const out: ImportedLine[] = [];
  const speakerOf = (t: string): [string | null, string] => {
    const v = t.match(/^<v(?:\.[^ >]*)?\s+([^>]{1,40})>(.*)$/);
    if (v) return [v[1].trim(), v[2].replace(/<\/v>/g, '').trim()];
    const m = t.match(/^([\p{L}][\p{L} .'-]{0,29})\s*:\s+(.+)$/u);
    return m ? [m[1].trim(), m[2].trim()] : [null, t.trim()];
  };
  if (text.split('\n').some(l => cue.test(l))) {
    // SRT / VTT: blocks of [index] time --> time, text lines
    let start: number | null = null, buf: string[] = [];
    const flush = () => { if (!buf.length) return; const [label, body] = speakerOf(buf.join(' ').replace(/<[^v][^>]*>/g, '').replace(/\s+/g, ' '));
      if (body) out.push({start, label, text: body}); buf = []; };
    for (const l of text.split('\n')) {
      if (cue.test(l)) { flush(); start = clock(l.split('-->')[0]); continue; }
      if (!l.trim()) { flush(); continue; }
      if (/^WEBVTT|^NOTE\b|^STYLE\b/.test(l.trim()) || (/^\d+$/.test(l.trim()) && !buf.length)) continue;
      buf.push(l.trim());
    }
    flush();
  } else {
    for (const l of text.split('\n')) {
      const t = l.trim(); if (!t) continue;
      const tm = t.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s+(.*)$/);
      const [label, body] = speakerOf(tm ? tm[2] : t);
      if (!label && out.length && !tm) { out[out.length - 1].text += ' ' + body; continue; }
      out.push({start: tm ? clock(tm[1]) : null, label, text: body});
    }
  }
  // consecutive lines of the same speaker without a new time are one turn
  return out.filter(l => l.text);
}
export const importedLabels = (lines: ImportedLine[]) => [...new Set(lines.map(l => l.label).filter((x): x is string => !!x))].slice(0, 12);
/** Our own transcript format, with the teacher's mapping of the labels found (unmapped → ONBEKEND). */
export function toTranscript(lines: ImportedLine[], map: Record<string, Line['speaker']>) {
  return lines.map(l => `${l.start != null ? `[${mmss(l.start)}] ` : ''}${(l.label && map[l.label]) || 'ONBEKEND'}: ${l.text}`).join('\n');
}
