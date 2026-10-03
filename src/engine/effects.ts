import type { Effect, Layer } from '../model/types';
import { col, num, vec, type EvalContext } from '../model/animate';
import { rgbaFloat } from '../model/color';
import { glfx } from './gl';

type Uniforms = Record<string, number | number[]>;
type Pass = [string, Uniforms];

export interface FxContext {
  t: number;
  /** Render scale (preview quality); pixel-sized parameters are multiplied by it. */
  scale: number;
  ec: EvalContext;
  tempCanvas: () => HTMLCanvasElement;
}

const supportsFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
const DEG = Math.PI / 180;

function blurPasses(sigma: number): Pass[] {
  return [
    ['blur', { u_dir: [1, 0], u_sigma: sigma }],
    ['blur', { u_dir: [0, 1], u_sigma: sigma }],
  ];
}

/** Shader passes for the pure per-pixel effects (null for composite ones). */
function shaderPasses(layer: Layer, e: Effect, fx: FxContext, w: number, h: number): Pass[] | null {
  const P = (k: string) => `fx.${e.id}.${k}`;
  const n = (k: string) => num(layer, P(k), fx.t, fx.ec);
  const c = (k: string) => rgbaFloat(col(layer, P(k), fx.t, fx.ec));
  const center = (): [number, number] => {
    const [cx, cy] = vec(layer, P('center'), fx.t, fx.ec);
    return [(cx / 100) * w, (1 - cy / 100) * h];
  };
  const s = fx.scale;
  switch (e.type) {
    case 'blur':
      return blurPasses(n('amount') * 0.6 * s);
    case 'dirBlur': {
      const a = n('angle') * DEG;
      const L = n('amount') * s;
      return [['dirBlur', { u_vec: [Math.cos(a) * L, -Math.sin(a) * L] }]];
    }
    case 'zoomBlur': {
      const [cx, cy] = center();
      return [['zoomBlur', { u_center: [cx / w, cy / h], u_amount: n('amount') / 100 }]];
    }
    case 'outline':
      return [['outline', { u_width: n('width') * s, u_color: c('color') }]];
    case 'color': {
      const ct = n('contrast');
      return [
        [
          'color',
          {
            u_bright: (n('brightness') / 100) * 0.6,
            u_contrast: ct >= 0 ? 1 + (ct / 100) * 2 : 1 + ct / 100,
            u_sat: 1 + n('saturation') / 100,
            u_hue: n('hue') * DEG,
            u_temp: (n('temperature') / 100) * 0.15,
          },
        ],
      ];
    }
    case 'tint':
      return [['tint', { u_color: c('color'), u_amount: n('amount') / 100 }]];
    case 'duotone':
      return [['duotone', { u_dark: c('dark'), u_light: c('light'), u_amount: n('amount') / 100 }]];
    case 'fill':
      return [['fill', { u_color: c('color') }]];
    case 'invert':
      return [['invert', { u_amount: n('amount') / 100 }]];
    case 'posterize':
      return [['posterize', { u_levels: Math.max(2, n('levels')) }]];
    case 'threshold':
      return [['threshold', { u_level: n('level') / 100 }]];
    case 'chromaKey':
      return [
        [
          'chromaKey',
          { u_key: c('key'), u_tol: (n('tolerance') / 100) * 0.6, u_soft: (n('softness') / 100) * 0.4, u_spill: n('spill') / 100 },
        ],
      ];
    case 'lumaKey':
      return [['lumaKey', { u_level: n('level') / 100, u_soft: n('softness') / 100 }]];
    case 'pixelate':
      return [['pixelate', { u_size: Math.max(1, n('size') * s) }]];
    case 'wave': {
      const a = n('angle') * DEG;
      return [['wave', { u_amp: n('amp') * s, u_len: Math.max(1, n('length') * s), u_speed: n('speed'), u_dir: [Math.cos(a), -Math.sin(a)] }]];
    }
    case 'swirl':
      return [['swirl', { u_center: center(), u_angle: -n('angle') * DEG, u_radius: (n('radius') / 100) * Math.min(w, h) }]];
    case 'bulge':
      return [['bulge', { u_center: center(), u_amount: n('amount') / 100, u_radius: (n('radius') / 100) * Math.min(w, h) }]];
    case 'kaleido':
      return [['kaleido', { u_center: center(), u_segments: Math.max(2, Math.round(n('segments'))), u_angle: -n('angle') * DEG }]];
    case 'mirror': {
      const a = n('angle') * DEG;
      return [['mirror', { u_center: center(), u_normal: [Math.cos(a), -Math.sin(a)] }]];
    }
    case 'turbulence':
      return [['turbulence', { u_amount: n('amount') * s, u_scale: Math.max(1, n('scale') * s), u_speed: n('speed') }]];
    case 'tile':
      return [['tile', { u_count: Math.max(1, n('count')), u_mirror: n('mirror') }]];
    case 'rgbSplit': {
      const a = n('angle') * DEG;
      const d = n('amount') * s;
      return [['rgbSplit', { u_off: [Math.cos(a) * d, -Math.sin(a) * d] }]];
    }
    case 'glitch':
      return [['glitch', { u_amount: n('amount') / 100, u_speed: n('speed'), u_block: Math.max(1, n('blocks') * s) }]];
    case 'grain':
      return [['grain', { u_amount: (n('amount') / 100) * 0.6, u_size: Math.max(0.5, n('size') * s) }]];
    case 'scanlines':
      return [['scanlines', { u_amount: n('amount') / 100, u_lines: Math.max(1, n('lines') * s), u_curve: n('curve') / 100 }]];
    case 'vignette':
      return [['vignette', { u_amount: n('amount') / 100, u_size: n('size') / 100, u_soft: Math.max(0.01, n('softness') / 100) }]];
    case 'halftone':
      return [['halftone', { u_size: Math.max(2, n('size') * s), u_angle: n('angle') * DEG }]];
    case 'edges':
      return [['edges', { u_amount: n('amount') / 100, u_invert: n('invert') }]];
  }
  return null;
}

function replace(buf: HTMLCanvasElement, src: CanvasImageSource) {
  const ctx = buf.getContext('2d')!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

/** Fallback for browsers without WebGL: only blur/color via canvas filters. */
function cssFallback(layer: Layer, e: Effect, buf: HTMLCanvasElement, fx: FxContext) {
  if (!supportsFilter) return;
  const n = (k: string) => num(layer, `fx.${e.id}.${k}`, fx.t, fx.ec);
  let filter = '';
  if (e.type === 'blur') filter = `blur(${n('amount') * 0.6 * fx.scale}px)`;
  if (e.type === 'color') filter = `brightness(${1 + n('brightness') / 100}) contrast(${1 + n('contrast') / 100}) saturate(${1 + n('saturation') / 100}) hue-rotate(${n('hue')}deg)`;
  if (e.type === 'invert') filter = `invert(${n('amount')}%)`;
  if (!filter) return;
  const tmp = fx.tempCanvas();
  const tctx = tmp.getContext('2d')!;
  tctx.clearRect(0, 0, tmp.width, tmp.height);
  tctx.filter = filter;
  tctx.drawImage(buf, 0, 0);
  tctx.filter = 'none';
  replace(buf, tmp);
}

/** Applies a layer's (non-transform) effects to its comp-sized buffer in place. */
export function applyEffects(layer: Layer, buf: HTMLCanvasElement, fx: FxContext) {
  const effects = layer.effects.filter((e) => e.enabled && e.type !== 'shake');
  if (!effects.length) return;
  const gl = glfx();
  const w = buf.width;
  const h = buf.height;
  let batch: Pass[] = [];
  const flush = () => {
    if (!batch.length || !gl) return;
    replace(buf, gl.run(buf, w, h, batch, fx.t));
    batch = [];
  };

  for (const e of effects) {
    if (!gl) {
      cssFallback(layer, e, buf, fx);
      continue;
    }
    const passes = shaderPasses(layer, e, fx, w, h);
    if (passes) {
      batch.push(...passes);
      continue;
    }
    flush();
    const P = (k: string) => `fx.${e.id}.${k}`;
    const n = (k: string) => num(layer, P(k), fx.t, fx.ec);
    const ctx = buf.getContext('2d')!;
    if (e.type === 'glow') {
      const strength = n('strength') / 100;
      const out = gl.run(buf, w, h, [...blurPasses(n('radius') * 0.5 * fx.scale), ['mul', { u_color: rgbaFloat(col(layer, P('color'), fx.t, fx.ec)), u_gain: 1 }]], fx.t);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Halo behind the layer keeps solid fills true to color...
      ctx.globalCompositeOperation = 'destination-over';
      for (let left = Math.min(4, strength); left > 0.001; left -= 1) {
        ctx.globalAlpha = Math.min(1, left);
        ctx.drawImage(out, 0, 0);
      }
      // ...plus a little additive bloom on top for the neon look.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, strength * 0.3);
      ctx.drawImage(out, 0, 0);
      ctx.restore();
    } else if (e.type === 'shadow') {
      const a = n('angle') * DEG;
      const d = n('distance') * fx.scale;
      const color = rgbaFloat(col(layer, P('color'), fx.t, fx.ec));
      const original = fx.tempCanvas();
      replace(original, buf);
      const out = gl.run(buf, w, h, [...blurPasses(n('softness') * 0.5 * fx.scale), ['fill', { u_color: color }]], fx.t);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(out, Math.sin(a) * d, -Math.cos(a) * d);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(original, 0, 0);
      ctx.restore();
    }
  }
  flush();
}

export function hasPixelEffects(layer: Layer) {
  return layer.effects.some((e) => e.enabled && e.type !== 'shake');
}
