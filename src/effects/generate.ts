import { DEG, ang, col, mix, num, opt, pct, point, px, type EffectSpec, type FxEval } from './types';
import { gauss } from './glsl';

/**
 * Generators compute a premultiplied `vec4 pattern(vec2 p)` in layer-local space.
 * The result is masked by the layer's alpha and either replaces the layer's pixels
 * or is drawn over them, then blended with the original by `u_mix`.
 */
const gen = (uniforms: string, fns: string) => `
uniform float u_mix; uniform float u_over; uniform float u_ang;
${uniforms}
vec2 rp(vec2 p) { return rot(u_ang) * (p - lcenter()); }
${fns}
void main() {
  vec4 o = tex(v_uv);
  vec4 g = pattern(lp()) * o.a;
  vec4 res = u_over > 0.5 ? g + o * (1.0 - g.a) : g;
  gl_FragColor = mix(o, res, u_mix);
}`;

const CHECKER = gen(
  'uniform float u_size; uniform vec4 u_c1; uniform vec4 u_c2; uniform vec2 u_off;',
  `vec4 pattern(vec2 p) {
    vec2 c = floor((rp(p) + u_off) / max(u_size, 1.0));
    return pre(mod(c.x + c.y, 2.0) < 0.5 ? u_c1 : u_c2);
  }`,
);

const GRID = gen(
  'uniform float u_sp; uniform float u_w; uniform vec4 u_line; uniform vec4 u_bg; uniform vec2 u_off;',
  `vec4 pattern(vec2 p) {
    vec2 q = rp(p) + u_off;
    vec2 f = abs(fract(q / max(u_sp, 1.0) + 0.5) - 0.5) * u_sp;
    float k = 1.0 - smoothstep(u_w * 0.5 - 0.75, u_w * 0.5 + 0.75, min(f.x, f.y));
    return pre(u_line) * k + pre(u_bg) * (1.0 - k);
  }`,
);

const STRIPES = gen(
  'uniform float u_w; uniform float u_ratio; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_shift;',
  `vec4 pattern(vec2 p) {
    float s = rp(p).x / max(u_w, 1.0) + u_shift;
    float f = fract(s);
    float aa = 1.0 / max(u_w, 1.0);
    float k = smoothstep(u_ratio - aa, u_ratio + aa, f) * (1.0 - smoothstep(1.0 - aa, 1.0, f));
    return mix(pre(u_c1), pre(u_c2), k);
  }`,
);

const DOTS = gen(
  'uniform float u_sp; uniform float u_size; uniform vec4 u_dot; uniform vec4 u_bg; uniform float u_stagger;',
  `vec4 pattern(vec2 p) {
    vec2 g = rp(p) / max(u_sp, 1.0);
    if (u_stagger > 0.5) g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 f = (fract(g) - 0.5) * u_sp;
    float r = u_size * 0.5 * u_sp;
    float k = 1.0 - smoothstep(r - 1.0, r + 1.0, length(f));
    return pre(u_dot) * k + pre(u_bg) * (1.0 - k);
  }`,
);

const CLOUDS = gen(
  'uniform float u_size; uniform vec4 u_sky; uniform vec4 u_cloud; uniform float u_cover; uniform float u_soft; uniform float u_speed;',
  `vec4 pattern(vec2 p) {
    vec2 q = rp(p) / max(u_size, 1.0) + vec2(u_ltime * u_speed * 0.05, u_ltime * u_speed * 0.015);
    float n = clamp((fbm(q, 6.0) - 0.5) * 2.4 + 0.5, 0.0, 1.0);
    float k = smoothstep(1.0 - u_cover - u_soft * 0.5, 1.0 - u_cover + u_soft * 0.5 + 0.001, n);
    return mix(pre(u_sky), pre(u_cloud), k);
  }`,
);

const RIDGES = gen(
  'uniform float u_size; uniform float u_oct; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_sharp; uniform float u_speed;',
  `float ridged(vec2 p) {
    float s = 0.0; float a = 0.5; float n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= u_oct) break;
      float v = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
      s += a * v * v; n += a; p = p * 2.03 + vec2(7.1, 3.3); a *= 0.5;
    }
    return s / n;
  }
  vec4 pattern(vec2 p) {
    float v = pow(ridged(rp(p) / max(u_size, 1.0) + u_ltime * u_speed * 0.1), u_sharp);
    return mix(pre(u_c1), pre(u_c2), clamp(v, 0.0, 1.0));
  }`,
);

const TURBULENCE = gen(
  'uniform float u_size; uniform float u_oct; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_contrast; uniform float u_speed;',
  `vec4 pattern(vec2 p) {
    vec2 q = rp(p) / max(u_size, 1.0) + vec2(u_ltime * u_speed * 0.1);
    float s = 0.0; float a = 0.5; float n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= u_oct) break;
      s += a * abs(vnoise(q) * 2.0 - 1.0); n += a; q = q * 2.03 + vec2(3.7, 8.1); a *= 0.5;
    }
    float v = clamp((s / n - 0.5) * u_contrast + 0.5, 0.0, 1.0);
    return mix(pre(u_c1), pre(u_c2), v);
  }`,
);

const STARFIELD = gen(
  'uniform vec2 u_c; uniform float u_density; uniform float u_size; uniform float u_speed; uniform vec4 u_star; uniform vec4 u_bg;',
  `float starLayer(vec2 uv, float seed) {
    vec2 g = floor(uv); vec2 f = fract(uv) - 0.5;
    vec2 h = hash2(g + seed * 17.0);
    if (h.x < 1.0 - u_density) return 0.0;
    vec2 pos = (hash2(g + seed * 31.0 + 5.0) - 0.5) * 0.7;
    return smoothstep(0.09 * u_size, 0.0, length(f - pos));
  }
  vec4 pattern(vec2 p) {
    vec2 uv = (p - u_c) / lmin() * 2.0;
    float acc = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float depth = fract(u_ltime * u_speed * 0.15 + fi / 5.0);
      float sc = mix(24.0, 0.8, depth);
      acc += starLayer(uv * sc + fi * 13.7, fi) * depth * smoothstep(1.0, 0.85, depth);
    }
    acc = clamp(acc * 1.6, 0.0, 1.0);
    return pre(u_bg) * (1.0 - acc) + pre(u_star) * acc;
  }`,
);

const SIMPLE_STARS = gen(
  'uniform float u_density; uniform float u_cell; uniform float u_size; uniform float u_tw; uniform vec4 u_star; uniform vec4 u_bg;',
  `vec4 pattern(vec2 p) {
    vec2 g = p / max(u_cell, 1.0);
    vec2 ig = floor(g); vec2 f = fract(g) - 0.5;
    vec2 h = hash2(ig + u_seed);
    float b = 0.0;
    if (h.x > 1.0 - u_density) {
      vec2 pos = (hash2(ig + 9.1) - 0.5) * 0.8;
      float tw = 0.65 + 0.35 * sin(u_ltime * u_tw * (1.0 + h.y * 3.0) + h.y * 40.0);
      float d = length(f - pos) * u_cell;
      b = (smoothstep(u_size, 0.0, d) + 0.35 * smoothstep(u_size * 3.0, 0.0, d)) * tw * (0.55 + 0.45 * h.y);
    }
    b = clamp(b, 0.0, 1.0);
    return pre(u_bg) * (1.0 - b) + pre(u_star) * b;
  }`,
);

const HEART = gen(
  'uniform vec2 u_c; uniform float u_size; uniform float u_soft; uniform vec4 u_color; uniform vec4 u_bg;',
  `float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - 0.35355;
    return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
  }
  vec4 pattern(vec2 p) {
    vec2 q = rot(u_ang) * (p - u_c) / max(u_size, 1.0);
    q = vec2(q.x, -q.y) * 1.25 + vec2(0.0, 0.55);
    float d = sdHeart(q);
    float k = 1.0 - smoothstep(-u_soft, u_soft + 0.003, d);
    return pre(u_color) * k + pre(u_bg) * (1.0 - k);
  }`,
);

const STAR = gen(
  'uniform vec2 u_c; uniform float u_size; uniform float u_n; uniform float u_m; uniform float u_round; uniform float u_soft; uniform vec4 u_color; uniform vec4 u_bg;',
  `float sdStar(vec2 p, float r, float n, float m) {
    float an = PI / n; float en = PI / m;
    vec2 acs = vec2(cos(an), sin(an)); vec2 ecs = vec2(cos(en), sin(en));
    float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
  }
  vec4 pattern(vec2 p) {
    vec2 q = rot(u_ang) * (p - u_c) / max(u_size, 1.0);
    q.y = -q.y;
    float d = sdStar(q, 1.0 - u_round, u_n, u_m) - u_round;
    float k = 1.0 - smoothstep(-u_soft, u_soft + 0.004, d);
    return pre(u_color) * k + pre(u_bg) * (1.0 - k);
  }`,
);

const RADIAL_RAYS = gen(
  'uniform vec2 u_c; uniform float u_count; uniform float u_soft; uniform float u_spin; uniform vec4 u_color; uniform vec4 u_bg; uniform float u_fade;',
  `vec4 pattern(vec2 p) {
    vec2 d = p - u_c;
    float a = atan(d.y, d.x) + u_spin;
    float r = 0.5 + 0.5 * cos(a * u_count);
    float k = smoothstep(0.5 - u_soft, 0.5 + u_soft + 0.001, r);
    k *= 1.0 - u_fade * smoothstep(0.0, 1.0, length(d) / (0.75 * length(u_lb.zw)));
    return pre(u_bg) * (1.0 - k) + pre(u_color) * k;
  }`,
);

const RIBBON = gen(
  'uniform float u_count; uniform float u_amp; uniform float u_len; uniform float u_th; uniform float u_sp; uniform float u_speed; uniform vec4 u_c1; uniform vec4 u_c2;',
  `vec4 pattern(vec2 p) {
    vec2 q = rp(p);
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      if (fi >= u_count) break;
      float x = q.x / max(u_len, 1.0) * TAU;
      float y = sin(x + u_ltime * u_speed + fi * 0.7) * u_amp + sin(x * 0.5 - u_ltime * u_speed * 0.6 + fi) * u_amp * 0.35 + (fi - (u_count - 1.0) * 0.5) * u_sp;
      float d = abs(q.y - y);
      float k = 1.0 - smoothstep(u_th * 0.5 - 1.0, u_th * 0.5 + 1.0, d);
      vec4 c = pre(mix(u_c1, u_c2, fi / max(u_count - 1.0, 1.0)));
      c.rgb *= 0.78 + 0.22 * sin(x * 2.0 + fi);
      acc = c * k + acc * (1.0 - k);
    }
    return acc;
  }`,
);

const VORONOI = gen(
  'uniform float u_cell; uniform float u_mode; uniform float u_edge; uniform vec4 u_c1; uniform vec4 u_c2; uniform vec4 u_ec; uniform float u_speed;',
  `vec4 pattern(vec2 p) {
    vec2 g = p / max(u_cell, 1.0);
    vec2 ig = floor(g); vec2 fg = fract(g);
    float md = 8.0; float md2 = 8.0; vec2 mc = vec2(0.0); vec2 mp = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 b = vec2(float(i), float(j));
        vec2 h = 0.5 + 0.5 * sin(u_ltime * u_speed + TAU * hash2(ig + b));
        vec2 r = b + h - fg;
        float d = dot(r, r);
        if (d < md) { md2 = md; md = d; mc = ig + b; mp = ig + b + h; }
        else if (d < md2) md2 = d;
      }
    }
    float e = 1.0 - smoothstep(0.0, u_edge, sqrt(md2) - sqrt(md));
    if (u_mode < 0.5) {
      vec3 c = mix(u_c1.rgb, u_c2.rgb, hash(mc));
      return pre(vec4(mix(c, u_ec.rgb, e * u_ec.a), 1.0));
    }
    if (u_mode < 1.5) {
      vec4 s = unpre(texL(mp * u_cell));
      return pre(vec4(mix(s.rgb, u_ec.rgb, e * u_ec.a), 1.0));
    }
    return pre(vec4(u_ec.rgb, e * u_ec.a));
  }`,
);

/** Contours use a blurred copy of the alpha (u_tex) as a height map; u_orig is the layer. */
const CONTOUR = `
uniform float u_mode; uniform float u_count; uniform float u_w; uniform float u_offset; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_mix;
void main() {
  vec4 o = orig(v_uv);
  vec2 d = 1.5 / u_res;
  float h = (tex(v_uv).a * 2.0 + tex(v_uv + vec2(d.x, 0.0)).a + tex(v_uv - vec2(d.x, 0.0)).a + tex(v_uv + vec2(0.0, d.y)).a + tex(v_uv - vec2(0.0, d.y)).a) / 6.0;
  vec4 res;
  if (u_mode < 0.5) {
    vec4 g = mix(u_c2, u_c1, smoothstep(0.5, 1.0, h));
    res = pre(vec4(g.rgb, g.a * o.a));
  } else if (u_mode < 1.5) {
    float f = fract(h * u_count + u_offset);
    float dd = min(f, 1.0 - f);
    float line = (1.0 - smoothstep(u_w * 0.5, u_w * 0.5 + 0.05, dd)) * step(0.02, h) * (1.0 - smoothstep(0.93, 0.98, h));
    vec4 l = pre(vec4(u_c1.rgb, u_c1.a * line));
    res = l + o * (1.0 - l.a);
  } else {
    float k = mod(floor(h * u_count + u_offset), 2.0);
    vec4 g = k < 0.5 ? u_c1 : u_c2;
    res = pre(vec4(g.rgb, g.a * step(0.02, h) * (1.0 - smoothstep(0.96, 0.995, h)))) + o * smoothstep(0.96, 0.995, h);
  }
  gl_FragColor = mix(o, res, u_mix);
}`;

const OVER = ['Replace layer', 'Over layer'];
const common = (e: FxEval) => ({ u_mix: e.n('mix') / 100, u_over: e.o('composite'), u_ang: -e.n('angle') * DEG });
const compositeProps = (overDefault = 0) => [opt('composite', 'Composite', OVER, overDefault), mix()];

export const GENERATE_EFFECTS: EffectSpec[] = [
  {
    type: 'checker',
    label: 'Checker',
    category: 'Generate',
    description: 'Creates a checkerboard pattern.',
    props: [px('size', 'Square size', 60, 1000), col('c1', 'Color 1', '#ffffff'), col('c2', 'Color 2', '#111111'), ang('angle', 'Angle', 0), { key: 'offset', label: 'Offset', kind: 'vec2', def: [0, 0], unit: 'px' }, ...compositeProps()],
    passes: (e) => [{ frag: CHECKER, u: { ...common(e), u_size: e.n('size'), u_c1: e.c('c1'), u_c2: e.c('c2'), u_off: e.v('offset') } }],
  },
  {
    type: 'grid',
    label: 'Grid',
    category: 'Generate',
    description: 'Generates a grid pattern.',
    props: [px('spacing', 'Spacing', 80, 1000), px('width', 'Line width', 3, 100), col('line', 'Line color', '#ffffff'), col('bg', 'Background', '#00000000'), ang('angle', 'Angle', 0), { key: 'offset', label: 'Offset', kind: 'vec2', def: [0, 0], unit: 'px' }, ...compositeProps(1)],
    passes: (e) => [{ frag: GRID, u: { ...common(e), u_sp: e.n('spacing'), u_w: e.n('width'), u_line: e.c('line'), u_bg: e.c('bg'), u_off: e.v('offset') } }],
  },
  {
    type: 'stripes',
    label: 'Stripes',
    category: 'Generate',
    description: 'Creates a striped pattern.',
    props: [px('width', 'Stripe width', 60, 1000), pct('ratio', 'Balance', 50, 1, 99), col('c1', 'Color 1', '#ffffff'), col('c2', 'Color 2', '#ff3d7f'), ang('angle', 'Angle', 45), num('speed', 'Scroll speed', 0, -10, 10, { step: 0.1 }), ...compositeProps()],
    passes: (e) => [{ frag: STRIPES, u: { ...common(e), u_w: e.n('width'), u_ratio: e.n('ratio') / 100, u_c1: e.c('c1'), u_c2: e.c('c2'), u_shift: e.local * e.n('speed') } }],
  },
  {
    type: 'dots',
    label: 'Dots',
    category: 'Generate',
    description: 'Creates a pattern of dots.',
    props: [px('spacing', 'Spacing', 50, 1000), pct('size', 'Dot size', 50, 1, 100), col('dot', 'Dot color', '#ffffff'), col('bg', 'Background', '#00000000'), opt('stagger', 'Layout', ['Grid', 'Staggered'], 1), ang('angle', 'Angle', 0), ...compositeProps(1)],
    passes: (e) => [{ frag: DOTS, u: { ...common(e), u_sp: e.n('spacing'), u_size: e.n('size') / 100, u_dot: e.c('dot'), u_bg: e.c('bg'), u_stagger: e.o('stagger') } }],
  },
  {
    type: 'clouds',
    label: 'Clouds',
    category: 'Generate',
    description: 'Generates a cloud-like texture.',
    props: [px('size', 'Scale', 300, 3000), col('sky', 'Sky', '#4a8fe7'), col('cloud', 'Clouds', '#ffffff'), pct('cover', 'Coverage', 55), pct('softness', 'Softness', 35), num('speed', 'Drift speed', 1, -20, 20, { step: 0.1 }), ang('angle', 'Angle', 0), ...compositeProps()],
    passes: (e) => [{ frag: CLOUDS, u: { ...common(e), u_size: e.n('size'), u_sky: e.c('sky'), u_cloud: e.c('cloud'), u_cover: e.n('cover') / 100, u_soft: e.n('softness') / 100, u_speed: e.n('speed') } }],
  },
  {
    type: 'fractalRidges',
    label: 'Fractal Ridges',
    category: 'Generate',
    description: 'Generates rough, mountainous ridged patterns.',
    props: [px('size', 'Scale', 250, 3000), num('octaves', 'Complexity', 5, 1, 8, { step: 1 }), col('c1', 'Low', '#14102b'), col('c2', 'Ridges', '#ffb36b'), num('sharpness', 'Sharpness', 2, 0.3, 8, { step: 0.1 }), num('speed', 'Evolution', 0, 0, 10, { step: 0.1 }), ang('angle', 'Angle', 0), ...compositeProps()],
    passes: (e) => [{ frag: RIDGES, u: { ...common(e), u_size: e.n('size'), u_oct: e.n('octaves'), u_c1: e.c('c1'), u_c2: e.c('c2'), u_sharp: e.n('sharpness'), u_speed: e.n('speed') } }],
  },
  {
    type: 'turbulenceGen',
    label: 'Turbulence',
    category: 'Generate',
    description: 'Generates irregular, turbulent patterns.',
    props: [px('size', 'Scale', 200, 3000), num('octaves', 'Complexity', 5, 1, 8, { step: 1 }), col('c1', 'Color 1', '#000000'), col('c2', 'Color 2', '#ffffff'), num('contrast', 'Contrast', 2, 0.2, 8, { step: 0.1 }), num('speed', 'Evolution', 0.5, 0, 10, { step: 0.1 }), ang('angle', 'Angle', 0), ...compositeProps()],
    passes: (e) => [{ frag: TURBULENCE, u: { ...common(e), u_size: e.n('size'), u_oct: e.n('octaves'), u_c1: e.c('c1'), u_c2: e.c('c2'), u_contrast: e.n('contrast'), u_speed: e.n('speed') } }],
  },
  {
    type: 'starfield',
    label: 'Starfield',
    category: 'Generate',
    description: 'Generates a field of stars flying toward you.',
    props: [point('center', 'Center'), pct('density', 'Density', 30), num('size', 'Star size', 1, 0.2, 4, { step: 0.05 }), num('speed', 'Speed', 1, -10, 10, { step: 0.1 }), col('star', 'Stars', '#ffffff'), col('bg', 'Background', '#05050c'), ...compositeProps()],
    passes: (e) => [{ frag: STARFIELD, u: { ...common(e), u_ang: 0, u_c: e.pt('center'), u_density: e.n('density') / 100, u_size: e.n('size'), u_speed: e.n('speed'), u_star: e.c('star'), u_bg: e.c('bg') } }],
  },
  {
    type: 'simpleStarfield',
    label: 'Simple Starfield',
    category: 'Generate',
    description: 'Generates twinkling stars against a space-like background.',
    props: [pct('density', 'Density', 25), px('cell', 'Spacing', 40, 400), px('size', 'Star size', 3, 20), num('twinkle', 'Twinkle speed', 3, 0, 20, { step: 0.1 }), col('star', 'Stars', '#ffffff'), col('bg', 'Background', '#05050c'), ...compositeProps()],
    passes: (e) => [{ frag: SIMPLE_STARS, u: { ...common(e), u_ang: 0, u_density: e.n('density') / 100, u_cell: e.n('cell'), u_size: e.n('size'), u_tw: e.n('twinkle'), u_star: e.c('star'), u_bg: e.c('bg') } }],
  },
  {
    type: 'heart',
    label: 'Heart',
    category: 'Generate',
    description: 'Generates a heart shape.',
    props: [point('center', 'Center'), px('size', 'Size', 300, 3000), col('color', 'Color', '#ff2d6f'), col('bg', 'Background', '#00000000'), pct('softness', 'Edge softness', 1, 0, 50), ang('angle', 'Rotation', 0), ...compositeProps()],
    passes: (e) => [{ frag: HEART, u: { ...common(e), u_c: e.pt('center'), u_size: e.n('size'), u_soft: e.n('softness') / 100, u_color: e.c('color'), u_bg: e.c('bg') } }],
  },
  {
    type: 'star',
    label: 'Star',
    category: 'Generate',
    description: 'Generates a star shape.',
    props: [point('center', 'Center'), px('size', 'Size', 250, 3000), num('points', 'Points', 5, 3, 24, { step: 1 }), pct('inner', 'Inner radius', 45, 5, 100), pct('round', 'Roundness', 0, 0, 40), col('color', 'Color', '#ffc94d'), col('bg', 'Background', '#00000000'), pct('softness', 'Edge softness', 1, 0, 50), ang('angle', 'Rotation', 0), ...compositeProps()],
    passes: (e) => {
      const n = Math.round(e.n('points'));
      const m = 2 + (1 - e.n('inner') / 100) * (n - 2);
      return [{ frag: STAR, u: { ...common(e), u_c: e.pt('center'), u_size: e.n('size'), u_n: n, u_m: Math.max(2, m), u_round: (e.n('round') / 100) * 0.5, u_soft: e.n('softness') / 100, u_color: e.c('color'), u_bg: e.c('bg') } }];
    },
  },
  {
    type: 'radialRays',
    label: 'Radial Rays',
    category: 'Generate',
    description: 'Creates rays spreading from a central point (sunburst).',
    props: [point('center', 'Center'), num('count', 'Rays', 12, 2, 64, { step: 1 }), pct('softness', 'Softness', 10, 0, 50), num('speed', 'Spin (°/s)', 15, -360, 360), col('color', 'Ray color', '#ffd166'), col('bg', 'Background', '#ff8a3d'), pct('fade', 'Fade out', 0), ...compositeProps()],
    passes: (e) => [
      { frag: RADIAL_RAYS, u: { ...common(e), u_ang: 0, u_c: e.pt('center'), u_count: Math.round(e.n('count')), u_soft: e.n('softness') / 100, u_spin: e.local * e.n('speed') * DEG, u_color: e.c('color'), u_bg: e.c('bg'), u_fade: e.n('fade') / 100 } },
    ],
  },
  {
    type: 'ribbon',
    label: 'Ribbon',
    category: 'Generate',
    description: 'Creates flowing ribbon-like waves.',
    props: [num('count', 'Ribbons', 4, 1, 12, { step: 1 }), px('amplitude', 'Amplitude', 120, 1000), px('length', 'Wavelength', 700, 4000), px('thickness', 'Thickness', 40, 400), px('spacing', 'Spacing', 50, 400), num('speed', 'Speed', 1.5, -10, 10, { step: 0.1 }), col('c1', 'Color 1', '#7c5cff'), col('c2', 'Color 2', '#ff5c8a'), ang('angle', 'Angle', 0), ...compositeProps(1)],
    passes: (e) => [
      {
        frag: RIBBON,
        u: { ...common(e), u_count: Math.round(e.n('count')), u_amp: e.n('amplitude'), u_len: e.n('length'), u_th: e.n('thickness'), u_sp: e.n('spacing'), u_speed: e.n('speed'), u_c1: e.c('c1'), u_c2: e.c('c2') },
      },
    ],
  },
  {
    type: 'voronoi',
    label: 'Voronoi Cells',
    category: 'Generate',
    description: 'Creates a pattern of irregular polygonal cells (or a stained-glass mosaic).',
    props: [opt('mode', 'Style', ['Colored cells', 'Mosaic of layer', 'Edges only']), px('cell', 'Cell size', 70, 1000), pct('edge', 'Edge width', 8, 0, 50), col('c1', 'Color 1', '#7c5cff'), col('c2', 'Color 2', '#3fe08f'), col('edgeColor', 'Edge color', '#000000'), num('speed', 'Animate', 0.5, 0, 10, { step: 0.1 }), ...compositeProps()],
    passes: (e) => [
      { frag: VORONOI, u: { ...common(e), u_ang: 0, u_mode: e.o('mode'), u_cell: e.n('cell'), u_edge: Math.max(0.001, e.n('edge') / 100), u_c1: e.c('c1'), u_c2: e.c('c2'), u_ec: e.c('edgeColor'), u_speed: e.n('speed') } },
    ],
  },
  {
    type: 'contourGradient',
    label: 'Contour Gradient',
    category: 'Generate',
    description: "Creates gradients that follow the layer's contours.",
    props: [px('distance', 'Distance', 40, 400), col('c1', 'Inner color', '#ffd166'), col('c2', 'Edge color', '#ef476f'), mix()],
    passes: (e) => [...gauss(e.n('distance') * 0.5 * e.scale), { frag: CONTOUR, u: { u_mode: 0, u_count: 1, u_w: 0, u_offset: 0, u_c1: e.c('c1'), u_c2: e.c('c2'), u_mix: e.n('mix') / 100 } }],
  },
  {
    type: 'contourLines',
    label: 'Contour Lines',
    category: 'Generate',
    description: 'Creates contour or topographic-style lines around the layer.',
    props: [px('distance', 'Spread', 60, 600), num('count', 'Lines', 8, 1, 40, { step: 1 }), pct('width', 'Line width', 12, 1, 50), col('c1', 'Line color', '#ffffff'), num('speed', 'Flow speed', 0, -5, 5, { step: 0.05 }), mix()],
    passes: (e) => [
      ...gauss(e.n('distance') * 0.5 * e.scale),
      { frag: CONTOUR, u: { u_mode: 1, u_count: e.n('count'), u_w: e.n('width') / 100, u_offset: e.local * e.n('speed'), u_c1: e.c('c1'), u_c2: [0, 0, 0, 0], u_mix: e.n('mix') / 100 } },
    ],
  },
  {
    type: 'contourStrips',
    label: 'Contour Strips',
    category: 'Generate',
    description: 'Produces layered strips following the contours.',
    props: [px('distance', 'Spread', 60, 600), num('count', 'Strips', 6, 1, 40, { step: 1 }), col('c1', 'Color 1', '#ff5c8a'), col('c2', 'Color 2', '#ffc94d'), num('speed', 'Flow speed', 0, -5, 5, { step: 0.05 }), mix()],
    passes: (e) => [
      ...gauss(e.n('distance') * 0.5 * e.scale),
      { frag: CONTOUR, u: { u_mode: 2, u_count: e.n('count'), u_w: 0, u_offset: e.local * e.n('speed'), u_c1: e.c('c1'), u_c2: e.c('c2'), u_mix: e.n('mix') / 100 } },
    ],
  },
];
