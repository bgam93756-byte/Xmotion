import type { Layer, Project, Vec2 } from '../model/types';
import { num, vec, type EvalContext } from '../model/animate';
import { buildShape, outlinePoints, type Rect } from './shapes';
import { makeEval, transformFx } from './effects';
import { layoutText } from './text';
import { media } from './media';

export function ctxFor(project: Project, layer: Layer): EvalContext {
  return { project, index: project.layers.indexOf(layer) + 1 };
}

export function shapeParams(layer: Layer, t: number, ctx: EvalContext) {
  const [w, h] = vec(layer, 'size', t, ctx);
  return {
    kind: layer.shape ?? 'rect',
    w,
    h,
    radius: num(layer, 'radius', t, ctx),
    sides: num(layer, 'sides', t, ctx),
    inner: num(layer, 'inner', t, ctx),
    points: layer.points,
    closed: layer.closed,
  } as const;
}

/** A shape layer's outline in comp coordinates. */
export function outlineComp(project: Project, layer: Layer, t: number): Vec2[] {
  if (layer.type !== 'shape') return [];
  const m = worldMatrix(project, layer, t);
  return outlinePoints(shapeParams(layer, t, ctxFor(project, layer))).map((p) => apply(m, p));
}

/** Point and tangent angle (radians) at fraction f along a polyline. */
export function alongPath(pts: Vec2[], f: number, wrap: boolean): { p: Vec2; ang: number } {
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = seg[seg.length - 1] || 1;
  const k = wrap ? ((f % 1) + 1) % 1 : Math.min(1, Math.max(0, f));
  const d = k * total;
  let i = 1;
  while (i < seg.length - 1 && seg[i] < d) i++;
  const u = (d - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]);
  const [x0, y0] = pts[i - 1];
  const [x1, y1] = pts[i];
  return { p: [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u], ang: Math.atan2(y1 - y0, x1 - x0) };
}

export function localMatrix(layer: Layer, t: number, ctx: EvalContext): DOMMatrix {
  let [px, py] = vec(layer, 'position', t, ctx);
  const [sx, sy] = vec(layer, 'scale', t, ctx);
  let rot = num(layer, 'rotation', t, ctx);
  const [ax, ay] = vec(layer, 'anchor', t, ctx);
  let fsx = 1;
  let fsy = 1;
  if (layer.effects.length) {
    const fx = transformFx(layer, t, ctx);
    px += fx.dx;
    py += fx.dy;
    rot += fx.rot;
    fsx = fx.sx;
    fsy = fx.sy;
    const mp = layer.effects.find((e) => e.enabled && e.type === 'moveAlongPath');
    const ref = mp?.refs?.path ? ctx.project.layers.find((l) => l.id === mp.refs!.path && l.id !== layer.id) : undefined;
    if (mp && ref) {
      const pts = outlineComp(ctx.project, ref, t);
      if (pts.length > 1) {
        const ev = makeEval(layer, mp, t, ctx);
        const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;
        const { p, ang } = alongPath(pts, ev.n('progress') / 100 + ev.n('speed') * ev.local, closed);
        const inv = parentMatrix(ctx.project, layer, t).inverse();
        [px, py] = apply(inv, p);
        rot += ev.n('rotation') + (ev.o('orient') === 0 ? (ang * 180) / Math.PI : 0);
      }
    }
  }
  const m = new DOMMatrix();
  m.translateSelf(px, py);
  m.rotateSelf(rot);
  m.scaleSelf((sx / 100) * fsx, (sy / 100) * fsy);
  m.translateSelf(-ax, -ay);
  return m;
}

/** Comp-space matrix for a layer, including its parent chain. */
export function worldMatrix(project: Project, layer: Layer, t: number, depth = 0): DOMMatrix {
  const m = localMatrix(layer, t, ctxFor(project, layer));
  if (!layer.parent || depth > 16) return m;
  const parent = project.layers.find((l) => l.id === layer.parent);
  if (!parent) return m;
  return worldMatrix(project, parent, t, depth + 1).multiply(m);
}

export function parentMatrix(project: Project, layer: Layer, t: number): DOMMatrix {
  const parent = layer.parent ? project.layers.find((l) => l.id === layer.parent) : undefined;
  return parent ? worldMatrix(project, parent, t) : new DOMMatrix();
}

/** Content bounds in the layer's local space (before transform). */
export function localBounds(layer: Layer, t: number, ctx: EvalContext): Rect {
  switch (layer.type) {
    case 'shape': {
      const g = buildShape(shapeParams(layer, t, ctx));
      const sw = layer.strokeOn ? num(layer, 'strokeWidth', t, ctx) / 2 : 0;
      const b = g.bounds;
      return { x: b.x - sw, y: b.y - sw, w: b.w + sw * 2, h: b.h + sw * 2 };
    }
    case 'text':
      return layoutText(layer, num(layer, 'fontSize', t, ctx), num(layer, 'tracking', t, ctx), num(layer, 'lineHeight', t, ctx)).bounds;
    case 'image':
    case 'video': {
      const a = media.get(layer.asset);
      const w = a?.meta.width ?? 400;
      const h = a?.meta.height ?? 300;
      return { x: -w / 2, y: -h / 2, w, h };
    }
    case 'adjustment':
      return { x: -ctx.project.width / 2, y: -ctx.project.height / 2, w: ctx.project.width, h: ctx.project.height };
    default:
      return { x: -40, y: -40, w: 80, h: 80 };
  }
}

export function corners(r: Rect): Vec2[] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

export function apply(m: DOMMatrix, [x, y]: Vec2): Vec2 {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function isActive(layer: Layer, t: number) {
  return t >= layer.start && t < layer.end;
}

/** Top-most selectable layer under a comp-space point. */
export function hitTest(project: Project, p: Vec2, t: number): Layer | null {
  for (const layer of project.layers) {
    if (!layer.visible || layer.locked || !isActive(layer, t)) continue;
    if (layer.type === 'audio' || layer.type === 'adjustment') continue;
    const m = worldMatrix(project, layer, t);
    const inv = m.inverse();
    if (Number.isNaN(inv.a)) continue;
    const [lx, ly] = apply(inv, p);
    const b = localBounds(layer, t, ctxFor(project, layer));
    const pad = 6 / Math.max(0.05, Math.hypot(m.a, m.b));
    if (lx >= b.x - pad && lx <= b.x + b.w + pad && ly >= b.y - pad && ly <= b.y + b.h + pad) return layer;
  }
  return null;
}
