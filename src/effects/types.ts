import type { Layer, PropValue, Vec2 } from '../model/types';
import type { PropDef } from '../model/schema';
import type { Pass, Uniform } from '../engine/gl';

export type { Pass, Uniform };

export type EffectCategory =
  | 'Blur & Sharpen'
  | 'Glow & Light'
  | 'Color'
  | 'Keying & Matte'
  | 'Distort'
  | 'Generate'
  | 'Stylize'
  | 'Tiles & Repeat'
  | 'Transition'
  | '3D & Perspective'
  | 'Motion'
  | 'Text'
  | 'Shape';

export type RGBA = [number, number, number, number];

/** Evaluated parameters and geometry available to an effect at render time. */
export interface FxEval {
  n(key: string): number;
  /** Straight (non-premultiplied) color as 0..1 floats. */
  c(key: string): RGBA;
  v(key: string): Vec2;
  /** Option index (for `options` params). */
  o(key: string): number;
  /** A point given as % of the layer bounds, converted to layer-local pixels. */
  pt(key: string): Vec2;
  ref(key: string): string | undefined;
  /** Comp time (s). */
  t: number;
  /** Time since the layer started (s). */
  local: number;
  /** Layer duration (s). */
  dur: number;
  fps: number;
  /** Render scale (preview quality / export size). */
  scale: number;
  /** Buffer size in pixels. */
  w: number;
  h: number;
  /** Layer content bounds in local pixels. */
  lb: { x: number; y: number; w: number; h: number };
  /** Buffer pixels per local pixel. */
  lpx: number;
  seed: number;
  /** Local point -> buffer pixel (top-left origin). */
  toBuf(p: Vec2): Vec2;
  layer: Layer;
}

/** Extra context for effects that composite with the 2D canvas. */
export interface FxApply extends FxEval {
  buf: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Local -> buffer matrix (includes render scale). */
  m: DOMMatrix;
  temp(): HTMLCanvasElement;
  /** Runs shader passes with the current buffer as input; result replaces the buffer. */
  shade(passes: Pass[], aux?: CanvasImageSource | null): void;
  /** Polyline (buffer px) of a referenced shape layer's outline. */
  refPath(key: string): Vec2[] | null;
  /** The composite of everything below this layer. */
  background(): HTMLCanvasElement | null;
}

export interface TransformOut {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  /** Absolute position override in the layer's parent space. */
  pos?: Vec2;
}

export interface TextMod {
  text?: string;
  reveal?: number;
  unit?: 'char' | 'word' | 'line';
  tracking?: number;
  random?: { amount: number; speed: number };
  /** Per-glyph transform for glyph i of n (0..1 position). */
  glyph?: (index: number, count: number) => { dx: number; dy: number; rot: number; scale: number; alpha: number };
}

export interface ShapeMod {
  strokeColor?: string;
  strokeWidth?: number;
  /** Width multipliers at start, end and middle of the path. */
  taper?: [number, number, number];
  /** Reveal [start, end] as 0..1 of the path length. */
  progress?: [number, number];
}

export interface EffectSpec {
  type: string;
  label: string;
  category: EffectCategory;
  description: string;
  props: PropDef[];
  /** Layer references (by key), e.g. a displacement map or a path. */
  refs?: { key: string; label: string; hint?: string }[];
  /** Shader passes (pixel effect). */
  passes?: (e: FxEval) => Pass[];
  /** Which texture to bind as u_aux. */
  aux?: 'background' | { ref: string };
  /** 2D/canvas implementation (pixel effect). */
  apply?: (a: FxApply) => void;
  /** Changes the layer transform. */
  transform?: (e: FxEval, out: TransformOut) => void;
  /** Multiplies layer opacity. */
  opacity?: (e: FxEval) => number;
  /** Remaps the time the layer is evaluated at. */
  time?: (e: FxEval) => number;
  /** Draws the layer several times (motion blur, echoes). */
  render?: 'motionBlur' | 'echo';
  /** Shape stroke overrides. */
  shape?: (e: FxEval) => ShapeMod;
  /** Text overrides (text layers). */
  text?: (e: FxEval, text: string) => TextMod;
}

/* ---------------- param builders ---------------- */

export const num = (key: string, label: string, def: number, min?: number, max?: number, extra: Partial<PropDef> = {}): PropDef => ({
  key,
  label,
  kind: 'number',
  def,
  min,
  max,
  slider: min !== undefined && max !== undefined,
  ...extra,
});
export const pct = (key: string, label: string, def: number, min = 0, max = 100) => num(key, label, def, min, max, { unit: '%' });
export const ang = (key: string, label: string, def: number) => num(key, label, def, undefined, undefined, { unit: '°' });
export const px = (key: string, label: string, def: number, max = 500) => num(key, label, def, 0, max, { unit: 'px' });
export const col = (key: string, label: string, def: string): PropDef => ({ key, label, kind: 'color', def });
/** Point as % of the layer bounds (50,50 = layer center). */
export const point = (key: string, label: string, def: [number, number] = [50, 50]): PropDef => ({ key, label, kind: 'vec2', def, unit: '%' });
export const vec = (key: string, label: string, def: [number, number], unit = 'px'): PropDef => ({ key, label, kind: 'vec2', def, unit });
export const opt = (key: string, label: string, options: string[], def = 0): PropDef => ({ key, label, kind: 'number', def, options, step: 1, min: 0, max: options.length - 1 });
export const mix = (def = 100) => pct('mix', 'Blend with original', def);

export const DEG = Math.PI / 180;

/** Waveform helper shared by motion effects: 0 sine, 1 triangle, 2 square, 3 sawtooth. */
export function wave(kind: number, x: number): number {
  const f = x - Math.floor(x);
  switch (kind) {
    case 1:
      return 1 - 4 * Math.abs(f - 0.5);
    case 2:
      return f < 0.5 ? 1 : -1;
    case 3:
      return f * 2 - 1;
    default:
      return Math.sin(x * Math.PI * 2);
  }
}
export const WAVES = ['Sine', 'Triangle', 'Square', 'Sawtooth'];

export type { PropValue };
