import type { EffectCategory, EffectSpec } from './types';
import { BLUR_EFFECTS } from './blur';
import { GLOW_EFFECTS } from './glow';
import { COLOR_EFFECTS } from './color';
import { KEYING_EFFECTS } from './keying';
import { DISTORT_EFFECTS } from './distort';
import { GENERATE_EFFECTS } from './generate';
import { STYLIZE_EFFECTS } from './stylize';
import { THREE_EFFECTS } from './three';
import { TILE_EFFECTS } from './tiles';
import { TRANSITION_EFFECTS } from './transition';
import { MOTION_EFFECTS, SHAPE_EFFECTS, TEXT_EFFECTS } from './motion';

export type { EffectCategory, EffectSpec } from './types';

export const EFFECT_SPECS: EffectSpec[] = [
  ...BLUR_EFFECTS,
  ...GLOW_EFFECTS,
  ...COLOR_EFFECTS,
  ...KEYING_EFFECTS,
  ...DISTORT_EFFECTS,
  ...GENERATE_EFFECTS,
  ...STYLIZE_EFFECTS,
  ...TILE_EFFECTS,
  ...TRANSITION_EFFECTS,
  ...THREE_EFFECTS,
  ...MOTION_EFFECTS,
  ...TEXT_EFFECTS,
  ...SHAPE_EFFECTS,
];

export const SPEC: Record<string, EffectSpec> = Object.fromEntries(EFFECT_SPECS.map((s) => [s.type, s]));

export const CATEGORIES: EffectCategory[] = [
  'Blur & Sharpen',
  'Glow & Light',
  'Color',
  'Keying & Matte',
  'Distort',
  'Generate',
  'Stylize',
  'Tiles & Repeat',
  'Transition',
  '3D & Perspective',
  'Motion',
  'Text',
  'Shape',
];

/** Effects that change pixels (rendered through the effect pipeline). */
export const isPixelEffect = (s: EffectSpec | undefined) => !!s && (!!s.passes || !!s.apply);
