import { DEG, ang, col, num, opt, pct, px, type EffectSpec } from './types';

const CMYK = `
uniform float u_size; uniform float u_ang; uniform float u_paper;
float screen(vec2 p, float a, float ch) {
  vec2 q = rot(a) * p;
  vec2 cc = (floor(q / u_size) + 0.5) * u_size;
  vec4 s = unpre(texL(rot(-a) * cc));
  vec3 c = s.rgb;
  float k = 1.0 - max(c.r, max(c.g, c.b));
  float ink;
  if (ch < 0.5) ink = (1.0 - c.r - k) / max(1.0 - k, 0.001);
  else if (ch < 1.5) ink = (1.0 - c.g - k) / max(1.0 - k, 0.001);
  else if (ch < 2.5) ink = (1.0 - c.b - k) / max(1.0 - k, 0.001);
  else ink = k;
  ink *= s.a;
  float r = u_size * 0.5 * sqrt(clamp(ink, 0.0, 1.0)) * 1.35;
  return 1.0 - smoothstep(r - 0.7, r + 0.7, length(q - cc));
}
void main() {
  vec4 o = tex(v_uv);
  vec2 p = lp();
  float C = screen(p, u_ang + 0.2618, 0.0);
  float M = screen(p, u_ang + 1.309, 1.0);
  float Y = screen(p, u_ang, 2.0);
  float K = screen(p, u_ang + 0.7854, 3.0);
  vec3 rgb = vec3(1.0);
  rgb *= mix(vec3(1.0), vec3(0.0, 1.0, 1.0), C);
  rgb *= mix(vec3(1.0), vec3(1.0, 0.0, 1.0), M);
  rgb *= mix(vec3(1.0), vec3(1.0, 1.0, 0.0), Y);
  rgb *= 1.0 - K;
  float ink = max(max(C, M), max(Y, K));
  float a = u_paper > 0.5 ? o.a * ink : o.a;
  gl_FragColor = vec4(rgb * a, a);
}`;

const HALFTONE = `
uniform float u_size; uniform float u_ang; uniform float u_mode; uniform vec4 u_ink;
void main() {
  vec2 p = lp();
  vec2 q = rot(u_ang) * p;
  vec2 cc = (floor(q / u_size) + 0.5) * u_size;
  vec4 s = unpre(texL(rot(-u_ang) * cc));
  float v = u_mode < 0.5 ? lum(s.rgb) : 1.0 - lum(s.rgb);
  float rad = u_size * 0.72 * sqrt(clamp(v, 0.0, 1.0)) * s.a;
  float cov = 1.0 - smoothstep(rad - 0.8, rad + 0.8, length(q - cc));
  vec3 c = u_mode < 1.5 ? s.rgb : u_ink.rgb;
  if (u_mode > 0.5 && u_mode < 1.5) c = s.rgb;
  gl_FragColor = vec4(c * cov, cov);
}`;

const LINES = `
uniform float u_size; uniform float u_ang; uniform float u_mode; uniform vec4 u_ink;
void main() {
  vec2 p = lp();
  vec2 q = rot(u_ang) * p;
  float cy = (floor(q.y / u_size) + 0.5) * u_size;
  vec4 s = unpre(texL(rot(-u_ang) * vec2(q.x, cy)));
  float dark = (1.0 - lum(s.rgb)) * s.a;
  float th = u_size * 0.5 * dark * 1.15;
  float cov = 1.0 - smoothstep(th - 0.7, th + 0.7, abs(q.y - cy));
  vec3 c = u_mode < 0.5 ? u_ink.rgb : s.rgb;
  gl_FragColor = vec4(c * cov, cov) * step(0.001, s.a);
}`;

const PIXELATE = `
uniform vec2 u_size;
void main() {
  vec2 p = lp();
  vec2 q = u_lb.xy + (floor((p - u_lb.xy) / u_size) + 0.5) * u_size;
  gl_FragColor = texL(q);
}`;

const MOSAIC = `
uniform vec2 u_n; uniform float u_sharp;
void main() {
  vec2 p = lp();
  vec2 cell = u_lb.zw / max(u_n, vec2(1.0));
  vec2 id = floor((p - u_lb.xy) / cell);
  vec2 c0 = u_lb.xy + (id + 0.5) * cell;
  vec4 c = texL(c0);
  if (u_sharp < 0.5) c = (c + texL(c0 + cell * vec2(0.25, 0.25)) + texL(c0 + cell * vec2(-0.25, 0.25)) + texL(c0 + cell * vec2(0.25, -0.25)) + texL(c0 + cell * vec2(-0.25, -0.25))) / 5.0;
  gl_FragColor = c;
}`;

const NOISE = `
uniform float u_amt; uniform float u_size; uniform float u_color; uniform float u_frame; uniform float u_clip;
void main() {
  vec4 c = unpre(tex(v_uv));
  vec2 g = floor(pix() / max(u_size, 0.5));
  float f = u_frame * 7.13;
  vec3 n = u_color > 0.5 ? vec3(hash(g + f), hash(g + f + 17.0), hash(g + f + 31.0)) - 0.5 : vec3(hash(g + f) - 0.5);
  gl_FragColor = pre(vec4(clamp(c.rgb + n * u_amt, 0.0, 1.0), c.a));
}`;

const RGB_SPLIT = `
uniform vec2 u_off;
void main() {
  vec2 o = u_off / u_res;
  vec4 r = texClip(v_uv + o); vec4 g = tex(v_uv); vec4 b = texClip(v_uv - o);
  float a = max(max(r.a, g.a), b.a);
  gl_FragColor = vec4(r.r, g.g, b.b, a);
}`;

const BLOCK_NOISE = `
uniform float u_amt; uniform vec2 u_block; uniform float u_step; uniform float u_color;
void main() {
  vec2 p = pix();
  vec4 acc = tex(v_uv);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 bs = u_block * (1.0 + fi * 1.7);
    vec2 cell = floor(p / bs);
    if (hash(cell + vec2(u_step * 3.1 + fi * 11.0, fi + u_seed)) > 1.0 - u_amt * 0.35) {
      vec2 sh = (hash2(cell + u_step + fi) - 0.5) * bs * 3.0;
      vec4 s = texClip(uvOf(p + sh));
      if (u_color > 0.5 && hash(cell + 5.0 + u_step) > 0.5) s.rgb = s.gbr;
      if (hash(cell + 9.0 + u_step) > 0.82) s.rgb = s.a - s.rgb;
      acc = s;
    }
  }
  gl_FragColor = acc;
}`;

const GLITCH = `
uniform float u_amount; uniform float u_speed; uniform float u_block;
void main() {
  float st = floor(u_time * u_speed);
  vec2 p = v_uv * u_res;
  float row = floor(p.y / u_block);
  float r1 = hash(vec2(row, st));
  float r2 = hash(vec2(row * 1.7 + 3.1, st + 11.0));
  float on = step(1.0 - u_amount * 0.6, r1);
  float shift = (r2 - 0.5) * u_amount * 0.25 * on;
  float bigBlock = step(1.0 - u_amount * 0.15, hash(vec2(floor(p.y / (u_block * 4.0)), st + 5.0)));
  shift += (hash(vec2(st, 2.0)) - 0.5) * 0.1 * bigBlock * u_amount;
  vec2 uv = v_uv + vec2(shift, 0.0);
  float split = (0.004 + 0.02 * on) * u_amount;
  vec4 cr = texClip(uv + vec2(split, 0.0));
  vec4 cg = texClip(uv);
  vec4 cb = texClip(uv - vec2(split, 0.0));
  vec4 c = vec4(cr.r, cg.g, cb.b, max(max(cr.a, cg.a), cb.a));
  if (hash(vec2(row, st + 7.0)) > 1.0 - u_amount * 0.08) c.rgb = c.gbr;
  gl_FragColor = c;
}`;

const SCANLINES = `
uniform float u_amount; uniform float u_lines; uniform float u_curve;
void main() {
  vec2 uv = v_uv;
  if (u_curve > 0.0) {
    vec2 cc = uv * 2.0 - 1.0;
    cc *= 1.0 + u_curve * 0.25 * dot(cc.yx, cc.yx);
    uv = cc * 0.5 + 0.5;
  }
  vec4 c = texClip(uv);
  float s = 0.5 + 0.5 * sin(uv.y * u_res.y * 3.14159 / u_lines * 2.0);
  c.rgb *= 1.0 - u_amount * s;
  gl_FragColor = c;
}`;

const VIGNETTE = `
uniform float u_amount; uniform float u_size; uniform float u_soft; uniform vec4 u_color;
void main() {
  vec4 c = tex(v_uv);
  vec2 n = (lnorm(lp()) - 0.5) * 2.0;
  float m = max(u_lb.z, u_lb.w);
  n *= vec2(u_lb.z / m, u_lb.w / m);
  float v = smoothstep(u_size, u_size + u_soft, length(n) * 0.75) * u_amount;
  vec4 u = unpre(c);
  gl_FragColor = pre(vec4(mix(u.rgb, u_color.rgb, v * u_color.a), u.a));
}`;

const EDGES = `
uniform float u_amount; uniform float u_invert;
void main() {
  vec2 px = 1.0 / u_res;
  float tl = lum(tex(v_uv + px * vec2(-1.0, 1.0)).rgb), t = lum(tex(v_uv + px * vec2(0.0, 1.0)).rgb), tr = lum(tex(v_uv + px * vec2(1.0, 1.0)).rgb);
  float l = lum(tex(v_uv + px * vec2(-1.0, 0.0)).rgb), r = lum(tex(v_uv + px * vec2(1.0, 0.0)).rgb);
  float bl = lum(tex(v_uv + px * vec2(-1.0, -1.0)).rgb), b = lum(tex(v_uv + px * vec2(0.0, -1.0)).rgb), br = lum(tex(v_uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float e = clamp(length(vec2(gx, gy)) * 1.5, 0.0, 1.0);
  vec4 c = unpre(tex(v_uv));
  vec3 rgb = u_invert > 0.5 ? vec3(1.0 - e) : c.rgb * e * 2.0;
  gl_FragColor = pre(vec4(mix(c.rgb, rgb, u_amount), c.a));
}`;

export const STYLIZE_EFFECTS: EffectSpec[] = [
  {
    type: 'cmykHalftone',
    label: 'CMYK Halftone Dots',
    category: 'Stylize',
    description: 'Creates a printed comic-book or newspaper dot pattern using printing colors.',
    props: [px('size', 'Dot size', 10, 100), ang('angle', 'Screen angle', 0), opt('paper', 'Paper', ['White', 'Transparent'])],
    passes: (e) => [{ frag: CMYK, u: { u_size: Math.max(2, e.n('size')), u_ang: e.n('angle') * DEG, u_paper: e.o('paper') } }],
  },
  {
    type: 'halftone',
    label: 'Halftone Dots',
    category: 'Stylize',
    description: 'Converts imagery into a dot-based print pattern.',
    props: [px('size', 'Dot size', 10, 100), ang('angle', 'Angle', 45), opt('mode', 'Dots for', ['Highlights (color)', 'Shadows (color)', 'Shadows (ink)']), col('ink', 'Ink', '#111111')],
    passes: (e) => [{ frag: HALFTONE, u: { u_size: Math.max(2, e.n('size')), u_ang: e.n('angle') * DEG, u_mode: e.o('mode'), u_ink: e.c('ink') } }],
  },
  {
    type: 'halftoneLines',
    label: 'Halftone Lines',
    category: 'Stylize',
    description: 'Converts imagery into a pattern of lines.',
    props: [px('size', 'Line spacing', 8, 100), ang('angle', 'Angle', 30), opt('mode', 'Color', ['Ink', 'Original colors'], 1), col('ink', 'Ink', '#111111')],
    passes: (e) => [{ frag: LINES, u: { u_size: Math.max(2, e.n('size')), u_ang: e.n('angle') * DEG, u_mode: e.o('mode'), u_ink: e.c('ink') } }],
  },
  {
    type: 'pixelate',
    label: 'Pixelate',
    category: 'Stylize',
    description: 'Makes an image look pixelated.',
    props: [px('size', 'Pixel size', 16, 400)],
    passes: (e) => [{ frag: PIXELATE, u: { u_size: [Math.max(1, e.n('size')), Math.max(1, e.n('size'))] } }],
  },
  {
    type: 'mosaic',
    label: 'Mosaic',
    category: 'Stylize',
    description: 'Breaks an image into larger colored blocks.',
    props: [num('h', 'Horizontal blocks', 20, 1, 400, { step: 1 }), num('v', 'Vertical blocks', 20, 1, 400, { step: 1 }), opt('sharp', 'Colors', ['Averaged', 'Sharp'])],
    passes: (e) => [{ frag: MOSAIC, u: { u_n: [Math.max(1, e.n('h')), Math.max(1, e.n('v'))], u_sharp: e.o('sharp') } }],
  },
  {
    type: 'grain',
    label: 'Noise',
    category: 'Stylize',
    description: 'Adds random grain or visual static.',
    props: [pct('amount', 'Amount', 20), num('size', 'Grain size', 1.5, 0.5, 8, { step: 0.1 }), opt('color', 'Type', ['Monochrome', 'Color']), opt('animated', 'Animate', ['Every frame', 'Static'])],
    passes: (e) => [{ frag: NOISE, u: { u_amt: (e.n('amount') / 100) * 0.6, u_size: Math.max(0.5, e.n('size') * e.scale), u_color: e.o('color'), u_frame: e.o('animated') ? 0 : Math.floor(e.t * e.fps) } }],
  },
  {
    type: 'rgbSplit',
    label: 'RGB Split',
    category: 'Stylize',
    description: 'Separates red, green and blue channels for a chromatic glitch look.',
    props: [px('amount', 'Offset', 12, 200), ang('angle', 'Angle', 0)],
    passes: (e) => {
      const a = e.n('angle') * DEG;
      const d = e.n('amount') * e.scale;
      return [{ frag: RGB_SPLIT, u: { u_off: [Math.cos(a) * d, -Math.sin(a) * d] } }];
    },
  },
  {
    type: 'blockNoise',
    label: 'Block Noise',
    category: 'Stylize',
    description: 'Adds random rectangular glitch patterns.',
    props: [pct('amount', 'Amount', 40), { key: 'block', label: 'Block size', kind: 'vec2', def: [60, 14], unit: 'px' }, num('speed', 'Changes / sec', 10, 0, 60), opt('color', 'Color glitches', ['Off', 'On'], 1)],
    passes: (e) => {
      const [bx, by] = e.v('block');
      return [{ frag: BLOCK_NOISE, u: { u_amt: e.n('amount') / 100, u_block: [Math.max(1, bx * e.scale), Math.max(1, by * e.scale)], u_step: Math.floor(e.local * e.n('speed')), u_color: e.o('color') } }];
    },
  },
  {
    type: 'glitch',
    label: 'Glitch',
    category: 'Stylize',
    description: 'Digital glitch: sliced, shifted rows with color splitting.',
    props: [pct('amount', 'Strength', 50), num('speed', 'Speed', 12, 0, 60), px('blocks', 'Block size', 40, 400)],
    passes: (e) => [{ frag: GLITCH, u: { u_amount: e.n('amount') / 100, u_speed: e.n('speed'), u_block: Math.max(1, e.n('blocks') * e.scale) } }],
  },
  {
    type: 'scanlines',
    label: 'Scanlines / CRT',
    category: 'Stylize',
    description: 'Old-TV scanlines with optional screen curvature.',
    props: [pct('amount', 'Strength', 40), num('lines', 'Line spacing', 4, 2, 40), pct('curve', 'Screen curve', 0)],
    passes: (e) => [{ frag: SCANLINES, u: { u_amount: e.n('amount') / 100, u_lines: Math.max(1, e.n('lines') * e.scale), u_curve: e.n('curve') / 100 } }],
  },
  {
    type: 'vignette',
    label: 'Vignette',
    category: 'Stylize',
    description: 'Darkens or tints the edges of an image.',
    props: [pct('amount', 'Amount', 50), pct('size', 'Size', 60), pct('softness', 'Softness', 50, 1, 100), col('color', 'Color', '#000000')],
    passes: (e) => [{ frag: VIGNETTE, u: { u_amount: e.n('amount') / 100, u_size: e.n('size') / 100, u_soft: Math.max(0.01, e.n('softness') / 100), u_color: e.c('color') } }],
  },
  {
    type: 'edges',
    label: 'Find Edges',
    category: 'Stylize',
    description: 'Detects and highlights outlines in an image.',
    props: [pct('amount', 'Amount', 100), opt('invert', 'Style', ['Neon edges', 'Ink on paper'])],
    passes: (e) => [{ frag: EDGES, u: { u_amount: e.n('amount') / 100, u_invert: e.o('invert') } }],
  },
];
