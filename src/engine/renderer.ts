import type { BlendMode, Layer, Project, Vec2 } from '../model/types';
import { col, num, type EvalContext } from '../model/animate';
import { applyEffects, hasPixelEffects, layerTimeFx, opacityFx, renderFx, shapeFx, textFx, type FxContext } from './effects';
import { media } from './media';
import { buildShape, outlinePoints, type Rect } from './shapes';
import { drawText, layoutText } from './text';
import { isActive, localBounds, outlineComp, shapeParams, worldMatrix } from './transform';

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

/** Draws one layer's own content (no opacity/blend/effects) with its world transform. */
function drawLayer(ctx: CanvasRenderingContext2D, project: Project, layer: Layer, t: number, s: number, ec: EvalContext) {
  const m = worldMatrix(project, layer, t);
  ctx.setTransform(s * m.a, s * m.b, s * m.c, s * m.d, s * m.e, s * m.f);
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

const isDrawable = (l: Layer) => l.type !== 'audio' && l.type !== 'null';

export class Renderer {
  private pool = new CanvasPool();

  /** Renders the comp at time t into `out` (resized to width*scale x height*scale). */
  render(project: Project, t: number, out: HTMLCanvasElement, opts: RenderOpts) {
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
    const s = opts.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (!opts.transparent) {
      ctx.fillStyle = project.background;
      ctx.fillRect(0, 0, W, H);
    }
    const layers = project.layers;
    const fx = (layer: Layer, lt: number, ec: EvalContext) => this.fxContext(project, layer, lt, ec, W, H, s, ctx);

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
    const nextAboveClips = (i: number) => {
      for (let j = i - 1; j >= 0; j--) if (isDrawable(layers[j])) return layers[j].clip;
      return false;
    };

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!isDrawable(layer)) continue;
      const visible = layer.visible && isActive(layer, t);
      if (!visible) {
        if (!layer.clip) flush();
        continue;
      }
      const ec: EvalContext = { project, index: i + 1 };
      const lt = layer.effects.length ? layerTimeFx(layer, t, ec) : t;
      const opacity = Math.min(1, Math.max(0, (num(layer, 'opacity', lt, ec) / 100) * (layer.effects.length ? opacityFx(layer, lt, ec) : 1)));

      if (layer.type === 'adjustment') {
        flush();
        if (opacity <= 0) continue;
        const buf = this.pool.acquire(W, H);
        const bctx = buf.getContext('2d')!;
        bctx.drawImage(ctx.canvas, 0, 0);
        applyEffects(layer, buf, fx(layer, lt, ec));
        composite(buf, opacity, layer.blend);
        this.pool.release(buf);
        continue;
      }

      if (layer.clip) {
        if (!pending || opacity <= 0) continue;
        const buf = this.pool.acquire(W, H);
        this.drawLayerFx(buf.getContext('2d')!, project, layer, lt, s, ec, W, H);
        applyEffects(layer, buf, fx(layer, lt, ec));
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
        nextAboveClips(i) || hasPixelEffects(layer) || (opacity < 1 && (layer.type === 'shape' || layer.type === 'text'));
      if (!needsBuffer) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = BLEND[layer.blend];
        drawLayer(ctx, project, layer, lt, s, ec);
        ctx.restore();
        continue;
      }
      const buf = this.pool.acquire(W, H);
      this.drawLayerFx(buf.getContext('2d')!, project, layer, lt, s, ec, W, H);
      applyEffects(layer, buf, fx(layer, lt, ec));
      pending = { buf, opacity, blend: layer.blend };
    }
    flush();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private fxContext(project: Project, layer: Layer, t: number, ec: EvalContext, W: number, H: number, s: number, main: CanvasRenderingContext2D): FxContext {
    const m = new DOMMatrix([s, 0, 0, s, 0, 0]).multiply(worldMatrix(project, layer, t));
    return {
      t,
      scale: s,
      ec,
      m,
      lb: localBounds(layer, t, ec),
      tempCanvas: () => this.temp(W, H),
      background: () => main.canvas,
      renderRef: (id) => {
        const ref = project.layers.find((l) => l.id === id);
        if (!ref || ref.id === layer.id || this.refDepth > 0) return null;
        this.refDepth++;
        try {
          const c = this.refCanvas(W, H);
          const rctx = c.getContext('2d')!;
          const rec: EvalContext = { project, index: project.layers.indexOf(ref) + 1 };
          rctx.save();
          drawLayer(rctx, project, ref, t, s, rec);
          rctx.restore();
          applyEffects(ref, c, this.fxContext(project, ref, t, rec, W, H, s, main));
          return c;
        } finally {
          this.refDepth--;
        }
      },
      refPath: (id) => {
        const ref = project.layers.find((l) => l.id === id);
        if (!ref || ref.id === layer.id) return null;
        return outlineComp(project, ref, t).map(([x, y]) => [x * s, y * s] as Vec2);
      },
    };
  }

  /** Draws a layer, including Echo Keyframes and per-layer Motion Blur. */
  private drawLayerFx(bctx: CanvasRenderingContext2D, project: Project, layer: Layer, t: number, s: number, ec: EvalContext, W: number, H: number) {
    const rf = layer.effects.length ? renderFx(layer, t, ec) : [];
    const blur = rf.find((r) => r.kind === 'motionBlur');
    const echo = rf.find((r) => r.kind === 'echo');
    const drawMain = (c: CanvasRenderingContext2D, tt: number) => {
      if (!blur) return drawLayer(c, project, layer, tt, s, ec);
      const n = Math.max(2, Math.min(48, Math.round(blur.ev.n('samples'))));
      const shutter = blur.ev.n('shutter') / 360 / project.fps;
      const acc = this.pool.acquire(W, H);
      const tmp = this.pool.acquire(W, H);
      const actx = acc.getContext('2d')!;
      const tctx = tmp.getContext('2d')!;
      for (let k = 0; k < n; k++) {
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.clearRect(0, 0, W, H);
        drawLayer(tctx, project, layer, Math.max(layer.start, tt + (k / (n - 1) - 0.5) * shutter), s, ec);
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
    if (!echo) return drawMain(bctx, t);
    const n = Math.round(echo.ev.n('count'));
    const delay = echo.ev.n('delay');
    const start = echo.ev.n('start') / 100;
    const decay = echo.ev.n('decay') / 100;
    const behind = echo.ev.o('order') === 0;
    const echoes = () => {
      for (let k = behind ? n : 1; behind ? k >= 1 : k <= n; k += behind ? -1 : 1) {
        const tt = t - k * delay;
        if (tt < layer.start) continue;
        bctx.save();
        bctx.globalAlpha = start * Math.max(0, 1 - ((k - 1) / Math.max(1, n)) * decay);
        drawMain(bctx, tt);
        bctx.restore();
      }
    };
    if (behind) echoes();
    drawMain(bctx, t);
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
