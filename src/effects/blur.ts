import { DEG, ang, num, opt, pct, point, px, type EffectSpec, type FxEval } from './types';
import { box, gauss } from './glsl';

/** A local point as a GL uv (bottom-left origin). */
export const uvOf = (e: FxEval, p: [number, number]): [number, number] => {
  const [x, y] = e.toBuf(p);
  return [x / e.w, 1 - y / e.h];
};
/** A local point in GL pixel coords (bottom-left origin). */
export const glPx = (e: FxEval, p: [number, number]): [number, number] => {
  const [x, y] = e.toBuf(p);
  return [x, e.h - y];
};

const DIR = `
uniform vec2 u_vec;
void main() {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 40; i++) sum += texClip(v_uv + u_vec * (float(i) / 39.0 - 0.5) / u_res);
  gl_FragColor = sum / 40.0;
}`;

const ZOOM = `
uniform vec2 u_c; uniform float u_amount;
void main() {
  vec4 sum = vec4(0.0);
  vec2 d = v_uv - u_c;
  for (int i = 0; i < 40; i++) sum += texClip(u_c + d * (1.0 - u_amount * float(i) / 39.0));
  gl_FragColor = sum / 40.0;
}`;

const SPIN = `
uniform vec2 u_c; uniform float u_angle;
void main() {
  vec2 p = v_uv * u_res - u_c;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 40; i++) {
    float a = (float(i) / 39.0 - 0.5) * u_angle;
    sum += texClip((u_c + rot(a) * p) / u_res);
  }
  gl_FragColor = sum / 40.0;
}`;

const LENS = `
uniform float u_r; uniform float u_boost;
void main() {
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = 0; i < 72; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 72.0) * u_r;
    float a = fi * 2.39996;
    vec4 s = texClip(v_uv + vec2(cos(a), sin(a)) * r / u_res);
    float w = 1.0 + u_boost * pow(lum(unpre(s).rgb), 4.0) * s.a;
    acc += s * w; ws += w;
  }
  gl_FragColor = acc / ws;
}`;

const INNER = `
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  vec3 rgb = b.a > 0.001 ? b.rgb / b.a : unpre(o).rgb;
  gl_FragColor = vec4(rgb * o.a, o.a);
}`;

const MASK = `
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : (b.a > 0.001 ? b.rgb / b.a : vec3(0.0));
  gl_FragColor = vec4(rgb * b.a, b.a);
}`;

const FEATHER = `
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  float a = o.a * clamp((b.a - 0.5) * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(unpre(o).rgb * a, a);
}`;

const SMOOTH = `
uniform float u_k;
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  float a = smoothstep(0.5 - u_k, 0.5 + u_k, b.a);
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : (b.a > 0.001 ? b.rgb / b.a : vec3(0.0));
  gl_FragColor = vec4(rgb * a, a);
}`;

const SHARPEN = `
uniform float u_amt;
void main() {
  vec2 d = 1.0 / u_res;
  vec4 c = tex(v_uv);
  vec4 n = tex(v_uv + vec2(d.x, 0.0)) + tex(v_uv - vec2(d.x, 0.0)) + tex(v_uv + vec2(0.0, d.y)) + tex(v_uv - vec2(0.0, d.y));
  vec4 s = c * (1.0 + 4.0 * u_amt) - n * u_amt;
  gl_FragColor = vec4(clamp(s.rgb, 0.0, c.a), c.a);
}`;

const UNSHARP = `
uniform float u_amt; uniform float u_th;
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  vec3 d = o.rgb - b.rgb;
  float m = smoothstep(u_th, u_th + 0.02, abs(lum(d)));
  gl_FragColor = vec4(clamp(o.rgb + d * u_amt * m, 0.0, o.a), o.a);
}`;

const DIMS = ['Both', 'Horizontal', 'Vertical'];

export const BLUR_EFFECTS: EffectSpec[] = [
  {
    type: 'blur',
    label: 'Gaussian Blur',
    category: 'Blur & Sharpen',
    description: 'Creates a smooth, soft blur.',
    props: [num('amount', 'Blurriness', 12, 0, 200), opt('dims', 'Direction', DIMS)],
    passes: (e) => gauss(e.n('amount') * 0.6 * e.scale, e.o('dims') as 0 | 1 | 2),
  },
  {
    type: 'boxBlur',
    label: 'Box Blur',
    category: 'Blur & Sharpen',
    description: 'Softens an image using a box-shaped blur.',
    props: [px('radius', 'Radius', 10, 200)],
    passes: (e) => box(e.n('radius') * e.scale),
  },
  {
    type: 'preciseBoxBlur',
    label: 'Precise Box Blur',
    category: 'Blur & Sharpen',
    description: 'Applies a box blur with more precise control.',
    props: [px('radius', 'Radius', 8, 200), num('iterations', 'Iterations', 3, 1, 5, { step: 1 }), opt('dims', 'Direction', DIMS)],
    passes: (e) => {
      const r = e.n('radius') * e.scale;
      const d = e.o('dims');
      return box(r, Math.round(e.n('iterations'))).filter((p) => d === 0 || (d === 1 ? (p.u!.u_dir as number[])[0] === 1 : (p.u!.u_dir as number[])[1] === 1));
    },
  },
  {
    type: 'dirBlur',
    label: 'Directional Blur',
    category: 'Blur & Sharpen',
    description: 'Blurs an image in a chosen direction.',
    props: [px('amount', 'Length', 30, 400), ang('angle', 'Direction', 0)],
    passes: (e) => {
      const a = e.n('angle') * DEG;
      const L = e.n('amount') * e.scale;
      return [{ frag: DIR, u: { u_vec: [Math.cos(a) * L, -Math.sin(a) * L] } }];
    },
  },
  {
    type: 'zoomBlur',
    label: 'Zoom Blur',
    category: 'Blur & Sharpen',
    description: 'Creates blur radiating toward or away from a center.',
    props: [pct('amount', 'Strength', 25), point('center', 'Center')],
    passes: (e) => [{ frag: ZOOM, u: { u_c: uvOf(e, e.pt('center')), u_amount: e.n('amount') / 100 } }],
  },
  {
    type: 'spinBlur',
    label: 'Spin Blur',
    category: 'Blur & Sharpen',
    description: 'Blurs content around a rotation center.',
    props: [num('angle', 'Angle', 20, 0, 360, { unit: '°' }), point('center', 'Center')],
    passes: (e) => [{ frag: SPIN, u: { u_c: glPx(e, e.pt('center')), u_angle: e.n('angle') * DEG } }],
  },
  {
    type: 'lensBlur',
    label: 'Lens Blur',
    category: 'Blur & Sharpen',
    description: 'Simulates camera lens or depth-of-field blur with bokeh highlights.',
    props: [px('radius', 'Iris radius', 14, 120), pct('boost', 'Specular brightness', 60, 0, 400)],
    passes: (e) => [{ frag: LENS, u: { u_r: e.n('radius') * e.scale, u_boost: e.n('boost') / 10 } }],
  },
  {
    type: 'innerBlur',
    label: 'Inner Blur',
    category: 'Blur & Sharpen',
    description: "Blurs content within a layer's boundaries, keeping its edges.",
    props: [num('amount', 'Blurriness', 12, 0, 200)],
    passes: (e) => [...gauss(e.n('amount') * 0.6 * e.scale), { frag: INNER }],
  },
  {
    type: 'maskBlur',
    label: 'Mask Blur',
    category: 'Blur & Sharpen',
    description: "Blurs the layer's mask edges while keeping its colors crisp.",
    props: [num('amount', 'Blurriness', 16, 0, 200)],
    passes: (e) => [...gauss(e.n('amount') * 0.6 * e.scale), { frag: MASK }],
  },
  {
    type: 'feather',
    label: 'Feather',
    category: 'Blur & Sharpen',
    description: 'Softens the edges of a layer inward.',
    props: [px('amount', 'Feather', 20, 300)],
    passes: (e) => [...gauss(e.n('amount') * 0.5 * e.scale), { frag: FEATHER }],
  },
  {
    type: 'smoothEdges',
    label: 'Smooth Edges',
    category: 'Blur & Sharpen',
    description: 'Reduces jagged edges.',
    props: [px('amount', 'Smoothness', 2, 20)],
    passes: (e) => [...gauss(Math.max(0.5, e.n('amount') * 0.6 * e.scale)), { frag: SMOOTH, u: { u_k: 0.18 } }],
  },
  {
    type: 'sharpen',
    label: 'Sharpen',
    category: 'Blur & Sharpen',
    description: 'Makes edges and details appear crisper.',
    props: [pct('amount', 'Amount', 50, 0, 300)],
    passes: (e) => [{ frag: SHARPEN, u: { u_amt: e.n('amount') / 100 } }],
  },
  {
    type: 'unsharpMask',
    label: 'Unsharp Mask',
    category: 'Blur & Sharpen',
    description: 'Sharpens details by increasing contrast around edges.',
    props: [pct('amount', 'Amount', 80, 0, 500), px('radius', 'Radius', 3, 50), pct('threshold', 'Threshold', 0)],
    passes: (e) => [...gauss(e.n('radius') * e.scale), { frag: UNSHARP, u: { u_amt: e.n('amount') / 100, u_th: e.n('threshold') / 100 } }],
  },
  {
    type: 'motionBlur',
    label: 'Motion Blur',
    category: 'Blur & Sharpen',
    description: 'Adds blur based on animated movement, rotation or scaling of this layer.',
    props: [num('shutter', 'Shutter angle', 180, 0, 720, { unit: '°' }), num('samples', 'Samples', 12, 2, 48, { step: 1 })],
    render: 'motionBlur',
  },
];
