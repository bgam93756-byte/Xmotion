import type { Effect, Layer, Vec2 } from '../model/types';
import { col, num, vec, type EvalContext } from '../model/animate';
import { rgbaFloat } from '../model/color';
import { seedFromString } from '../model/noise';
import { SPEC, isPixelEffect } from '../effects';
import type { FxApply, FxEval, ShapeMod, TextMod, TransformOut } from '../effects/types';
import { glfx, type Common, type Pass } from './gl';
import type { Rect } from './shapes';

export interface FxContext {
  t: number;
  /** Render scale (preview quality); pixel-sized parameters are multiplied by it. */
  scale: number;
  ec: EvalContext;
  /** Local -> buffer pixels. */
  m: DOMMatrix;
  /** Layer content bounds in local pixels. */
  lb: Rect;
  tempCanvas: () => HTMLCanvasElement;
  /** The composite of everything below this layer. */
  background: () => HTMLCanvasElement | null;
  /** Renders another layer (by id) into a buffer-sized canvas. */
  renderRef: (layerId: string) => HTMLCanvasElement | null;
  /** Outline of another (shape) layer in buffer pixels. */
  refPath: (layerId: string) => Vec2[] | null;
}

const IDENTITY = new DOMMatrix();
const NO_BOUNDS: Rect = { x: -50, y: -50, w: 100, h: 100 };

export const enabledFx = (layer: Layer) => layer.effects.filter((e) => e.enabled && SPEC[e.type]);

/** Evaluated parameters for one effect instance. */
export function makeEval(layer: Layer, e: Effect, t: number, ec: EvalContext, scale = 1, m: DOMMatrix = IDENTITY, lb: Rect = NO_BOUNDS, w = 0, h = 0): FxEval {
  const P = (k: string) => `fx.${e.id}.${k}`;
  const n = (k: string) => num(layer, P(k), t, ec);
  const v = (k: string) => vec(layer, P(k), t, ec);
  return {
    n,
    c: (k) => rgbaFloat(col(layer, P(k), t, ec)),
    v,
    o: (k) => Math.round(n(k)),
    pt: (k) => {
      const [x, y] = v(k);
      return [lb.x + (x / 100) * lb.w, lb.y + (y / 100) * lb.h];
    },
    ref: (k) => {
      const id = e.refs?.[k];
      return id && ec.project.layers.some((l) => l.id === id) ? id : undefined;
    },
    t,
    local: t - layer.start,
    dur: layer.end - layer.start,
    fps: ec.project.fps,
    scale,
    w,
    h,
    lb,
    lpx: Math.hypot(m.a, m.b) || 1,
    seed: seedFromString(e.id),
    toBuf: ([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f],
    layer,
  };
}

const mat3 = (m: DOMMatrix) => new Float32Array([m.a, m.b, 0, m.c, m.d, 0, m.e, m.f, 1]);

function replace(buf: HTMLCanvasElement, src: CanvasImageSource) {
  const ctx = buf.getContext('2d')!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

const supportsFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/** Without WebGL only blur and basic color can be approximated with canvas filters. */
function cssFallback(e: Effect, ev: FxEval, buf: HTMLCanvasElement, temp: HTMLCanvasElement) {
  if (!supportsFilter) return;
  let filter = '';
  if (e.type === 'blur') filter = `blur(${ev.n('amount') * 0.6 * ev.scale}px)`;
  if (e.type === 'brightnessContrast') filter = `brightness(${1 + ev.n('brightness') / 200}) contrast(${1 + ev.n('contrast') / 100})`;
  if (e.type === 'hueShift') filter = `hue-rotate(${ev.n('hue')}deg)`;
  if (e.type === 'invert') filter = `invert(${ev.n('amount')}%)`;
  if (!filter) return;
  const tctx = temp.getContext('2d')!;
  tctx.clearRect(0, 0, temp.width, temp.height);
  tctx.filter = filter;
  tctx.drawImage(buf, 0, 0);
  tctx.filter = 'none';
  replace(buf, temp);
}

const failed = new Set<string>();

/** Applies a layer's pixel effects to its buffer, in order. */
export function applyEffects(layer: Layer, buf: HTMLCanvasElement, fx: FxContext) {
  const list = enabledFx(layer).filter((e) => isPixelEffect(SPEC[e.type]));
  const overlays = layer.type === 'text' ? [] : enabledFx(layer).filter((e) => e.type === 'countUpDown' || e.type === 'timecode');
  if (!list.length && !overlays.length) return;
  const gl = glfx();
  const w = buf.width;
  const h = buf.height;
  const inv = fx.m.inverse();
  const common: Common = {
    time: fx.t,
    ltime: fx.t - layer.start,
    scale: fx.scale,
    seed: 0,
    toLocal: mat3(Number.isNaN(inv.a) ? IDENTITY : inv),
    toBuf: mat3(fx.m),
    lb: [fx.lb.x, fx.lb.y, Math.max(1, fx.lb.w), Math.max(1, fx.lb.h)],
  };

  for (const e of list) {
    const spec = SPEC[e.type];
    const ev = makeEval(layer, e, fx.t, fx.ec, fx.scale, fx.m, fx.lb, w, h);
    common.seed = ev.seed % 1000;
    const aux = () => {
      if (spec.aux === 'background') return fx.background();
      if (spec.aux && typeof spec.aux === 'object') {
        const id = ev.ref(spec.aux.ref);
        return id ? fx.renderRef(id) : null;
      }
      return null;
    };
    try {
      if (spec.apply) {
        const a: FxApply = {
          ...ev,
          buf,
          ctx: buf.getContext('2d')!,
          m: fx.m,
          temp: fx.tempCanvas,
          shade: (passes: Pass[], auxSrc?: CanvasImageSource | null) => {
            if (gl) replace(buf, gl.run(buf, w, h, passes, common, (auxSrc as TexImageSource) ?? null));
          },
          refPath: (k) => {
            const id = ev.ref(k);
            return id ? fx.refPath(id) : null;
          },
          background: fx.background,
        };
        spec.apply(a);
        continue;
      }
      if (!gl) {
        cssFallback(e, ev, buf, fx.tempCanvas());
        continue;
      }
      const passes = spec.passes!(ev);
      if (passes.length) replace(buf, gl.run(buf, w, h, passes, common, aux() as TexImageSource | null));
    } catch (err) {
      if (!failed.has(e.type)) {
        failed.add(e.type);
        console.error(`Effect "${spec.label}" failed:`, err);
      }
    }
  }

  // Count Up/Down and Timecode draw a number on non-text layers.
  for (const e of overlays) {
    const ev = makeEval(layer, e, fx.t, fx.ec, fx.scale, fx.m, fx.lb, w, h);
    const text = SPEC[e.type].text!(ev, '#').text ?? '';
    const ctx = buf.getContext('2d')!;
    const [cx, cy] = ev.toBuf([fx.lb.x + fx.lb.w / 2, fx.lb.y + fx.lb.h / 2]);
    const size = Math.max(8, Math.min(fx.lb.w, fx.lb.h) * 0.22 * ev.lpx);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }
}

export function hasPixelEffects(layer: Layer) {
  return layer.effects.some((e) => e.enabled && (isPixelEffect(SPEC[e.type]) || SPEC[e.type]?.render || (layer.type !== 'text' && (e.type === 'countUpDown' || e.type === 'timecode'))));
}

/* ---------------- non-pixel effect kinds ---------------- */

export function transformFx(layer: Layer, t: number, ec: EvalContext): TransformOut {
  const out: TransformOut = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };
  for (const e of layer.effects) {
    if (!e.enabled) continue;
    const spec = SPEC[e.type];
    if (spec?.transform && e.type !== 'moveAlongPath') spec.transform(makeEval(layer, e, t, ec), out);
  }
  return out;
}

export function opacityFx(layer: Layer, t: number, ec: EvalContext): number {
  let k = 1;
  for (const e of layer.effects) {
    if (!e.enabled) continue;
    const spec = SPEC[e.type];
    if (spec?.opacity) k *= Math.min(1, Math.max(0, spec.opacity(makeEval(layer, e, t, ec))));
  }
  return k;
}

/** The time a layer should be evaluated at (Time Quantization). */
export function layerTimeFx(layer: Layer, t: number, ec: EvalContext): number {
  for (const e of layer.effects) {
    if (!e.enabled) continue;
    const spec = SPEC[e.type];
    if (spec?.time) return spec.time(makeEval(layer, e, t, ec));
  }
  return t;
}

export function shapeFx(layer: Layer, t: number, ec: EvalContext): ShapeMod {
  const out: ShapeMod = {};
  for (const e of layer.effects) {
    if (!e.enabled) continue;
    const spec = SPEC[e.type];
    if (spec?.shape) Object.assign(out, spec.shape(makeEval(layer, e, t, ec)));
  }
  return out;
}

export function textFx(layer: Layer, t: number, ec: EvalContext): TextMod {
  const out: TextMod = {};
  let text = layer.text ?? '';
  for (const e of layer.effects) {
    if (!e.enabled) continue;
    const spec = SPEC[e.type];
    if (!spec?.text) continue;
    const r = spec.text(makeEval(layer, e, t, ec), text);
    if (r.text !== undefined) text = r.text;
    if (r.tracking !== undefined) out.tracking = (out.tracking ?? 0) + r.tracking;
    if (r.reveal !== undefined) out.reveal = Math.min(out.reveal ?? 100, r.reveal);
    if (r.unit) out.unit = r.unit;
    if (r.random) out.random = r.random;
    if (r.glyph) {
      const prev = out.glyph;
      out.glyph = prev
        ? (i, n) => {
            const a = prev(i, n);
            const b = r.glyph!(i, n);
            return { dx: a.dx + b.dx, dy: a.dy + b.dy, rot: a.rot + b.rot, scale: a.scale * b.scale, alpha: a.alpha * b.alpha };
          }
        : r.glyph;
    }
  }
  if (text !== (layer.text ?? '')) out.text = text;
  return out;
}

export interface RenderFx {
  kind: 'motionBlur' | 'echo';
  ev: FxEval;
}

export function renderFx(layer: Layer, t: number, ec: EvalContext): RenderFx[] {
  const out: RenderFx[] = [];
  for (const e of layer.effects) {
    if (!e.enabled) continue;
    const spec = SPEC[e.type];
    if (spec?.render) out.push({ kind: spec.render, ev: makeEval(layer, e, t, ec) });
  }
  return out;
}
