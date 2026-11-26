// v72: preparing an external audio file for transcription in the browser (no library, no server conversion).
// MP3/M4A up to 24 MB are uploaded as they are. Larger files and WAV are decoded at 16 kHz mono and cut into WAV pieces of
// 10 minutes (≈19 MB each: under the transcription limit of 25 MB and the storage limit of 50 MB).
export const PIECE_SECONDS = 600;
export const AUDIO_EXT = /\.(mp3|m4a|wav)$/i;
export const TEXT_EXT = /\.(txt|srt|vtt)$/i;

export function directMime(name: string, type: string) {
  if (/\.mp3$/i.test(name) || /mpeg|mp3/.test(type)) return 'audio/mpeg';
  if (/\.m4a$/i.test(name) || /mp4|m4a|aac/.test(type)) return 'audio/mp4';
  return null;
}

/** 16-bit PCM WAV of mono float samples (pure; unit-tested). */
export function wavBytes(samples: Float32Array, rate: number): Uint8Array {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Uint8Array(b);
}

export async function prepareAudio(file: File, onStep?: (s: string) => void): Promise<{blobs: Blob[]; offsets: number[]; mime: string; ext: string[]}> {
  const mime = directMime(file.name, file.type);
  if (mime && file.size <= 24 * 1024 * 1024) return {blobs: [file.slice(0, file.size, mime)], offsets: [0], mime, ext: [mime === 'audio/mpeg' ? 'mp3' : 'm4a']};
  onStep?.('decode');
  const rate = 16000;
  const AC = (window as unknown as {OfflineAudioContext: typeof OfflineAudioContext}).OfflineAudioContext;
  const ctx = new AC(1, rate, rate); // decodeAudioData resamples to the context rate (16 kHz)
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const n = buf.length, ch = buf.numberOfChannels, mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  const per = PIECE_SECONDS * rate, blobs: Blob[] = [], offsets: number[] = [];
  for (let i = 0; i < n; i += per) { blobs.push(new Blob([wavBytes(mono.subarray(i, Math.min(n, i + per)), rate) as BlobPart], {type: 'audio/wav'})); offsets.push(i / rate); }
  return {blobs, offsets, mime: 'audio/wav', ext: blobs.map(() => 'wav')};
}
