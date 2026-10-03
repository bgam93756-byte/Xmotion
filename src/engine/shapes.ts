import type { ShapeKind, Vec2 } from '../model/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapeGeom {
  path: Path2D;
  /** Approximate outline length, used by trim paths. */
  length: number;
  bounds: Rect;
}

export interface ShapeParams {
  kind: ShapeKind;
  w: number;
  h: number;
  radius: number;
  sides: number;
  inner: number;
  points?: Vec2[];
  closed?: boolean;
}

const cache = new Map<string, ShapeGeom>();

function polyVerts(p: ShapeParams): Vec2[] {
  const rx = p.w / 2;
  const ry = p.h / 2;
  const out: Vec2[] = [];
  const n = Math.max(3, Math.round(p.sides));
  if (p.kind === 'star') {
    const k = Math.max(0.01, p.inner / 100);
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const f = i % 2 === 0 ? 1 : k;
      out.push([Math.cos(a) * rx * f, Math.sin(a) * ry * f]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
  }
  return out;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function roundedPoly(path: Path2D, v: Vec2[], r: number) {
  const n = v.length;
  let minEdge = Infinity;
  for (let i = 0; i < n; i++) minEdge = Math.min(minEdge, dist(v[i], v[(i + 1) % n]));
  const rr = Math.min(r, minEdge / 2.2);
  const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(v[n - 1], v[0]);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const cur = v[i];
    const next = v[(i + 1) % n];
    path.arcTo(cur[0], cur[1], next[0], next[1], rr);
  }
  path.closePath();
}

function smoothPath(path: Path2D, pts: Vec2[], closed: boolean) {
  if (pts.length === 0) return;
  path.moveTo(pts[0][0], pts[0][1]);
  if (pts.length < 3) {
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      path.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    path.lineTo(last[0], last[1]);
  }
  if (closed) path.closePath();
}

function pointsBounds(pts: Vec2[]): Rect {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

let pointsIds = new WeakMap<Vec2[], number>();
let nextPointsId = 1;
function pointsKey(pts: Vec2[] | undefined) {
  if (!pts) return 0;
  let id = pointsIds.get(pts);
  if (!id) {
    id = nextPointsId++;
    pointsIds.set(pts, id);
  }
  return id;
}

export function buildShape(p: ShapeParams): ShapeGeom {
  const key = `${p.kind}|${p.w.toFixed(2)}|${p.h.toFixed(2)}|${p.radius.toFixed(2)}|${Math.round(p.sides)}|${p.inner.toFixed(2)}|${pointsKey(p.points)}|${p.closed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const path = new Path2D();
  const w = Math.max(0, p.w);
  const h = Math.max(0, p.h);
  let length = 0;
  let bounds: Rect = { x: -w / 2, y: -h / 2, w, h };
  switch (p.kind) {
    case 'rect': {
      const r = Math.max(0, Math.min(p.radius, w / 2, h / 2));
      if (r > 0) {
        // Manual rounded rect: Path2D.roundRect is missing on older WebKit.
        const x = -w / 2;
        const y = -h / 2;
        path.moveTo(x + r, y);
        path.arcTo(x + w, y, x + w, y + h, r);
        path.arcTo(x + w, y + h, x, y + h, r);
        path.arcTo(x, y + h, x, y, r);
        path.arcTo(x, y, x + w, y, r);
        path.closePath();
      } else path.rect(-w / 2, -h / 2, w, h);
      length = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
      break;
    }
    case 'ellipse': {
      // Start at the top so trim paths animate like a clock hand.
      path.ellipse(0, 0, w / 2, h / 2, -Math.PI / 2, 0, Math.PI * 2);
      const a = w / 2;
      const b = h / 2;
      length = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      break;
    }
    case 'polygon':
    case 'star': {
      const v = polyVerts(p);
      if (p.radius > 0) roundedPoly(path, v, p.radius);
      else {
        path.moveTo(v[0][0], v[0][1]);
        for (let i = 1; i < v.length; i++) path.lineTo(v[i][0], v[i][1]);
        path.closePath();
      }
      for (let i = 0; i < v.length; i++) length += dist(v[i], v[(i + 1) % v.length]);
      break;
    }
    case 'path': {
      const pts = p.points ?? [];
      smoothPath(path, pts, !!p.closed);
      for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
      if (p.closed && pts.length > 1) length += dist(pts[pts.length - 1], pts[0]);
      bounds = pointsBounds(pts);
      break;
    }
  }
  const g = { path, length, bounds };
  if (cache.size > 3000) {
    cache.clear();
    pointsIds = new WeakMap();
  }
  cache.set(key, g);
  return g;
}

/** Simplifies a freehand stroke (Ramer–Douglas–Peucker). */
export function simplify(points: Vec2[], tolerance = 1.5): Vec2[] {
  if (points.length < 3) return points;
  const sq = tolerance * tolerance;
  const segDist = (p: Vec2, a: Vec2, b: Vec2) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = 0;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sq) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
