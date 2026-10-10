import { useEffect, useRef, useState } from 'react';
import type { Layer, Project, Vec2 } from '../model/types';
import { evalPropAt, keyedValue, vec } from '../model/animate';
import { getProp } from '../model/schema';
import { allLayers, findLayer, isInside } from '../model/tree';
import { flat, is3DLayer, isMask, Renderer } from '../engine/renderer';
import { transformFx } from '../engine/effects';
import { media } from '../engine/media';
import { onFontsChanged } from '../engine/fonts';
import { simplify, type Rect } from '../engine/shapes';
import { activeAt, apply, corners, hitTest, localBounds, parentMatrix, propClock, timesOf, worldMatrix, withMemo } from '../engine/transform';
import { activeCamera, homography, projectLocal, projectPoint, rayToLayer, screenDeltaToWorld, type Camera } from '../engine/camera';
import {
  endMerge,
  layerById,
  openSheet,
  select,
  selectedIds,
  setAnchor,
  setPropValue,
  toggleSelect,
  update,
  useEditor,
  writeValue,
  type EditorState,
  type ViewSettings,
} from '../state/store';
import { addDrawing } from './actions';
import { haptic, isTouch } from '../platform';
import { Icon } from './icons';
import { ViewMenu } from './ViewMenu';
import { boxOf, moveBox, snapBox, snapTargets, snapValue, unionBox, type Box, type SnapTargets } from './snap';
import './viewport.css';

/** One layer being moved, and how a comp-space drag maps into its parent's space. */
interface MoveItem {
  id: string;
  v0: Vec2;
  /** Inverse of the parent space: its 2D part for 2D layers, the full matrix for 3D layers. */
  inv: DOMMatrix;
  /** 3D layers move on the plane facing the camera through their anchor (world point `at`). */
  z0?: number;
  at?: [number, number, number];
}

type Drag =
  | { kind: 'move'; hit: string; items: MoveItem[]; p0: Vec2; s0: Vec2; gid: number; moved: boolean; cam: Camera | null; box: Box | null; targets: SnapTargets | null; snapped: [boolean, boolean] }
  | { kind: 'scale'; layer: string; s0: Vec2; h0: Vec2; base: DOMMatrix; gid: number }
  | { kind: 'rotate'; layer: string; r0: number; a0: number; center: Vec2; gid: number }
  | { kind: 'anchor'; layer: string; off: Vec2; snap: number }
  | { kind: 'guide'; axis: 'v' | 'h'; index: number; value: number; pt: Vec2; gid: number }
  | { kind: 'pan'; s0: Vec2; pan0: Vec2 }
  | { kind: 'pen'; points: Vec2[] }
  | { kind: 'pinch'; d0: number; mid0: Vec2; zoom0: number; pan0: Vec2 }
  /** Two fingers on the selected layer: move, scale and rotate it together. */
  | { kind: 'twist'; layer: string; gid: number; d0: number; mid0: Vec2; lastA: number; rot: number; s0: Vec2; r0: number; flip: number; item: MoveItem; cam: Camera | null };

let gestureId = 0;
const HANDLE = isTouch ? 22 : 10;
/** Snap distances in screen pixels. */
const SNAP_PX = 8;
const ANCHOR_SNAP_PX = isTouch ? 14 : 10;
const GUIDE_PX = isTouch ? 12 : 8;
/** Pointer travel before a press on a layer starts moving it (keeps taps from nudging). */
const MOVE_SLOP = isTouch ? 4 : 2;
const ACCENT = '#7c5cff';
const ANCHOR = '#ffc94d';
const GUIDE = '#35c8ff';
const SNAP = '#ff5c8a';

const round1 = (v: number) => Math.round(v * 10) / 10;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Layers whose transform can be edited in the viewport. */
const canEdit = (l: Layer) => !l.locked && l.type !== 'audio' && l.type !== 'camera';

/* ---------------- geometry (comp space) ---------------- */

/** Resolves the active camera at most once per frame or gesture. */
function lazyCamera(p: Project, t: number): () => Camera {
  let cam: Camera | null = null;
  return () => (cam ??= activeCamera(p, t));
}

function boundsOf(p: Project, l: Layer, t: number): Rect {
  const { ec, lt } = timesOf(p, l, t);
  return localBounds(l, lt, ec, t);
}

function anchorOf(p: Project, l: Layer, t: number): Vec2 {
  const { ec, lt } = timesOf(p, l, t);
  return vec(l, 'anchor', lt, ec);
}

/**
 * Local points → comp space: projected through the camera for 3D layers, else
 * with the 2D part of the world matrix. Null when a point is behind the camera.
 */
function toCompSpace(p: Project, l: Layer, t: number, pts: Vec2[], cam: () => Camera): Vec2[] | null {
  const w = worldMatrix(p, l, t);
  if (is3DLayer(l)) {
    const H = homography(cam(), w);
    const out = pts.map(([u, v]) => projectLocal(H, u, v));
    return out.every(Boolean) ? (out as Vec2[]) : null;
  }
  const m = flat(w);
  return pts.map((q) => apply(m, q));
}

/** A layer's content corners in comp space. */
function compCorners(p: Project, l: Layer, t: number, cam: () => Camera): Vec2[] | null {
  return toCompSpace(p, l, t, corners(boundsOf(p, l, t)), cam);
}

/** Corners, edge centers and center of a rect (anchor snap points). */
function ninePoints(b: Rect): Vec2[] {
  const xs = [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = [b.y, b.y + b.h / 2, b.y + b.h];
  return ys.flatMap((y) => xs.map((x): Vec2 => [x, y]));
}

function insidePoly(pts: Vec2[], [x, y]: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when a moving layer is up the layer's parent chain (so it moves along). */
function follows(p: Project, l: Layer, moving: Set<string>): boolean {
  let cur = l.parent;
  for (let n = 0; cur && n < 64; n++) {
    if (moving.has(cur)) return true;
    cur = layerById(p, cur)?.parent;
  }
  return false;
}

/**
 * The layer the select tool grabs at a comp point: a selected mask (masks
 * aren't hit-tested) or a selected group keeps the pointer, so it can be
 * dragged as a whole; otherwise the top-most layer, groups picked whole.
 */
function pick(p: Project, c: Vec2, t: number, selectedId: string | null): Layer | null {
  const sel = layerById(p, selectedId);
  if (sel && isMask(sel) && canEdit(sel) && activeAt(p, sel, t)) {
    const cs = compCorners(p, sel, t, lazyCamera(p, t));
    if (cs && insidePoly(cs, c)) return sel;
  }
  const hit = hitTest(p, c, t, selectedId);
  if (hit && sel?.type === 'group' && hit.id !== sel.id && isInside(p, hit.id, sel.id)) return sel;
  return hit;
}

/** Boxes of other visible layers to snap to: top-level layers and the moving layers' siblings. */
function snapBoxes(p: Project, t: number, moving: Set<string>, cam: () => Camera): Box[] {
  const pool = new Set<Layer>(p.layers);
  for (const id of moving) {
    const f = findLayer(p, id);
    if (f?.group) f.list.forEach((l) => pool.add(l));
  }
  const out: Box[] = [];
  for (const l of pool) {
    if (moving.has(l.id) || l.type === 'audio' || l.type === 'adjustment' || l.type === 'camera' || l.type === 'null' || isMask(l)) continue;
    if (!activeAt(p, l, t) || follows(p, l, moving) || [...moving].some((id) => isInside(p, id, l.id))) continue;
    const b = boxOf(compCorners(p, l, t, cam) ?? []);
    if (b) out.push(b);
  }
  return out;
}

/** How a comp-space drag maps onto a layer's position (and Z for 3D layers). */
function moveItem(p: Project, l: Layer, t: number): MoveItem {
  const { ec, lt } = timesOf(p, l, t);
  const v0 = evalPropAt(l, 'position', propClock(p, l, 'position', t), ec) as Vec2;
  const pm = parentMatrix(p, l, t);
  if (!is3DLayer(l)) return { id: l.id, v0, inv: flat(pm).inverse() };
  const [ax, ay] = vec(l, 'anchor', lt, ec);
  const w = worldMatrix(p, l, t).transformPoint(new DOMPoint(ax, ay, 0));
  const z0 = evalPropAt(l, 'z', propClock(p, l, 'z', t), ec) as number;
  return { id: l.id, v0, inv: pm.inverse(), z0, at: [w.x, w.y, w.z] };
}

/** Writes a layer's position for a comp-space drag (dx, dy) from where `it` started. */
function writeMove(dp: Project, l: Layer, it: MoveItem, cam: Camera | null, dx: number, dy: number, t: number) {
  if (it.at && cam) {
    // 3D: drag on the plane facing the camera, then into the parent's space.
    const w = screenDeltaToWorld(cam, it.at, dx, dy);
    const a = it.inv.transformPoint(new DOMPoint(it.at[0], it.at[1], it.at[2]));
    const b = it.inv.transformPoint(new DOMPoint(it.at[0] + w[0], it.at[1] + w[1], it.at[2] + w[2]));
    writeValue(dp, l, 'position', [round1(it.v0[0] + b.x - a.x), round1(it.v0[1] + b.y - a.y)], t);
    writeValue(dp, l, 'z', round1((it.z0 ?? 0) + b.z - a.z), t);
  } else {
    const nx = it.v0[0] + it.inv.a * dx + it.inv.c * dy;
    const ny = it.v0[1] + it.inv.b * dx + it.inv.d * dy;
    writeValue(dp, l, 'position', [round1(nx), round1(ny)], t);
  }
}

/** Starts moving layers (several when dragging a multi-selection). */
function startMove(p: Project, t: number, ids: string[], hit: string, pt: Vec2, c: Vec2, gid: number): Drag | null {
  const moving = new Set(ids);
  const cam = lazyCamera(p, t);
  const items: MoveItem[] = [];
  let box: Box | null = null;
  let has3D = false;
  for (const id of ids) {
    const l = layerById(p, id);
    if (!l || !canEdit(l)) continue;
    // Layers inside a moving group, or parented to a moving layer, already move with it.
    if (ids.some((o) => o !== id && isInside(p, id, o)) || follows(p, l, moving)) continue;
    const it = moveItem(p, l, t);
    items.push(it);
    if (it.at) has3D = true;
    else box = unionBox(box, boxOf(compCorners(p, l, t, cam) ?? []));
  }
  if (!items.length) return null;
  // Box snapping is for 2D moves; 3D layers move in perspective.
  const vs = useEditor.getState().view;
  const targets =
    !has3D && box && vs.snap
      ? snapTargets({ width: p.width, height: p.height, guides: vs.guides ? p.guides : null, grid: vs.grid ? vs.gridSize : null, boxes: snapBoxes(p, t, moving, cam) })
      : null;
  return { kind: 'move', hit, items, p0: c, s0: pt, gid, moved: false, cam: has3D ? cam() : null, box: has3D ? null : box, targets, snapped: [false, false] };
}

export function Viewport() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef(new Renderer());
  const view = useRef({ zoom: 0.3, pan: [0, 0] as Vec2, fit: true });
  const [zoomLabel, setZoomLabel] = useState(30);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  /** Magenta lines shown while a move is snapped (comp px). */
  const snapLines = useRef<{ x: number[]; y: number[] } | null>(null);
  /** Press of the current single-pointer gesture, and the last tap (double-tap detection). */
  const down = useRef<{ pt: Vec2; at: number } | null>(null);
  const lastTap = useRef<{ pt: Vec2; at: number } | null>(null);
  const raf = useRef(0);
  const fullDraw = useRef(true);
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);

  /** Redraws on the next frame; overlay-only skips rendering the comp. */
  const schedule = (overlayOnly = false) => {
    if (!overlayOnly) fullDraw.current = true;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const full = fullDraw.current;
      fullDraw.current = false;
      // The comp and its overlay share cached matrices for this frame.
      withMemo(() => draw(full));
    });
  };

  const fitView = () => {
    const wrap = wrapRef.current;
    const p = useEditor.getState().project;
    if (!wrap || !p) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const m = isTouch ? 12 : 32;
    const zoom = Math.max(0.01, Math.min((W - m * 2) / p.width, (H - m * 2) / p.height));
    view.current = { zoom, pan: [(W - p.width * zoom) / 2, (H - p.height * zoom) / 2], fit: true };
    setZoomLabel(Math.round(zoom * 100));
    schedule();
  };

  const setZoom = (zoom: number, around?: Vec2) => {
    const wrap = wrapRef.current!;
    const v = view.current;
    const c: Vec2 = around ?? [wrap.clientWidth / 2, wrap.clientHeight / 2];
    const z = Math.min(16, Math.max(0.02, zoom));
    const k = z / v.zoom;
    view.current = { zoom: z, pan: [c[0] - (c[0] - v.pan[0]) * k, c[1] - (c[1] - v.pan[1]) * k], fit: false };
    setZoomLabel(Math.round(z * 100));
    schedule();
  };

  const toComp = ([x, y]: Vec2): Vec2 => {
    const v = view.current;
    return [(x - v.pan[0]) / v.zoom, (y - v.pan[1]) / v.zoom];
  };
  const toScreen = ([x, y]: Vec2): Vec2 => {
    const v = view.current;
    return [x * v.zoom + v.pan[0], y * v.zoom + v.pan[1]];
  };

  function draw(full: boolean) {
    const s = useEditor.getState();
    const p = s.project;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!p || !canvas || !wrap) return;
    if (full) {
      const dpr = window.devicePixelRatio || 1;
      const v = view.current;
      const q = s.previewQuality;
      const shown = p.width * v.zoom * dpr;
      let scale = q === 'full' ? 1 : q === 'half' ? 0.5 : q === 'quarter' ? 0.25 : Math.min(1, shown / p.width);
      // Keep playback smooth on phones: cap the preview at ~1.5M pixels while playing.
      if (s.playing && q === 'auto') scale = Math.min(scale, Math.sqrt(1.5e6 / (p.width * p.height)));
      scale = Math.max(0.05, scale);
      media.syncVideos(p, s.time, s.playing);
      renderer.current.render(p, s.time, canvas, { scale, motionBlur: !s.playing });
      canvas.style.width = `${p.width * v.zoom}px`;
      canvas.style.height = `${p.height * v.zoom}px`;
      canvas.style.transform = `translate(${v.pan[0]}px, ${v.pan[1]}px)`;
    }
    drawOverlay(s, p);
  }

  function drawOverlay(s: EditorState, p: Project) {
    const o = overlayRef.current;
    const wrap = wrapRef.current;
    if (!o || !wrap) return;
    const t = s.time;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (o.width !== Math.round(W * dpr) || o.height !== Math.round(H * dpr)) {
      o.width = Math.round(W * dpr);
      o.height = Math.round(H * dpr);
      o.style.width = `${W}px`;
      o.style.height = `${H}px`;
    }
    const ctx = o.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const [x0, y0] = toScreen([0, 0]);
    const [x1, y1] = toScreen([p.width, p.height]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
    const cam = lazyCamera(p, t);

    drawAids(ctx, p, s.view, W, H);

    // Null layers are invisible in the render; show them as handles.
    for (const l of allLayers(p)) {
      if (l.type !== 'null' || !activeAt(p, l, t)) continue;
      const c = toCompSpace(p, l, t, [[0, 0]], cam);
      if (!c) continue;
      const [sx, sy] = toScreen(c[0]);
      ctx.strokeStyle = 'rgba(160,170,190,0.8)';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx - 14, sy - 14, 28, 28);
      ctx.setLineDash([]);
    }

    const sl = snapLines.current;
    if (sl) {
      ctx.strokeStyle = SNAP;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of sl.x) {
        const sx = toScreen([x, 0])[0];
        ctx.moveTo(sx, y0);
        ctx.lineTo(sx, y1);
      }
      for (const y of sl.y) {
        const sy = toScreen([0, y])[1];
        ctx.moveTo(x0, sy);
        ctx.lineTo(x1, sy);
      }
      ctx.stroke();
    }

    const d = drag.current;
    if (d?.kind === 'pen' && d.points.length > 1) {
      const b = s.brush;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * view.current.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      d.points.forEach((pt, i) => {
        const [sx, sy] = toScreen(pt);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      ctx.stroke();
    }

    drawSelection(ctx, s, p, cam);
  }

  /** Grid, rule of thirds, safe areas and guides. */
  function drawAids(ctx: CanvasRenderingContext2D, p: Project, vs: ViewSettings, W: number, H: number) {
    const [x0, y0] = toScreen([0, 0]);
    const [x1, y1] = toScreen([p.width, p.height]);
    const vline = (x: number, a: number, b: number) => {
      const sx = Math.round(x) + 0.5;
      ctx.moveTo(sx, a);
      ctx.lineTo(sx, b);
    };
    const hline = (y: number, a: number, b: number) => {
      const sy = Math.round(y) + 0.5;
      ctx.moveTo(a, sy);
      ctx.lineTo(b, sy);
    };
    // Light lines with a dark halo so they read on any content.
    const contrast = (color: string) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    ctx.save();
    if (vs.grid && vs.gridSize > 0) {
      let step = vs.gridSize;
      while (step * view.current.zoom < 6) step *= 2;
      ctx.beginPath();
      for (let x = step; x < p.width - 1e-6; x += step) vline(toScreen([x, 0])[0], y0, y1);
      for (let y = step; y < p.height - 1e-6; y += step) hline(toScreen([0, y])[1], x0, x1);
      ctx.strokeStyle = 'rgba(170,176,196,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (vs.thirds) {
      ctx.beginPath();
      for (const k of [1 / 3, 2 / 3]) {
        vline(x0 + (x1 - x0) * k, y0, y1);
        hline(y0 + (y1 - y0) * k, x0, x1);
      }
      contrast('rgba(255,255,255,0.55)');
    }
    if (vs.safe) {
      // Action safe (90%) and title safe (80%).
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (const k of [0.9, 0.8]) {
        const mx = ((1 - k) / 2) * (x1 - x0);
        const my = ((1 - k) / 2) * (y1 - y0);
        ctx.rect(Math.round(x0 + mx) + 0.5, Math.round(y0 + my) + 0.5, Math.round((x1 - x0) * k), Math.round((y1 - y0) * k));
      }
      contrast('rgba(255,255,255,0.5)');
      ctx.setLineDash([]);
    }
    const g = p.guides;
    if (vs.guides && g) {
      const d = drag.current;
      const dragging = (axis: 'v' | 'h', i: number) => d?.kind === 'guide' && d.axis === axis && d.index === i;
      const off = (axis: 'v' | 'h', v: number) => v < 0 || v > (axis === 'v' ? p.width : p.height);
      ctx.lineWidth = 1;
      const line = (axis: 'v' | 'h', v: number, i: number) => {
        const gone = dragging(axis, i) && off(axis, v);
        ctx.strokeStyle = gone ? 'rgba(255,92,108,0.9)' : GUIDE;
        ctx.setLineDash(gone ? [6, 4] : []);
        ctx.beginPath();
        if (axis === 'v') vline(toScreen([v, 0])[0], 0, H);
        else hline(toScreen([0, v])[1], 0, W);
        ctx.stroke();
      };
      g.v.forEach((x, i) => line('v', x, i));
      g.h.forEach((y, i) => line('h', y, i));
      ctx.setLineDash([]);
      if (d?.kind === 'guide') label(ctx, off(d.axis, d.value) ? 'Remove' : `${d.axis === 'v' ? 'x' : 'y'} ${d.value}`, d.pt[0] + 14, d.pt[1] - 18);
    }
    ctx.restore();
  }

  function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.save();
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(20,21,27,0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y - 10, w, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y);
    ctx.restore();
  }

  function outline(ctx: CanvasRenderingContext2D, cs: Vec2[] | null, color: string, dashed = false) {
    if (!cs) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    cs.map(toScreen).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function crosshair(ctx: CanvasRenderingContext2D, [x, y]: Vec2, big = false) {
    const r = big ? 8 : 5;
    const arm = big ? 16 : 9;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    if (big) {
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.strokeStyle = ANCHOR;
    ctx.lineWidth = big ? 2 : 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawSelection(ctx: CanvasRenderingContext2D, s: EditorState, p: Project, cam: () => Camera) {
    const t = s.time;
    const primary = layerById(p, s.selectedId);
    const ids = s.selection.length ? s.selection : primary ? [primary.id] : [];
    const multi = ids.length > 1;
    // The group the selection lives in, as a faint frame.
    const group = primary && findLayer(p, primary.id)?.group;
    if (group && activeAt(p, group, t)) outline(ctx, compCorners(p, group, t, cam), 'rgba(124,92,255,0.65)', true);
    for (const id of ids) {
      const l = layerById(p, id);
      if (!l || l.type === 'audio' || l.type === 'camera' || l.type === 'adjustment' || !activeAt(p, l, t)) continue;
      outline(ctx, compCorners(p, l, t, cam), ACCENT, isMask(l));
    }
    if (!primary || primary.type === 'audio' || primary.type === 'camera' || !activeAt(p, primary, t)) return;
    drawMotionPath(ctx, p, primary, t, cam);
    if (s.tool === 'anchor') return drawAnchorTool(ctx, p, primary, t, cam);
    if (primary.type === 'adjustment' || multi || primary.locked) return;
    const cs = compCorners(p, primary, t, cam);
    if (!cs) return;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    if (!is3DLayer(primary)) {
      const pts = cs.map(toScreen);
      // Rotation handle
      const top: Vec2 = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      const rh = rotateHandle(pts);
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(rh[0], rh[1]);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(rh[0], rh[1], isTouch ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Scale handles
      for (const [x, y] of pts) {
        const r = isTouch ? 7 : 4.5;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // Anchor point
    const a = toCompSpace(p, primary, t, [anchorOf(p, primary, t)], cam);
    if (a) crosshair(ctx, toScreen(a[0]));
  }

  /** Anchor tool: the pivot as a big crosshair plus the 9 points it snaps to. */
  function drawAnchorTool(ctx: CanvasRenderingContext2D, p: Project, l: Layer, t: number, cam: () => Camera) {
    if (!canEdit(l)) return;
    const nine = toCompSpace(p, l, t, ninePoints(boundsOf(p, l, t)), cam);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    for (const q of nine ?? []) {
      const [x, y] = toScreen(q);
      ctx.beginPath();
      ctx.arc(x, y, isTouch ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    const a = toCompSpace(p, l, t, [anchorOf(p, l, t)], cam);
    if (a) crosshair(ctx, toScreen(a[0]), true);
  }

  function drawMotionPath(ctx: CanvasRenderingContext2D, p: Project, layer: Layer, t: number, cam: () => Camera) {
    const prop = getProp(layer, 'position');
    if (!prop.keys || prop.keys.length < 2) return;
    const pm = parentMatrix(p, layer, t);
    const pm2 = flat(pm);
    const three = is3DLayer(layer);
    const zProp = getProp(layer, 'z');
    // Position (and Z for 3D layers) at a local key time, on screen; null behind the camera.
    const at = (v: Vec2, k: number): Vec2 | null => {
      if (!three) return toScreen(apply(pm2, v));
      const w = pm.transformPoint(new DOMPoint(v[0], v[1], keyedValue(zProp, k) as number));
      const q = projectPoint(cam(), w.x, w.y, w.z);
      return q ? toScreen(q.p) : null;
    };
    const k0 = prop.keys[0].t;
    const k1 = prop.keys[prop.keys.length - 1].t;
    const steps = Math.min(240, Math.max(16, Math.round((k1 - k0) * p.fps)));
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 201, 77, 0.7)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i <= steps; i++) {
      const k = k0 + ((k1 - k0) * i) / steps;
      const q = at(keyedValue(prop, k) as Vec2, k);
      if (!q) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
      drawing = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ANCHOR;
    for (const k of prop.keys) {
      const q = at(k.v as Vec2, k.t);
      if (!q) continue;
      ctx.save();
      ctx.translate(q[0], q[1]);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    ctx.restore();
  }

  function rotateHandle(pts: Vec2[]): Vec2 {
    const top: Vec2 = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    const bottom: Vec2 = [(pts[3][0] + pts[2][0]) / 2, (pts[3][1] + pts[2][1]) / 2];
    const dx = top[0] - bottom[0];
    const dy = top[1] - bottom[1];
    const len = Math.hypot(dx, dy) || 1;
    const off = isTouch ? 36 : 26;
    return [top[0] + (dx / len) * off, top[1] + (dy / len) * off];
  }

  /* ---------------- interaction ---------------- */

  const local = (e: React.PointerEvent | PointerEvent | WheelEvent): Vec2 => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  /** The guide line near a screen point (when guides are shown). */
  function guideAt(p: Project, vs: ViewSettings, pt: Vec2): { axis: 'v' | 'h'; index: number } | null {
    if (!vs.guides || !p.guides) return null;
    let best: { axis: 'v' | 'h'; index: number } | null = null;
    let bd = GUIDE_PX;
    for (let i = 0; i < p.guides.v.length; i++) {
      const d = Math.abs(toScreen([p.guides.v[i], 0])[0] - pt[0]);
      if (d < bd) [bd, best] = [d, { axis: 'v', index: i }];
    }
    for (let i = 0; i < p.guides.h.length; i++) {
      const d = Math.abs(toScreen([0, p.guides.h[i]])[1] - pt[1]);
      if (d < bd) [bd, best] = [d, { axis: 'h', index: i }];
    }
    return best;
  }

  function startPinch() {
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    drag.current = {
      kind: 'pinch',
      d0: Math.hypot(b[0] - a[0], b[1] - a[1]),
      mid0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      zoom0: view.current.zoom,
      pan0: [...view.current.pan],
    };
    snapLines.current = null;
    down.current = null;
  }

  /**
   * Second finger down while the first one moves the selected layer: from now
   * on both fingers move, scale and rotate it (two fingers elsewhere zoom the view).
   */
  function startTwist(): boolean {
    const d = drag.current;
    const s = useEditor.getState();
    const p = s.project;
    if (!p || d?.kind !== 'move' || d.items.length !== 1 || d.hit !== s.selectedId || s.selection.length) return false;
    const l = layerById(p, d.items[0].id);
    if (!l || !canEdit(l)) return false;
    const [a, b] = [...pointers.current.values()];
    const t = s.time;
    const { ec } = timesOf(p, l, t);
    // Mirrored parents turn a clockwise twist into a counter-clockwise rotation.
    const pm = flat(parentMatrix(p, l, t));
    const lastA = Math.atan2(b[1] - a[1], b[0] - a[0]);
    drag.current = {
      kind: 'twist',
      layer: l.id,
      gid: d.gid,
      d0: Math.max(1, dist(a, b)),
      mid0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      lastA,
      rot: 0,
      s0: evalPropAt(l, 'scale', propClock(p, l, 'scale', t), ec) as Vec2,
      r0: evalPropAt(l, 'rotation', propClock(p, l, 'rotation', t), ec) as number,
      flip: pm.a * pm.d - pm.b * pm.c < 0 ? -1 : 1,
      // From where the first finger already moved it.
      item: moveItem(p, l, t),
      cam: is3DLayer(l) ? activeCamera(p, t) : null,
    };
    snapLines.current = null;
    down.current = null;
    haptic();
    return true;
  }

  function onPointerDown(e: React.PointerEvent) {
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    wrapRef.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      if (!startTwist()) startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    down.current = { pt, at: performance.now() };
    const s = useEditor.getState();
    const p = s.project;
    if (!p) return;
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      drag.current = { kind: 'pan', s0: pt, pan0: [...view.current.pan] };
      return;
    }
    if (s.tool === 'pen') {
      drag.current = { kind: 'pen', points: [toComp(pt)] };
      return;
    }
    const t = s.time;
    const c = toComp(pt);
    const gid = ++gestureId;
    endMerge();
    if (s.tool === 'anchor') {
      startAnchor(p, s, pt, c, e.altKey);
      return;
    }
    const sel = layerById(p, s.selectedId);
    if (sel && !s.selection.length && canEdit(sel) && sel.type !== 'adjustment' && !is3DLayer(sel) && activeAt(p, sel, t)) {
      const { ec, lt } = timesOf(p, sel, t);
      const m = flat(worldMatrix(p, sel, t));
      const cs = corners(localBounds(sel, lt, ec, t));
      const pts = cs.map((q) => toScreen(apply(m, q)));
      const rh = rotateHandle(pts);
      const anchor = vec(sel, 'anchor', lt, ec);
      const center = apply(m, anchor);
      if (dist(pt, rh) < HANDLE) {
        const cs0 = toScreen(center);
        const r0 = evalPropAt(sel, 'rotation', propClock(p, sel, 'rotation', t), ec) as number;
        drag.current = { kind: 'rotate', layer: sel.id, r0, a0: Math.atan2(pt[1] - cs0[1], pt[0] - cs0[0]), center: cs0, gid };
        return;
      }
      const hi = pts.findIndex((h) => dist(pt, h) < HANDLE);
      if (hi >= 0) {
        const s0 = evalPropAt(sel, 'scale', propClock(p, sel, 'scale', t), ec) as Vec2;
        // The space just before scaling: the world matrix with the anchor offset
        // and the scale (property × transform effects) taken back out. It keeps
        // rotation, skew and effect offsets, so the handle stays under the finger.
        const fx = sel.effects.length ? transformFx(sel, lt, ec) : { sx: 1, sy: 1 };
        const kx = (s0[0] / 100) * fx.sx;
        const ky = (s0[1] / 100) * fx.sy;
        if (Math.abs(kx) > 1e-6 && Math.abs(ky) > 1e-6) {
          const base = m.translate(anchor[0], anchor[1]).scale(1 / kx, 1 / ky);
          const h0: Vec2 = [(cs[hi][0] - anchor[0]) * kx, (cs[hi][1] - anchor[1]) * ky];
          drag.current = { kind: 'scale', layer: sel.id, s0, h0, base, gid };
          return;
        }
      }
    }
    const hit = pick(p, c, t, s.selectedId);
    if (hit) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        toggleSelect(hit.id);
        haptic();
        drag.current = null;
        return;
      }
      const ids = selectedIds();
      const keep = ids.length > 1 && ids.includes(hit.id);
      if (!keep && hit.id !== s.selectedId) {
        select(hit.id);
        haptic();
      }
      drag.current = startMove(p, t, keep ? ids : [hit.id], hit.id, pt, c, gid);
    } else {
      const g = guideAt(p, s.view, pt);
      if (g) {
        drag.current = { kind: 'guide', ...g, value: p.guides![g.axis][g.index], pt, gid };
        haptic();
        schedule(true);
        return;
      }
      if (s.selectedId || s.selection.length) select(null);
      drag.current = { kind: 'pan', s0: pt, pan0: [...view.current.pan] };
    }
    schedule(true);
  }

  /** Anchor tool press: grab the selected layer's pivot (or pick a layer when none is selected). */
  function startAnchor(p: Project, s: EditorState, pt: Vec2, c: Vec2, free: boolean) {
    const t = s.time;
    const sel = layerById(p, s.selectedId);
    if (!sel || !canEdit(sel) || !activeAt(p, sel, t)) {
      const hit = hitTest(p, c, t, s.selectedId);
      if (hit) {
        select(hit.id);
        haptic();
      } else drag.current = { kind: 'pan', s0: pt, pan0: [...view.current.pan] };
      return;
    }
    // Pressing on the pivot drags it from where it is; anywhere else, it jumps to the finger.
    const a = toCompSpace(p, sel, t, [anchorOf(p, sel, t)], lazyCamera(p, t));
    const as = a && toScreen(a[0]);
    const off: Vec2 = as && dist(as, pt) < HANDLE * 1.5 ? [as[0] - pt[0], as[1] - pt[1]] : [0, 0];
    const d: Drag = { kind: 'anchor', layer: sel.id, off, snap: -1 };
    drag.current = d;
    if (!off[0] && !off[1]) moveAnchor(d, pt, free);
  }

  /** Moves the pivot under a screen point, snapping to the layer's 9 box points. */
  function moveAnchor(d: Extract<Drag, { kind: 'anchor' }>, pt: Vec2, free: boolean) {
    const s = useEditor.getState();
    const p = s.project;
    const l = p && layerById(p, d.layer);
    if (!p || !l) return;
    const t = s.time;
    const cam = lazyCamera(p, t);
    const target: Vec2 = [pt[0] + d.off[0], pt[1] + d.off[1]];
    const nine = ninePoints(boundsOf(p, l, t));
    let uv: Vec2 | null = null;
    let snap = -1;
    const scr = !free && s.view.snap ? toCompSpace(p, l, t, nine, cam)?.map(toScreen) : null;
    if (scr) {
      // Small on screen: shrink the radius so spots between the points stay reachable.
      let bd = Math.min(ANCHOR_SNAP_PX, Math.max(3, Math.min(dist(scr[0], scr[1]), dist(scr[0], scr[3])) / 3));
      scr.forEach((q, i) => {
        const dd = dist(q, target);
        if (dd < bd) [bd, snap] = [dd, i];
      });
      if (snap >= 0) uv = nine[snap];
    }
    if (!uv) {
      const cp = toComp(target);
      if (is3DLayer(l)) uv = rayToLayer(p, l, cp, t, cam());
      else {
        const inv = flat(worldMatrix(p, l, t)).inverse();
        if (!Number.isNaN(inv.a)) uv = apply(inv, cp);
      }
    }
    if (!uv) return;
    if (snap >= 0 && snap !== d.snap) haptic();
    d.snap = snap;
    setAnchor(l.id, [round1(uv[0]), round1(uv[1])], `anchor:${l.id}`);
  }

  function onPointerMove(e: React.PointerEvent) {
    const pt = local(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === 'mouse') hover(pt);
      return;
    }
    pointers.current.set(e.pointerId, pt);
    const d = drag.current;
    if (!d) return;
    const s = useEditor.getState();
    const p = s.project;
    if (!p) return;
    switch (d.kind) {
      case 'pinch': {
        const [a, b] = [...pointers.current.values()];
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const z = Math.min(16, Math.max(0.02, d.zoom0 * (span / d.d0)));
        const k = z / d.zoom0;
        view.current = { zoom: z, pan: [mid[0] - (d.mid0[0] - d.pan0[0]) * k, mid[1] - (d.mid0[1] - d.pan0[1]) * k], fit: false };
        setZoomLabel(Math.round(z * 100));
        schedule();
        break;
      }
      case 'twist': {
        const [a, b] = [...pointers.current.values()];
        if (!a || !b) break;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        // Accumulate the turn so it can go past half a turn.
        let da = ang - d.lastA;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        d.rot += da;
        d.lastA = ang;
        const k = dist(a, b) / d.d0;
        const c0 = toComp(d.mid0);
        const c1 = toComp([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        const t = s.time;
        update((dp) => {
          const l = layerById(dp, d.layer);
          if (!l) return;
          writeValue(dp, l, 'scale', [round1(d.s0[0] * k), round1(d.s0[1] * k)], t);
          writeValue(dp, l, 'rotation', round1(d.r0 + (d.flip * d.rot * 180) / Math.PI), t);
          writeMove(dp, l, d.item, d.cam, c1[0] - c0[0], c1[1] - c0[1], t);
        }, `drag:${d.gid}`);
        break;
      }
      case 'pan':
        view.current = { ...view.current, pan: [d.pan0[0] + pt[0] - d.s0[0], d.pan0[1] + pt[1] - d.s0[1]], fit: false };
        schedule();
        break;
      case 'pen': {
        const c = toComp(pt);
        const last = d.points[d.points.length - 1];
        if (Math.hypot(c[0] - last[0], c[1] - last[1]) * view.current.zoom > 1.5) d.points.push(c);
        schedule(true);
        break;
      }
      case 'move': {
        if (!d.moved) {
          if (dist(pt, d.s0) < MOVE_SLOP) break;
          d.moved = true;
        }
        const c = toComp(pt);
        let dx = c[0] - d.p0[0];
        let dy = c[1] - d.p0[1];
        snapLines.current = null;
        if (d.box && d.targets && s.view.snap && !e.altKey) {
          const r = snapBox(moveBox(d.box, dx, dy), d.targets, SNAP_PX / view.current.zoom);
          dx += r.dx;
          dy += r.dy;
          const sx = r.lines.x.length > 0;
          const sy = r.lines.y.length > 0;
          if (sx || sy) snapLines.current = r.lines;
          if ((sx && !d.snapped[0]) || (sy && !d.snapped[1])) haptic();
          d.snapped = [sx, sy];
        }
        const t = s.time;
        update((dp) => {
          for (const it of d.items) {
            const l = layerById(dp, it.id);
            if (l) writeMove(dp, l, it, d.cam, dx, dy, t);
          }
        }, `drag:${d.gid}`);
        break;
      }
      case 'scale': {
        const c = toComp(pt);
        const inv = d.base.inverse();
        const q = apply(inv, c);
        let sx: number;
        let sy: number;
        if (e.shiftKey) {
          sx = Math.abs(d.h0[0]) > 1e-3 ? d.s0[0] * (q[0] / d.h0[0]) : d.s0[0];
          sy = Math.abs(d.h0[1]) > 1e-3 ? d.s0[1] * (q[1] / d.h0[1]) : d.s0[1];
        } else {
          const k = (q[0] * d.h0[0] + q[1] * d.h0[1]) / (d.h0[0] ** 2 + d.h0[1] ** 2 || 1);
          sx = d.s0[0] * k;
          sy = d.s0[1] * k;
        }
        setPropValue(d.layer, 'scale', [round1(sx), round1(sy)], `drag:${d.gid}`);
        break;
      }
      case 'rotate': {
        const a = Math.atan2(pt[1] - d.center[1], pt[0] - d.center[0]);
        let r = d.r0 + ((a - d.a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        setPropValue(d.layer, 'rotation', round1(r), `drag:${d.gid}`);
        break;
      }
      case 'anchor':
        moveAnchor(d, pt, e.altKey);
        break;
      case 'guide': {
        const c = toComp(pt);
        const extent = d.axis === 'v' ? p.width : p.height;
        let v = d.axis === 'v' ? c[0] : c[1];
        if (s.view.snap && !e.altKey) v = snapValue(v, [], s.view.grid ? s.view.gridSize : null, extent, SNAP_PX / view.current.zoom);
        v = Math.round(v);
        d.pt = pt;
        if (v === d.value) {
          schedule(true);
          break;
        }
        d.value = v;
        const { axis, index } = d;
        update((dp) => {
          const list = dp.guides?.[axis];
          if (list && index < list.length) list[index] = v;
        }, `guide:${d.gid}`);
        break;
      }
    }
  }

  /** Desktop: resize cursor over guides that can be dragged. */
  function hover(pt: Vec2) {
    const wrap = wrapRef.current;
    const s = useEditor.getState();
    const p = s.project;
    if (!wrap || !p) return;
    let cursor = '';
    if (s.tool === 'select') {
      const g = guideAt(p, s.view, pt);
      if (g && !pick(p, toComp(pt), s.time, s.selectedId)) cursor = g.axis === 'v' ? 'col-resize' : 'row-resize';
    }
    if (wrap.style.cursor !== cursor) wrap.style.cursor = cursor;
  }

  function onPointerUp(e: React.PointerEvent) {
    const pt = local(e);
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'pinch' || d?.kind === 'twist') {
      // Lifting one finger of a pinch or twist shouldn't turn into a drag.
      drag.current = null;
      if (d.kind === 'twist') endMerge();
      return;
    }
    if (d?.kind === 'pen') {
      const b = useEditor.getState().brush;
      addDrawing(simplify(d.points, 1 / view.current.zoom), b.color, b.width);
    }
    if (d?.kind === 'guide') {
      // Dropped outside the comp: remove it (same undo step as the move).
      const p = useEditor.getState().project;
      const extent = d.axis === 'v' ? p?.width ?? 0 : p?.height ?? 0;
      if (d.value < 0 || d.value > extent) {
        const { axis, index } = d;
        update((dp) => {
          dp.guides?.[axis].splice(index, 1);
        }, `guide:${d.gid}`);
        haptic();
      }
    }
    // A tap on a layer of a multi-selection selects just that layer.
    if (d?.kind === 'move' && !d.moved && d.items.length > 1) select(d.hit);
    drag.current = null;
    snapLines.current = null;
    endMerge();
    if (e.type === 'pointerup') detectTap(pt);
    down.current = null;
    schedule(true);
  }

  function detectTap(pt: Vec2) {
    const dn = down.current;
    if (!dn || pointers.current.size) return;
    const now = performance.now();
    if (now - dn.at > 350 || dist(pt, dn.pt) > 10) {
      lastTap.current = null;
      return;
    }
    const prev = lastTap.current;
    if (prev && now - prev.at < 400 && dist(prev.pt, pt) < 30) {
      lastTap.current = null;
      onDoubleTap(pt);
    } else lastTap.current = { pt, at: now };
  }

  /** Double-tap/click: enter a group (select the child under the pointer), open a layer's properties, or fit an empty area. */
  function onDoubleTap(pt: Vec2) {
    const s = useEditor.getState();
    const p = s.project;
    if (!p || s.tool !== 'select') return;
    const c = toComp(pt);
    const hit = pick(p, c, s.time, s.selectedId);
    if (!hit) {
      if (!guideAt(p, s.view, pt)) fitView();
      return;
    }
    if (hit.type === 'group') {
      const child = hitTest(p, c, s.time, hit.id);
      if (child && child.id !== hit.id) {
        select(child.id);
        haptic();
      }
      return;
    }
    select(hit.id);
    openSheet('props');
  }

  const spaceDown = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) setZoom(view.current.zoom * Math.exp(-e.deltaY * 0.01), local(e));
      else {
        view.current = { ...view.current, pan: [view.current.pan[0] - e.deltaX, view.current.pan[1] - e.deltaY], fit: false };
        schedule();
      }
    };
    wrap.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => {
      if (view.current.fit) fitView();
      else schedule();
    });
    ro.observe(wrap);
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) spaceDown.current = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project !== prev.project || s.time !== prev.time || s.previewQuality !== prev.previewQuality || s.playing !== prev.playing) {
        if (s.project && prev.project && (s.project.width !== prev.project.width || s.project.height !== prev.project.height)) fitView();
        schedule();
      } else if (s.selectedId !== prev.selectedId || s.selection !== prev.selection || s.view !== prev.view || s.tool !== prev.tool) schedule(true);
    });
    const unMedia = media.onChange(() => schedule());
    const unFonts = onFontsChanged(() => schedule());
    const onFit = () => fitView();
    window.addEventListener('xm:fit', onFit);
    fitView();
    return () => {
      wrap.removeEventListener('wheel', wheel);
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('xm:fit', onFit);
      unsub();
      unMedia();
      unFonts();
      cancelAnimationFrame(raf.current);
      // Let a remount (StrictMode runs effects twice in development) schedule frames again.
      raf.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`viewport ${tool === 'pen' ? 'pen' : ''} ${tool === 'anchor' ? 'anchor' : ''}`}>
      <div ref={wrapRef} className="viewport-wrap" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <canvas ref={canvasRef} className="comp-canvas" />
        <canvas ref={overlayRef} className="overlay-canvas" />
      </div>
      <ViewMenu />
      <div className="zoom-ctl">
        <button type="button" onClick={() => setZoom(view.current.zoom / 1.25)} aria-label="Zoom out">
          <Icon name="minus" size={14} />
        </button>
        <button type="button" className="zoom-label" onClick={fitView} title="Fit (double-tap empty area)">
          {zoomLabel}%
        </button>
        <button type="button" onClick={() => setZoom(view.current.zoom * 1.25)} aria-label="Zoom in">
          <Icon name="plus" size={14} />
        </button>
      </div>
      {tool === 'pen' && <PenBar color={brush.color} width={brush.width} />}
      {tool === 'anchor' && <AnchorBar />}
    </div>
  );
}

function PenBar({ color, width }: { color: string; width: number }) {
  const setBrush = (b: Partial<{ color: string; width: number }>) => useEditor.setState((s) => ({ brush: { ...s.brush, ...b } }));
  return (
    <div className="pen-bar">
      <span className="pen-title">
        <Icon name="pen" size={16} /> Draw with your finger
      </span>
      <label className="pen-color" style={{ background: color }}>
        <input type="color" value={color.slice(0, 7)} onChange={(e) => setBrush({ color: e.target.value })} />
      </label>
      <input type="range" min={1} max={80} value={width} onChange={(e) => setBrush({ width: Number(e.target.value) })} aria-label="Brush size" />
      <button type="button" className="btn primary small" onClick={() => useEditor.setState({ tool: 'select' })}>
        Done
      </button>
    </div>
  );
}

/** Anchor tool bar: hint, center the pivot, and Done. */
function AnchorBar() {
  const usable = useEditor((s) => {
    const l = s.project ? layerById(s.project, s.selectedId) : undefined;
    return !!l && canEdit(l);
  });
  const center = () => {
    const { project: p, selectedId, time } = useEditor.getState();
    const l = p ? layerById(p, selectedId) : undefined;
    if (!p || !l) return;
    const b = boundsOf(p, l, time);
    endMerge();
    setAnchor(l.id, [round1(b.x + b.w / 2), round1(b.y + b.h / 2)]);
  };
  return (
    <div className="pen-bar anchor-bar">
      <span className="anchor-title">
        <Icon name="anchor" size={16} /> {usable ? 'Drag the anchor' : 'Tap a layer'}
      </span>
      {usable && (
        <button type="button" className="btn small" onClick={center}>
          Center
        </button>
      )}
      <button type="button" className="btn primary small" onClick={() => useEditor.setState({ tool: 'select' })}>
        Done
      </button>
    </div>
  );
}
