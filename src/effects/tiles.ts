import type { Vec2 } from '../model/types';
import { DEG, ang, num, opt, pct, px, vec, type EffectSpec, type FxApply } from './types';

const MOTION_TILE = `
uniform vec2 u_out; uniform float u_mirror; uniform vec2 u_phase;
void main() {
  vec2 n = lnorm(lp()) - 0.5;
  if (abs(n.x) > u_out.x * 0.5 || abs(n.y) > u_out.y * 0.5) { gl_FragColor = vec4(0.0); return; }
  vec2 g = n + 0.5 + u_phase;
  vec2 f = fract(g);
  if (u_mirror > 0.5) { vec2 m = mod(floor(g), 2.0); f = mix(f, 1.0 - f, m); }
  gl_FragColor = texL(ldenorm(f));
}`;

const TILE_ROTATE = `
uniform float u_size; uniform float u_ang; uniform float u_rand;
void main() {
  vec2 p = lp();
  vec2 id = floor(p / u_size);
  vec2 c = (id + 0.5) * u_size;
  float a = u_ang + (hash(id + u_seed) - 0.5) * 2.0 * u_rand;
  vec2 q = c + rot(a) * (p - c);
  if (abs(q.x - c.x) > u_size * 0.5 || abs(q.y - c.y) > u_size * 0.5) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texL(q);
}`;

const TILE_SHIFT = `
uniform float u_size; uniform vec2 u_shift; uniform float u_rand;
void main() {
  vec2 p = lp();
  vec2 id = floor(p / u_size);
  vec2 sh = vec2(mod(id.y, 2.0) * u_shift.x, mod(id.x, 2.0) * u_shift.y) + (hash2(id + u_seed) - 0.5) * 2.0 * u_rand;
  gl_FragColor = texL(p - sh);
}`;

const HEX = `
vec4 hexCell(vec2 p) {
  vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
}
float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
`;

const HEX_FX = `
uniform float u_size; uniform float u_mode; uniform float u_ang; uniform float u_rand; uniform vec2 u_shift; uniform float u_gap;
${HEX}
void main() {
  vec2 p = lp();
  vec2 sp = p / u_size;
  vec4 h = hexCell(sp);
  vec2 center = (sp - h.xy) * u_size;
  float r = hash(h.zw + u_seed);
  if (u_mode < 0.5) {
    vec2 n = vec2(h.x + 0.5, h.y / 1.1547 + 0.5);
    gl_FragColor = texL(ldenorm(n));
  } else if (u_mode < 1.5) {
    float a = u_ang + (r - 0.5) * 2.0 * u_rand;
    gl_FragColor = texL(center + rot(a) * h.xy * u_size);
  } else if (u_mode < 2.5) {
    vec2 sh = u_shift * (mod(h.z + h.w, 2.0) < 1.0 ? 1.0 : -1.0) + (hash2(h.zw + u_seed) - 0.5) * 2.0 * u_rand;
    gl_FragColor = texL(p - sh);
  } else {
    vec4 c = texL(center);
    float d = hexDist(h.xy);
    float cov = 1.0 - smoothstep(0.5 - u_gap - 0.02, 0.5 - u_gap, d);
    gl_FragColor = c * cov;
  }
}`;

/* ---------------- 2D copy-based repeaters ---------------- */

interface Copy {
  /** Transform in buffer pixels. */
  m: DOMMatrix;
  alpha: number;
}

/** Draws transformed copies of the layer's current pixels (only its bounding box is copied). */
function drawCopies(a: FxApply, copies: Copy[], keepOriginal: 'none' | 'behind' | 'front') {
  const snap = a.temp();
  const sctx = snap.getContext('2d')!;
  sctx.drawImage(a.buf, 0, 0);
  const corners: Vec2[] = [
    [a.lb.x, a.lb.y],
    [a.lb.x + a.lb.w, a.lb.y],
    [a.lb.x + a.lb.w, a.lb.y + a.lb.h],
    [a.lb.x, a.lb.y + a.lb.h],
  ].map((c) => a.toBuf(c as Vec2));
  const pad = 4;
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])) - pad));
  const x1 = Math.min(a.w, Math.ceil(Math.max(...corners.map((c) => c[0])) + pad));
  const y1 = Math.min(a.h, Math.ceil(Math.max(...corners.map((c) => c[1])) + pad));
  const ctx = a.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 'behind': copies first (far to near), then the original on top.
  if (keepOriginal !== 'front') ctx.clearRect(0, 0, a.w, a.h);
  if (x1 > x0 && y1 > y0) {
    for (const c of copies) {
      if (c.alpha <= 0.001) continue;
      ctx.setTransform(c.m);
      ctx.globalAlpha = Math.min(1, c.alpha);
      ctx.drawImage(snap, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    }
  }
  if (keepOriginal === 'behind') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(snap, 0, 0);
  }
  ctx.restore();
}

/** Local-space transform T expressed in buffer pixels: m * T * m^-1. */
const inBuf = (a: FxApply, t: DOMMatrix) => a.m.multiply(t).multiply(a.m.inverse());

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

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const TILE_EFFECTS: EffectSpec[] = [
  {
    type: 'tile',
    label: 'Tiles',
    category: 'Tiles & Repeat',
    description: 'Repeats a layer in a tiled pattern beyond its edges.',
    props: [pct('outW', 'Output width', 300, 100, 2000), pct('outH', 'Output height', 300, 100, 2000), opt('mirror', 'Mirror edges', ['Off', 'On']), vec('phase', 'Phase', [0, 0], '%')],
    passes: (e) => {
      const [px0, py0] = e.v('phase');
      return [{ frag: MOTION_TILE, u: { u_out: [e.n('outW') / 100, e.n('outH') / 100], u_mirror: e.o('mirror'), u_phase: [px0 / 100, py0 / 100] } }];
    },
  },
  {
    type: 'tileRotate',
    label: 'Tile Rotate',
    category: 'Tiles & Repeat',
    description: 'Divides an image into tiles and rotates them.',
    props: [px('size', 'Tile size', 80, 1000), ang('angle', 'Rotation', 30), num('random', 'Random rotation', 0, 0, 180, { unit: '°' })],
    passes: (e) => [{ frag: TILE_ROTATE, u: { u_size: Math.max(2, e.n('size')), u_ang: e.n('angle') * DEG, u_rand: e.n('random') * DEG } }],
  },
  {
    type: 'tileShift',
    label: 'Tile Shift',
    category: 'Tiles & Repeat',
    description: 'Shifts tiles within an image (brick-style offsets).',
    props: [px('size', 'Tile size', 80, 1000), vec('shift', 'Shift', [30, 0]), px('random', 'Random shift', 0, 300)],
    passes: (e) => [{ frag: TILE_SHIFT, u: { u_size: Math.max(2, e.n('size')), u_shift: e.v('shift'), u_rand: e.n('random') } }],
  },
  {
    type: 'hexTiling',
    label: 'Hexagon Tiling',
    category: 'Tiles & Repeat',
    description: 'Repeats imagery in a hexagonal arrangement.',
    props: [px('size', 'Hexagon size', 160, 2000)],
    passes: (e) => [{ frag: HEX_FX, u: { u_size: Math.max(4, e.n('size')), u_mode: 0, u_ang: 0, u_rand: 0, u_shift: [0, 0], u_gap: 0 } }],
  },
  {
    type: 'hexTileRotate',
    label: 'Hexagon Tile Rotate',
    category: 'Tiles & Repeat',
    description: 'Creates hexagonal tiles with rotational variations.',
    props: [px('size', 'Hexagon size', 120, 2000), ang('angle', 'Rotation', 60), num('random', 'Random rotation', 30, 0, 180, { unit: '°' })],
    passes: (e) => [{ frag: HEX_FX, u: { u_size: Math.max(4, e.n('size')), u_mode: 1, u_ang: e.n('angle') * DEG, u_rand: e.n('random') * DEG, u_shift: [0, 0], u_gap: 0 } }],
  },
  {
    type: 'hexTileShift',
    label: 'Hexagon Tile Shift',
    category: 'Tiles & Repeat',
    description: 'Creates a hexagonal tiled pattern with shifted tiles.',
    props: [px('size', 'Hexagon size', 120, 2000), vec('shift', 'Shift', [20, 10]), px('random', 'Random shift', 10, 300)],
    passes: (e) => [{ frag: HEX_FX, u: { u_size: Math.max(4, e.n('size')), u_mode: 2, u_ang: 0, u_rand: e.n('random'), u_shift: e.v('shift'), u_gap: 0 } }],
  },
  {
    type: 'hexArray',
    label: 'Hexagon Array',
    category: 'Tiles & Repeat',
    description: 'Rebuilds the layer as an array of colored hexagons.',
    props: [px('size', 'Hexagon size', 40, 1000), pct('gap', 'Gap', 8, 0, 45)],
    passes: (e) => [{ frag: HEX_FX, u: { u_size: Math.max(4, e.n('size')), u_mode: 3, u_ang: 0, u_rand: 0, u_shift: [0, 0], u_gap: e.n('gap') / 100 } }],
  },
  {
    type: 'repeat',
    label: 'Repeat',
    category: 'Tiles & Repeat',
    description: 'Duplicates content multiple times, each copy offset, rotated and scaled a bit more.',
    props: [num('count', 'Copies', 5, 1, 60, { step: 1 }), vec('offset', 'Offset per copy', [40, 0]), ang('rotation', 'Rotation per copy', 0), pct('scale', 'Scale per copy', 100, 10, 200), pct('fade', 'Opacity falloff', 15), opt('order', 'Copies are', ['Behind', 'In front'])],
    apply: (a) => {
      const n = Math.round(a.n('count'));
      const [ox, oy] = a.v('offset');
      const c: Vec2 = [a.lb.x + a.lb.w / 2, a.lb.y + a.lb.h / 2];
      const copies: Copy[] = [];
      for (let i = 1; i <= n; i++) {
        const s = Math.pow(a.n('scale') / 100, i);
        const t = new DOMMatrix().translate(c[0] + ox * i, c[1] + oy * i).rotate(a.n('rotation') * i).scale(s, s).translate(-c[0], -c[1]);
        copies.push({ m: inBuf(a, t), alpha: Math.pow(1 - a.n('fade') / 100, i) });
      }
      const behind = a.o('order') === 0;
      drawCopies(a, behind ? copies.reverse() : copies, behind ? 'behind' : 'front');
    },
  },
  {
    type: 'linearRepeat',
    label: 'Linear Repeat',
    category: 'Tiles & Repeat',
    description: 'Repeats a layer in a line.',
    props: [num('count', 'Count', 5, 1, 60, { step: 1 }), px('distance', 'Spacing', 150, 4000), ang('angle', 'Direction', 0), pct('scaleEnd', 'End scale', 100, 0, 300), pct('opacityEnd', 'End opacity', 100), opt('align', 'Alignment', ['Centered', 'From layer'])],
    apply: (a) => {
      const n = Math.max(1, Math.round(a.n('count')));
      const dx = Math.cos(a.n('angle') * DEG) * a.n('distance');
      const dy = Math.sin(a.n('angle') * DEG) * a.n('distance');
      const c: Vec2 = [a.lb.x + a.lb.w / 2, a.lb.y + a.lb.h / 2];
      const start = a.o('align') === 0 ? -(n - 1) / 2 : 0;
      const copies: Copy[] = [];
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) : 0;
        const s = lerp(1, a.n('scaleEnd') / 100, k);
        const t = new DOMMatrix().translate(c[0] + dx * (start + i), c[1] + dy * (start + i)).scale(s, s).translate(-c[0], -c[1]);
        copies.push({ m: inBuf(a, t), alpha: lerp(1, a.n('opacityEnd') / 100, k) });
      }
      drawCopies(a, copies.reverse(), 'none');
    },
  },
  {
    type: 'radialRepeat',
    label: 'Radial Repeat',
    category: 'Tiles & Repeat',
    description: 'Repeats content around a center in a circular arrangement.',
    props: [num('count', 'Count', 8, 1, 60, { step: 1 }), px('radius', 'Radius', 250, 4000), ang('start', 'Start angle', -90), num('arc', 'Arc', 360, 1, 360, { unit: '°' }), opt('orient', 'Rotate copies', ['Yes', 'No']), pct('scale', 'Scale', 100, 1, 300)],
    apply: (a) => {
      const n = Math.max(1, Math.round(a.n('count')));
      const c: Vec2 = [a.lb.x + a.lb.w / 2, a.lb.y + a.lb.h / 2];
      const arc = a.n('arc');
      const step = arc >= 360 ? 360 / n : n > 1 ? arc / (n - 1) : 0;
      const s = a.n('scale') / 100;
      const copies: Copy[] = [];
      for (let i = 0; i < n; i++) {
        const angDeg = a.n('start') + step * i;
        const t = new DOMMatrix()
          .translate(c[0] + Math.cos(angDeg * DEG) * a.n('radius'), c[1] + Math.sin(angDeg * DEG) * a.n('radius'))
          .rotate(a.o('orient') === 0 ? angDeg + 90 : 0)
          .scale(s, s)
          .translate(-c[0], -c[1]);
        copies.push({ m: inBuf(a, t), alpha: 1 });
      }
      drawCopies(a, copies, 'none');
    },
  },
  {
    type: 'gridRepeat',
    label: 'Grid Repeat',
    category: 'Tiles & Repeat',
    description: 'Repeats content in a grid arrangement.',
    props: [num('cols', 'Columns', 3, 1, 30, { step: 1 }), num('rows', 'Rows', 3, 1, 30, { step: 1 }), vec('gap', 'Gap', [20, 20]), pct('scale', 'Scale', 100, 1, 300), opt('stagger', 'Layout', ['Grid', 'Staggered rows'])],
    apply: (a) => {
      const cols = Math.max(1, Math.round(a.n('cols')));
      const rows = Math.max(1, Math.round(a.n('rows')));
      const [gx, gy] = a.v('gap');
      const s = a.n('scale') / 100;
      const sx = a.lb.w * s + gx;
      const sy = a.lb.h * s + gy;
      const c: Vec2 = [a.lb.x + a.lb.w / 2, a.lb.y + a.lb.h / 2];
      const copies: Copy[] = [];
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const off = a.o('stagger') === 1 && r % 2 ? sx / 2 : 0;
          const t = new DOMMatrix()
            .translate(c[0] + (k - (cols - 1) / 2) * sx + off, c[1] + (r - (rows - 1) / 2) * sy)
            .scale(s, s)
            .translate(-c[0], -c[1]);
          copies.push({ m: inBuf(a, t), alpha: 1 });
        }
      }
      drawCopies(a, copies, 'none');
    },
  },
  {
    type: 'scatterRepeat',
    label: 'Scatter Repeat',
    category: 'Tiles & Repeat',
    description: 'Repeats copies of content with scattered placement.',
    props: [num('count', 'Count', 12, 1, 100, { step: 1 }), vec('spread', 'Spread', [600, 400]), pct('scaleVar', 'Scale variation', 40), num('rotVar', 'Rotation variation', 45, 0, 180, { unit: '°' }), pct('opacityVar', 'Opacity variation', 30), num('seed', 'Random seed', 1, 0, 9999, { step: 1 }), num('drift', 'Drift speed', 0, 0, 200)],
    apply: (a) => {
      const r = rng(Math.round(a.n('seed')) * 7919 + 13);
      const [sx, sy] = a.v('spread');
      const c: Vec2 = [a.lb.x + a.lb.w / 2, a.lb.y + a.lb.h / 2];
      const copies: Copy[] = [];
      for (let i = 0; i < Math.round(a.n('count')); i++) {
        const px0 = (r() - 0.5) * sx;
        const py0 = (r() - 0.5) * sy;
        const sc = 1 + (r() - 0.5) * 2 * (a.n('scaleVar') / 100);
        const ro = (r() - 0.5) * 2 * a.n('rotVar');
        const al = 1 - r() * (a.n('opacityVar') / 100);
        const drift = a.n('drift') * a.local;
        const da = r() * Math.PI * 2;
        const t = new DOMMatrix()
          .translate(c[0] + px0 + Math.cos(da) * drift, c[1] + py0 + Math.sin(da) * drift)
          .rotate(ro)
          .scale(Math.max(0.01, sc))
          .translate(-c[0], -c[1]);
        copies.push({ m: inBuf(a, t), alpha: al });
      }
      drawCopies(a, copies, 'none');
    },
  },
  {
    type: 'repeatAlongPath',
    label: 'Repeat Along Path',
    category: 'Tiles & Repeat',
    description: 'Repeats objects along a path (pick a shape or drawing layer as the path).',
    props: [num('count', 'Count', 10, 1, 100, { step: 1 }), pct('start', 'Start', 0), pct('end', 'End', 100), pct('offset', 'Offset (animate me)', 0, -1000, 1000), opt('align', 'Align to path', ['Yes', 'No']), pct('scale', 'Scale', 100, 1, 300)],
    refs: [{ key: 'path', label: 'Path layer', hint: 'A shape or drawing layer (it can be hidden). Default: a circle.' }],
    apply: (a) => {
      let path = a.refPath('path');
      const cBuf = a.toBuf([a.lb.x + a.lb.w / 2, a.lb.y + a.lb.h / 2]);
      if (!path || path.length < 2) {
        const R = Math.min(a.lb.w, a.lb.h) * 1.2 * a.lpx;
        path = Array.from({ length: 97 }, (_, i) => [cBuf[0] + Math.cos((i / 96) * Math.PI * 2) * R, cBuf[1] + Math.sin((i / 96) * Math.PI * 2) * R] as Vec2);
      }
      const seg: number[] = [0];
      for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      const total = seg[seg.length - 1] || 1;
      const at = (f: number): { p: Vec2; ang: number } => {
        const d = (((f % 1) + 1) % 1) * total;
        let i = 1;
        while (i < seg.length - 1 && seg[i] < d) i++;
        const k = (d - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]);
        const [x0, y0] = path![i - 1];
        const [x1, y1] = path![i];
        return { p: [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k], ang: Math.atan2(y1 - y0, x1 - x0) };
      };
      const n = Math.max(1, Math.round(a.n('count')));
      const s = a.n('scale') / 100;
      const st = a.n('start') / 100;
      const en = a.n('end') / 100;
      const closed = Math.hypot(path[0][0] - path[path.length - 1][0], path[0][1] - path[path.length - 1][1]) < 2;
      const copies: Copy[] = [];
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (closed && en - st >= 1 ? n : n - 1) : 0;
        const f = st + (en - st) * k + a.n('offset') / 100;
        const { p, ang: an } = at(closed ? f : Math.min(0.9999, Math.max(0, f)));
        const t = new DOMMatrix()
          .translate(p[0], p[1])
          .rotate(a.o('align') === 0 ? (an * 180) / Math.PI : 0)
          .scale(s, s)
          .translate(-cBuf[0], -cBuf[1]);
        copies.push({ m: t, alpha: 1 });
      }
      drawCopies(a, copies, 'none');
    },
  },
];
