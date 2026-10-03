import type { Layer, Project, Vec2 } from '../model/types';
import { num, vec, type EvalContext } from '../model/animate';
import { fbm1, seedFromString } from '../model/noise';
import { buildShape, type Rect } from './shapes';
import { layoutText } from './text';
import { media } from './media';

export function ctxFor(project: Project, layer: Layer): EvalContext {
  return { project, index: project.layers.indexOf(layer) + 1 };
}

/** Camera-shake effect contributes a transform offset rather than pixels. */
function shakeOffset(layer: Layer, t: number, ctx: EvalContext): { dx: number; dy: number; dr: number } {
  let dx = 0;
  let dy = 0;
  let dr = 0;
  for (const e of layer.effects) {
    if (!e.enabled || e.type !== 'shake') continue;
    const path = (k: string) => `fx.${e.id}.${k}`;
    const amount = num(layer, path('amount'), t, ctx);
    const speed = num(layer, path('speed'), t, ctx);
    const rot = num(layer, path('rotation'), t, ctx);
    const s = seedFromString(e.id);
    const x = t * speed;
    dx += fbm1(x, s, 2) * amount;
    dy += fbm1(x, s + 50, 2) * amount;
    dr += fbm1(x, s + 99, 2) * rot;
  }
  return { dx, dy, dr };
}

export function localMatrix(layer: Layer, t: number, ctx: EvalContext): DOMMatrix {
  const [px, py] = vec(layer, 'position', t, ctx);
  const [sx, sy] = vec(layer, 'scale', t, ctx);
  const rot = num(layer, 'rotation', t, ctx);
  const [ax, ay] = vec(layer, 'anchor', t, ctx);
  const sh = layer.effects.length ? shakeOffset(layer, t, ctx) : null;
  const m = new DOMMatrix();
  m.translateSelf(px + (sh?.dx ?? 0), py + (sh?.dy ?? 0));
  m.rotateSelf(rot + (sh?.dr ?? 0));
  m.scaleSelf(sx / 100, sy / 100);
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
      const [w, h] = vec(layer, 'size', t, ctx);
      const g = buildShape({
        kind: layer.shape ?? 'rect',
        w,
        h,
        radius: num(layer, 'radius', t, ctx),
        sides: num(layer, 'sides', t, ctx),
        inner: num(layer, 'inner', t, ctx),
        points: layer.points,
        closed: layer.closed,
      });
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
