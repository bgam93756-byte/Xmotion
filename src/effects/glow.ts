import { DEG, ang, col, mix, num, opt, pct, point, px, type EffectSpec, type FxEval } from './types';
import { THRESH, gauss } from './glsl';
import { glPx, uvOf } from './blur';

/** Halo behind the layer plus a little additive bloom on top. */
const GLOW_COMP = `
uniform vec4 u_color; uniform float u_k; uniform float u_bloom;
void main() {
  vec4 o = orig(v_uv); vec4 g = tex(v_uv);
  g = vec4(g.rgb * u_color.rgb, g.a) * u_k;
  vec4 c = o + g * (1.0 - o.a) + g * u_bloom * o.a;
  c.a = min(c.a, 1.0);
  gl_FragColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`;

const SOFT_COMP = `
uniform float u_k;
void main() {
  vec4 o = orig(v_uv); vec4 b = unpre(tex(v_uv));
  vec4 u = unpre(o);
  vec3 s = 1.0 - (1.0 - u.rgb) * (1.0 - b.rgb * u_k);
  gl_FragColor = pre(vec4(s, o.a));
}`;

const DARK_COMP = `
uniform vec4 u_color; uniform float u_k;
void main() {
  vec4 o = orig(v_uv);
  float a = clamp(tex(v_uv).a * u_k, 0.0, 1.0) * u_color.a;
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * (1.0 - o.a);
}`;

const EDGE = `
void main() {
  vec2 d = 1.0 / u_res;
  float l = tex(v_uv - vec2(d.x, 0.0)).a, r = tex(v_uv + vec2(d.x, 0.0)).a;
  float b = tex(v_uv - vec2(0.0, d.y)).a, t = tex(v_uv + vec2(0.0, d.y)).a;
  float ll = lum(unpre(tex(v_uv - vec2(d.x, 0.0))).rgb), lr = lum(unpre(tex(v_uv + vec2(d.x, 0.0))).rgb);
  float lb = lum(unpre(tex(v_uv - vec2(0.0, d.y))).rgb), lt = lum(unpre(tex(v_uv + vec2(0.0, d.y))).rgb);
  float e = clamp(length(vec2(r - l, t - b)) * 1.5 + length(vec2(lr - ll, lt - lb)) * 0.8, 0.0, 1.0);
  gl_FragColor = vec4(vec3(e), e);
}`;

const ELECTRIC = `
uniform float u_freq; uniform float u_amp; uniform float u_speed;
void main() {
  vec2 p = v_uv * u_res;
  float t = u_time * u_speed;
  vec2 n = vec2(fbm(p * u_freq + vec2(t, 0.0), 4.0), fbm(p * u_freq + vec2(3.1, t) + 13.7, 4.0)) - 0.5;
  float a = texClip((p + n * u_amp) / u_res).a;
  float line = 1.0 - smoothstep(0.0, 0.35, abs(a - 0.5) * 2.0);
  gl_FragColor = vec4(vec3(line), line);
}`;

const ELECTRIC_COMP = `
uniform vec4 u_color; uniform float u_k;
void main() {
  vec4 o = orig(v_uv); vec4 g = tex(v_uv);
  float core = smoothstep(0.35, 0.8, g.a);
  vec3 add = u_color.rgb * g.a * u_k + vec3(core);
  float a = max(o.a, clamp(g.a * u_k + core, 0.0, 1.0));
  gl_FragColor = vec4(min(o.rgb + add, vec3(a)), a);
}`;

const INNER_GLOW = `
uniform vec4 u_color; uniform float u_k; uniform float u_invert;
void main() {
  vec4 o = orig(v_uv);
  float b = tex(v_uv).a;
  float g = (u_invert > 0.5 ? b : 1.0 - b) * u_k;
  vec4 u = unpre(o);
  vec3 rgb = mix(u.rgb, u_color.rgb, clamp(g, 0.0, 1.0) * u_color.a);
  gl_FragColor = pre(vec4(rgb, u.a));
}`;

const SCAN = `
uniform float u_pos; uniform float u_width; uniform vec2 u_dir; uniform vec4 u_color; uniform float u_k;
void main() {
  vec4 o = tex(v_uv);
  vec2 q = lp() - lcenter();
  float span = abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y);
  float d = dot(q, u_dir) / max(span, 1.0) + 0.5;
  float band = exp(-pow((d - u_pos) / max(u_width, 0.001), 2.0));
  vec3 add = u_color.rgb * band * u_k * o.a;
  gl_FragColor = vec4(min(o.rgb + add, vec3(o.a)), o.a);
}`;

const FLARE = `
uniform vec2 u_L; uniform float u_size; uniform float u_k; uniform vec4 u_color;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  vec2 d = p - u_L;
  float r = length(d) / u_size;
  float core = exp(-r * r * 6.0) * 1.4 + exp(-r * 2.2) * 0.35;
  float ring = exp(-pow((r - 1.3) * 7.0, 2.0)) * 0.22;
  float a = atan(d.y, d.x);
  float rays = pow(abs(sin(a * 6.0 + 0.4)), 30.0) * exp(-r * 1.1) * 0.5;
  float streak = exp(-abs(d.y) / u_size * 18.0) * exp(-abs(d.x) / u_size * 0.6) * 0.6;
  vec3 c = u_color.rgb * (core + ring + rays + streak);
  vec2 axis = u_res * 0.5 - u_L;
  for (int i = 1; i <= 6; i++) {
    float fi = float(i);
    vec2 gp = u_L + axis * (0.35 * fi);
    float gr = length(p - gp) / (u_size * (0.12 + 0.18 * hash1(fi + 3.0)));
    c += hsv2rgb(vec3(fract(0.13 * fi + 0.5), 0.55, 1.0)) * 0.16 * exp(-gr * gr * 2.5);
  }
  c *= u_k;
  float al = max(o.a, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
  gl_FragColor = vec4(min(o.rgb + c, vec3(al)), al);
}`;

const RAYS = `
uniform vec2 u_c; uniform float u_len; uniform float u_k; uniform float u_th;
void main() {
  vec4 o = tex(v_uv);
  vec2 d = v_uv - u_c;
  vec4 acc = vec4(0.0); float w = 1.0; float ws = 0.0;
  for (int i = 0; i < 56; i++) {
    float f = float(i) / 55.0 * u_len;
    vec4 s = texClip(v_uv - d * f);
    acc += s * smoothstep(u_th, u_th + 0.15, lum(unpre(s).rgb)) * w;
    ws += w; w *= 0.965;
  }
  vec4 r = acc / ws * u_k;
  float a = max(o.a, min(1.0, r.a));
  gl_FragColor = vec4(min(o.rgb + r.rgb, vec3(a)), a);
}`;

const STREAKS = `
uniform float u_mode; uniform vec2 u_c; uniform vec2 u_vec; uniform float u_amount; uniform float u_th; uniform float u_k;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 48; i++) {
    float f = float(i) / 47.0;
    vec2 q;
    if (u_mode < 0.5) q = p - u_vec * f;
    else if (u_mode < 1.5) q = u_c + (p - u_c) * (1.0 - u_amount * f);
    else q = u_c + rot(u_amount * f) * (p - u_c);
    vec4 s = texClip(q / u_res);
    acc += s * smoothstep(u_th, u_th + 0.12, lum(unpre(s).rgb)) * (1.0 - f);
  }
  vec4 r = acc / 24.0 * u_k;
  float a = max(o.a, min(1.0, r.a));
  gl_FragColor = vec4(min(o.rgb + r.rgb, vec3(a)), a);
}`;

const BUMP = `
uniform float u_h; uniform vec2 u_light; uniform float u_soft; uniform float u_spec;
float L(vec2 uv) { return lum(unpre(tex(uv)).rgb); }
void main() {
  vec4 c = tex(v_uv);
  vec2 d = u_soft / u_res;
  float dx = L(v_uv + vec2(d.x, 0.0)) - L(v_uv - vec2(d.x, 0.0));
  float dy = L(v_uv + vec2(0.0, d.y)) - L(v_uv - vec2(0.0, d.y));
  vec3 n = normalize(vec3(-dx * u_h, -dy * u_h, 1.0));
  vec3 l = normalize(vec3(u_light, 0.9));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * u_spec;
  vec4 u = unpre(c);
  gl_FragColor = pre(vec4(clamp(u.rgb * (0.3 + 0.85 * diff) + spec, 0.0, 1.0), u.a));
}`;

const BEVEL = `
uniform vec2 u_light; uniform float u_depth; uniform vec4 u_hi; uniform vec4 u_sh;
void main() {
  vec4 o = orig(v_uv);
  if (o.a < 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 d = 1.5 / u_res;
  float dx = tex(v_uv + vec2(d.x, 0.0)).a - tex(v_uv - vec2(d.x, 0.0)).a;
  float dy = tex(v_uv + vec2(0.0, d.y)).a - tex(v_uv - vec2(0.0, d.y)).a;
  vec3 n = normalize(vec3(-dx * u_depth, -dy * u_depth, 1.0));
  float s = dot(n.xy, u_light) * 1.6;
  vec4 u = unpre(o);
  vec3 rgb = mix(u.rgb, u_hi.rgb, clamp(s, 0.0, 1.0) * u_hi.a);
  rgb = mix(rgb, u_sh.rgb, clamp(-s, 0.0, 1.0) * u_sh.a);
  gl_FragColor = pre(vec4(rgb, u.a));
}`;

const SHADOW_COMP = `
uniform vec2 u_off; uniform vec4 u_color;
void main() {
  vec4 o = orig(v_uv);
  float a = texClip(v_uv - u_off / u_res).a * u_color.a;
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * (1.0 - o.a);
}`;

const LONG_SHADOW = `
uniform vec2 u_dir; uniform float u_len; uniform vec4 u_color; uniform float u_fade;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  float a = 0.0;
  for (int i = 1; i <= 96; i++) {
    float f = float(i) / 96.0;
    a = max(a, origClip((p - u_dir * f * u_len) / u_res).a * (1.0 - u_fade * f));
  }
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * u_color.a * (1.0 - o.a);
}`;

const RADIAL_SHADOW = `
uniform vec2 u_L; uniform float u_k; uniform float u_soft; uniform vec4 u_color;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  float a = 0.0;
  for (int i = 0; i < 12; i++) {
    float j = (float(i) / 11.0 - 0.5) * u_soft;
    a += origClip((u_L + (p - u_L) / (1.0 + u_k + j)) / u_res).a;
  }
  a /= 12.0;
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * u_color.a * (1.0 - o.a);
}`;

const EXTRUDE = `
uniform vec2 u_dir; uniform float u_len; uniform float u_shade;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  vec4 ex = vec4(0.0);
  for (int i = 1; i <= 96; i++) {
    float f = float(i) / 96.0;
    vec4 s = origClip((p - u_dir * f * u_len) / u_res);
    if (s.a > 0.5) { vec4 u = unpre(s); ex = pre(vec4(u.rgb * (1.0 - u_shade * f), 1.0)); break; }
  }
  gl_FragColor = o + ex * (1.0 - o.a);
}`;

const OUTLINE = `
uniform float u_width; uniform vec4 u_color;
void main() {
  vec4 c = tex(v_uv);
  float a = c.a;
  for (int r = 1; r <= 4; r++) {
    float rad = u_width * float(r) / 4.0;
    for (int i = 0; i < 24; i++) {
      float ang = float(i) * 0.261799;
      a = max(a, texClip(v_uv + vec2(cos(ang), sin(ang)) * rad / u_res).a);
    }
  }
  vec4 o = vec4(u_color.rgb * u_color.a, u_color.a) * a;
  gl_FragColor = c + o * (1.0 - c.a);
}`;

const MAGNIFY_BG = `
uniform vec2 u_c; uniform float u_mag; uniform float u_amt;
void main() {
  vec4 o = tex(v_uv);
  vec3 bg = unpre(aux(u_c + (v_uv - u_c) / max(u_mag, 0.01))).rgb;
  gl_FragColor = mix(o, vec4(bg * o.a, o.a), u_amt);
}`;

const GLASS = `
uniform float u_refr; uniform float u_noise; uniform float u_size; uniform float u_src; uniform float u_hl;
void main() {
  vec4 o = orig(v_uv);
  if (o.a < 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 d = 1.5 / u_res;
  float dx = tex(v_uv + vec2(d.x, 0.0)).a - tex(v_uv - vec2(d.x, 0.0)).a;
  float dy = tex(v_uv + vec2(0.0, d.y)).a - tex(v_uv - vec2(0.0, d.y)).a;
  vec2 q = lp() / max(u_size, 1.0);
  vec2 nz = vec2(vnoise(q), vnoise(q + 19.3)) - 0.5;
  vec2 off = (-vec2(dx, dy) * u_refr * 3.0 + nz * u_noise) * u_scale / u_res;
  vec4 s = u_src < 0.5 ? aux(v_uv + off) : origClip(v_uv + off);
  vec3 rgb = unpre(s).rgb;
  float spec = pow(clamp(dot(normalize(vec2(-dx, -dy) + 1e-5), vec2(-0.7, 0.7)), 0.0, 1.0), 6.0) * clamp(length(vec2(dx, dy)) * 4.0, 0.0, 1.0) * u_hl;
  rgb = rgb * 0.94 + 0.04 + spec;
  gl_FragColor = pre(vec4(clamp(rgb, 0.0, 1.0), o.a));
}`;

const DIFFUSION = `
uniform float u_amt; uniform float u_con; uniform float u_sat;
void main() {
  vec4 o = orig(v_uv); vec4 b = tex(v_uv);
  vec4 u = unpre(o); vec4 bu = unpre(b);
  vec3 sc = 1.0 - (1.0 - u.rgb) * (1.0 - bu.rgb);
  vec3 rgb = mix(u.rgb, sc, u_amt);
  rgb = (rgb - 0.5) * (1.0 + u_con) + 0.5;
  rgb = mix(vec3(lum(rgb)), rgb, 1.0 + u_sat);
  vec4 inside = pre(vec4(clamp(rgb, 0.0, 1.0), u.a));
  vec4 c = inside + b * u_amt * 0.6 * (1.0 - o.a);
  gl_FragColor = vec4(min(c.rgb, vec3(c.a)), min(c.a, 1.0));
}`;

const REEDED = `
uniform float u_w; uniform float u_refr; uniform vec2 u_dir;
void main() {
  vec2 q = lp();
  float s = dot(q, u_dir) / max(u_w, 1.0);
  float f = fract(s) - 0.5;
  vec4 c = texL(q + u_dir * f * u_refr);
  c.rgb += (1.0 - smoothstep(0.0, 0.12, 0.5 - abs(f))) * 0.18 * c.a;
  gl_FragColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`;

/** Screen-space direction (deg, 0 = right, 90 = down) as a GL vector. */
const glDir = (deg: number): [number, number] => [Math.cos(deg * DEG), -Math.sin(deg * DEG)];
/** Shadow direction like drop shadows (135° = down-right), as a GL vector. */
const shadowDir = (deg: number): [number, number] => [Math.sin(deg * DEG), Math.cos(deg * DEG)];
/** Light direction: angle the light comes from (0 = right, 90 = top). */
const lightDir = (deg: number): [number, number] => [Math.cos(deg * DEG), Math.sin(deg * DEG)];

const glow = (e: FxEval, threshold: number, radius: number, color: number[], k: number, bloom: number) => [
  ...(threshold > 0 ? [{ frag: THRESH, u: { u_th: threshold } }] : []),
  ...gauss(radius * 0.5 * e.scale),
  { frag: GLOW_COMP, u: { u_color: color, u_k: k, u_bloom: bloom } },
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GLOW_EFFECTS: EffectSpec[] = [
  {
    type: 'glow',
    label: 'Glow',
    category: 'Glow & Light',
    description: 'Adds a luminous halo to bright areas or edges.',
    props: [px('radius', 'Radius', 24, 300), pct('strength', 'Intensity', 120, 0, 500), pct('threshold', 'Threshold', 0), col('color', 'Tint', '#ffffff')],
    passes: (e) => glow(e, e.n('threshold') / 100, e.n('radius'), e.c('color'), e.n('strength') / 100, 0.3),
  },
  {
    type: 'lightGlow',
    label: 'Light Glow',
    category: 'Glow & Light',
    description: 'Creates a soft glow around brighter areas.',
    props: [px('radius', 'Radius', 40, 300), pct('strength', 'Intensity', 150, 0, 500), pct('threshold', 'Threshold', 55)],
    passes: (e) => glow(e, e.n('threshold') / 100, e.n('radius'), [1, 1, 1, 1], e.n('strength') / 100, 0.6),
  },
  {
    type: 'softGlow',
    label: 'Soft Glow',
    category: 'Glow & Light',
    description: 'Adds a gentle, diffused glow.',
    props: [px('radius', 'Radius', 20, 300), pct('amount', 'Amount', 60, 0, 200)],
    passes: (e) => [...gauss(e.n('radius') * 0.5 * e.scale), { frag: SOFT_COMP, u: { u_k: e.n('amount') / 100 } }],
  },
  {
    type: 'darkGlow',
    label: 'Dark Glow',
    category: 'Glow & Light',
    description: 'Adds a dark or contrasting glow around the layer.',
    props: [px('radius', 'Radius', 30, 300), pct('strength', 'Intensity', 150, 0, 500), col('color', 'Color', '#000000')],
    passes: (e) => [...gauss(e.n('radius') * 0.5 * e.scale), { frag: DARK_COMP, u: { u_color: e.c('color'), u_k: e.n('strength') / 100 } }],
  },
  {
    type: 'edgeGlow',
    label: 'Edge Glow',
    category: 'Glow & Light',
    description: 'Adds a glow around detected edges.',
    props: [px('radius', 'Radius', 12, 200), pct('strength', 'Intensity', 200, 0, 800), col('color', 'Color', '#4de1ff')],
    passes: (e) => [{ frag: EDGE }, ...gauss(e.n('radius') * 0.5 * e.scale), { frag: GLOW_COMP, u: { u_color: e.c('color'), u_k: e.n('strength') / 100, u_bloom: 1 } }],
  },
  {
    type: 'electricEdges',
    label: 'Electric Edges',
    category: 'Glow & Light',
    description: 'Creates glowing, irregular electric-looking outlines.',
    props: [
      col('color', 'Color', '#5ad1ff'),
      pct('strength', 'Intensity', 260, 0, 600),
      px('amplitude', 'Jaggedness', 16, 100),
      num('frequency', 'Detail', 3, 0.5, 30),
      num('speed', 'Speed', 4, 0, 30),
      px('thickness', 'Thickness', 6, 40),
      px('glow', 'Glow radius', 12, 120),
    ],
    passes: (e) => [
      ...gauss(Math.max(0.5, e.n('thickness') * e.scale)),
      { frag: ELECTRIC, u: { u_freq: e.n('frequency') / 100 / e.scale, u_amp: e.n('amplitude') * e.scale, u_speed: e.n('speed') } },
      ...gauss(e.n('glow') * 0.5 * e.scale),
      { frag: ELECTRIC_COMP, u: { u_color: e.c('color'), u_k: e.n('strength') / 100 } },
    ],
  },
  {
    type: 'innerGlow',
    label: 'Inner Glow',
    category: 'Glow & Light',
    description: 'Adds a glow inside the edges of a layer.',
    props: [px('radius', 'Radius', 20, 300), pct('strength', 'Intensity', 120, 0, 500), col('color', 'Color', '#ffffff'), opt('source', 'Source', ['Edges', 'Center'])],
    passes: (e) => [...gauss(e.n('radius') * 0.5 * e.scale), { frag: INNER_GLOW, u: { u_color: e.c('color'), u_k: e.n('strength') / 100, u_invert: e.o('source') } }],
  },
  {
    type: 'glowScan',
    label: 'Glow Scan',
    category: 'Glow & Light',
    description: 'Creates a moving scan effect with glowing highlights.',
    props: [col('color', 'Color', '#ffffff'), pct('strength', 'Intensity', 120, 0, 500), ang('angle', 'Direction', 20), pct('width', 'Width', 12, 1, 100), pct('position', 'Position', 50, -50, 150), num('speed', 'Auto speed (scans/s)', 0.5, 0, 10)],
    passes: (e) => {
      const sp = e.n('speed');
      const pos = sp > 0 ? (e.local * sp - Math.floor(e.local * sp)) * 1.6 - 0.3 : e.n('position') / 100;
      const a = e.n('angle') * DEG;
      return [{ frag: SCAN, u: { u_pos: pos, u_width: e.n('width') / 100, u_dir: [Math.cos(a), Math.sin(a)], u_color: e.c('color'), u_k: e.n('strength') / 100 } }];
    },
  },
  {
    type: 'lensFlare',
    label: 'Lens Flare',
    category: 'Glow & Light',
    description: 'Adds a bright lens-flare effect.',
    props: [point('position', 'Light position', [25, 25]), px('size', 'Size', 120, 1000), pct('brightness', 'Brightness', 100, 0, 400), col('color', 'Color', '#ffd9a8')],
    passes: (e) => [{ frag: FLARE, u: { u_L: glPx(e, e.pt('position')), u_size: Math.max(1, e.n('size') * e.scale), u_k: e.n('brightness') / 100, u_color: e.c('color') } }],
  },
  {
    type: 'lightning',
    label: 'Lightning',
    category: 'Glow & Light',
    description: 'Generates lightning-like bolts between two points.',
    props: [
      point('start', 'Start', [50, 0]),
      point('end', 'End', [50, 100]),
      col('color', 'Color', '#9fd8ff'),
      px('thickness', 'Thickness', 3, 30),
      px('glow', 'Glow', 18, 80),
      pct('jag', 'Jaggedness', 35, 0, 100),
      num('branches', 'Branches', 3, 0, 12, { step: 1 }),
      num('speed', 'Strikes / sec', 8, 0, 60),
    ],
    apply: (a) => {
      const r = rng(Math.floor(a.local * Math.max(0.0001, a.n('speed'))) * 7919 + a.seed);
      const s = a.toBuf(a.pt('start'));
      const t = a.toBuf(a.pt('end'));
      const jag = a.n('jag') / 100;
      const bolt = (p0: [number, number], p1: [number, number], depth: number): [number, number][] => {
        let pts: [number, number][] = [p0, p1];
        let disp = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * jag * 0.5;
        for (let d = 0; d < depth; d++) {
          const next: [number, number][] = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1];
            const [x1, y1] = pts[i];
            const len = Math.hypot(x1 - x0, y1 - y0) || 1;
            const off = (r() - 0.5) * disp;
            next.push([(x0 + x1) / 2 + (-(y1 - y0) / len) * off, (y0 + y1) / 2 + ((x1 - x0) / len) * off], pts[i]);
          }
          pts = next;
          disp *= 0.55;
        }
        return pts;
      };
      const ctx = a.ctx;
      const stroke = (pts: [number, number][], w: number) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineWidth = w;
        ctx.stroke();
      };
      const [cr, cg, cb] = a.c('color').map((v) => Math.round(v * 255));
      const main = bolt(s, t, 7);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = `rgb(${cr},${cg},${cb})`;
      ctx.shadowBlur = a.n('glow') * a.scale;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`;
      const w = Math.max(0.5, a.n('thickness') * a.scale);
      stroke(main, w * 2);
      for (let b = 0; b < a.n('branches'); b++) {
        const i = Math.floor(r() * (main.length - 2)) + 1;
        const from = main[i];
        const len = Math.hypot(t[0] - s[0], t[1] - s[1]) * (0.15 + r() * 0.25);
        const ang2 = Math.atan2(t[1] - s[1], t[0] - s[0]) + (r() - 0.5) * 1.6;
        stroke(bolt(from, [from[0] + Math.cos(ang2) * len, from[1] + Math.sin(ang2) * len], 5), w);
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      stroke(main, w * 0.8);
      ctx.restore();
    },
  },
  {
    type: 'rays',
    label: 'Rays',
    category: 'Glow & Light',
    description: 'Creates visible beams of light streaming from bright areas.',
    props: [point('center', 'Light source', [50, 30]), pct('length', 'Length', 60, 0, 100), pct('strength', 'Intensity', 100, 0, 600), pct('threshold', 'Threshold', 55)],
    passes: (e) => [{ frag: RAYS, u: { u_c: uvOf(e, e.pt('center')), u_len: e.n('length') / 100, u_k: e.n('strength') / 100, u_th: e.n('threshold') / 100 } }],
  },
  {
    type: 'linearStreaks',
    label: 'Linear Streaks',
    category: 'Glow & Light',
    description: 'Creates elongated streaks of light or color.',
    props: [ang('angle', 'Direction', 0), px('length', 'Length', 120, 1000), pct('strength', 'Intensity', 120, 0, 600), pct('threshold', 'Threshold', 50)],
    passes: (e) => {
      const [dx, dy] = glDir(e.n('angle'));
      const L = e.n('length') * e.scale;
      return [{ frag: STREAKS, u: { u_mode: 0, u_c: [0, 0], u_vec: [dx * L, dy * L], u_amount: 0, u_th: e.n('threshold') / 100, u_k: e.n('strength') / 100 } }];
    },
  },
  {
    type: 'zoomStreaks',
    label: 'Zoom Streaks',
    category: 'Glow & Light',
    description: 'Creates streaks that simulate rapid zooming.',
    props: [point('center', 'Center'), pct('length', 'Length', 30, 0, 100), pct('strength', 'Intensity', 120, 0, 600), pct('threshold', 'Threshold', 50)],
    passes: (e) => [{ frag: STREAKS, u: { u_mode: 1, u_c: glPx(e, e.pt('center')), u_vec: [0, 0], u_amount: e.n('length') / 100, u_th: e.n('threshold') / 100, u_k: e.n('strength') / 100 } }],
  },
  {
    type: 'spinStreaks',
    label: 'Spin Streaks',
    category: 'Glow & Light',
    description: 'Creates streaks associated with spinning movement.',
    props: [point('center', 'Center'), num('angle', 'Angle', 30, 0, 360, { unit: '°' }), pct('strength', 'Intensity', 120, 0, 600), pct('threshold', 'Threshold', 50)],
    passes: (e) => [{ frag: STREAKS, u: { u_mode: 2, u_c: glPx(e, e.pt('center')), u_vec: [0, 0], u_amount: e.n('angle') * DEG, u_th: e.n('threshold') / 100, u_k: e.n('strength') / 100 } }],
  },
  {
    type: 'bumpMap',
    label: 'Bump Map',
    category: 'Glow & Light',
    description: 'Uses lighting and surface information to create a raised, embossed appearance.',
    props: [num('height', 'Height', 8, 0, 60), ang('light', 'Light angle', 135), px('softness', 'Softness', 2, 20), pct('specular', 'Shine', 30)],
    passes: (e) => [{ frag: BUMP, u: { u_h: e.n('height'), u_light: lightDir(e.n('light')), u_soft: Math.max(1, e.n('softness') * e.scale), u_spec: e.n('specular') / 100 } }],
  },
  {
    type: 'smoothBevel',
    label: 'Smooth Bevel',
    category: 'Glow & Light',
    description: 'Creates softened beveled edges that give shapes depth.',
    props: [px('size', 'Bevel size', 12, 120), ang('light', 'Light angle', 135), num('depth', 'Depth', 10, 0, 40), col('highlight', 'Highlight', '#ffffffcc'), col('shadow', 'Shadow', '#000000aa')],
    passes: (e) => [...gauss(e.n('size') * 0.5 * e.scale), { frag: BEVEL, u: { u_light: lightDir(e.n('light')), u_depth: e.n('depth') * 4, u_hi: e.c('highlight'), u_sh: e.c('shadow') } }],
  },
  {
    type: 'shadow',
    label: 'Drop Shadow',
    category: 'Glow & Light',
    description: 'Casts a soft shadow behind the layer.',
    props: [col('color', 'Color', '#000000b0'), px('distance', 'Distance', 16, 400), ang('angle', 'Direction', 135), px('softness', 'Softness', 18, 200)],
    passes: (e) => {
      const [dx, dy] = shadowDir(e.n('angle'));
      const d = e.n('distance') * e.scale;
      return [...gauss(e.n('softness') * 0.5 * e.scale), { frag: SHADOW_COMP, u: { u_off: [dx * d, dy * d], u_color: e.c('color') } }];
    },
  },
  {
    type: 'longShadow',
    label: 'Long Shadow',
    category: 'Glow & Light',
    description: 'Extends a shadow away from an object.',
    props: [ang('angle', 'Direction', 135), px('length', 'Length', 300, 2000), col('color', 'Color', '#00000099'), pct('fade', 'Fade', 60)],
    passes: (e) => [{ frag: LONG_SHADOW, u: { u_dir: shadowDir(e.n('angle')), u_len: e.n('length') * e.scale, u_color: e.c('color'), u_fade: e.n('fade') / 100 } }],
  },
  {
    type: 'radialShadow',
    label: 'Radial Shadow',
    category: 'Glow & Light',
    description: 'Casts a shadow away from a point light.',
    props: [point('light', 'Light position', [30, 10]), pct('distance', 'Projection distance', 15, 0, 200), pct('softness', 'Softness', 10, 0, 100), col('color', 'Color', '#000000aa')],
    passes: (e) => [{ frag: RADIAL_SHADOW, u: { u_L: glPx(e, e.pt('light')), u_k: e.n('distance') / 100, u_soft: e.n('softness') / 100, u_color: e.c('color') } }],
  },
  {
    type: 'rasterExtrude',
    label: 'Raster Extrude',
    category: 'Glow & Light',
    description: 'Gives raster imagery an extended, dimensional appearance.',
    props: [ang('angle', 'Direction', 135), px('depth', 'Depth', 40, 400), pct('shade', 'Shading', 50)],
    passes: (e) => [{ frag: EXTRUDE, u: { u_dir: shadowDir(e.n('angle')), u_len: e.n('depth') * e.scale, u_shade: e.n('shade') / 100 } }],
  },
  {
    type: 'outline',
    label: 'Outline / Sticker',
    category: 'Glow & Light',
    description: 'Draws a solid outline around the layer, like a sticker.',
    props: [px('width', 'Width', 10, 60), col('color', 'Color', '#ffffff')],
    passes: (e) => [{ frag: OUTLINE, u: { u_width: e.n('width') * e.scale, u_color: e.c('color') } }],
  },
  {
    type: 'copyBackground',
    label: 'Copy Background',
    category: 'Glow & Light',
    description: 'Copies the imagery behind the layer into its shape — add blur for frosted glass.',
    props: [px('blur', 'Background blur', 0, 200), mix()],
    apply: (a) => {
      const bg = a.background();
      if (!bg) return;
      const mask = a.temp();
      mask.getContext('2d')!.drawImage(a.buf, 0, 0);
      const ctx = a.ctx;
      const k = a.n('mix') / 100;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(bg, 0, 0);
      ctx.restore();
      if (a.n('blur') > 0) a.shade(gauss(a.n('blur') * 0.6 * a.scale));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      if (k < 1) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1 - k;
        ctx.drawImage(mask, 0, 0);
      }
      ctx.restore();
    },
  },
  {
    type: 'magnifyBackground',
    label: 'Magnify Background',
    category: 'Glow & Light',
    description: 'Magnifies the background behind the layer, like a lens.',
    props: [pct('magnification', 'Magnification', 200, 10, 1000), point('center', 'Center'), mix()],
    aux: 'background',
    passes: (e) => [{ frag: MAGNIFY_BG, u: { u_c: uvOf(e, e.pt('center')), u_mag: e.n('magnification') / 100, u_amt: e.n('mix') / 100 } }],
  },
  {
    type: 'glass',
    label: 'Glass',
    category: 'Glow & Light',
    description: 'Makes the layer look like glass refracting what is behind it (or itself).',
    props: [opt('source', 'Refract', ['Background', 'Layer itself']), px('refraction', 'Edge refraction', 20, 200), px('noise', 'Surface distortion', 8, 100), px('size', 'Surface size', 60, 600), pct('highlight', 'Highlight', 50)],
    aux: 'background',
    passes: (e) => [
      ...gauss(6 * e.scale),
      { frag: GLASS, u: { u_refr: e.n('refraction'), u_noise: e.n('noise'), u_size: e.n('size'), u_src: e.o('source'), u_hl: e.n('highlight') / 100 } },
    ],
  },
  {
    type: 'ominoDiffusion',
    label: 'Omino Diffusion+',
    category: 'Glow & Light',
    description: 'A dreamy diffusion: soft bloom with contrast and saturation control.',
    props: [px('radius', 'Radius', 24, 300), pct('amount', 'Amount', 60), pct('contrast', 'Contrast', 10, -100, 100), pct('saturation', 'Saturation', 10, -100, 100)],
    passes: (e) => [...gauss(e.n('radius') * 0.5 * e.scale), { frag: DIFFUSION, u: { u_amt: e.n('amount') / 100, u_con: e.n('contrast') / 100, u_sat: e.n('saturation') / 100 } }],
  },
  {
    type: 'ominoGlass',
    label: 'Omino Glass',
    category: 'Glow & Light',
    description: 'Fluted / reeded glass distortion.',
    props: [px('width', 'Flute width', 40, 400), px('refraction', 'Refraction', 30, 300), ang('angle', 'Angle', 0)],
    passes: (e) => {
      const a = e.n('angle') * DEG;
      return [{ frag: REEDED, u: { u_w: e.n('width'), u_refr: e.n('refraction'), u_dir: [Math.cos(a), Math.sin(a)] } }];
    },
  },
];
