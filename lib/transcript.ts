// Pure helpers (no imports) for speaker-separated transcripts. Unit-tested.
export type Segment = {start: number; end: number; text: string};
export type Line = {speaker: 'DOCENT' | 'LEERLING'; start: number; text: string};

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Merge two per-speaker segment lists into one chronological dialogue. Drops empty/very short noise segments. */
export function mergeSpeakers(teacher: Segment[], student: Segment[]): Line[] {
  const clean = (segs: Segment[], speaker: Line['speaker']) => (segs || [])
    .map(s => ({speaker, start: Number(s.start) || 0, text: String(s.text || '').trim()}))
    .filter(s => s.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2);
  return [...clean(teacher, 'DOCENT'), ...clean(student, 'LEERLING')].sort((a, b) => a.start - b.start || (a.speaker === 'DOCENT' ? -1 : 1));
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
