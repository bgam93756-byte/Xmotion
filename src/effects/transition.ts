import { DEG, ang, col, opt, pct, point, px, type EffectSpec } from './types';

const BLOCK_DISSOLVE = `
uniform float u_prog; uniform float u_block; uniform float u_soft;
void main() {
  vec4 o = tex(v_uv);
  vec2 id = floor(lp() / max(u_block, 1.0));
  float r = hash(id + u_seed);
  float t = u_prog * (1.0 + u_soft);
  gl_FragColor = o * smoothstep(t - u_soft, t + 0.0001, r);
}`;

const DISSOLVE = `
uniform float u_prog; uniform float u_size; uniform float u_soft; uniform vec4 u_edge; uniform float u_ew;
void main() {
  vec4 o = tex(v_uv);
  float n = fbm(lp() / max(u_size, 1.0), 4.0);
  n = clamp((n - 0.2) / 0.6, 0.0, 1.0);
  float t = u_prog * (1.0 + u_soft + u_ew) - u_soft;
  float a = smoothstep(t, t + u_soft + 0.0001, n);
  float e = smoothstep(t - u_ew, t, n) * (1.0 - a) * step(0.0001, u_ew);
  vec4 glow = vec4(u_edge.rgb, 1.0) * u_edge.a * e * o.a;
  gl_FragColor = o * a + glow;
}`;

const RADIAL_WIPE = `
uniform float u_prog; uniform vec2 u_c; uniform float u_start; uniform float u_feather; uniform float u_dir;
void main() {
  vec4 o = tex(v_uv);
  vec2 d = lp() - u_c;
  float a = fract((atan(d.y, d.x) - u_start) / TAU);
  if (u_dir > 0.5 && u_dir < 1.5) a = 1.0 - a;
  if (u_dir > 1.5) a = 1.0 - abs(a * 2.0 - 1.0);
  float t = u_prog * (1.0 + u_feather) - u_feather;
  gl_FragColor = o * smoothstep(t, t + u_feather + 0.0001, a);
}`;

const WIPE = `
uniform float u_prog; uniform vec2 u_dir; uniform float u_feather;
void main() {
  vec4 o = tex(v_uv);
  float span = abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y);
  float s = dot(lp() - lcenter(), u_dir) / max(span, 1.0) + 0.5;
  float t = u_prog * (1.0 + u_feather) - u_feather;
  gl_FragColor = o * smoothstep(t, t + u_feather + 0.0001, s);
}`;

export const TRANSITION_EFFECTS: EffectSpec[] = [
  {
    type: 'blockDissolve',
    label: 'Block Dissolve',
    category: 'Transition',
    description: 'Breaks an image into blocks that disappear.',
    props: [pct('progress', 'Transition (animate me)', 50), px('block', 'Block size', 24, 500), pct('softness', 'Softness', 5, 0, 100)],
    passes: (e) => [{ frag: BLOCK_DISSOLVE, u: { u_prog: e.n('progress') / 100, u_block: Math.max(1, e.n('block')), u_soft: e.n('softness') / 100 } }],
  },
  {
    type: 'dissolve',
    label: 'Dissolve',
    category: 'Transition',
    description: 'Makes an image burn or break away into disappearing parts.',
    props: [pct('progress', 'Transition (animate me)', 50), px('size', 'Pattern size', 80, 1000), pct('softness', 'Softness', 5, 0, 100), col('edge', 'Edge glow', '#ff9a3d'), pct('edgeWidth', 'Edge width', 6, 0, 50)],
    passes: (e) => [{ frag: DISSOLVE, u: { u_prog: e.n('progress') / 100, u_size: e.n('size'), u_soft: e.n('softness') / 100, u_edge: e.c('edge'), u_ew: e.n('edgeWidth') / 100 } }],
  },
  {
    type: 'radialWipe',
    label: 'Radial Wipe',
    category: 'Transition',
    description: 'Reveals or hides content with a clock-like sweep.',
    props: [pct('progress', 'Transition (animate me)', 50), point('center', 'Center'), ang('start', 'Start angle', -90), pct('feather', 'Feather', 2, 0, 50), opt('dir', 'Direction', ['Clockwise', 'Counter-clockwise', 'Both'])],
    passes: (e) => [{ frag: RADIAL_WIPE, u: { u_prog: e.n('progress') / 100, u_c: e.pt('center'), u_start: e.n('start') * DEG, u_feather: e.n('feather') / 100, u_dir: e.o('dir') } }],
  },
  {
    type: 'wipe',
    label: 'Wipe',
    category: 'Transition',
    description: 'Reveals or hides a layer through a directional transition.',
    props: [pct('progress', 'Transition (animate me)', 50), ang('angle', 'Direction', 0), pct('feather', 'Feather', 5, 0, 100)],
    passes: (e) => [{ frag: WIPE, u: { u_prog: e.n('progress') / 100, u_dir: [Math.cos(e.n('angle') * DEG), Math.sin(e.n('angle') * DEG)], u_feather: e.n('feather') / 100 } }],
  },
];

