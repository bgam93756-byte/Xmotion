/** A detected beat: its time (s) and how hard it hits relative to the loudest one (0–1). */
export interface Onset {
  t: number;
  strength: number;
}

/**
 * Beat (onset) times of a mono signal, for syncing edits to music. Measures
 * how fast the energy rises every 10 ms, weighting the bass (kicks) over the
 * full band, and keeps the peaks that stand out from their surroundings, at
 * least `minGap` seconds apart (stronger beats win).
 */
export function detectOnsets(samples: Float32Array, sampleRate: number, minGap = 0.25): Onset[] {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const frames = Math.floor(samples.length / hop);
  if (frames < 3) return [];
  // One-pole low-pass around 150 Hz isolates kicks and bass notes.
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  const low = new Float32Array(frames);
  const full = new Float32Array(frames);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let el = 0;
    let ef = 0;
    for (let i = f * hop, end = i + hop; i < end; i++) {
      const x = samples[i];
      lp += a * (x - lp);
      el += lp * lp;
      ef += x * x;
    }
    low[f] = Math.log1p((1000 * el) / hop);
    full[f] = Math.log1p((1000 * ef) / hop);
  }
  // Onset strength: rises only, bass counted double.
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = 2 * Math.max(0, low[f] - low[f - 1]) + Math.max(0, full[f] - full[f - 1]);
  let max = 0;
  for (let f = 0; f < frames; f++) max = Math.max(max, flux[f]);
  if (max <= 0) return [];
  // A peak must beat 1.5× the average of the surrounding ±0.25 s and be the highest within ±30 ms.
  const W = 25;
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + flux[f];
  const peaks: Onset[] = [];
  for (let f = 1; f < frames - 1; f++) {
    const v = flux[f];
    if (v < max * 0.08) continue;
    const lo = Math.max(0, f - W);
    const hi = Math.min(frames, f + W + 1);
    if (v < ((prefix[hi] - prefix[lo]) / (hi - lo)) * 1.5) continue;
    let top = true;
    for (let g = Math.max(0, f - 3); g <= Math.min(frames - 1, f + 3) && top; g++) if (g !== f && (flux[g] > v || (flux[g] === v && g < f))) top = false;
    if (top) peaks.push({ t: (f * hop) / sampleRate, strength: v / max });
  }
  // Strongest first, dropping beats too close to a stronger one.
  const kept: Onset[] = [];
  for (const p of [...peaks].sort((x, y) => y.strength - x.strength)) if (kept.every((k) => Math.abs(k.t - p.t) >= minGap)) kept.push(p);
  return kept.sort((x, y) => x.t - y.t);
}

/** Mixes an AudioBuffer down to one channel. */
export function monoOf(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  return out;
}
