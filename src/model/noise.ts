/** Deterministic hash of a number (and optional seed) into [0, 1). */
export function hash1(n: number, seed = 0): number {
  const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth 1D gradient noise in roughly [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = hash1(i, seed) * 2 - 1;
  const g1 = hash1(i + 1, seed) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = g0 * f;
  const b = g1 * (f - 1);
  return (a + (b - a) * u) * 2;
}

/** Fractal noise with octaves, normalized to roughly [-1, 1]. */
export function fbm1(x: number, seed = 0, octaves = 1): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < Math.max(1, Math.min(8, octaves)); o++) {
    sum += noise1(x * freq, seed + o * 17.13) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Stable numeric seed from a string id. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10007;
}
