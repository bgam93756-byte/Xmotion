export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA>();

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa into [r, g, b, a] with rgb 0..255 and a 0..1. */
export function parseColor(c: string): RGBA {
  const hit = cache.get(c);
  if (hit) return hit;
  let h = c.trim().replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  const out: RGBA =
    /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h) ? [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1] : [0, 0, 0, 1];
  if (cache.size > 2000) cache.clear();
  cache.set(c, out);
  return out;
}

const hx = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

export function toHex([r, g, b, a]: RGBA): string {
  return '#' + hx(r) + hx(g) + hx(b) + (a >= 1 ? '' : hx(a * 255));
}

export function lerpColor(a: string, b: string, k: number): string {
  const A = parseColor(a);
  const B = parseColor(b);
  return toHex([0, 1, 2, 3].map((i) => A[i] + (B[i] - A[i]) * k) as RGBA);
}

/** Returns the color with alpha multiplied by `alpha` (0..1). */
export function withAlpha(c: string, alpha: number): string {
  const [r, g, b, a] = parseColor(c);
  return toHex([r, g, b, a * alpha]);
}

export function rgbaFloat(c: string): [number, number, number, number] {
  const [r, g, b, a] = parseColor(c);
  return [r / 255, g / 255, b / 255, a];
}

/** Splits "#rrggbbaa" into a 6-digit hex (for <input type=color>) plus alpha 0..1. */
export function splitAlpha(c: string): { hex: string; alpha: number } {
  const [r, g, b, a] = parseColor(c);
  return { hex: toHex([r, g, b, 1]), alpha: a };
}
