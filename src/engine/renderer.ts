import type { BlendMode, Layer, Project } from '../model/types';
import { col, num, vec, type EvalContext } from '../model/animate';
import { applyEffects, hasPixelEffects, type FxContext } from './effects';
import { media } from './media';
import { buildShape, type Rect } from './shapes';
import { drawText, layoutText } from './text';
import { isActive, worldMatrix } from './transform';

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

/** Draws one layer's own content (no opacity/blend/effects) with its world transform. */
function drawLayer(ctx: CanvasRenderingContext2D, project: Project, layer: Layer, t: number, s: number, ec: EvalContext) {
  const m = worldMatrix(project, layer, t);
  ctx.setTransform(s * m.a, s * m.b, s * m.c, s * m.d, s * m.e, s * m.f);
  switch (layer.type) {
    case 'shape': {
      const [w, h] = vec(layer, 'size', t, ec);
      const kind = layer.shape ?? 'rect';
      const geom = buildShape({
        kind,
        w,
        h,
        radius: num(layer, 'radius', t, ec),
        sides: num(layer, 'sides', t, ec),
        inner: num(layer, 'inner', t, ec),
        points: layer.points,
        closed: layer.closed,
      });
      if (layer.fillOn) {
        ctx.fillStyle = fillStyle(ctx, layer, geom.bounds, t, ec);
        ctx.fill(geom.path);
      }
      const sw = num(layer, 'strokeWidth', t, ec);
      if (layer.strokeOn && sw > 0) {
        ctx.lineWidth = sw;
        ctx.strokeStyle = col(layer, 'strokeColor', t, ec);
        ctx.lineJoin = kind === 'path' || kind === 'ellipse' ? 'round' : 'miter';
        ctx.lineCap = kind === 'path' ? 'round' : 'butt';
        const ts = num(layer, 'trimStart', t, ec);
        const te = num(layer, 'trimEnd', t, ec);
        const off = num(layer, 'trimOffset', t, ec);
        const total = geom.length;
        let draw = true;
        if ((ts > 0 || te < 100 || off !== 0) && total > 0) {
          const a = Math.max(0, Math.min(ts, te)) / 100;
          const b = Math.min(100, Math.max(ts, te)) / 100;
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
      break;
    }
    case 'text': {
      const fs = num(layer, 'fontSize', t, ec);
      const layout = layoutText(layer, fs, num(layer, 'tracking', t, ec), num(layer, 'lineHeight', t, ec));
      drawText(ctx, layer, layout, {
        fill: layer.fillOn ? fillStyle(ctx, layer, layout.bounds, t, ec) : null,
        stroke: layer.strokeOn ? col(layer, 'strokeColor', t, ec) : null,
        strokeWidth: num(layer, 'strokeWidth', t, ec),
        reveal: num(layer, 'reveal', t, ec),
        waveAmp: num(layer, 'waveAmp', t, ec),
        waveFreq: num(layer, 'waveFreq', t, ec),
        time: t,
        fontSize: fs,
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
    const fx = (ec: EvalContext): FxContext => ({ t, scale: s, ec, tempCanvas: () => this.temp(W, H) });

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
      const opacity = Math.min(1, Math.max(0, num(layer, 'opacity', t, ec) / 100));

      if (layer.type === 'adjustment') {
        flush();
        if (opacity <= 0) continue;
        const buf = this.pool.acquire(W, H);
        const bctx = buf.getContext('2d')!;
        bctx.drawImage(ctx.canvas, 0, 0);
        applyEffects(layer, buf, fx(ec));
        composite(buf, opacity, layer.blend);
        this.pool.release(buf);
        continue;
      }

      if (layer.clip) {
        if (!pending || opacity <= 0) continue;
        const buf = this.pool.acquire(W, H);
        const bctx = buf.getContext('2d')!;
        drawLayer(bctx, project, layer, t, s, ec);
        applyEffects(layer, buf, fx(ec));
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
        drawLayer(ctx, project, layer, t, s, ec);
        ctx.restore();
        continue;
      }
      const buf = this.pool.acquire(W, H);
      drawLayer(buf.getContext('2d')!, project, layer, t, s, ec);
      applyEffects(layer, buf, fx(ec));
      pending = { buf, opacity, blend: layer.blend };
    }
    flush();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Releases GPU/canvas memory held by this renderer. */
  dispose() {
    this.pool.dispose();
    if (this.tempC) free(this.tempC);
    this.tempC = null;
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
