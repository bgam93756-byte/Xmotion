import type { BlendMode, Layer, Project, Vec2 } from '../model/types';
import { col, num, type EvalContext } from '../model/animate';
import { findLayer } from '../model/tree';
import { applyEffects, hasPixelEffects, opacityFx, renderFx, shapeFx, textFx, type FxContext } from './effects';
import { media } from './media';
import { buildShape, outlinePoints, type Rect } from './shapes';
import { drawText, layoutText } from './text';
import { corners, isActive, isMaskLayer, localBounds, outlineComp, shapeParams, timesOf, withMemo, worldMatrix } from './transform';
import { activeCamera, depthAt, glMat3, homography, inv3, mul3, projectLocal, type Camera, type Mat3 } from './camera';
import { glfx, LUMA_MATTE_FRAG, WARP_FRAG, type Common } from './gl';

export interface RenderOpts {
  /** Output pixels per comp pixel. */
  scale: number;
  transparent?: boolean;
  motionBlur?: boolean;
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  add: 'lighter',
};

class CanvasPool {
  private free: HTMLCanvasElement[] = [];
  acquire(w: number, h: number): HTMLCanvasElement {
    let c = this.free.pop();
    if (!c) c = document.createElement('canvas');
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    } else {
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
    }
    return c;
  }
  release(c: HTMLCanvasElement) {
    if (this.free.length < 4) this.free.push(c);
    else free(c);
  }
  dispose() {
    this.free.forEach(free);
    this.free = [];
  }
}

/** iOS counts canvas memory until a canvas is shrunk, so release it explicitly. */
export function free(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

function fillStyle(ctx: CanvasRenderingContext2D, layer: Layer, b: Rect, t: number, ec: EvalContext): string | CanvasGradient {
  const c1 = col(layer, 'fill', t, ec);
  const type = layer.fillType ?? 'solid';
  if (type === 'solid') return c1;
  const c2 = col(layer, 'fill2', t, ec);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let g: CanvasGradient;
  if (type === 'linear') {
    const a = (num(layer, 'gradAngle', t, ec) * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (Math.abs(b.w * dx) + Math.abs(b.h * dy)) / 2 || 1;
    g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  } else {
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, Math.max(b.w, b.h) / 2));
  }
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

function taperAt(k: number, [a, b, mid]: [number, number, number]) {
  return k < 0.5 ? a + (mid - a) * (k * 2) : mid + (b - mid) * ((k - 0.5) * 2);
}

/** Strokes a polyline segment by segment so the width can vary along it. */
function taperStroke(ctx: CanvasRenderingContext2D, pts: Vec2[], from: number, to: number, sw: number, taper: [number, number, number]) {
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = seg[seg.length - 1];
  if (total <= 0 || to <= from) return;
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const u0 = seg[i - 1] / total;
    const u1 = seg[i] / total;
    const a = Math.max(u0, from);
    const b = Math.min(u1, to);
    if (b <= a) continue;
    const lerpPt = (u: number): Vec2 => {
      const k = (u - u0) / Math.max(1e-9, u1 - u0);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    };
    const w = sw * taperAt(((a + b) / 2 - from) / (to - from), taper);
    if (w <= 0.05) continue;
    const p0 = lerpPt(a);
    const p1 = lerpPt(b);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
  }
}

/** Flattens a (possibly 3D) matrix to its 2D part, as 2D layers are drawn. */
export function flat(m: DOMMatrix): DOMMatrix {
  return m.is2D ? m : new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
}

/** Local → output-pixel matrix of a 2D layer at comp time `compT`. */
function pixelMatrix(project: Project, layer: Layer, compT: number, s: number): DOMMatrix {
  return new DOMMatrix([s, 0, 0, s, 0, 0]).multiply(flat(worldMatrix(project, layer, compT)));
}

export const is3DLayer = (l: Layer) => !!l.threeD && l.type !== 'group' && l.type !== 'camera';
export const isMask = isMaskLayer;
const isDrawable = (l: Layer) => l.type !== 'audio' && l.type !== 'null' && l.type !== 'camera';

/**
 * Draws one layer's own content (no opacity/blend/effects) at its layer time
 * `t`, with `m` mapping local coordinates to target pixels.
 */
function drawContent(ctx: CanvasRenderingContext2D, layer: Layer, t: number, ec: EvalContext, m: DOMMatrix) {
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  const mod = layer.effects.length ? shapeFx(layer, t, ec) : {};
  switch (layer.type) {
    case 'shape': {
      const params = shapeParams(layer, t, ec);
      const kind = params.kind;
      const geom = buildShape(params);
      if (layer.fillOn) {
        ctx.fillStyle = fillStyle(ctx, layer, geom.bounds, t, ec);
        ctx.fill(geom.path);
      }
      const sw = mod.strokeWidth ?? num(layer, 'strokeWidth', t, ec);
      if ((layer.strokeOn || mod.strokeColor) && sw > 0) {
        ctx.lineWidth = sw;
        ctx.strokeStyle = mod.strokeColor ?? col(layer, 'strokeColor', t, ec);
        ctx.lineJoin = kind === 'path' || kind === 'ellipse' ? 'round' : 'miter';
        ctx.lineCap = kind === 'path' ? 'round' : 'butt';
        const ts = num(layer, 'trimStart', t, ec);
        const te = num(layer, 'trimEnd', t, ec);
        const off = num(layer, 'trimOffset', t, ec);
        let a = Math.max(0, Math.min(ts, te)) / 100;
        let b = Math.min(100, Math.max(ts, te)) / 100;
        if (mod.progress) {
          const [ps, pe] = mod.progress;
          [a, b] = [a + (b - a) * Math.min(ps, pe), a + (b - a) * Math.max(0, Math.min(1, pe))];
        }
        const total = geom.length;
        if (mod.taper) {
          ctx.strokeStyle = mod.strokeColor ?? col(layer, 'strokeColor', t, ec);
          taperStroke(ctx, outlinePoints(params), a, b, sw, mod.taper);
        } else {
          let draw = true;
          if ((a > 0 || b < 1 || off !== 0) && total > 0) {
            const visible = (b - a) * total;
            if (visible <= 0.01) draw = false;
            else if (visible < total - 0.01) {
              ctx.setLineDash([visible, total - visible]);
              ctx.lineDashOffset = -(a * total + (off / 360) * total);
            }
          }
          if (draw) ctx.stroke(geom.path);
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      }
      break;
    }
    case 'text': {
      const tm = layer.effects.length ? textFx(layer, t, ec) : {};
      const L = tm.text !== undefined ? { ...layer, text: tm.text } : layer;
      const fs = num(layer, 'fontSize', t, ec);
      const layout = layoutText(L, fs, num(layer, 'tracking', t, ec) + (tm.tracking ?? 0), num(layer, 'lineHeight', t, ec));
      const baseReveal = num(layer, 'reveal', t, ec);
      drawText(ctx, L, layout, {
        fill: layer.fillOn ? fillStyle(ctx, layer, layout.bounds, t, ec) : null,
        stroke: layer.strokeOn || mod.strokeColor ? (mod.strokeColor ?? col(layer, 'strokeColor', t, ec)) : null,
        strokeWidth: mod.strokeWidth ?? num(layer, 'strokeWidth', t, ec),
        reveal: tm.reveal !== undefined ? Math.min(baseReveal, tm.reveal) : baseReveal,
        waveAmp: num(layer, 'waveAmp', t, ec),
        waveFreq: num(layer, 'waveFreq', t, ec),
        time: t,
        fontSize: fs,
        animator: tm.reveal !== undefined && (layer.animator ?? 'none') === 'none' ? 'typewriter' : undefined,
        unit: tm.unit,
        random: tm.random,
        glyph: tm.glyph,
      });
      break;
    }
    case 'image':
    case 'video': {
      const f = media.frame(layer);
      if (f) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(f.src, -f.w / 2, -f.h / 2, f.w, f.h);
      }
      break;
    }
  }
}

/** State shared while rendering one frame. */
interface Frame {
  project: Project;
  compT: number;
  s: number;
  W: number;
  H: number;
  cam: Camera | null;
}

const NO_COMMON: Common = {
  time: 0,
  ltime: 0,
  scale: 1,
  seed: 0,
  toLocal: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  toBuf: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  lb: [0, 0, 1, 1],
};

function copyInto(dst: HTMLCanvasElement, src: CanvasImageSource) {
  const c = dst.getContext('2d')!;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'copy';
  c.drawImage(src, 0, 0);
  c.restore();
}

/** Replaces a buffer with its luminance matte (alpha = luma × alpha). */
function lumaMatte(buf: HTMLCanvasElement) {
  const gl = glfx();
  if (gl) {
    copyInto(buf, gl.run(buf, buf.width, buf.height, [{ frag: LUMA_MATTE_FRAG, u: { u_invert: 0 } }], NO_COMMON));
    return;
  }
  const c = buf.getContext('2d')!;
  const img = c.getImageData(0, 0, buf.width, buf.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // getImageData is not premultiplied: the matte is luma × alpha.
    const m = ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) * (d[i + 3] / 255);
    d[i] = d[i + 1] = d[i + 2] = 0;
    d[i + 3] = Math.round(Math.min(1, m) * 255);
  }
  c.putImageData(img, 0, 0);
}

export class Renderer {
  private pool = new CanvasPool();

  /** Renders the comp at time t into `out` (resized to width*scale x height*scale). */
  render(project: Project, t: number, out: HTMLCanvasElement, opts: RenderOpts) {
    withMemo(() => this.renderFrame(project, t, out, opts));
  }

  private renderFrame(project: Project, t: number, out: HTMLCanvasElement, opts: RenderOpts) {
    const W = Math.max(1, Math.round(project.width * opts.scale));
    const H = Math.max(1, Math.round(project.height * opts.scale));
    if (out.width !== W || out.height !== H) {
      out.width = W;
      out.height = H;
    }
    const ctx = out.getContext('2d')!;
    const mb = project.motionBlur;
    if (opts.motionBlur && mb.on && mb.samples > 1) {
      const tmp = this.pool.acquire(W, H);
      const tctx = tmp.getContext('2d')!;
      const n = Math.min(64, Math.round(mb.samples));
      const shutter = mb.shutter / project.fps;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let k = 0; k < n; k++) {
        const tt = t + (k / (n - 1) - 0.5) * shutter;
        this.frame(project, Math.max(0, tt), tctx, W, H, opts);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1 / (k + 1);
        ctx.drawImage(tmp, 0, 0);
      }
      ctx.globalAlpha = 1;
      this.pool.release(tmp);
    } else {
      this.frame(project, t, ctx, W, H, opts);
    }
  }

  private frame(project: Project, t: number, ctx: CanvasRenderingContext2D, W: number, H: number, opts: RenderOpts) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const f: Frame = { project, compT: t, s: opts.scale, W, H, cam: null };
    if (!opts.transparent) {
      ctx.fillStyle = project.background;
      ctx.fillRect(0, 0, W, H);
    }
    this.container(f, project.layers, ctx, t, opts.transparent ? null : project.background);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private camera(f: Frame): Camera {
    return (f.cam ??= activeCamera(f.project, f.compT));
  }

  /**
   * Bottom-to-top drawing order of a container: runs of adjacent 3D layers are
   * sorted far to near so they overlap by depth.
   */
  private order(f: Frame, list: Layer[], ct: number): number[] {
    const idx: number[] = [];
    for (let i = list.length - 1; i >= 0; i--) if (isDrawable(list[i])) idx.push(i);
    const shown = (l: Layer) => l.visible && isActive(l, ct);
    const sortable = (l: Layer) => is3DLayer(l) && !isMask(l) && !l.clip && shown(l);
    for (let a = 0; a < idx.length; ) {
      if (!sortable(list[idx[a]])) {
        a++;
        continue;
      }
      // Hidden layers draw nothing, so they don't split a run.
      let b = a;
      while (b < idx.length && (sortable(list[idx[b]]) || !shown(list[idx[b]]))) b++;
      const run = idx.slice(a, b).filter((i) => sortable(list[i]));
      if (run.length > 1) {
        const cam = this.camera(f);
        const hidden = idx.slice(a, b).filter((i) => !sortable(list[i]));
        const depths = run.map((i, k) => {
          const l = list[i];
          const { ec, lt } = timesOf(f.project, l, f.compT);
          const lb = localBounds(l, lt, ec, f.compT);
          const Hm = homography(cam, worldMatrix(f.project, l, f.compT));
          return { i, k, d: depthAt(Hm, lb.x + lb.w / 2, lb.y + lb.h / 2) };
        });
        depths.sort((p, q) => q.d - p.d || p.k - q.k);
        [...hidden, ...depths.map((r) => r.i)].forEach((i, k) => (idx[a + k] = i));
      }
      a = b;
    }
    return idx;
  }

  private opacityOf(layer: Layer, lt: number, ec: EvalContext) {
    return Math.min(1, Math.max(0, (num(layer, 'opacity', lt, ec) / 100) * (layer.effects.length ? opacityFx(layer, lt, ec) : 1)));
  }

  /**
   * Composites a container's layers (root or a group's children) into ctx;
   * `ct` is the container's clock. At the root, `background` is the comp
   * background already painted into ctx: masks cut it too, so it is put back
   * underneath after each mask.
   */
  private container(f: Frame, list: Layer[], ctx: CanvasRenderingContext2D, ct: number, background: string | null = null) {
    const { project, W, H } = f;
    const order = this.order(f, list, ct);

    let pending: { buf: HTMLCanvasElement; opacity: number; blend: BlendMode } | null = null;
    const composite = (src: HTMLCanvasElement, opacity: number, blend: BlendMode) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = BLEND[blend];
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    };
    const flush = () => {
      if (!pending) return;
      composite(pending.buf, pending.opacity, pending.blend);
      this.pool.release(pending.buf);
      pending = null;
    };
    const nextAboveClips = (k: number) => {
      for (let j = k + 1; j < order.length; j++) {
        const l = list[order[j]];
        if (isMask(l)) return false;
        return l.clip;
      }
      return false;
    };

    for (let k = 0; k < order.length; k++) {
      const layer = list[order[k]];
      const visible = layer.visible && isActive(layer, ct);
      if (isMask(layer)) {
        flush();
        if (visible && this.applyMask(f, layer, ctx) && background) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
        continue;
      }
      if (!visible) {
        if (!layer.clip) flush();
        continue;
      }
      const { ec, lt } = timesOf(project, layer, f.compT);
      const opacity = this.opacityOf(layer, lt, ec);

      if (layer.type === 'adjustment') {
        flush();
        if (opacity <= 0) continue;
        const buf = this.pool.acquire(W, H);
        buf.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
        applyEffects(layer, buf, this.fxContext(f, layer, lt, ec, ctx.canvas));
        composite(buf, opacity, layer.blend);
        this.pool.release(buf);
        continue;
      }

      if (layer.clip) {
        if (!pending || opacity <= 0) continue;
        const buf = this.layerBuffer(f, layer, lt, ec, ctx.canvas);
        const p = pending as { buf: HTMLCanvasElement };
        const pctx = p.buf.getContext('2d')!;
        pctx.save();
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.globalAlpha = opacity;
        pctx.globalCompositeOperation = 'source-atop';
        pctx.drawImage(buf, 0, 0);
        pctx.restore();
        this.pool.release(buf);
        continue;
      }

      flush();
      if (opacity <= 0) continue;
      const needsBuffer =
        nextAboveClips(k) ||
        layer.type === 'group' ||
        is3DLayer(layer) ||
        hasPixelEffects(layer) ||
        (opacity < 1 && (layer.type === 'shape' || layer.type === 'text'));
      if (!needsBuffer) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = BLEND[layer.blend];
        drawContent(ctx, layer, lt, ec, pixelMatrix(project, layer, f.compT, f.s));
        ctx.restore();
        continue;
      }
      pending = { buf: this.layerBuffer(f, layer, lt, ec, ctx.canvas), opacity, blend: layer.blend };
    }
    flush();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** A layer's pixels (content + effects, without opacity/blend) in a pooled frame-sized buffer. */
  private layerBuffer(f: Frame, layer: Layer, lt: number, ec: EvalContext, bg: HTMLCanvasElement | null): HTMLCanvasElement {
    if (is3DLayer(layer)) return this.render3D(f, layer, lt, ec, bg);
    const buf = this.pool.acquire(f.W, f.H);
    if (layer.type === 'group') this.container(f, layer.children ?? [], buf.getContext('2d')!, lt);
    else this.drawLayerFx(buf.getContext('2d')!, f, layer, lt, ec, null);
    // Group bounds are costly, so the effect context is only built when needed.
    if (hasPixelEffects(layer)) applyEffects(layer, buf, this.fxContext(f, layer, lt, ec, bg));
    return buf;
  }

  /** Masks everything drawn so far in the container (returns false when nothing changed). */
  private applyMask(f: Frame, layer: Layer, ctx: CanvasRenderingContext2D): boolean {
    const { ec, lt } = timesOf(f.project, layer, f.compT);
    const opacity = this.opacityOf(layer, lt, ec);
    const mode = layer.maskMode!;
    const inverted = mode === 'alphaInv' || mode === 'lumaInv';
    if (inverted && opacity <= 0) return false;
    const buf = this.layerBuffer(f, layer, lt, ec, ctx.canvas);
    if (mode === 'luma' || mode === 'lumaInv') lumaMatte(buf);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = inverted ? 'destination-out' : 'destination-in';
    ctx.drawImage(buf, 0, 0);
    ctx.restore();
    this.pool.release(buf);
    return true;
  }

  /**
   * 3D layers are drawn flat into a buffer in their own plane (where their
   * effects run), then projected through the camera with a perspective warp.
   */
  private render3D(f: Frame, layer: Layer, lt: number, ec: EvalContext, bg: HTMLCanvasElement | null): HTMLCanvasElement {
    const { project, s, W, H } = f;
    const out = this.pool.acquire(W, H);
    const cam = this.camera(f);
    const Hc = homography(cam, worldMatrix(project, layer, f.compT));
    const lb = localBounds(layer, lt, ec, f.compT);
    const lw = Math.max(1, lb.w);
    const lh = Math.max(1, lb.h);

    // Resolution: local units → buffer pixels, matched to the projected size.
    let k = s;
    const cs = corners(lb).map(([u, v]) => projectLocal(Hc, u, v));
    if (cs.every(Boolean)) {
      const [a, b, c, d] = cs as Vec2[];
      const dist = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      k = s * Math.max(Math.max(dist(a, b), dist(d, c)) / lw, Math.max(dist(a, d), dist(b, c)) / lh);
    }
    k = Math.min(4 * s, Math.max(0.02, k));
    const fxPad = hasPixelEffects(layer) ? Math.max(lw, lh) * 0.15 + 24 : 0;
    const maxDim = Math.min(4096, Math.ceil(2 * Math.max(W, H)));
    let pad = fxPad + 2 / k;
    let bw = (lw + 2 * pad) * k;
    let bh = (lh + 2 * pad) * k;
    const fit = Math.min(1, maxDim / bw, maxDim / bh, Math.sqrt(8e6 / (bw * bh)));
    if (fit < 1) {
      k *= fit;
      pad = fxPad + 2 / k;
      bw = (lw + 2 * pad) * k;
      bh = (lh + 2 * pad) * k;
    }
    const Bw = Math.max(1, Math.ceil(bw));
    const Bh = Math.max(1, Math.ceil(bh));
    const ox = lb.x - pad;
    const oy = lb.y - pad;
    const L = new DOMMatrix([k, 0, 0, k, -k * ox, -k * oy]);

    const src = this.pool.acquire(Bw, Bh);
    this.drawLayerFx(src.getContext('2d')!, f, layer, lt, ec, L);
    if (hasPixelEffects(layer)) applyEffects(layer, src, this.fxContext(f, layer, lt, ec, bg, L, k, [Bw, Bh]));

    // Output pixel → comp → local plane → source pixel.
    const inv = inv3(Hc);
    if (inv) {
      const Lm: Mat3 = [k, 0, -k * ox, 0, k, -k * oy, 0, 0, 1];
      const Sinv: Mat3 = [1 / s, 0, 0, 0, 1 / s, 0, 0, 0, 1];
      const M = mul3(Lm, mul3(inv, Sinv));
      const gl = glfx();
      if (gl) {
        copyInto(out, gl.run(src, W, H, [{ frag: WARP_FRAG, u: { u_inv: glMat3(M), u_src: [Bw, Bh] } }], NO_COMMON));
      } else {
        // Without WebGL: an affine approximation from three projected corners.
        const toOut = (x: number, y: number) => projectLocal(Hc, ox + x / k, oy + y / k);
        const p0 = toOut(0, 0);
        const p1 = toOut(Bw, 0);
        const p2 = toOut(0, Bh);
        if (p0 && p1 && p2) {
          const octx = out.getContext('2d')!;
          octx.setTransform(((p1[0] - p0[0]) / Bw) * s, ((p1[1] - p0[1]) / Bw) * s, ((p2[0] - p0[0]) / Bh) * s, ((p2[1] - p0[1]) / Bh) * s, p0[0] * s, p0[1] * s);
          octx.drawImage(src, 0, 0);
          octx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
    }
    this.pool.release(src);
    return out;
  }

  private fxContext(f: Frame, layer: Layer, lt: number, ec: EvalContext, bg: HTMLCanvasElement | null, m?: DOMMatrix, scale?: number, size?: [number, number]): FxContext {
    const { project, s, W, H } = f;
    return {
      t: lt,
      scale: scale ?? s,
      ec,
      m: m ?? pixelMatrix(project, layer, f.compT, s),
      lb: localBounds(layer, lt, ec, f.compT),
      tempCanvas: () => this.temp(size?.[0] ?? W, size?.[1] ?? H),
      background: () => bg,
      renderRef: (id) => {
        const ref = findLayer(project, id)?.layer;
        if (!ref || ref.id === layer.id || this.refDepth > 0) return null;
        this.refDepth++;
        try {
          const r = timesOf(project, ref, f.compT);
          const buf = this.layerBuffer(f, ref, r.lt, r.ec, null);
          const c = this.refCanvas(W, H);
          c.getContext('2d')!.drawImage(buf, 0, 0);
          this.pool.release(buf);
          return c;
        } finally {
          this.refDepth--;
        }
      },
      refPath: (id) => {
        const ref = findLayer(project, id)?.layer;
        if (!ref || ref.id === layer.id) return null;
        return outlineComp(project, ref, f.compT).map(([x, y]) => [x * s, y * s] as Vec2);
      },
    };
  }

  /**
   * Draws a layer, including Echo Keyframes and per-layer Motion Blur. With
   * `fixed` (3D layers) the layer is drawn in its own plane with that matrix.
   */
  private drawLayerFx(bctx: CanvasRenderingContext2D, f: Frame, layer: Layer, lt: number, ec: EvalContext, fixed: DOMMatrix | null) {
    const { project, s } = f;
    const rf = layer.effects.length ? renderFx(layer, lt, ec) : [];
    const blur = rf.find((r) => r.kind === 'motionBlur');
    const echo = rf.find((r) => r.kind === 'echo');
    const drawAt = (c: CanvasRenderingContext2D, compT: number) => {
      const r = compT === f.compT ? { lt, ec } : timesOf(project, layer, compT);
      drawContent(c, layer, r.lt, r.ec, fixed ?? pixelMatrix(project, layer, compT, s));
    };
    const cw = bctx.canvas.width;
    const ch = bctx.canvas.height;
    const drawMain = (c: CanvasRenderingContext2D, compT: number) => {
      if (!blur) return drawAt(c, compT);
      const n = Math.max(2, Math.min(48, Math.round(blur.ev.n('samples'))));
      const shutter = blur.ev.n('shutter') / 360 / project.fps;
      const acc = this.pool.acquire(cw, ch);
      const tmp = this.pool.acquire(cw, ch);
      const actx = acc.getContext('2d')!;
      const tctx = tmp.getContext('2d')!;
      for (let k = 0; k < n; k++) {
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.clearRect(0, 0, cw, ch);
        drawAt(tctx, compT + (k / (n - 1) - 0.5) * shutter);
        actx.setTransform(1, 0, 0, 1, 0, 0);
        actx.globalAlpha = 1 / (k + 1);
        actx.drawImage(tmp, 0, 0);
      }
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(acc, 0, 0);
      c.restore();
      this.pool.release(acc);
      this.pool.release(tmp);
    };
    if (!echo) return drawMain(bctx, f.compT);
    const n = Math.round(echo.ev.n('count'));
    const delay = echo.ev.n('delay');
    const start = echo.ev.n('start') / 100;
    const decay = echo.ev.n('decay') / 100;
    const behind = echo.ev.o('order') === 0;
    const echoes = () => {
      for (let k = behind ? n : 1; behind ? k >= 1 : k <= n; k += behind ? -1 : 1) {
        const tt = f.compT - k * delay;
        if (timesOf(project, layer, tt).ct < layer.start) continue;
        bctx.save();
        bctx.globalAlpha = start * Math.max(0, 1 - ((k - 1) / Math.max(1, n)) * decay);
        drawMain(bctx, tt);
        bctx.restore();
      }
    };
    if (behind) echoes();
    drawMain(bctx, f.compT);
    if (!behind) echoes();
  }

  private refDepth = 0;
  private refC: HTMLCanvasElement | null = null;
  private refCanvas(w: number, h: number) {
    if (!this.refC) this.refC = document.createElement('canvas');
    const c = this.refC;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    } else {
      const x = c.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, w, h);
    }
    return c;
  }

  /** Releases GPU/canvas memory held by this renderer. */
  dispose() {
    this.pool.dispose();
    if (this.tempC) free(this.tempC);
    if (this.refC) free(this.refC);
    this.tempC = null;
    this.refC = null;
  }

  private tempC: HTMLCanvasElement | null = null;
  private temp(w: number, h: number) {
    if (!this.tempC) this.tempC = document.createElement('canvas');
    const c = this.tempC;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    } else c.getContext('2d')!.clearRect(0, 0, w, h);
    return c;
  }
}

/** Small JPEG preview of a project frame for the project gallery. */
export function thumbnail(project: Project, t: number): string {
  const r = new Renderer();
  const c = document.createElement('canvas');
  const scale = 240 / Math.max(project.width, project.height);
  r.render(project, t, c, { scale });
  const url = c.toDataURL('image/jpeg', 0.75);
  r.dispose();
  free(c);
  return url;
}
