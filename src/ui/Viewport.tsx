import { useEffect, useRef, useState } from 'react';
import type { Layer, Project, Vec2 } from '../model/types';
import { evalPropAt, keyedValue } from '../model/animate';
import { getProp } from '../model/schema';
import { Renderer } from '../engine/renderer';
import { media } from '../engine/media';
import { onFontsChanged } from '../engine/fonts';
import { simplify } from '../engine/shapes';
import { apply, corners, ctxFor, hitTest, isActive, localBounds, parentMatrix, worldMatrix } from '../engine/transform';
import { endMerge, layerById, openSheet, select, setPropValue, useEditor } from '../state/store';
import { addDrawing } from './actions';
import { haptic, isTouch } from '../platform';
import { Icon } from './icons';

type Drag =
  | { kind: 'move'; layer: string; p0: Vec2; v0: Vec2; inv: DOMMatrix; gid: number; snapped: [boolean, boolean] }
  | { kind: 'scale'; layer: string; s0: Vec2; h0: Vec2; base: DOMMatrix; gid: number }
  | { kind: 'rotate'; layer: string; r0: number; a0: number; center: Vec2; gid: number }
  | { kind: 'pan'; s0: Vec2; pan0: Vec2 }
  | { kind: 'pen'; points: Vec2[] }
  | { kind: 'pinch'; d0: number; mid0: Vec2; zoom0: number; pan0: Vec2 };

let gestureId = 0;
const HANDLE = isTouch ? 22 : 10;

export function Viewport() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef(new Renderer());
  const view = useRef({ zoom: 0.3, pan: [0, 0] as Vec2, fit: true });
  const [zoomLabel, setZoomLabel] = useState(30);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const guides = useRef<{ x?: number; y?: number }>({});
  const raf = useRef(0);
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);

  const schedule = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      draw();
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

  function draw() {
    const s = useEditor.getState();
    const p = s.project;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!p || !canvas || !wrap) return;
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
    drawOverlay(p, s.time, s.selectedId);
  }

  function drawOverlay(p: Project, t: number, selectedId: string | null) {
    const o = overlayRef.current;
    const wrap = wrapRef.current;
    if (!o || !wrap) return;
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

    // Null layers are invisible in the render; show them as handles.
    for (const l of p.layers) {
      if (l.type !== 'null' || !l.visible || !isActive(l, t)) continue;
      const m = worldMatrix(p, l, t);
      const c = toScreen(apply(m, [0, 0]));
      ctx.strokeStyle = 'rgba(160,170,190,0.8)';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(c[0] - 14, c[1] - 14, 28, 28);
      ctx.setLineDash([]);
    }

    const g = guides.current;
    ctx.strokeStyle = '#ff5c8a';
    ctx.lineWidth = 1;
    if (g.x !== undefined) {
      const sx = toScreen([g.x, 0])[0];
      ctx.beginPath();
      ctx.moveTo(sx, y0);
      ctx.lineTo(sx, y1);
      ctx.stroke();
    }
    if (g.y !== undefined) {
      const sy = toScreen([0, g.y])[1];
      ctx.beginPath();
      ctx.moveTo(x0, sy);
      ctx.lineTo(x1, sy);
      ctx.stroke();
    }

    const d = drag.current;
    if (d?.kind === 'pen' && d.points.length > 1) {
      const b = useEditor.getState().brush;
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

    const layer = layerById(p, selectedId);
    if (!layer || !layer.visible || layer.type === 'audio' || !isActive(layer, t)) return;
    drawMotionPath(ctx, p, layer, t);
    if (layer.type === 'adjustment') return;
    const m = worldMatrix(p, layer, t);
    const b = localBounds(layer, t, ctxFor(p, layer));
    const pts = corners(b).map((c) => toScreen(apply(m, c)));
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    if (layer.locked) return;
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
    // Anchor point
    const anchor = evalPropAt(layer, 'anchor', t, ctxFor(p, layer)) as Vec2;
    const [ax, ay] = toScreen(apply(m, anchor));
    ctx.strokeStyle = '#ffc94d';
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI * 2);
    ctx.moveTo(ax - 9, ay);
    ctx.lineTo(ax + 9, ay);
    ctx.moveTo(ax, ay - 9);
    ctx.lineTo(ax, ay + 9);
    ctx.stroke();
  }

  function drawMotionPath(ctx: CanvasRenderingContext2D, p: Project, layer: Layer, t: number) {
    const prop = getProp(layer, 'position');
    if (!prop.keys || prop.keys.length < 2) return;
    const pm = parentMatrix(p, layer, t);
    const k0 = prop.keys[0].t;
    const k1 = prop.keys[prop.keys.length - 1].t;
    const steps = Math.min(240, Math.max(16, Math.round((k1 - k0) * p.fps)));
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 201, 77, 0.7)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const v = keyedValue(prop, k0 + ((k1 - k0) * i) / steps) as Vec2;
      const [sx, sy] = toScreen(apply(pm, v));
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffc94d';
    for (const k of prop.keys) {
      const [sx, sy] = toScreen(apply(pm, k.v as Vec2));
      ctx.save();
      ctx.translate(sx, sy);
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
    guides.current = {};
  }

  function onPointerDown(e: React.PointerEvent) {
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    wrapRef.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
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
    const sel = layerById(p, s.selectedId);
    const gid = ++gestureId;
    endMerge();
    if (sel && sel.visible && !sel.locked && isActive(sel, t) && sel.type !== 'audio' && sel.type !== 'adjustment') {
      const m = worldMatrix(p, sel, t);
      const ec = ctxFor(p, sel);
      const b = localBounds(sel, t, ec);
      const cs = corners(b);
      const pts = cs.map((c) => toScreen(apply(m, c)));
      const rh = rotateHandle(pts);
      const anchor = evalPropAt(sel, 'anchor', t, ec) as Vec2;
      const center = apply(m, anchor);
      if (Math.hypot(pt[0] - rh[0], pt[1] - rh[1]) < HANDLE) {
        const c = toScreen(center);
        drag.current = { kind: 'rotate', layer: sel.id, r0: evalPropAt(sel, 'rotation', t, ec) as number, a0: Math.atan2(pt[1] - c[1], pt[0] - c[0]), center: c, gid };
        return;
      }
      const hi = pts.findIndex((h) => Math.hypot(pt[0] - h[0], pt[1] - h[1]) < HANDLE);
      if (hi >= 0) {
        const s0 = evalPropAt(sel, 'scale', t, ec) as Vec2;
        const pos = evalPropAt(sel, 'position', t, ec) as Vec2;
        const rot = evalPropAt(sel, 'rotation', t, ec) as number;
        const base = parentMatrix(p, sel, t).translate(pos[0], pos[1]).rotate(rot);
        const h0: Vec2 = [((cs[hi][0] - anchor[0]) * s0[0]) / 100, ((cs[hi][1] - anchor[1]) * s0[1]) / 100];
        drag.current = { kind: 'scale', layer: sel.id, s0, h0, base, gid };
        return;
      }
    }
    const hit = hitTest(p, toComp(pt), t);
    if (hit) {
      if (hit.id !== s.selectedId) {
        select(hit.id);
        haptic();
      }
      const ec = ctxFor(p, hit);
      drag.current = {
        kind: 'move',
        layer: hit.id,
        p0: toComp(pt),
        v0: evalPropAt(hit, 'position', t, ec) as Vec2,
        inv: parentMatrix(p, hit, t).inverse(),
        gid,
        snapped: [false, false],
      };
    } else {
      if (s.selectedId) select(null);
      drag.current = { kind: 'pan', s0: pt, pan0: [...view.current.pan] };
    }
    schedule();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    const d = drag.current;
    if (!d) return;
    const p = useEditor.getState().project;
    if (!p) return;
    switch (d.kind) {
      case 'pinch': {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const z = Math.min(16, Math.max(0.02, d.zoom0 * (dist / d.d0)));
        const k = z / d.zoom0;
        view.current = { zoom: z, pan: [mid[0] - (d.mid0[0] - d.pan0[0]) * k, mid[1] - (d.mid0[1] - d.pan0[1]) * k], fit: false };
        setZoomLabel(Math.round(z * 100));
        schedule();
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
        schedule();
        break;
      }
      case 'move': {
        const c = toComp(pt);
        const dx = c[0] - d.p0[0];
        const dy = c[1] - d.p0[1];
        let nx = d.v0[0] + d.inv.a * dx + d.inv.c * dy;
        let ny = d.v0[1] + d.inv.b * dx + d.inv.d * dy;
        const layer = layerById(p, d.layer);
        guides.current = {};
        if (layer && !layer.parent && !e.altKey) {
          const tol = 8 / view.current.zoom;
          const sx = Math.abs(nx - p.width / 2) < tol;
          const sy = Math.abs(ny - p.height / 2) < tol;
          if (sx) {
            nx = p.width / 2;
            guides.current.x = nx;
          }
          if (sy) {
            ny = p.height / 2;
            guides.current.y = ny;
          }
          if ((sx && !d.snapped[0]) || (sy && !d.snapped[1])) haptic();
          d.snapped = [sx, sy];
        }
        setPropValue(d.layer, 'position', [Math.round(nx * 10) / 10, Math.round(ny * 10) / 10], `drag:${d.gid}`);
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
        setPropValue(d.layer, 'scale', [Math.round(sx * 10) / 10, Math.round(sy * 10) / 10], `drag:${d.gid}`);
        break;
      }
      case 'rotate': {
        const a = Math.atan2(pt[1] - d.center[1], pt[0] - d.center[0]);
        let r = d.r0 + ((a - d.a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        setPropValue(d.layer, 'rotation', Math.round(r * 10) / 10, `drag:${d.gid}`);
        break;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'pinch') {
      // Lifting one finger of a pinch shouldn't turn into a drag.
      drag.current = null;
      return;
    }
    if (d?.kind === 'pen') {
      const b = useEditor.getState().brush;
      addDrawing(simplify(d.points, 1 / view.current.zoom), b.color, b.width);
    }
    drag.current = null;
    guides.current = {};
    endMerge();
    schedule();
  }

  function onDoubleClick(e: React.MouseEvent) {
    const s = useEditor.getState();
    if (!s.project) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const hit = hitTest(s.project, toComp([e.clientX - r.left, e.clientY - r.top]), s.time);
    if (hit) {
      select(hit.id);
      openSheet('props');
    } else fitView();
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
      if (s.project !== prev.project || s.time !== prev.time || s.selectedId !== prev.selectedId || s.previewQuality !== prev.previewQuality || s.playing !== prev.playing) {
        if (s.project && prev.project && (s.project.width !== prev.project.width || s.project.height !== prev.project.height)) fitView();
        schedule();
      }
    });
    const unMedia = media.onChange(schedule);
    const unFonts = onFontsChanged(schedule);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`viewport ${tool === 'pen' ? 'pen' : ''}`}>
      <div
        ref={wrapRef}
        className="viewport-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <canvas ref={canvasRef} className="comp-canvas" />
        <canvas ref={overlayRef} className="overlay-canvas" />
      </div>
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
