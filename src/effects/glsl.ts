import type { Pass } from './types';

/** Separable gaussian blur in buffer pixels. */
export const GAUSS = `
uniform vec2 u_dir; uniform float u_sigma;
void main() {
  if (u_sigma < 0.3) { gl_FragColor = tex(v_uv); return; }
  float st = max(1.0, u_sigma * 3.0 / 16.0);
  vec4 sum = vec4(0.0); float ws = 0.0;
  for (int i = -16; i <= 16; i++) {
    float x = float(i) * st;
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    sum += texClip(v_uv + u_dir * x / u_res) * w;
    ws += w;
  }
  gl_FragColor = sum / ws;
}`;

/** Separable box blur in buffer pixels. */
export const BOX = `
uniform vec2 u_dir; uniform float u_radius;
void main() {
  if (u_radius < 0.5) { gl_FragColor = tex(v_uv); return; }
  float st = max(1.0, u_radius / 16.0);
  vec4 s = vec4(0.0); float n = 0.0;
  for (int i = -16; i <= 16; i++) {
    float x = float(i) * st;
    if (abs(x) > u_radius) continue;
    s += texClip(v_uv + u_dir * x / u_res); n += 1.0;
  }
  gl_FragColor = s / max(n, 1.0);
}`;

export function gauss(sigma: number, dims: 0 | 1 | 2 = 0): Pass[] {
  const out: Pass[] = [];
  if (dims !== 2) out.push({ frag: GAUSS, u: { u_dir: [1, 0], u_sigma: sigma } });
  if (dims !== 1) out.push({ frag: GAUSS, u: { u_dir: [0, 1], u_sigma: sigma } });
  return out;
}

export function box(radius: number, iterations = 1): Pass[] {
  const out: Pass[] = [];
  for (let i = 0; i < iterations; i++) {
    out.push({ frag: BOX, u: { u_dir: [1, 0], u_radius: radius } }, { frag: BOX, u: { u_dir: [0, 1], u_radius: radius } });
  }
  return out;
}

/** Copies u_orig through unchanged (used to start a chain from the original). */
export const COPY = `void main() { gl_FragColor = tex(v_uv); }`;

/** Alpha-only channel (for blurring masks): rgb = alpha. */
export const ALPHA_ONLY = `void main() { float a = tex(v_uv).a; gl_FragColor = vec4(a, a, a, a); }`;

/** Keeps only pixels brighter than u_th (soft knee). */
export const THRESH = `
uniform float u_th;
void main() {
  vec4 c = tex(v_uv);
  float l = lum(unpre(c).rgb);
  gl_FragColor = c * smoothstep(u_th, u_th + 0.12, l);
}`;
