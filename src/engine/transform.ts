import type { Layer, Project, Vec2 } from '../model/types';
import { num, vec, type EvalContext } from '../model/animate';
import { allLayers, ancestors, findLayer } from '../model/tree';
import { buildShape, outlinePoints, type Rect } from './shapes';
import { layerTimeFx, makeEval, transformFx } from './effects';
import { layoutText } from './text';
import { media } from './media';
import { activeCamera, rayHit, type Camera } from './camera';

export function ctxFor(project: Project, layer: Layer): EvalContext {
  const f = findLayer(project, layer.id);
  return { project, index: (f?.index ?? 0) + 1 };
}

/* ---------------- per-frame memo ---------------- */

// World matrices and clocks are pure functions of the (immutable) tree, the
// layer and the comp time. While a frame renders nothing changes, so they are
// cached for its duration; deep group nesting would otherwise recompute every
// ancestor chain for every layer.
let memoDepth = 0;
const worldMemo = new Map<Layer, Map<number, DOMMatrix>>();
const timesMemo = new Map<Layer, Map<number, Times>>();

function memoSet<T>(memo: Map<Layer, Map<number, T>>, layer: Layer, t: number, v: T) {
  let m = memo.get(layer);
  if (!m) memo.set(layer, (m = new Map()));
  m.set(t, v);
}

/** Runs fn with world matrices and clocks cached (for one rendered frame). */
export function withMemo<T>(fn: () => T): T {
  memoDepth++;
  try {
    return fn();
  } finally {
    if (--memoDepth === 0) {
      worldMemo.clear();
      timesMemo.clear();
    }
  }
}

/* ---------------- time ---------------- */

/**
 * The time a layer runs on, given the time of its container:
 * time remapping first, then effects such as Time Quantization.
 */
export function layerTime(layer: Layer, t: number, ec: EvalContext): number {
  let lt = t;
  if (layer.timeRemapOn) lt = layer.start + num(layer, 'timeRemap', t, ec);
  return layer.effects.length ? layerTimeFx(layer, lt, ec) : lt;
}

/** The clock of the container holding a layer (comp time at the root, group time inside groups). */
export function containerTime(project: Project, layer: Layer, compT: number): number {
  const group = findLayer(project, layer.id)?.group;
  return group ? timesOf(project, group, compT).lt : compT;
}

export interface Times {
  ec: EvalContext;
  /** The container's clock. */
  ct: number;
  /** The layer's own clock (time remapping and time effects applied). */
  lt: number;
}

/** Container time and the layer's own time at a comp time. */
export function timesOf(project: Project, layer: Layer, compT: number): Times {
  const cached = memoDepth ? timesMemo.get(layer)?.get(compT) : undefined;
  if (cached) return cached;
  const ec = ctxFor(project, layer);
  const ct = containerTime(project, layer, compT);
  const times = { ec, ct, lt: layerTime(layer, ct, ec) };
  if (memoDepth) memoSet(timesMemo, layer, compT, times);
  return times;
}

/** Mask layers hide what's below them and are never drawn or picked themselves. */
export const isMaskLayer = (l: Layer) => !!l.maskMode && l.maskMode !== 'none';

export function isActive(layer: Layer, t: number) {
  return t >= layer.start && t < layer.end;
}

/* ---------------- geometry ---------------- */

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
export function outlineComp(project: Project, layer: Layer, compT: number): Vec2[] {
  if (layer.type !== 'shape') return [];
  const m = worldMatrix(project, layer, compT);
  const { ec, lt } = timesOf(project, layer, compT);
  return outlinePoints(shapeParams(layer, lt, ec)).map((p) => apply(m, p));
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

/** Layers whose Move Along Path is being evaluated (cycle guard). */
const pathBusy = new Set<string>();

/**
 * Local transform at the layer's own time `lt`. 3D layers (and cameras) get a
 * full 3D matrix with Z position and X/Y rotation; 2D layers stay flat.
 * Without `withFx` only the layer's own properties count (no transform effects).
 */
export function localMatrix(layer: Layer, lt: number, ctx: EvalContext, project?: Project, compT?: number, withFx = true): DOMMatrix {
  let [px, py] = vec(layer, 'position', lt, ctx);
  const [sx, sy] = layer.type === 'camera' ? [100, 100] : vec(layer, 'scale', lt, ctx);
  let rot = num(layer, 'rotation', lt, ctx);
  const [ax, ay] = layer.type === 'camera' ? [0, 0] : vec(layer, 'anchor', lt, ctx);
  const is3D = (layer.threeD && layer.type !== 'group') || layer.type === 'camera';
  let fsx = 1;
  let fsy = 1;
  // Cameras take no effects (a stray Spin would roll the view).
  if (withFx && layer.effects.length && layer.type !== 'camera') {
    const fx = transformFx(layer, lt, ctx);
    px += fx.dx;
    py += fx.dy;
    rot += fx.rot;
    fsx = fx.sx;
    fsy = fx.sy;
    const mp = layer.effects.find((e) => e.enabled && e.type === 'moveAlongPath');
    const ref = mp?.refs?.path && project ? findLayer(project, mp.refs.path)?.layer : undefined;
    // A path that depends on this layer (a child, or parented to it) would recurse forever.
    if (mp && ref && ref.id !== layer.id && project && compT !== undefined && !pathBusy.has(layer.id)) {
      pathBusy.add(layer.id);
      try {
        const pts = outlineComp(project, ref, compT);
        if (pts.length > 1) {
          const ev = makeEval(layer, mp, lt, ctx);
          const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;
          const { p, ang } = alongPath(pts, ev.n('progress') / 100 + ev.n('speed') * ev.local, closed);
          const inv = parentMatrix(project, layer, compT).inverse();
          [px, py] = apply(inv, p);
          rot += ev.n('rotation') + (ev.o('orient') === 0 ? (ang * 180) / Math.PI : 0);
        }
      } finally {
        pathBusy.delete(layer.id);
      }
    }
  }
  const m = new DOMMatrix();
  if (is3D) {
    m.translateSelf(px, py, num(layer, 'z', lt, ctx));
    m.rotateSelf(0, 0, rot);
    m.rotateSelf(0, num(layer, 'rotY', lt, ctx), 0);
    m.rotateSelf(num(layer, 'rotX', lt, ctx), 0, 0);
  } else {
    m.translateSelf(px, py);
    m.rotateSelf(rot);
  }
  const skew = layer.type === 'camera' ? 0 : num(layer, 'skew', lt, ctx);
  if (skew) {
    const axis = num(layer, 'skewAxis', lt, ctx);
    m.rotateSelf(axis);
    m.skewXSelf(Math.max(-85, Math.min(85, skew)));
    m.rotateSelf(-axis);
  }
  m.scaleSelf((sx / 100) * fsx, (sy / 100) * fsy);
  m.translateSelf(-ax, -ay);
  return m;
}

/**
 * Local → comp matrix at comp time `compT`, including parents and enclosing
 * groups. 2D renderers use its 2D part (a–f); 3D layers use the full matrix.
 */
export function worldMatrix(project: Project, layer: Layer, compT: number, depth = 0): DOMMatrix {
  const cached = memoDepth ? worldMemo.get(layer)?.get(compT) : undefined;
  if (cached) return cached;
  const { ec, lt } = timesOf(project, layer, compT);
  const local = localMatrix(layer, lt, ec, project, compT);
  if (depth > 24) return local;
  const m = parentMatrix(project, layer, compT, depth).multiply(local);
  if (memoDepth) memoSet(worldMemo, layer, compT, m);
  return m;
}

/** The space a layer's position lives in: its parent layer, else its group, else the comp. */
export function parentMatrix(project: Project, layer: Layer, compT: number, depth = 0): DOMMatrix {
  const found = findLayer(project, layer.id);
  if (layer.parent) {
    const parent = found?.list.find((l) => l.id === layer.parent);
    if (parent && parent.id !== layer.id) return worldMatrix(project, parent, compT, depth + 1);
  }
  if (found?.group) return worldMatrix(project, found.group, compT, depth + 1);
  return new DOMMatrix();
}

/** Content bounds in the layer's local space (before transform), at the layer's own time. */
export function localBounds(layer: Layer, lt: number, ctx: EvalContext, compT?: number): Rect {
  switch (layer.type) {
    case 'shape': {
      const g = buildShape(shapeParams(layer, lt, ctx));
      const sw = layer.strokeOn ? num(layer, 'strokeWidth', lt, ctx) / 2 : 0;
      const b = g.bounds;
      return { x: b.x - sw, y: b.y - sw, w: b.w + sw * 2, h: b.h + sw * 2 };
    }
    case 'text':
      return layoutText(layer, num(layer, 'fontSize', lt, ctx), num(layer, 'tracking', lt, ctx), num(layer, 'lineHeight', lt, ctx)).bounds;
    case 'image':
    case 'video': {
      const a = media.get(layer.asset);
      const w = a?.meta.width ?? 400;
      const h = a?.meta.height ?? 300;
      return { x: -w / 2, y: -h / 2, w, h };
    }
    case 'adjustment':
      return { x: -ctx.project.width / 2, y: -ctx.project.height / 2, w: ctx.project.width, h: ctx.project.height };
    case 'group':
      return groupBounds(ctx.project, layer, compT ?? lt);
    default:
      return { x: -40, y: -40, w: 80, h: 80 };
  }
}

/** Union of a group's (active, visible) children, in the group's local space. */
function groupBounds(project: Project, group: Layer, compT: number): Rect {
  const kids = group.children ?? [];
  // Nothing to show yet: a small box around the group's pivot.
  const empty = (): Rect => {
    const { ec, lt } = timesOf(project, group, compT);
    const [ax, ay] = vec(group, 'anchor', lt, ec);
    return { x: ax - 40, y: ay - 40, w: 80, h: 80 };
  };
  if (!kids.length) return empty();
  const inv = worldMatrix(project, group, compT).inverse();
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const c of kids) {
    if (!c.visible || c.type === 'audio' || c.type === 'camera' || isMaskLayer(c)) continue;
    const { ec, ct, lt } = timesOf(project, c, compT);
    if (!isActive(c, ct)) continue;
    const rel = inv.multiply(worldMatrix(project, c, compT));
    for (const p of corners(localBounds(c, lt, ec, compT))) {
      const [x, y] = apply(rel, p);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) return empty();
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

/* ---------------- hit testing ---------------- */

const notSelectable = (l: Layer) => l.type === 'audio' || l.type === 'adjustment' || l.type === 'camera';
const is3D = (l: Layer) => !!l.threeD && l.type !== 'group' && l.type !== 'camera';
/** Layers that draw nothing (and so don't break the renderer's depth-sorted runs of 3D layers). */
const drawsNothing = (l: Layer) => l.type === 'audio' || l.type === 'null' || l.type === 'camera';

/** Whether a 2D layer's bounds contain a comp point. */
function hit2D(project: Project, layer: Layer, p: Vec2, compT: number): boolean {
  const { ec, lt } = timesOf(project, layer, compT);
  const b = localBounds(layer, lt, ec, compT);
  const w = worldMatrix(project, layer, compT);
  // 2D layers (even under a 3D parent) are drawn with the 2D part of their matrix.
  const m = w.is2D ? w : new DOMMatrix([w.a, w.b, w.c, w.d, w.e, w.f]);
  const inv = m.inverse();
  if (Number.isNaN(inv.a)) return false;
  const [lx, ly] = apply(inv, p);
  const pad = 6 / Math.max(0.05, Math.hypot(m.a, m.b));
  return lx >= b.x - pad && lx <= b.x + b.w + pad && ly >= b.y - pad && ly <= b.y + b.h + pad;
}

/** Camera depth where a comp point hits a 3D layer's bounds, or null. */
function hit3D(project: Project, layer: Layer, p: Vec2, compT: number, cam: Camera): number | null {
  const hit = rayHit(project, layer, p, compT, cam);
  if (!hit) return null;
  const { ec, lt } = timesOf(project, layer, compT);
  const b = localBounds(layer, lt, ec, compT);
  const pad = 6;
  const inside = hit.u >= b.x - pad && hit.u <= b.x + b.w + pad && hit.v >= b.y - pad && hit.v <= b.y + b.h + pad;
  return inside ? hit.depth : null;
}

/**
 * Top-most selectable layer under a comp-space point. Groups are picked as a
 * whole unless they are "open" (the selection is the group or inside it), in
 * which case their children can be picked directly. Adjacent 3D layers are
 * drawn sorted by depth, so among them the one nearest the camera wins.
 */
export function hitTest(project: Project, p: Vec2, compT: number, selectedId?: string | null): Layer | null {
  const open = new Set<string>();
  if (selectedId) {
    const sel = findLayer(project, selectedId)?.layer;
    if (sel?.type === 'group') open.add(sel.id);
    for (const g of ancestors(project, selectedId)) open.add(g.id);
  }
  let cam: Camera | null = null;
  const camera = () => (cam ??= activeCamera(project, compT));
  const shown = (l: Layer, t: number) => l.visible && !isMaskLayer(l) && isActive(l, t);
  const search = (list: Layer[], t: number): Layer | null => {
    for (let i = 0; i < list.length; i++) {
      const layer = list[i];
      if (!shown(layer, t)) continue;
      if (is3D(layer) && !layer.clip) {
        // The run of 3D layers the renderer depth-sorts together.
        let best: { layer: Layer; depth: number } | null = null;
        let j = i;
        for (; j < list.length; j++) {
          const l = list[j];
          if (drawsNothing(l) || !shown(l, t)) continue;
          if (!is3D(l) || l.clip) break;
          if (l.locked || notSelectable(l)) continue;
          const d = hit3D(project, l, p, compT, camera());
          if (d !== null && (!best || d < best.depth)) best = { layer: l, depth: d };
        }
        if (best) return best.layer;
        i = j - 1;
        continue;
      }
      if (layer.locked) continue;
      if (layer.type === 'group') {
        const inner = search(layer.children ?? [], layerTime(layer, t, ctxFor(project, layer)));
        if (inner) return open.has(layer.id) ? inner : layer;
        continue;
      }
      if (notSelectable(layer)) continue;
      if (is3D(layer) ? hit3D(project, layer, p, compT, camera()) !== null : hit2D(project, layer, p, compT)) return layer;
    }
    return null;
  };
  return search(project.layers, compT);
}

/** All layers whose content intersects a comp-space point (used for snapping exclusions etc.). */
export function selectableLayers(project: Project): Layer[] {
  return allLayers(project).filter((l) => !notSelectable(l));
}

/* ---------------- clocks for editing, media and audio ---------------- */

/**
 * Whether a layer shows at comp time `compT`: visible and inside its time
 * window, and so is every group around it.
 */
export function activeAt(project: Project, layer: Layer, compT: number): boolean {
  let t = compT;
  for (const g of ancestors(project, layer.id)) {
    if (!g.visible || !isActive(g, t)) return false;
    t = layerTime(g, t, ctxFor(project, g));
  }
  return layer.visible && isActive(layer, t);
}

/**
 * Time on the clock a property's keyframes live on (relative keys add
 * layer.start): the container clock, then time remapping. Time remap keys
 * themselves live on the container clock.
 */
export function propClock(project: Project, layer: Layer, path: string, compT: number): number {
  const ct = containerTime(project, layer, compT);
  if (path === 'timeRemap' || !layer.timeRemapOn) return ct;
  return layer.start + num(layer, 'timeRemap', ct, ctxFor(project, layer));
}

/** True when the layer or a group around it is time remapped (its media can't simply play). */
export function isRetimed(project: Project, layer: Layer): boolean {
  return !!layer.timeRemapOn || ancestors(project, layer.id).some((g) => g.timeRemapOn);
}

/** Comp time → time on the layer's own clock, for media source time (remap included). */
export function mediaClock(project: Project, layer: Layer, compT: number): number {
  return timesOf(project, layer, compT).lt;
}
