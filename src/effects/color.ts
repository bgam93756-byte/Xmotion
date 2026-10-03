import { DEG, ang, col, mix, num, opt, pct, point, type EffectSpec, type FxEval } from './types';

/** Wraps a per-pixel color body: `rgb` (straight color) and `c` (unpremultiplied input) are in scope. */
const colorFx = (uniforms: string, body: string, fns = '') => `
${uniforms}
${fns}
void main() {
  vec4 c = unpre(tex(v_uv));
  vec3 rgb = c.rgb;
  ${body}
  gl_FragColor = pre(vec4(clamp(rgb, 0.0, 1.0), c.a));
}`;

const BC = colorFx('uniform float u_b; uniform float u_c;', 'rgb = (rgb + u_b - 0.5) * u_c + 0.5;');
const EXPO = colorFx('uniform float u_e; uniform float u_off; uniform float u_g;', 'rgb = pow(max(rgb * exp2(u_e) + u_off, 0.0), vec3(1.0 / max(u_g, 0.01)));');
const TEMP = colorFx(
  'uniform float u_t; uniform float u_tint;',
  'rgb *= vec3(1.0 + u_t * 0.22, 1.0 + u_t * 0.04 - u_tint * 0.18, 1.0 - u_t * 0.24); rgb += vec3(u_tint * 0.05, 0.0, u_tint * 0.05);',
);
const TUNE = colorFx('uniform vec3 u_gain; uniform float u_lift; uniform float u_gamma;', 'rgb = pow(max(rgb * u_gain + u_lift, 0.0), vec3(1.0 / max(u_gamma, 0.01)));');
const HUE = colorFx('uniform float u_h;', 'vec3 h = rgb2hsv(rgb); h.x = fract(h.x + u_h); rgb = hsv2rgb(h);');
const SATVIB = colorFx(
  'uniform float u_s; uniform float u_v;',
  'float l = lum(rgb); rgb = mix(vec3(l), rgb, 1.0 + u_s); float s = rgb2hsv(clamp(rgb, 0.0, 1.0)).y; rgb = mix(vec3(lum(rgb)), rgb, 1.0 + u_v * (1.0 - s));',
);
const HILO = colorFx(
  'uniform float u_sh; uniform float u_hl;',
  'float l = lum(rgb); rgb += u_sh * 0.5 * (1.0 - smoothstep(0.0, 0.6, l)); rgb += u_hl * 0.5 * smoothstep(0.4, 1.0, l);',
);
const HOT = colorFx(
  'uniform float u_k;',
  'vec3 s = smoothstep(0.04, 0.96, rgb); s = mix(vec3(lum(s)), s, 1.0 + 0.9 * u_k); s += vec3(0.09, 0.02, -0.07) * u_k; rgb = mix(rgb, s, clamp(u_k, 0.0, 1.0)) + (s - rgb) * max(u_k - 1.0, 0.0);',
);
const TINT = colorFx(
  'uniform vec4 u_color; uniform float u_amount;',
  'float l = lum(rgb); vec3 t = u_color.rgb; vec3 r = l < 0.5 ? 2.0 * l * t : 1.0 - 2.0 * (1.0 - l) * (1.0 - t); rgb = mix(rgb, r, u_amount);',
);
const DUOTONE = colorFx('uniform vec4 u_dark; uniform vec4 u_light; uniform float u_amount;', 'rgb = mix(rgb, mix(u_dark.rgb, u_light.rgb, smoothstep(0.0, 1.0, lum(rgb))), u_amount);');
const GRADMAP = colorFx(
  'uniform vec4 u_c0; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_amount;',
  'float l = lum(rgb); vec3 g = l < 0.5 ? mix(u_c0.rgb, u_c1.rgb, l * 2.0) : mix(u_c1.rgb, u_c2.rgb, (l - 0.5) * 2.0); rgb = mix(rgb, g, u_amount);',
);
const BLEND_FN = `
vec3 blendMode(vec3 b, vec3 s, float m) {
  if (m < 0.5) return s;
  if (m < 1.5) return b * s;
  if (m < 2.5) return 1.0 - (1.0 - b) * (1.0 - s);
  if (m < 3.5) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (m < 4.5) return min(b + s, 1.0);
  return mix(vec3(lum(b)), s, 1.0) * lum(b) / max(lum(s), 0.001);
}`;
const BLENDS = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Add', 'Color'];
const GRADOVER = colorFx(
  'uniform vec4 u_c1; uniform vec4 u_c2; uniform vec2 u_dir; uniform float u_type; uniform float u_mode; uniform float u_op;',
  `vec2 q = lp() - lcenter(); float t;
  if (u_type < 0.5) { float span = abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y); t = dot(q, u_dir) / max(span, 1.0) + 0.5; }
  else t = length(q) / max(0.5 * length(u_lb.zw), 1.0);
  vec4 g = mix(u_c1, u_c2, clamp(t, 0.0, 1.0));
  rgb = mix(rgb, blendMode(rgb, g.rgb, u_mode), g.a * u_op);`,
  BLEND_FN,
);
const FOURCOLOR = colorFx(
  'uniform vec2 u_p0; uniform vec2 u_p1; uniform vec2 u_p2; uniform vec2 u_p3; uniform vec4 u_k0; uniform vec4 u_k1; uniform vec4 u_k2; uniform vec4 u_k3; uniform float u_blend; uniform float u_mode; uniform float u_op;',
  `vec2 q = lp(); float s = lmin();
  float w0 = 1.0 / pow(length(q - u_p0) / s + 0.02, u_blend);
  float w1 = 1.0 / pow(length(q - u_p1) / s + 0.02, u_blend);
  float w2 = 1.0 / pow(length(q - u_p2) / s + 0.02, u_blend);
  float w3 = 1.0 / pow(length(q - u_p3) / s + 0.02, u_blend);
  vec3 g = (u_k0.rgb * w0 + u_k1.rgb * w1 + u_k2.rgb * w2 + u_k3.rgb * w3) / (w0 + w1 + w2 + w3);
  rgb = mix(rgb, blendMode(rgb, g, u_mode), u_op);`,
  BLEND_FN,
);
const PALETTE = colorFx(
  'uniform vec4 u_k0; uniform vec4 u_k1; uniform vec4 u_k2; uniform vec4 u_k3; uniform vec4 u_k4; uniform float u_mode; uniform float u_amount;',
  `vec3 best;
  if (u_mode < 0.5) {
    best = u_k0.rgb; float bd = distance(rgb, u_k0.rgb);
    float d = distance(rgb, u_k1.rgb); if (d < bd) { bd = d; best = u_k1.rgb; }
    d = distance(rgb, u_k2.rgb); if (d < bd) { bd = d; best = u_k2.rgb; }
    d = distance(rgb, u_k3.rgb); if (d < bd) { bd = d; best = u_k3.rgb; }
    d = distance(rgb, u_k4.rgb); if (d < bd) { bd = d; best = u_k4.rgb; }
  } else {
    float i = floor(clamp(lum(rgb), 0.0, 0.999) * 5.0);
    best = i < 0.5 ? u_k0.rgb : i < 1.5 ? u_k1.rgb : i < 2.5 ? u_k2.rgb : i < 3.5 ? u_k3.rgb : u_k4.rgb;
  }
  rgb = mix(rgb, best, u_amount);`,
);
const REPLACE = colorFx(
  'uniform vec4 u_from; uniform vec4 u_to; uniform float u_tol; uniform float u_soft;',
  'float d = distance(rgb, u_from.rgb) / 1.732; float m = 1.0 - smoothstep(u_tol, u_tol + u_soft + 0.001, d); rgb = rgb + (u_to.rgb - u_from.rgb) * m;',
);
const SPOT = colorFx(
  'uniform vec4 u_keep; uniform float u_tol; uniform float u_soft; uniform float u_amount;',
  'vec3 hk = rgb2hsv(u_keep.rgb); vec3 hc = rgb2hsv(rgb); float dh = abs(hc.x - hk.x); dh = min(dh, 1.0 - dh) * 2.0; float d = mix(dh, distance(rgb, u_keep.rgb) / 1.732, 0.35) + (hc.y < 0.12 ? 1.0 : 0.0); float m = 1.0 - smoothstep(u_tol, u_tol + u_soft + 0.001, d); rgb = mix(rgb, mix(vec3(lum(rgb)), rgb, m), u_amount);',
);
const SPECTRAL = colorFx('uniform float u_cycles; uniform float u_offset; uniform float u_amount;', 'rgb = mix(rgb, hsv2rgb(vec3(fract(lum(rgb) * u_cycles + u_offset), 1.0, 1.0)), u_amount);');
const IRIDESCENCE = colorFx(
  'uniform float u_freq; uniform float u_phase; uniform float u_size; uniform float u_sat; uniform float u_amount;',
  `vec2 q = lp();
  float h = fract(lum(rgb) * u_freq + u_phase + (q.x + q.y * 0.6) / max(u_size, 1.0) + vnoise(q / max(u_size, 1.0) * 2.0) * 0.3);
  vec3 ir = hsv2rgb(vec3(h, u_sat, 1.0));
  vec3 ov = mix(2.0 * rgb * ir, 1.0 - 2.0 * (1.0 - rgb) * (1.0 - ir), step(0.5, rgb));
  rgb = mix(rgb, ov, u_amount);`,
);
const REMAP_RGB = colorFx(
  'uniform vec3 u_src; uniform float u_a;',
  'vec4 k = vec4(c.rgb, c.a); rgb = vec3(pick(k, u_src.x), pick(k, u_src.y), pick(k, u_src.z));',
  `float pick(vec4 k, float i) {
    if (i < 0.5) return k.r; if (i < 1.5) return k.g; if (i < 2.5) return k.b; if (i < 3.5) return k.a;
    if (i < 4.5) return lum(k.rgb); if (i < 5.5) return 0.0; return 1.0;
  }`,
);
const REMAP_HSV = colorFx(
  'uniform vec3 u_src;',
  'vec3 h = rgb2hsv(rgb); rgb = hsv2rgb(vec3(pick(h, rgb, u_src.x), pick(h, rgb, u_src.y), pick(h, rgb, u_src.z)));',
  `float pick(vec3 h, vec3 r, float i) {
    if (i < 0.5) return h.x; if (i < 1.5) return h.y; if (i < 2.5) return h.z; if (i < 3.5) return r.r;
    if (i < 4.5) return r.g; if (i < 5.5) return r.b; if (i < 6.5) return lum(r); if (i < 7.5) return 0.0; return 1.0;
  }`,
);
const INVERT = colorFx('uniform float u_amount; uniform float u_mode;', 'vec3 inv = 1.0 - rgb; if (u_mode > 0.5) { vec3 h = rgb2hsv(rgb); h.z = 1.0 - h.z; inv = hsv2rgb(h); } rgb = mix(rgb, inv, u_amount);');
const POSTERIZE = colorFx('uniform float u_levels;', 'float n = u_levels - 1.0; rgb = floor(rgb * n + 0.5) / n;');
const THRESHOLD = colorFx('uniform float u_level; uniform float u_soft;', 'rgb = vec3(smoothstep(u_level - u_soft, u_level + u_soft + 0.0001, lum(rgb)));');
const FILL = `
uniform vec4 u_color; uniform float u_amt;
void main() {
  vec4 o = tex(v_uv);
  float a = o.a * u_color.a;
  gl_FragColor = mix(o, vec4(u_color.rgb * a, a), u_amt);
}`;
const ADJUST = colorFx(
  'uniform float u_bright; uniform float u_contrast; uniform float u_sat; uniform float u_hue; uniform float u_temp;',
  `rgb += u_bright;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  rgb = mix(vec3(lum(rgb)), rgb, u_sat);
  vec3 h = rgb2hsv(clamp(rgb, 0.0, 1.0)); h.x = fract(h.x + u_hue); rgb = hsv2rgb(h);
  rgb += vec3(u_temp, u_temp * 0.2, -u_temp);`,
);

const contrastK = (c: number) => (c >= 0 ? 1 + (c / 100) * 2 : 1 + c / 100);
const RGB_SRC = ['Red', 'Green', 'Blue', 'Alpha', 'Luminance', 'Zero', 'Full'];
const HSV_SRC = ['Hue', 'Saturation', 'Value', 'Red', 'Green', 'Blue', 'Luminance', 'Zero', 'Full'];
const dirOf = (e: FxEval, k: string): [number, number] => [Math.cos(e.n(k) * DEG), Math.sin(e.n(k) * DEG)];

export const COLOR_EFFECTS: EffectSpec[] = [
  {
    type: 'brightnessContrast',
    label: 'Brightness / Contrast',
    category: 'Color',
    description: 'Adjusts overall brightness and the difference between light and dark areas.',
    props: [num('brightness', 'Brightness', 10, -100, 100), num('contrast', 'Contrast', 20, -100, 100)],
    passes: (e) => [{ frag: BC, u: { u_b: (e.n('brightness') / 100) * 0.5, u_c: contrastK(e.n('contrast')) } }],
  },
  {
    type: 'exposureGamma',
    label: 'Exposure / Gamma',
    category: 'Color',
    description: 'Adjusts exposure, midtones and overall brightness.',
    props: [num('exposure', 'Exposure (stops)', 0.5, -5, 5, { step: 0.05 }), num('offset', 'Offset', 0, -50, 50), num('gamma', 'Gamma', 1, 0.1, 4, { step: 0.01 })],
    passes: (e) => [{ frag: EXPO, u: { u_e: e.n('exposure'), u_off: e.n('offset') / 100, u_g: e.n('gamma') } }],
  },
  {
    type: 'colorTemp',
    label: 'Color Temperature',
    category: 'Color',
    description: 'Makes colors look warmer or cooler.',
    props: [num('temperature', 'Temperature', 25, -100, 100), num('tint', 'Tint (green ↔ magenta)', 0, -100, 100)],
    passes: (e) => [{ frag: TEMP, u: { u_t: e.n('temperature') / 100, u_tint: e.n('tint') / 100 } }],
  },
  {
    type: 'colorTune',
    label: 'Color Tune',
    category: 'Color',
    description: 'Fine-tunes red, green and blue levels, lift and gamma.',
    props: [pct('red', 'Red', 110, 0, 200), pct('green', 'Green', 100, 0, 200), pct('blue', 'Blue', 88, 0, 200), num('lift', 'Lift', 0, -50, 50), num('gamma', 'Gamma', 1, 0.1, 4, { step: 0.01 })],
    passes: (e) => [{ frag: TUNE, u: { u_gain: [e.n('red') / 100, e.n('green') / 100, e.n('blue') / 100], u_lift: e.n('lift') / 100, u_gamma: e.n('gamma') } }],
  },
  {
    type: 'hueShift',
    label: 'Hue Shift',
    category: 'Color',
    description: 'Changes the hues of an image without changing its brightness.',
    props: [num('hue', 'Hue', 90, -360, 360, { unit: '°' })],
    passes: (e) => [{ frag: HUE, u: { u_h: e.n('hue') / 360 } }],
  },
  {
    type: 'satVibrance',
    label: 'Saturation / Vibrance',
    category: 'Color',
    description: 'Adjusts color intensity and strengthens less-saturated colors.',
    props: [num('saturation', 'Saturation', 0, -100, 100), num('vibrance', 'Vibrance', 30, -100, 100)],
    passes: (e) => [{ frag: SATVIB, u: { u_s: e.n('saturation') / 100, u_v: e.n('vibrance') / 100 } }],
  },
  {
    type: 'highlightsShadows',
    label: 'Highlights and Shadows',
    category: 'Color',
    description: 'Adjusts bright highlights and dark shadow regions separately.',
    props: [num('shadows', 'Shadows', 30, -100, 100), num('highlights', 'Highlights', -20, -100, 100)],
    passes: (e) => [{ frag: HILO, u: { u_sh: e.n('shadows') / 100, u_hl: e.n('highlights') / 100 } }],
  },
  {
    type: 'hotColor',
    label: 'Hot Color',
    category: 'Color',
    description: 'Produces intense, high-contrast color treatments.',
    props: [pct('amount', 'Amount', 80, 0, 200)],
    passes: (e) => [{ frag: HOT, u: { u_k: e.n('amount') / 100 } }],
  },
  {
    type: 'color',
    label: 'Color Adjust',
    category: 'Color',
    description: 'Brightness, contrast, saturation, hue and temperature in one effect.',
    props: [num('brightness', 'Brightness', 0, -100, 100), num('contrast', 'Contrast', 0, -100, 100), num('saturation', 'Saturation', 0, -100, 100), num('hue', 'Hue shift', 0, -180, 180, { unit: '°' }), num('temperature', 'Temperature', 0, -100, 100)],
    passes: (e) => [
      {
        frag: ADJUST,
        u: { u_bright: (e.n('brightness') / 100) * 0.6, u_contrast: contrastK(e.n('contrast')), u_sat: 1 + e.n('saturation') / 100, u_hue: e.n('hue') / 360, u_temp: (e.n('temperature') / 100) * 0.15 },
      },
    ],
  },
  {
    type: 'tint',
    label: 'Colorize',
    category: 'Color',
    description: 'Adds or replaces colors with a chosen color treatment.',
    props: [col('color', 'Color', '#ff3d7f'), pct('amount', 'Amount', 100)],
    passes: (e) => [{ frag: TINT, u: { u_color: e.c('color'), u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'duotone',
    label: 'Duotone',
    category: 'Color',
    description: 'Maps shadows and highlights to two colors.',
    props: [col('dark', 'Shadows', '#1b0b4a'), col('light', 'Highlights', '#ffc94d'), pct('amount', 'Amount', 100)],
    passes: (e) => [{ frag: DUOTONE, u: { u_dark: e.c('dark'), u_light: e.c('light'), u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'gradientMap',
    label: 'Gradient Map',
    category: 'Color',
    description: 'Maps different brightness levels to selected colors.',
    props: [col('c0', 'Shadows', '#120a3a'), col('c1', 'Midtones', '#e0457b'), col('c2', 'Highlights', '#ffe9a8'), pct('amount', 'Amount', 100)],
    passes: (e) => [{ frag: GRADMAP, u: { u_c0: e.c('c0'), u_c1: e.c('c1'), u_c2: e.c('c2'), u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'gradientOverlay',
    label: 'Gradient Overlay',
    category: 'Color',
    description: 'Places a color gradient over a layer.',
    props: [col('c1', 'Start color', '#7c5cff'), col('c2', 'End color', '#ff5c8a'), opt('type', 'Type', ['Linear', 'Radial']), ang('angle', 'Angle', 90), opt('mode', 'Blend', BLENDS, 3), pct('opacity', 'Opacity', 100)],
    passes: (e) => [{ frag: GRADOVER, u: { u_c1: e.c('c1'), u_c2: e.c('c2'), u_type: e.o('type'), u_dir: dirOf(e, 'angle'), u_mode: e.o('mode'), u_op: e.n('opacity') / 100 } }],
  },
  {
    type: 'fourColor',
    label: 'Four-color Gradient',
    category: 'Color',
    description: 'Blends four colors across an image.',
    props: [
      col('k0', 'Color 1', '#ff3d7f'),
      point('p0', 'Point 1', [10, 10]),
      col('k1', 'Color 2', '#ffc94d'),
      point('p1', 'Point 2', [90, 10]),
      col('k2', 'Color 3', '#3fe08f'),
      point('p2', 'Point 3', [10, 90]),
      col('k3', 'Color 4', '#4d7dff'),
      point('p3', 'Point 4', [90, 90]),
      num('blend', 'Blend', 2.5, 1, 8, { step: 0.1 }),
      opt('mode', 'Blend mode', BLENDS),
      pct('opacity', 'Opacity', 100),
    ],
    passes: (e) => [
      {
        frag: FOURCOLOR,
        u: { u_p0: e.pt('p0'), u_p1: e.pt('p1'), u_p2: e.pt('p2'), u_p3: e.pt('p3'), u_k0: e.c('k0'), u_k1: e.c('k1'), u_k2: e.c('k2'), u_k3: e.c('k3'), u_blend: e.n('blend'), u_mode: e.o('mode'), u_op: e.n('opacity') / 100 },
      },
    ],
  },
  {
    type: 'paletteMap',
    label: 'Palette Map',
    category: 'Color',
    description: 'Replaces image colors with colors from a selected palette.',
    props: [col('k0', 'Color 1', '#0f0e17'), col('k1', 'Color 2', '#2e2a5c'), col('k2', 'Color 3', '#e53170'), col('k3', 'Color 4', '#ff8906'), col('k4', 'Color 5', '#fffffe'), opt('mode', 'Match by', ['Nearest color', 'Brightness']), pct('amount', 'Amount', 100)],
    passes: (e) => [{ frag: PALETTE, u: { u_k0: e.c('k0'), u_k1: e.c('k1'), u_k2: e.c('k2'), u_k3: e.c('k3'), u_k4: e.c('k4'), u_mode: e.o('mode'), u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'replaceColor',
    label: 'Replace Color',
    category: 'Color',
    description: 'Replaces a selected color with another.',
    props: [col('from', 'Color to replace', '#ff0000'), col('to', 'Replace with', '#00a2ff'), pct('tolerance', 'Tolerance', 25), pct('softness', 'Softness', 15)],
    passes: (e) => [{ frag: REPLACE, u: { u_from: e.c('from'), u_to: e.c('to'), u_tol: e.n('tolerance') / 100, u_soft: e.n('softness') / 100 } }],
  },
  {
    type: 'spotColor',
    label: 'Spot Color',
    category: 'Color',
    description: 'Keeps a selected color and turns everything else gray.',
    props: [col('keep', 'Color to keep', '#ff2020'), pct('tolerance', 'Tolerance', 20), pct('softness', 'Softness', 15), pct('amount', 'Desaturate others', 100)],
    passes: (e) => [{ frag: SPOT, u: { u_keep: e.c('keep'), u_tol: e.n('tolerance') / 100, u_soft: e.n('softness') / 100, u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'spectralMap',
    label: 'Spectral Map',
    category: 'Color',
    description: 'Maps brightness into a rainbow spectrum.',
    props: [num('cycles', 'Cycles', 1, 0.1, 10, { step: 0.1 }), num('offset', 'Hue offset', 0, -360, 360, { unit: '°' }), pct('amount', 'Amount', 100)],
    passes: (e) => [{ frag: SPECTRAL, u: { u_cycles: e.n('cycles'), u_offset: e.n('offset') / 360, u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'iridescence',
    label: 'Iridescence',
    category: 'Color',
    description: 'Creates shifting, rainbow-like surface colors.',
    props: [pct('amount', 'Amount', 70), num('frequency', 'Frequency', 1.5, 0, 10, { step: 0.1 }), num('speed', 'Shift speed', 0.2, -5, 5, { step: 0.05 }), num('size', 'Pattern size', 400, 20, 4000), pct('saturation', 'Saturation', 70)],
    passes: (e) => [
      { frag: IRIDESCENCE, u: { u_freq: e.n('frequency'), u_phase: e.local * e.n('speed'), u_size: e.n('size'), u_sat: e.n('saturation') / 100, u_amount: e.n('amount') / 100 } },
    ],
  },
  {
    type: 'channelRemapRGB',
    label: 'Channel Remap (RGB)',
    category: 'Color',
    description: 'Rearranges red, green and blue color channels.',
    props: [opt('r', 'Red from', RGB_SRC, 2), opt('g', 'Green from', RGB_SRC, 0), opt('b', 'Blue from', RGB_SRC, 1)],
    passes: (e) => [{ frag: REMAP_RGB, u: { u_src: [e.o('r'), e.o('g'), e.o('b')] } }],
  },
  {
    type: 'channelRemapHSV',
    label: 'Channel Remap (HSV)',
    category: 'Color',
    description: 'Rearranges hue, saturation and value between channels.',
    props: [opt('h', 'Hue from', HSV_SRC, 2), opt('s', 'Saturation from', HSV_SRC, 1), opt('v', 'Value from', HSV_SRC, 0)],
    passes: (e) => [{ frag: REMAP_HSV, u: { u_src: [e.o('h'), e.o('s'), e.o('v')] } }],
  },
  {
    type: 'invert',
    label: 'Invert',
    category: 'Color',
    description: 'Reverses image colors to their opposites.',
    props: [pct('amount', 'Amount', 100), opt('mode', 'Invert', ['RGB', 'Brightness only'])],
    passes: (e) => [{ frag: INVERT, u: { u_amount: e.n('amount') / 100, u_mode: e.o('mode') } }],
  },
  {
    type: 'posterize',
    label: 'Posterize',
    category: 'Color',
    description: 'Reduces the number of color or brightness levels.',
    props: [num('levels', 'Levels', 5, 2, 32, { step: 1 })],
    passes: (e) => [{ frag: POSTERIZE, u: { u_levels: Math.max(2, e.n('levels')) } }],
  },
  {
    type: 'threshold',
    label: 'Threshold',
    category: 'Color',
    description: 'Converts brightness into black and white regions based on a cutoff.',
    props: [pct('level', 'Level', 50), pct('softness', 'Softness', 0, 0, 50)],
    passes: (e) => [{ frag: THRESHOLD, u: { u_level: e.n('level') / 100, u_soft: e.n('softness') / 100 } }],
  },
  {
    type: 'fill',
    label: 'Solid Color',
    category: 'Color',
    description: 'Fills a layer with a chosen color, keeping its shape.',
    props: [col('color', 'Color', '#ffffff'), mix()],
    passes: (e) => [{ frag: FILL, u: { u_color: e.c('color'), u_amt: e.n('mix') / 100 } }],
  },
];
