import type { PropDef } from './schema';

export type EffectCategory = 'Blur & Light' | 'Color' | 'Keying' | 'Distort' | 'Stylize' | 'Motion';

export interface EffectDef {
  type: string;
  label: string;
  category: EffectCategory;
  props: PropDef[];
}

const n = (key: string, label: string, def: number, min?: number, max?: number, extra: Partial<PropDef> = {}): PropDef => ({
  key,
  label,
  kind: 'number',
  def,
  min,
  max,
  slider: min !== undefined && max !== undefined,
  ...extra,
});
const c = (key: string, label: string, def: string): PropDef => ({ key, label, kind: 'color', def });
const v = (key: string, label: string, def: [number, number]): PropDef => ({ key, label, kind: 'vec2', def, unit: '%' });

const list: EffectDef[] = [
  // Blur & light
  { type: 'blur', label: 'Gaussian Blur', category: 'Blur & Light', props: [n('amount', 'Blurriness', 12, 0, 200)] },
  {
    type: 'dirBlur',
    label: 'Directional Blur',
    category: 'Blur & Light',
    props: [n('amount', 'Length', 30, 0, 400), n('angle', 'Angle', 0, undefined, undefined, { unit: '°' })],
  },
  {
    type: 'zoomBlur',
    label: 'Zoom Blur',
    category: 'Blur & Light',
    props: [n('amount', 'Strength', 25, 0, 100, { unit: '%' }), v('center', 'Center', [50, 50])],
  },
  {
    type: 'glow',
    label: 'Glow',
    category: 'Blur & Light',
    props: [n('radius', 'Radius', 24, 0, 200), n('strength', 'Intensity', 120, 0, 400, { unit: '%' }), c('color', 'Tint', '#ffffff')],
  },
  {
    type: 'shadow',
    label: 'Drop Shadow',
    category: 'Blur & Light',
    props: [
      c('color', 'Color', '#000000b0'),
      n('distance', 'Distance', 16, 0, 400),
      n('angle', 'Direction', 135, undefined, undefined, { unit: '°' }),
      n('softness', 'Softness', 18, 0, 200),
    ],
  },
  {
    type: 'outline',
    label: 'Outline / Sticker',
    category: 'Blur & Light',
    props: [n('width', 'Width', 10, 0, 60), c('color', 'Color', '#ffffff')],
  },

  // Color
  {
    type: 'color',
    label: 'Color Adjust',
    category: 'Color',
    props: [
      n('brightness', 'Brightness', 0, -100, 100),
      n('contrast', 'Contrast', 0, -100, 100),
      n('saturation', 'Saturation', 0, -100, 100),
      n('hue', 'Hue shift', 0, -180, 180, { unit: '°' }),
      n('temperature', 'Temperature', 0, -100, 100),
    ],
  },
  { type: 'tint', label: 'Tint / Colorize', category: 'Color', props: [c('color', 'Color', '#ff3d7f'), n('amount', 'Amount', 100, 0, 100, { unit: '%' })] },
  {
    type: 'duotone',
    label: 'Duotone',
    category: 'Color',
    props: [c('dark', 'Shadows', '#1b0b4a'), c('light', 'Highlights', '#ffc94d'), n('amount', 'Amount', 100, 0, 100, { unit: '%' })],
  },
  { type: 'fill', label: 'Fill Color', category: 'Color', props: [c('color', 'Color', '#ffffff')] },
  { type: 'invert', label: 'Invert', category: 'Color', props: [n('amount', 'Amount', 100, 0, 100, { unit: '%' })] },
  { type: 'posterize', label: 'Posterize', category: 'Color', props: [n('levels', 'Levels', 5, 2, 32)] },
  { type: 'threshold', label: 'Threshold', category: 'Color', props: [n('level', 'Level', 50, 0, 100, { unit: '%' })] },

  // Keying
  {
    type: 'chromaKey',
    label: 'Chroma Key (Green Screen)',
    category: 'Keying',
    props: [
      c('key', 'Key color', '#00ff00'),
      n('tolerance', 'Tolerance', 30, 0, 100, { unit: '%' }),
      n('softness', 'Edge softness', 10, 0, 100, { unit: '%' }),
      n('spill', 'Spill removal', 50, 0, 100, { unit: '%' }),
    ],
  },
  { type: 'lumaKey', label: 'Luma Key', category: 'Keying', props: [n('level', 'Threshold', 20, 0, 100, { unit: '%' }), n('softness', 'Softness', 10, 0, 100, { unit: '%' })] },

  // Distort
  { type: 'pixelate', label: 'Pixelate / Mosaic', category: 'Distort', props: [n('size', 'Cell size', 16, 1, 200)] },
  {
    type: 'wave',
    label: 'Wave Warp',
    category: 'Distort',
    props: [n('amp', 'Amplitude', 20, 0, 300), n('length', 'Wavelength', 120, 4, 2000), n('speed', 'Speed', 2, -20, 20), n('angle', 'Direction', 0, undefined, undefined, { unit: '°' })],
  },
  { type: 'swirl', label: 'Swirl', category: 'Distort', props: [n('angle', 'Angle', 180, -1080, 1080, { unit: '°' }), n('radius', 'Radius', 50, 1, 150, { unit: '%' }), v('center', 'Center', [50, 50])] },
  { type: 'bulge', label: 'Bulge / Pinch', category: 'Distort', props: [n('amount', 'Amount', 50, -100, 100, { unit: '%' }), n('radius', 'Radius', 40, 1, 150, { unit: '%' }), v('center', 'Center', [50, 50])] },
  { type: 'kaleido', label: 'Kaleidoscope', category: 'Distort', props: [n('segments', 'Segments', 6, 2, 32), n('angle', 'Rotation', 0, undefined, undefined, { unit: '°' }), v('center', 'Center', [50, 50])] },
  { type: 'mirror', label: 'Mirror', category: 'Distort', props: [n('angle', 'Reflection angle', 90, undefined, undefined, { unit: '°' }), v('center', 'Center', [50, 50])] },
  { type: 'turbulence', label: 'Turbulent Displace', category: 'Distort', props: [n('amount', 'Amount', 20, 0, 200), n('scale', 'Size', 120, 4, 1000), n('speed', 'Evolution speed', 1, 0, 20)] },
  { type: 'tile', label: 'Motion Tile', category: 'Distort', props: [n('count', 'Tiles', 3, 1, 12), n('mirror', 'Mirror edges', 0, 0, 1, { step: 1 })] },

  // Stylize
  { type: 'rgbSplit', label: 'RGB Split', category: 'Stylize', props: [n('amount', 'Offset', 12, 0, 200), n('angle', 'Angle', 0, undefined, undefined, { unit: '°' })] },
  {
    type: 'glitch',
    label: 'Glitch',
    category: 'Stylize',
    props: [n('amount', 'Strength', 50, 0, 100, { unit: '%' }), n('speed', 'Speed', 12, 0, 60), n('blocks', 'Block size', 40, 2, 400)],
  },
  { type: 'grain', label: 'Film Grain', category: 'Stylize', props: [n('amount', 'Amount', 20, 0, 100, { unit: '%' }), n('size', 'Grain size', 1.5, 0.5, 8)] },
  { type: 'scanlines', label: 'Scanlines / CRT', category: 'Stylize', props: [n('amount', 'Strength', 40, 0, 100, { unit: '%' }), n('lines', 'Line spacing', 4, 2, 40), n('curve', 'Screen curve', 0, 0, 100, { unit: '%' })] },
  { type: 'vignette', label: 'Vignette', category: 'Stylize', props: [n('amount', 'Amount', 50, 0, 100, { unit: '%' }), n('size', 'Size', 60, 0, 100, { unit: '%' }), n('softness', 'Softness', 50, 1, 100, { unit: '%' })] },
  { type: 'halftone', label: 'Halftone', category: 'Stylize', props: [n('size', 'Dot size', 10, 2, 100), n('angle', 'Angle', 45, undefined, undefined, { unit: '°' })] },
  { type: 'edges', label: 'Find Edges / Sketch', category: 'Stylize', props: [n('amount', 'Amount', 100, 0, 100, { unit: '%' }), n('invert', 'Ink on paper', 0, 0, 1, { step: 1 })] },

  // Motion
  {
    type: 'shake',
    label: 'Camera Shake',
    category: 'Motion',
    props: [n('amount', 'Amount', 20, 0, 500), n('speed', 'Frequency', 8, 0, 60), n('rotation', 'Rotation', 2, 0, 90, { unit: '°' })],
  },
];

export const EFFECT_DEFS: Record<string, EffectDef> = Object.fromEntries(list.map((d) => [d.type, d]));
export const EFFECT_LIST = list;
