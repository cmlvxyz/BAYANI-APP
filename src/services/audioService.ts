/**
 * Audio helpers for Bayani App (citizen).
 *
 * The wearable has no physical speaker, so "live audio" is simulated by
 * synthesizing a short WAV clip (an emergency tone + faint ambient noise) at
 * SOS time. The same clip is stored in the Audio Evidence Vault (real playback)
 * and re-broadcast to the Response Center every few seconds so responders hear
 * the live feed in the alert dashboard.
 */

/** Synthesize a WAV (8 kHz, mono, 16-bit) of emergency beeps + ambient noise. */
export function createEmergencyAudioDataUrl(seconds = 45): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * seconds);
  const pcm = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const inBeep = t % 1.4 < 0.5; // 0.5s beep every 1.4s
    const cyclePos = i % sampleRate;
    const env = 1 - cyclePos / sampleRate; // per-second decay
    const tone = Math.sin(2 * Math.PI * (inBeep ? 1300 : 0) * t);
    const amb = Math.random() - 0.5;
    const v = inBeep ? 0.6 * env * tone : 0.12 * amb;
    pcm[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  }

  const dataSize = pcm.length * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let k = 0; k < s.length; k++) dv.setUint8(off + k, s.charCodeAt(k));
  };

  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  dv.setUint32(40, dataSize, true);

  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);

  return `data:audio/wav;base64,${toBase64(ab)}`;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x4000)));
  }
  return btoa(bin);
}

/** Play a data-URL audio clip. Returns the element so callers can stop it. */
export function playAudioUrl(url: string, loop = false): HTMLAudioElement | null {
  try {
    const el = new Audio(url);
    el.loop = loop;
    el.preload = 'auto';
    void el.play().catch(() => {});
    return el;
  } catch {
    return null;
  }
}