import type { Keyframe, Layer, Project, Prop, PropValue, Vec2 } from './types';
import { applyEase } from './easing';
import { lerpColor } from './color';
import { compileExpr, type EValue, type ExprEnv } from './expr';
import { seedFromString } from './noise';
import { getProp } from './schema';

export function interpolate(a: PropValue, b: PropValue, k: number): PropValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  if (typeof a === 'string' && typeof b === 'string') return lerpColor(a, b, k);
  if (Array.isArray(a) && Array.isArray(b)) return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return k < 1 ? a : b;
}

/** Value of a keyframed property at a time relative to the layer start. */
export function keyedValue(prop: Prop, localT: number): PropValue {
  const keys = prop.keys;
  if (!keys || keys.length === 0) return prop.value;
  if (localT <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (localT >= last.t) return last.v;
  // Binary search for the segment containing localT.
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= localT) lo = mid;
    else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  const span = b.t - a.t;
  const x = span <= 0 ? 1 : (localT - a.t) / span;
  return interpolate(a.v, b.v, applyEase(a.ease, x, a.bez));
}

export interface EvalContext {
  project: Project;
  /** Layer index from the top (for `index` in expressions). */
  index: number;
}

const toPropValue = (v: EValue, like: PropValue): PropValue => {
  if (Array.isArray(like)) {
    if (typeof v === 'number') return [v, v];
    return [Number.isFinite(v[0]) ? v[0] : like[0], Number.isFinite(v[1]) ? v[1] : like[1]] as Vec2;
  }
  if (typeof like === 'number') {
    const n = typeof v === 'number' ? v : v[0];
    return Number.isFinite(n) ? n : like;
  }
  return like;
};

/** Evaluates a property (keyframes + optional expression) at comp time `t`. */
export function evalPropAt(layer: Layer, path: string, t: number, ctx: EvalContext): PropValue {
  const prop = getProp(layer, path);
  const base = keyedValue(prop, t - layer.start);
  if (!prop.expr || typeof base === 'string') return base;
  try {
    const fn = compileExpr(prop.expr);
    const keys = prop.keys;
    const env: ExprEnv = {
      time: t,
      frame: Math.floor(t * ctx.project.fps + 1e-6),
      fps: ctx.project.fps,
      value: base as EValue,
      index: ctx.index,
      width: ctx.project.width,
      height: ctx.project.height,
      inPoint: layer.start,
      outPoint: layer.end,
      duration: ctx.project.duration,
      seed: seedFromString(layer.id + path),
      valueAt: (tt) => keyedValue(prop, tt - layer.start) as EValue,
      keyRange: keys && keys.length > 1 ? [keys[0].t + layer.start, keys[keys.length - 1].t + layer.start] : null,
    };
    return toPropValue(fn(env), base);
  } catch {
    return base;
  }
}

export function num(layer: Layer, path: string, t: number, ctx: EvalContext): number {
  const v = evalPropAt(layer, path, t, ctx);
  return typeof v === 'number' ? v : 0;
}

export function vec(layer: Layer, path: string, t: number, ctx: EvalContext): Vec2 {
  const v = evalPropAt(layer, path, t, ctx);
  return Array.isArray(v) ? v : [0, 0];
}

export function col(layer: Layer, path: string, t: number, ctx: EvalContext): string {
  const v = evalPropAt(layer, path, t, ctx);
  return typeof v === 'string' ? v : '#000000';
}

export function isAnimated(prop: Prop | undefined): boolean {
  return !!prop && ((prop.keys?.length ?? 0) > 0 || !!prop.expr);
}

/** Keyframe at (approximately) a local time, within half a frame. */
export function keyAt(prop: Prop, localT: number, fps: number): Keyframe | undefined {
  const tol = 0.5 / fps;
  return prop.keys?.find((k) => Math.abs(k.t - localT) < tol);
}

export function sortKeys(prop: Prop) {
  prop.keys?.sort((a, b) => a.t - b.t);
}
