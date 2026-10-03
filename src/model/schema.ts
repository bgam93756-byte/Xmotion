import type { Effect, Layer, LayerType, Project, Prop, PropValue, ShapeKind, Vec2 } from './types';
import { uid } from './ids';
import { EFFECT_DEFS } from './effectDefs';

export type PropKind = 'number' | 'vec2' | 'color';

export interface PropDef {
  key: string;
  label: string;
  kind: PropKind;
  def: PropValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Show a slider (only for bounded numbers). */
  slider?: boolean;
  /** Discrete choices: the value is the option index. */
  options?: string[];
}

export interface PropSection {
  title: string;
  defs: PropDef[];
}

const P = (key: string, label: string, kind: PropKind, def: PropValue, extra: Partial<PropDef> = {}): PropDef => ({
  key,
  label,
  kind,
  def,
  ...extra,
});

export const TRANSFORM_DEFS: PropDef[] = [
  P('position', 'Position', 'vec2', [0, 0], { step: 1 }),
  P('scale', 'Scale', 'vec2', [100, 100], { unit: '%', step: 1 }),
  P('rotation', 'Rotation', 'number', 0, { unit: '°', step: 1 }),
  P('opacity', 'Opacity', 'number', 100, { min: 0, max: 100, unit: '%', slider: true }),
  P('anchor', 'Anchor', 'vec2', [0, 0], { step: 1 }),
];

const OPACITY_DEF = TRANSFORM_DEFS[3];

const SIZE = P('size', 'Size', 'vec2', [300, 300], { min: 0, step: 1 });
const ROUND = P('radius', 'Roundness', 'number', 0, { min: 0, max: 500, step: 1 });
const SIDES = P('sides', 'Sides', 'number', 5, { min: 3, max: 40, step: 1, slider: true });
const INNER = P('inner', 'Inner radius', 'number', 45, { min: 1, max: 100, unit: '%', slider: true });

export const FILL_DEFS: PropDef[] = [
  P('fill', 'Fill', 'color', '#7c5cff'),
  P('fill2', 'Gradient end', 'color', '#ff5c8a'),
  P('gradAngle', 'Gradient angle', 'number', 90, { unit: '°' }),
];

export const STROKE_DEFS: PropDef[] = [
  P('strokeColor', 'Stroke', 'color', '#ffffff'),
  P('strokeWidth', 'Stroke width', 'number', 8, { min: 0, max: 400, step: 0.5 }),
];

export const TRIM_DEFS: PropDef[] = [
  P('trimStart', 'Trim start', 'number', 0, { min: 0, max: 100, unit: '%', slider: true }),
  P('trimEnd', 'Trim end', 'number', 100, { min: 0, max: 100, unit: '%', slider: true }),
  P('trimOffset', 'Trim offset', 'number', 0, { unit: '°' }),
];

export const TEXT_DEFS: PropDef[] = [
  P('fontSize', 'Font size', 'number', 120, { min: 1, max: 2000, step: 1 }),
  P('tracking', 'Letter spacing', 'number', 0, { min: -200, max: 1000, step: 0.5 }),
  P('lineHeight', 'Line height', 'number', 120, { min: 10, max: 500, unit: '%' }),
];

export const TEXT_ANIM_DEFS: PropDef[] = [
  P('reveal', 'Reveal', 'number', 100, { min: 0, max: 100, unit: '%', slider: true }),
  P('waveAmp', 'Wave height', 'number', 0, { min: 0, max: 500, step: 1 }),
  P('waveFreq', 'Wave speed', 'number', 3, { min: 0, max: 30, step: 0.1 }),
];

export const LAYER_COLORS: Record<LayerType, string> = {
  shape: '#7c5cff',
  text: '#ff5c8a',
  image: '#3fb8ff',
  video: '#ffb13f',
  audio: '#3fe08f',
  null: '#9aa0aa',
  adjustment: '#d9dde4',
};

export function shapeDefs(kind: ShapeKind): PropDef[] {
  switch (kind) {
    case 'rect':
      return [SIZE, ROUND];
    case 'ellipse':
      return [SIZE];
    case 'polygon':
      return [SIZE, SIDES, ROUND];
    case 'star':
      return [SIZE, { ...SIDES, label: 'Points' }, INNER, ROUND];
    case 'path':
      return [];
  }
}

/** All animatable properties of a layer, grouped for the inspector. */
export function propSections(layer: Layer): PropSection[] {
  const out: PropSection[] = [];
  if (layer.type === 'audio') return out;
  if (layer.type === 'adjustment') return [{ title: 'Adjustment', defs: [OPACITY_DEF] }];
  out.push({ title: 'Transform', defs: TRANSFORM_DEFS });
  if (layer.type === 'shape') {
    const sd = shapeDefs(layer.shape ?? 'rect');
    if (sd.length) out.push({ title: 'Shape', defs: sd });
    out.push({ title: 'Fill', defs: FILL_DEFS });
    out.push({ title: 'Stroke', defs: [...STROKE_DEFS, ...TRIM_DEFS] });
  }
  if (layer.type === 'text') {
    out.push({ title: 'Text', defs: TEXT_DEFS });
    out.push({ title: 'Fill', defs: FILL_DEFS });
    out.push({ title: 'Stroke', defs: STROKE_DEFS });
    out.push({ title: 'Text animation', defs: TEXT_ANIM_DEFS });
  }
  return out;
}

const ALL_LAYER_DEFS = new Map<string, PropDef>(
  [TRANSFORM_DEFS, FILL_DEFS, STROKE_DEFS, TRIM_DEFS, TEXT_DEFS, TEXT_ANIM_DEFS, [SIZE, ROUND, SIDES, INNER]]
    .flat()
    .map((d) => [d.key, d]),
);

/**
 * Property paths: plain keys address layer props ("position"),
 * "fx.<effectId>.<key>" addresses an effect parameter.
 */
export function parsePath(path: string): { fx?: string; key: string } {
  if (path.startsWith('fx.')) {
    const [, fx, key] = path.split('.');
    return { fx, key };
  }
  return { key: path };
}

export function findDef(layer: Layer, path: string): PropDef | undefined {
  const { fx, key } = parsePath(path);
  if (fx) {
    const eff = layer.effects.find((e) => e.id === fx);
    return eff ? EFFECT_DEFS[eff.type]?.props.find((d) => d.key === key) : undefined;
  }
  if (layer.shape === 'star' && key === 'sides') return shapeDefs('star')[1];
  return ALL_LAYER_DEFS.get(key);
}

const defaultProps = new Map<PropDef, Prop>();

/** Returns the stored property, or a (shared, read-only) default. */
export function getProp(layer: Layer, path: string): Prop {
  const { fx, key } = parsePath(path);
  const src = fx ? layer.effects.find((e) => e.id === fx)?.props : layer.props;
  const p = src?.[key];
  if (p) return p;
  const def = findDef(layer, path);
  if (!def) return { value: 0 };
  let d = defaultProps.get(def);
  if (!d) {
    d = { value: def.def };
    defaultProps.set(def, d);
  }
  return d;
}

/** Property container on a (draft) layer for a path, creating the effect prop map entry if needed. */
export function propOwner(layer: Layer, path: string): { owner: Record<string, Prop>; key: string } | null {
  const { fx, key } = parsePath(path);
  if (fx) {
    const eff = layer.effects.find((e) => e.id === fx);
    return eff ? { owner: eff.props, key } : null;
  }
  return { owner: layer.props, key };
}

export function cloneValue<T extends PropValue>(v: T): T {
  return (Array.isArray(v) ? [...v] : v) as T;
}

export function createEffect(type: string): Effect {
  const def = EFFECT_DEFS[type];
  const props: Record<string, Prop> = {};
  for (const d of def.props) props[d.key] = { value: cloneValue(d.def) };
  return { id: uid('fx'), type, enabled: true, props };
}

function nextName(project: Project, base: string): string {
  let n = 1;
  const names = new Set(project.layers.map((l) => l.name));
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
  path: 'Drawing',
};

export interface NewLayerOpts extends Partial<Layer> {
  at?: Vec2;
}

export function createLayer(project: Project, type: LayerType, opts: NewLayerOpts = {}): Layer {
  const { at, ...rest } = opts;
  const center: Vec2 = at ?? [Math.round(project.width / 2), Math.round(project.height / 2)];
  const start = rest.start ?? 0;
  const base: Layer = {
    id: uid('L'),
    name: '',
    type,
    start,
    end: Math.max(start + 0.1, rest.end ?? project.duration),
    visible: true,
    locked: false,
    blend: 'normal',
    clip: false,
    parent: null,
    label: LAYER_COLORS[type],
    props: { position: { value: center } },
    effects: [],
  };
  switch (type) {
    case 'shape': {
      const shape = rest.shape ?? 'rect';
      Object.assign(base, { shape, fillOn: shape !== 'path', fillType: 'solid', strokeOn: shape === 'path', closed: shape !== 'path' });
      base.name = nextName(project, SHAPE_NAMES[shape]);
      if (shape === 'path') base.props.strokeWidth = { value: 12 };
      break;
    }
    case 'text':
      Object.assign(base, {
        text: 'Your text',
        font: 'Inter',
        weight: 800,
        italic: false,
        align: 'center',
        fillOn: true,
        fillType: 'solid',
        strokeOn: false,
        animator: 'none',
        animUnit: 'char',
      });
      base.props.fill = { value: '#ffffff' };
      base.name = nextName(project, 'Text');
      break;
    case 'image':
    case 'video':
    case 'audio':
      Object.assign(base, { trimIn: 0, speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 });
      base.name = nextName(project, type[0].toUpperCase() + type.slice(1));
      break;
    case 'null':
      base.name = nextName(project, 'Null');
      break;
    case 'adjustment':
      base.name = nextName(project, 'Adjustment');
      break;
  }
  return { ...base, ...rest, props: { ...base.props, ...(rest.props ?? {}) } };
}

export const PROJECT_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Story / Reel 9:16', w: 1080, h: 1920 },
  { label: 'YouTube 16:9', w: 1920, h: 1080 },
  { label: 'Square 1:1', w: 1080, h: 1080 },
  { label: 'Portrait 4:5', w: 1080, h: 1350 },
  { label: '4K 16:9', w: 3840, h: 2160 },
  { label: 'Cinematic 21:9', w: 2560, h: 1080 },
];

export function createProject(opts: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    version: 1,
    id: uid('P'),
    name: 'Untitled project',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 10,
    background: '#101014',
    layers: [],
    assets: [],
    motionBlur: { on: false, samples: 8, shutter: 0.5 },
    created: now,
    modified: now,
    ...opts,
  };
}
