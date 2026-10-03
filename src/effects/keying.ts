import { col, num, pct, px, type EffectSpec } from './types';

const CHROMA = `
uniform vec4 u_key; uniform float u_tol; uniform float u_soft; uniform float u_spill;
vec2 cbcr(vec3 c) { return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b); }
void main() {
  vec4 c = unpre(tex(v_uv));
  float d = distance(cbcr(c.rgb), cbcr(u_key.rgb)) / 0.7;
  float a = smoothstep(u_tol, u_tol + u_soft + 0.0001, d);
  float spill = (1.0 - smoothstep(u_tol, u_tol + u_soft + 0.35, d)) * u_spill;
  vec3 rgb = mix(c.rgb, vec3(lum(c.rgb)), spill);
  gl_FragColor = pre(vec4(rgb, c.a * a));
}`;

const LUMA = `
uniform float u_level; uniform float u_soft; uniform float u_invert;
void main() {
  vec4 c = unpre(tex(v_uv));
  float l = lum(c.rgb);
  if (u_invert > 0.5) l = 1.0 - l;
  float a = smoothstep(u_level, u_level + u_soft + 0.0001, l);
  gl_FragColor = pre(vec4(c.rgb, c.a * a));
}`;

const CHOKE = `
uniform float u_r; uniform float u_soft;
void main() {
  vec4 o = tex(v_uv);
  float r = abs(u_r);
  float mn = o.a; float mx = o.a;
  for (int k = 1; k <= 3; k++) {
    float rad = r * float(k) / 3.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 0.3927;
      float s = texClip(v_uv + vec2(cos(a), sin(a)) * rad / u_res).a;
      mn = min(mn, s); mx = max(mx, s);
    }
  }
  float a = u_r >= 0.0 ? mn : mx;
  a = smoothstep(0.5 - u_soft, 0.5 + u_soft + 0.0001, a);
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : vec3(0.0);
  if (o.a <= 0.01) {
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 16; i++) { float an = float(i) * 0.3927; acc += texClip(v_uv + vec2(cos(an), sin(an)) * r / u_res); }
    rgb = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
  }
  gl_FragColor = vec4(rgb * a, a);
}`;

const SOLID_MATTE = `
uniform float u_th; uniform vec4 u_color; uniform float u_use;
void main() {
  vec4 o = tex(v_uv);
  float a = step(u_th, o.a);
  vec3 rgb = u_use > 0.5 ? u_color.rgb : (o.a > 0.001 ? o.rgb / o.a : vec3(0.0));
  gl_FragColor = vec4(rgb * a, a);
}`;

const ROUGHEN = `
uniform float u_amt; uniform float u_size; uniform float u_cx; uniform float u_speed;
void main() {
  vec4 o = tex(v_uv);
  vec2 q = lp() / max(u_size, 1.0) + vec2(u_ltime * u_speed);
  vec2 off = (vec2(fbm(q, u_cx), fbm(q + 31.7, u_cx)) - 0.5) * 2.0 * u_amt * lpx();
  vec4 d = texClip(v_uv + off / u_res);
  float a = d.a;
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : (d.a > 0.001 ? d.rgb / d.a : vec3(0.0));
  gl_FragColor = vec4(rgb * a, a);
}`;

const FILL_BEHIND = `
uniform vec4 u_color;
void main() {
  vec4 o = tex(v_uv);
  if (!inBounds(lp())) { gl_FragColor = o; return; }
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * u_color.a * (1.0 - o.a);
}`;

export const KEYING_EFFECTS: EffectSpec[] = [
  {
    type: 'chromaKey',
    label: 'Chroma Key',
    category: 'Keying & Matte',
    description: 'Removes a selected color, commonly a green-screen background.',
    props: [col('key', 'Key color', '#00ff00'), pct('tolerance', 'Tolerance', 30), pct('softness', 'Edge softness', 10), pct('spill', 'Spill removal', 50)],
    passes: (e) => [{ frag: CHROMA, u: { u_key: e.c('key'), u_tol: (e.n('tolerance') / 100) * 0.6, u_soft: (e.n('softness') / 100) * 0.4, u_spill: e.n('spill') / 100 } }],
  },
  {
    type: 'lumaKey',
    label: 'Luma Key',
    category: 'Keying & Matte',
    description: 'Makes areas transparent based on brightness.',
    props: [pct('level', 'Threshold', 20), pct('softness', 'Softness', 10), num('invert', 'Key out bright areas', 0, 0, 1, { step: 1, options: ['No (key dark)', 'Yes (key bright)'] })],
    passes: (e) => [{ frag: LUMA, u: { u_level: e.n('level') / 100, u_soft: e.n('softness') / 100, u_invert: e.o('invert') } }],
  },
  {
    type: 'matteChoker',
    label: 'Matte Choker',
    category: 'Keying & Matte',
    description: 'Shrinks (or spreads) a matte to clean up unwanted edges.',
    props: [num('choke', 'Choke', 3, -40, 40, { unit: 'px' }), pct('softness', 'Softness', 20, 0, 50)],
    passes: (e) => [{ frag: CHOKE, u: { u_r: e.n('choke') * e.scale, u_soft: e.n('softness') / 100 } }],
  },
  {
    type: 'solidMatte',
    label: 'Solid Matte',
    category: 'Keying & Matte',
    description: 'Turns the layer into a solid, hard-edged opacity mask.',
    props: [pct('threshold', 'Threshold', 50, 1, 100), num('useColor', 'Fill', 0, 0, 1, { step: 1, options: ['Keep colors', 'Solid color'] }), col('color', 'Color', '#ffffff')],
    passes: (e) => [{ frag: SOLID_MATTE, u: { u_th: e.n('threshold') / 100, u_use: e.o('useColor'), u_color: e.c('color') } }],
  },
  {
    type: 'roughenEdges',
    label: 'Roughen Edges',
    category: 'Keying & Matte',
    description: 'Makes smooth edges appear irregular or distressed.',
    props: [px('amount', 'Border', 8, 100), px('size', 'Scale', 24, 400), num('complexity', 'Complexity', 3, 1, 8, { step: 1 }), num('speed', 'Evolution speed', 0, 0, 10, { step: 0.1 })],
    passes: (e) => [{ frag: ROUGHEN, u: { u_amt: e.n('amount'), u_size: e.n('size'), u_cx: e.n('complexity'), u_speed: e.n('speed') } }],
  },
  {
    type: 'fillBehind',
    label: 'Fill Behind',
    category: 'Keying & Matte',
    description: "Fills transparent areas behind the layer's content, within its bounds.",
    props: [col('color', 'Color', '#101014')],
    passes: (e) => [{ frag: FILL_BEHIND, u: { u_color: e.c('color') } }],
  },
];
