import { DEG, WAVES, ang, col, num, opt, pct, point, px, type EffectSpec, type FxEval } from './types';

const BEND = `
uniform float u_amt; uniform float u_dir; uniform vec2 u_c;
void main() {
  vec2 p = lp(); vec2 d = p - u_c; vec2 q = p;
  if (u_dir < 0.5) { float x = d.x / max(u_lb.z * 0.5, 1.0); q.y = p.y - u_amt * x * x * u_lb.w * 0.5; }
  else { float y = d.y / max(u_lb.w * 0.5, 1.0); q.x = p.x - u_amt * y * y * u_lb.z * 0.5; }
  gl_FragColor = texL(q);
}`;

const RIPPLE = `
uniform vec2 u_c; uniform float u_amp; uniform float u_len; uniform float u_speed; uniform float u_rad;
void main() {
  vec2 p = lp(); vec2 d = p - u_c; float r = length(d);
  float fall = u_rad > 0.0 ? 1.0 - smoothstep(u_rad * 0.6, u_rad, r) : 1.0;
  float w = sin(r / max(u_len, 1.0) * TAU - u_ltime * u_speed * TAU) * u_amp * fall;
  gl_FragColor = texL(p + (r > 0.0 ? d / r : vec2(0.0)) * w);
}`;

const CURL = `
uniform float u_prog; uniform vec2 u_dir; uniform float u_R; uniform vec4 u_back;
vec4 pageAt(vec2 p, float sx, float x) {
  vec2 q = p + u_dir * (sx - x);
  if (!inBounds(q)) return vec4(0.0);
  return texL(q);
}
vec4 backSide(vec4 b, float shade) {
  vec4 u = unpre(b);
  return pre(vec4(mix(u.rgb, u_back.rgb, u_back.a) * shade, u.a));
}
void main() {
  vec2 p = lp();
  float hs = 0.5 * (abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y));
  float x = dot(p - lcenter(), u_dir);
  float L = mix(hs + u_R, -hs - PI * u_R, u_prog);
  vec4 col = vec4(0.0);
  if (x < L) {
    col = pageAt(p, x, x);
    float x3 = L + PI * u_R + (L - x);
    if (x3 < hs) {
      vec4 b = pageAt(p, x3, x);
      if (b.a > 0.0) { vec4 bb = backSide(b, 0.9); col = bb + col * (1.0 - bb.a); }
    } else {
      col.rgb *= 1.0 - 0.35 * exp(-(L - x) / max(u_R, 1.0)) * step(-hs, L);
    }
  } else if (x < L + u_R) {
    float th = asin(clamp((x - L) / u_R, -1.0, 1.0));
    float x1 = L + u_R * th;
    float x2 = L + u_R * (PI - th);
    vec4 f = x1 < hs ? pageAt(p, x1, x) : vec4(0.0);
    f.rgb *= 0.7 + 0.3 * cos(th);
    if (x2 < hs) {
      vec4 b = pageAt(p, x2, x);
      if (b.a > 0.0) { vec4 bb = backSide(b, 0.55 + 0.45 * sin(th)); f = bb + f * (1.0 - bb.a); }
    }
    col = f;
  }
  gl_FragColor = col;
}`;

const CHAN = `
float chan(vec4 c, float i) {
  vec4 u = unpre(c);
  if (i < 0.5) return lum(u.rgb); if (i < 1.5) return u.r; if (i < 2.5) return u.g; if (i < 3.5) return u.b; return c.a;
}`;

const DISPLACE = `
uniform vec2 u_amt; uniform vec2 u_ch; uniform float u_useAux;
${CHAN}
void main() {
  vec4 m = u_useAux > 0.5 ? aux(v_uv) : orig(v_uv);
  vec2 off = vec2(chan(m, u_ch.x) - 0.5, chan(m, u_ch.y) - 0.5) * u_amt * 2.0 * m.a;
  gl_FragColor = texL(lp() + off);
}`;

const POLAR_DISPLACE = `
uniform vec2 u_c; uniform float u_rad; uniform float u_ang; uniform float u_useAux; uniform float u_ch;
${CHAN}
void main() {
  vec4 m = u_useAux > 0.5 ? aux(v_uv) : orig(v_uv);
  float v = (chan(m, u_ch) - 0.5) * m.a;
  vec2 d = lp() - u_c;
  float r = length(d) + v * 2.0 * u_rad;
  float a = atan(d.y, d.x) + v * 2.0 * u_ang;
  gl_FragColor = texL(u_c + vec2(cos(a), sin(a)) * r);
}`;

const FRACTAL_WARP = `
uniform float u_amt; uniform float u_size; uniform float u_oct; uniform float u_speed;
void main() {
  vec2 p = lp();
  vec2 s = p / max(u_size, 1.0) + u_ltime * u_speed * 0.2;
  vec2 q1 = vec2(fbm(s, u_oct), fbm(s + vec2(5.2, 1.3), u_oct));
  vec2 q2 = vec2(fbm(s + 4.0 * q1 + vec2(1.7, 9.2), u_oct), fbm(s + 4.0 * q1 + vec2(8.3, 2.8), u_oct));
  gl_FragColor = texL(p + (q2 - 0.5) * 2.0 * u_amt);
}`;

const TURB = `
uniform float u_amt; uniform float u_size; uniform float u_speed; uniform float u_oct;
void main() {
  vec2 p = lp();
  vec2 s = p / max(u_size, 1.0) + vec2(u_ltime * u_speed * 0.3);
  vec2 off = vec2(fbm(s, u_oct), fbm(s + 19.1, u_oct)) - 0.5;
  gl_FragColor = texL(p + off * 2.0 * u_amt);
}`;

const RANDOM_DISPLACE = `
uniform float u_amt; uniform float u_cell; uniform float u_step;
void main() {
  vec2 p = lp();
  vec2 cell = floor(p / max(u_cell, 1.0));
  vec2 r = hash2(cell + vec2(u_step * 7.13, u_seed)) - 0.5;
  gl_FragColor = texL(p + r * 2.0 * u_amt);
}`;

const OFFSET = `
uniform vec2 u_shift;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texL(ldenorm(fract(lnorm(p) - u_shift)));
}`;

const BULGE = `
uniform vec2 u_c; uniform float u_amt; uniform float u_rad; uniform float u_feather;
void main() {
  vec2 p = lp(); vec2 d = p - u_c; float r = length(d); vec2 q = p;
  if (r < u_rad && r > 0.0) {
    float k = r / u_rad;
    float nk = u_amt >= 0.0 ? pow(k, 1.0 + u_amt * 1.5) : pow(k, 1.0 / (1.0 - u_amt * 1.5));
    nk = mix(nk, k, smoothstep(1.0 - u_feather, 1.0, k));
    q = u_c + d / r * nk * u_rad;
  }
  gl_FragColor = texL(q);
}`;

const POLAR = `
uniform float u_mode; uniform float u_amt;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 n = lnorm(p); vec2 q;
  if (u_mode < 0.5) {
    vec2 d = (n - 0.5) * 2.0;
    q = vec2(atan(d.x, -d.y) / TAU + 0.5, 1.0 - length(d));
  } else {
    float a = (n.x - 0.5) * TAU; float r = 1.0 - n.y;
    q = 0.5 + 0.5 * vec2(sin(a), -cos(a)) * r;
  }
  gl_FragColor = texL(ldenorm(mix(n, q, u_amt)));
}`;

const SPHERIZE = `
uniform vec2 u_c; uniform float u_rad; uniform float u_amt;
void main() {
  vec2 p = lp(); vec2 d = (p - u_c) / max(u_rad, 1.0); float r = length(d); vec2 q = p;
  if (r < 1.0) { float k = mix(1.0, (asin(r) / (PI * 0.5)) / max(r, 1e-4), u_amt); q = u_c + d * k * u_rad; }
  gl_FragColor = texL(q);
}`;

const SQUEEZE = `
uniform float u_amt; uniform vec2 u_c;
void main() {
  vec2 d = lp() - u_c; float k = exp(u_amt);
  gl_FragColor = texL(u_c + vec2(d.x * k, d.y / k));
}`;

const STRETCH = `
uniform vec2 u_dir; uniform float u_k; uniform vec2 u_c;
void main() {
  vec2 d = lp() - u_c; float a = dot(d, u_dir);
  gl_FragColor = texL(u_c + (d - a * u_dir) + u_dir * a / max(u_k, 0.01));
}`;

const STRETCH_SEG = `
uniform vec2 u_dir; uniform float u_pos; uniform float u_w; uniform float u_amt;
void main() {
  vec2 p = lp();
  float hs = 0.5 * (abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y));
  float s = dot(p - lcenter(), u_dir);
  float s0 = -hs + u_pos * 2.0 * hs - u_w * hs;
  float s1 = s0 + 2.0 * u_w * hs;
  float L = s1 - s0; float src;
  if (s < s0) src = s;
  else if (s < s1 + u_amt) src = s0 + (s - s0) * L / max(L + u_amt, 0.001);
  else src = s - u_amt;
  gl_FragColor = texL(p + u_dir * (src - s));
}`;

const SWIRL = `
uniform vec2 u_c; uniform float u_ang; uniform float u_rad;
void main() {
  vec2 d = lp() - u_c; float r = length(d);
  if (r < u_rad) { float k = 1.0 - r / u_rad; d = rot(u_ang * k * k) * d; }
  gl_FragColor = texL(u_c + d);
}`;

const WAVE = `
uniform float u_amp; uniform float u_len; uniform float u_speed; uniform vec2 u_dir; uniform float u_type; uniform float u_phase;
float wv(float x, float t) {
  float f = fract(x);
  if (t < 0.5) return sin(x * TAU);
  if (t < 1.5) return 1.0 - 4.0 * abs(f - 0.5);
  if (t < 2.5) return f < 0.5 ? 1.0 : -1.0;
  return f * 2.0 - 1.0;
}
void main() {
  vec2 p = lp(); vec2 perp = vec2(-u_dir.y, u_dir.x);
  float ph = dot(p, perp) / max(u_len, 1.0) - u_ltime * u_speed + u_phase;
  gl_FragColor = texL(p + u_dir * u_amp * wv(ph, u_type));
}`;

const KALEIDO = `
uniform vec2 u_c; uniform float u_seg; uniform float u_ang;
void main() {
  vec2 d = lp() - u_c; float r = length(d);
  float a = atan(d.y, d.x) - u_ang; float seg = TAU / u_seg;
  a = mod(a, seg); if (a > seg * 0.5) a = seg - a;
  a += u_ang;
  gl_FragColor = texL(u_c + vec2(cos(a), sin(a)) * r);
}`;

const MIRROR = `
uniform vec2 u_c; uniform vec2 u_n;
void main() {
  vec2 d = lp() - u_c; float k = dot(d, u_n);
  if (k < 0.0) d -= 2.0 * k * u_n;
  gl_FragColor = texL(u_c + d);
}`;

const TUNNEL = `
uniform vec2 u_c; uniform float u_speed; uniform float u_twist; uniform float u_rep; uniform float u_depth;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 d = (p - u_c) / lmin(); float r = length(d);
  float a = atan(d.y, d.x) / TAU + 0.5;
  float z = u_depth / max(r, 0.001) + u_ltime * u_speed;
  vec2 n = vec2(fract(a * u_rep + z * u_twist), fract(z));
  vec4 c = texL(ldenorm(n));
  gl_FragColor = c * smoothstep(0.0, 0.35, r);
}`;

const dir = (e: FxEval, k: string): [number, number] => [Math.cos(e.n(k) * DEG), Math.sin(e.n(k) * DEG)];
const radius = (e: FxEval, k: string) => (e.n(k) / 100) * Math.min(e.lb.w, e.lb.h);
const MAP_CH = ['Luminance', 'Red', 'Green', 'Blue', 'Alpha'];
const mapRef = [{ key: 'map', label: 'Map layer', hint: 'Leave empty to use this layer itself' }];

export const DISTORT_EFFECTS: EffectSpec[] = [
  {
    type: 'bend',
    label: 'Bend',
    category: 'Distort',
    description: 'Bends a layer or shape.',
    props: [pct('amount', 'Bend', 30, -100, 100), opt('direction', 'Direction', ['Horizontal', 'Vertical']), point('center', 'Center')],
    passes: (e) => [{ frag: BEND, u: { u_amt: e.n('amount') / 100, u_dir: e.o('direction'), u_c: e.pt('center') } }],
  },
  {
    type: 'circularRipple',
    label: 'Circular Ripple',
    category: 'Distort',
    description: 'Creates circular waves spreading across an image.',
    props: [point('center', 'Center'), px('amplitude', 'Amplitude', 12, 200), px('wavelength', 'Wavelength', 60, 1000), num('speed', 'Speed', 1, -10, 10, { step: 0.1 }), pct('radius', 'Radius (0 = no limit)', 0, 0, 300)],
    passes: (e) => [{ frag: RIPPLE, u: { u_c: e.pt('center'), u_amp: e.n('amplitude'), u_len: e.n('wavelength'), u_speed: e.n('speed'), u_rad: radius(e, 'radius') } }],
  },
  {
    type: 'curl',
    label: 'Curl',
    category: 'Distort',
    description: 'Makes a layer appear to curl or fold like a page.',
    props: [pct('progress', 'Curl', 35), ang('angle', 'Direction', 315), px('radius', 'Roll radius', 60, 600), col('back', 'Back side', '#ffffffb0')],
    passes: (e) => [{ frag: CURL, u: { u_prog: e.n('progress') / 100, u_dir: dir(e, 'angle'), u_R: Math.max(1, e.n('radius')), u_back: e.c('back') } }],
  },
  {
    type: 'displacementMap',
    label: 'Displacement Map',
    category: 'Distort',
    description: "Uses another layer's brightness or color to distort this layer.",
    props: [px('h', 'Horizontal amount', 30, 500), opt('hch', 'Horizontal from', MAP_CH), px('v', 'Vertical amount', 30, 500), opt('vch', 'Vertical from', MAP_CH)],
    refs: mapRef,
    aux: { ref: 'map' },
    passes: (e) => [{ frag: DISPLACE, u: { u_amt: [e.n('h'), e.n('v')], u_ch: [e.o('hch'), e.o('vch')], u_useAux: e.ref('map') ? 1 : 0 } }],
  },
  {
    type: 'polarDisplacement',
    label: 'Polar Displacement Map',
    category: 'Distort',
    description: 'Distorts radially and around a center using a map layer.',
    props: [point('center', 'Center'), px('radial', 'Radial amount', 40, 500), num('angular', 'Angular amount', 20, -180, 180, { unit: '°' }), opt('ch', 'Map channel', MAP_CH)],
    refs: mapRef,
    aux: { ref: 'map' },
    passes: (e) => [{ frag: POLAR_DISPLACE, u: { u_c: e.pt('center'), u_rad: e.n('radial'), u_ang: e.n('angular') * DEG, u_ch: e.o('ch'), u_useAux: e.ref('map') ? 1 : 0 } }],
  },
  {
    type: 'fractalWarp',
    label: 'Fractal Warp',
    category: 'Distort',
    description: 'Distorts an image using complex fractal patterns.',
    props: [px('amount', 'Amount', 40, 500), px('size', 'Scale', 200, 3000), num('octaves', 'Complexity', 4, 1, 8, { step: 1 }), num('speed', 'Evolution speed', 0.5, 0, 10, { step: 0.1 })],
    passes: (e) => [{ frag: FRACTAL_WARP, u: { u_amt: e.n('amount'), u_size: e.n('size'), u_oct: e.n('octaves'), u_speed: e.n('speed') } }],
  },
  {
    type: 'turbulence',
    label: 'Turbulent Displace',
    category: 'Distort',
    description: 'Distorts a layer using turbulent patterns.',
    props: [px('amount', 'Amount', 20, 400), px('scale', 'Size', 120, 2000), num('speed', 'Evolution speed', 1, 0, 20, { step: 0.1 }), num('octaves', 'Complexity', 2, 1, 8, { step: 1 })],
    passes: (e) => [{ frag: TURB, u: { u_amt: e.n('amount'), u_size: e.n('scale'), u_speed: e.n('speed'), u_oct: e.n('octaves') } }],
  },
  {
    type: 'randomDisplacement',
    label: 'Random Displacement',
    category: 'Distort',
    description: 'Randomly shifts blocks of the image, changing over time.',
    props: [px('amount', 'Amount', 10, 300), px('cell', 'Block size', 24, 500), num('speed', 'Changes / sec', 8, 0, 60)],
    passes: (e) => [{ frag: RANDOM_DISPLACE, u: { u_amt: e.n('amount'), u_cell: e.n('cell'), u_step: Math.floor(e.local * e.n('speed')) } }],
  },
  {
    type: 'offset',
    label: 'Offset',
    category: 'Distort',
    description: 'Shifts image content, wrapping it around the edges.',
    props: [{ key: 'shift', label: 'Shift', kind: 'vec2', def: [25, 0], unit: '%' }],
    passes: (e) => {
      const [x, y] = e.v('shift');
      return [{ frag: OFFSET, u: { u_shift: [x / 100, y / 100] } }];
    },
  },
  {
    type: 'bulge',
    label: 'Pinch/Bulge',
    category: 'Distort',
    description: 'Pulls image content inward or pushes it outward.',
    props: [pct('amount', 'Amount', 50, -100, 100), pct('radius', 'Radius', 50, 1, 200), point('center', 'Center')],
    passes: (e) => [{ frag: BULGE, u: { u_c: e.pt('center'), u_amt: e.n('amount') / 100, u_rad: radius(e, 'radius'), u_feather: 0.15 } }],
  },
  {
    type: 'innerPinchBulge',
    label: 'Inner Pinch/Bulge',
    category: 'Distort',
    description: 'Pinches or bulges content within an area, with a soft edge.',
    props: [pct('amount', 'Amount', 60, -100, 100), pct('radius', 'Radius', 25, 1, 200), pct('feather', 'Feather', 50), point('center', 'Center')],
    passes: (e) => [{ frag: BULGE, u: { u_c: e.pt('center'), u_amt: e.n('amount') / 100, u_rad: radius(e, 'radius'), u_feather: e.n('feather') / 100 } }],
  },
  {
    type: 'polarCoordinates',
    label: 'Polar Coordinates',
    category: 'Distort',
    description: 'Converts between circular and rectangular image layouts.',
    props: [opt('mode', 'Conversion', ['Rectangular to polar', 'Polar to rectangular']), pct('amount', 'Interpolation', 100)],
    passes: (e) => [{ frag: POLAR, u: { u_mode: e.o('mode'), u_amt: e.n('amount') / 100 } }],
  },
  {
    type: 'spherize',
    label: 'Spherize',
    category: 'Distort',
    description: 'Distorts a layer into a spherical appearance.',
    props: [pct('amount', 'Amount', 100, -100, 100), pct('radius', 'Radius', 50, 1, 200), point('center', 'Center')],
    passes: (e) => [{ frag: SPHERIZE, u: { u_c: e.pt('center'), u_rad: radius(e, 'radius'), u_amt: e.n('amount') / 100 } }],
  },
  {
    type: 'squeeze',
    label: 'Squeeze',
    category: 'Distort',
    description: 'Compresses content along one axis while stretching the other.',
    props: [pct('amount', 'Squeeze', 30, -100, 100), point('center', 'Center')],
    passes: (e) => [{ frag: SQUEEZE, u: { u_amt: (e.n('amount') / 100) * 0.8, u_c: e.pt('center') } }],
  },
  {
    type: 'stretchAxis',
    label: 'Stretch Axis',
    category: 'Distort',
    description: 'Stretches content along a selected axis.',
    props: [ang('angle', 'Axis', 0), pct('amount', 'Stretch', 150, 1, 500), point('center', 'Center')],
    passes: (e) => [{ frag: STRETCH, u: { u_dir: dir(e, 'angle'), u_k: e.n('amount') / 100, u_c: e.pt('center') } }],
  },
  {
    type: 'stretchSegment',
    label: 'Stretch Segment',
    category: 'Distort',
    description: 'Stretches a selected band of the image, pushing the rest outward.',
    props: [ang('angle', 'Axis', 0), pct('position', 'Segment position', 50), pct('width', 'Segment width', 10, 0, 100), px('amount', 'Stretch', 150, 2000)],
    passes: (e) => [{ frag: STRETCH_SEG, u: { u_dir: dir(e, 'angle'), u_pos: e.n('position') / 100, u_w: e.n('width') / 100, u_amt: e.n('amount') } }],
  },
  {
    type: 'swirl',
    label: 'Swirl',
    category: 'Distort',
    description: 'Twists image content around a center.',
    props: [num('angle', 'Angle', 180, -1080, 1080, { unit: '°' }), pct('radius', 'Radius', 50, 1, 200), point('center', 'Center')],
    passes: (e) => [{ frag: SWIRL, u: { u_c: e.pt('center'), u_ang: e.n('angle') * DEG, u_rad: radius(e, 'radius') } }],
  },
  {
    type: 'wave',
    label: 'Wave Warp',
    category: 'Distort',
    description: 'Distorts content into wave patterns.',
    props: [opt('type', 'Wave type', WAVES), px('amp', 'Height', 20, 300), px('length', 'Width', 120, 2000), ang('angle', 'Direction', 0), num('speed', 'Speed (waves/s)', 1, -20, 20, { step: 0.1 }), num('phase', 'Phase', 0, -360, 360, { unit: '°' })],
    passes: (e) => [{ frag: WAVE, u: { u_amp: e.n('amp'), u_len: e.n('length'), u_speed: e.n('speed'), u_dir: dir(e, 'angle'), u_type: e.o('type'), u_phase: e.n('phase') / 360 } }],
  },
  {
    type: 'kaleido',
    label: 'Kaleidoscope',
    category: 'Distort',
    description: 'Repeats and reflects imagery into a symmetrical pattern.',
    props: [num('segments', 'Segments', 6, 2, 32, { step: 1 }), ang('angle', 'Rotation', 0), point('center', 'Center')],
    passes: (e) => [{ frag: KALEIDO, u: { u_c: e.pt('center'), u_seg: Math.max(2, Math.round(e.n('segments'))), u_ang: e.n('angle') * DEG } }],
  },
  {
    type: 'mirror',
    label: 'Mirror',
    category: 'Distort',
    description: 'Reflects imagery to create symmetry.',
    props: [ang('angle', 'Reflection angle', 0), point('center', 'Center')],
    passes: (e) => [{ frag: MIRROR, u: { u_c: e.pt('center'), u_n: dir(e, 'angle') } }],
  },
  {
    type: 'tunnel',
    label: 'Tunnel',
    category: 'Distort',
    description: 'Creates a tunnel-like perspective with repeating depth.',
    props: [point('center', 'Center'), num('speed', 'Speed', 0.5, -10, 10, { step: 0.05 }), num('repeat', 'Repeats around', 2, 1, 12, { step: 1 }), num('twist', 'Twist', 0, -2, 2, { step: 0.05 }), num('depth', 'Depth', 0.3, 0.05, 2, { step: 0.01 })],
    passes: (e) => [{ frag: TUNNEL, u: { u_c: e.pt('center'), u_speed: e.n('speed'), u_rep: Math.round(e.n('repeat')), u_twist: e.n('twist'), u_depth: e.n('depth') } }],
  },
];
