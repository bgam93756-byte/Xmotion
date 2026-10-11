import type { AssetMeta, Layer, Project, Vec2 } from './types';
import { LAYER_COLORS } from './schema';

/** Properties only shapes have, dropped when a clip slot becomes a photo or video. */
const SHAPE_ONLY = ['size', 'radius', 'sides', 'inner', 'fill', 'fill2', 'gradAngle', 'strokeColor', 'strokeWidth', 'trimStart', 'trimEnd', 'trimOffset'];

/** Replace works on photos, videos and template clip slots. */
export const canReplace = (l: Layer) => l.type === 'image' || l.type === 'video' || (l.type === 'shape' && !!l.placeholder);

/** Multiplies a 2D property (value and keyframes) by k. */
function scaleVec(l: Layer, key: string, k: number, def: Vec2) {
  const p = l.props[key] ?? (l.props[key] = { value: [...def] as Vec2 });
  const mul = (v: unknown): Vec2 => {
    const [x, y] = v as Vec2;
    return [Math.round(x * k * 100) / 100, Math.round(y * k * 100) / 100];
  };
  p.value = mul(p.value);
  for (const kf of p.keys ?? []) kf.v = mul(kf.v);
}

/** The area (layer pixels) a replacement has to cover. */
function slotSize(p: Project, l: Layer): Vec2 {
  if (l.type === 'shape') {
    const size = l.props.size;
    return ((size?.keys?.[0]?.v ?? size?.value ?? [p.width, p.height]) as Vec2).slice() as Vec2;
  }
  const a = p.assets.find((x) => x.id === l.asset);
  return [a?.width ?? 400, a?.height ?? 300];
}

/**
 * Turns a photo, video or clip slot into the given photo or video (in place,
 * e.g. on a draft): timing, animation and effects stay, and the new media is
 * scaled to cover the same area with the pivot on the same spot.
 */
export function replaceWithMedia(p: Project, l: Layer, meta: AssetMeta) {
  if (meta.kind !== 'image' && meta.kind !== 'video') return;
  if (!p.assets.some((a) => a.id === meta.id)) p.assets.push(meta);
  const [bw, bh] = slotSize(p, l);
  const k = Math.max(bw / (meta.width || bw), bh / (meta.height || bh));
  scaleVec(l, 'scale', k, [100, 100]);
  scaleVec(l, 'anchor', 1 / k, [0, 0]);
  if (l.type === 'shape') {
    for (const key of SHAPE_ONLY) delete l.props[key];
    delete l.shape;
    delete l.points;
    delete l.closed;
    delete l.fillOn;
    delete l.fillType;
    delete l.strokeOn;
  }
  delete l.placeholder;
  l.type = meta.kind;
  l.asset = meta.id;
  l.label = LAYER_COLORS[meta.kind];
  Object.assign(l, { trimIn: 0, speed: l.speed ?? 1, volume: l.volume ?? 1, muted: l.muted ?? false, fadeIn: l.fadeIn ?? 0, fadeOut: l.fadeOut ?? 0 });
}
