export type Vec2 = [number, number];
/** CSS hex color: #rrggbb or #rrggbbaa */
export type Color = string;
export type PropValue = number | Vec2 | Color;

export type EaseName =
  | 'linear'
  | 'hold'
  | 'ease'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backIn'
  | 'backOut'
  | 'elastic'
  | 'bounce'
  | 'custom';

export type Bezier = [number, number, number, number];

export interface Keyframe<T extends PropValue = PropValue> {
  id: string;
  /** Seconds, relative to the layer's start so keys travel with the clip. */
  t: number;
  v: T;
  /** Interpolation from this keyframe towards the next one. */
  ease: EaseName;
  bez?: Bezier;
}

export interface Prop<T extends PropValue = PropValue> {
  value: T;
  /** Sorted by `t`. Present (non-empty) means the property is animated. */
  keys?: Keyframe<T>[];
  /** Optional expression evaluated on top of the keyframed value. */
  expr?: string;
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'add';

export type LayerType = 'shape' | 'text' | 'image' | 'video' | 'audio' | 'null' | 'adjustment';
export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'path';
export type FillType = 'solid' | 'linear' | 'radial';
export type TextAnimator = 'none' | 'typewriter' | 'fade' | 'pop' | 'slideUp' | 'drop' | 'scramble' | 'blurIn';
export type TextAnimUnit = 'char' | 'word' | 'line';

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, Prop>;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  /** Comp time (seconds) where the layer appears / disappears. */
  start: number;
  end: number;
  visible: boolean;
  locked: boolean;
  blend: BlendMode;
  /** Clipping mask: only draw where the layer below is opaque. */
  clip: boolean;
  parent?: string | null;
  /** Timeline label color. */
  label?: string;
  props: Record<string, Prop>;
  effects: Effect[];

  // shape
  shape?: ShapeKind;
  fillOn?: boolean;
  fillType?: FillType;
  strokeOn?: boolean;
  points?: Vec2[];
  closed?: boolean;

  // text
  text?: string;
  font?: string;
  weight?: number;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  animator?: TextAnimator;
  animUnit?: TextAnimUnit;

  // media
  asset?: string;
  /** Seconds into the source media where the clip begins. */
  trimIn?: number;
  speed?: number;
  volume?: number;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export type AssetKind = 'image' | 'video' | 'audio' | 'font';

export interface AssetMeta {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  width?: number;
  height?: number;
  duration?: number;
  fontFamily?: string;
}

export interface MotionBlur {
  on: boolean;
  samples: number;
  /** Shutter as a fraction of a frame (0.5 = 180°). */
  shutter: number;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: Color;
  /** Index 0 is the top-most layer. */
  layers: Layer[];
  assets: AssetMeta[];
  motionBlur: MotionBlur;
  created: number;
  modified: number;
}
