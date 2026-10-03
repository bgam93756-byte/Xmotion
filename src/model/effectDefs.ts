/**
 * Effect metadata (labels, categories, parameters). The implementations live
 * next to the metadata in src/effects/*, one file per category.
 */
import { EFFECT_SPECS, SPEC } from '../effects';
import type { EffectSpec } from '../effects';

export type EffectDef = EffectSpec;
export type { EffectCategory } from '../effects';

export const EFFECT_DEFS: Record<string, EffectDef> = SPEC;
export const EFFECT_LIST: EffectDef[] = EFFECT_SPECS;
