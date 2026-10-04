/**
 * Keeping layers in place when the space they live in changes: grouping,
 * ungrouping, parenting, moving between groups, pasting into a transformed
 * group or saving to the Elements library. A layer's local transform is
 * re-expressed so that newParent · newLocal = oldParent · oldLocal.
 */
import type { Layer, PropValue, Vec2 } from '../model/types';
import type { EvalContext } from '../model/animate';
import { cloneValue, getProp } from '../model/schema';
import { localMatrix } from '../engine/transform';

const RAD = 180 / Math.PI;
const round = (v: number, k = 1e4) => Math.round(v * k) / k;

const flat = (m: DOMMatrix) => (m.is2D ? m : new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
const isThreeD = (l: Layer) => (!!l.threeD && l.type !== 'group') || l.type === 'camera';
const keyed = (l: Layer, key: string) => !!getProp(l, key).keys?.length;

/** Applies f to a property's static value and every keyframe value. */
function mapProp(l: Layer, key: string, f: (v: PropValue, keyT?: number) => PropValue) {
  const p = (l.props[key] ??= { value: cloneValue(getProp(l, key).value) });
  p.value = f(p.value);
  p.keys?.forEach((k) => (k.v = f(k.v, k.t)));
}

/** Writes a static property (callers check it isn't keyframed). */
function setValue(l: Layer, key: string, value: PropValue) {
  l.props[key] = { ...l.props[key], value };
}

/** The angle equal to `a` (mod 360) closest to `near`, so 370° doesn't snap back to 10°. */
const unwrap = (a: number, near: number) => a + 360 * Math.round((near - a) / 360);

const close = (a: number, b: number, scale = 1) => Math.abs(a - b) <= 1e-6 * Math.max(1, scale);

/** Rotation (degrees) and uniform scale of a 2D linear map, when it is a similarity. */
function similarity(m: DOMMatrix): { rot: number; k: number } | null {
  const k = Math.hypot(m.a, m.b);
  if (k < 1e-12 || !close(m.a, m.d, k) || !close(m.b, -m.c, k)) return null;
  return { rot: Math.atan2(m.b, m.a) * RAD, k };
}

/** The closest similarity (polar decomposition) of a 2D linear map. */
function nearestSimilarity(m: DOMMatrix): { rot: number; k: number } {
  return { rot: Math.atan2(m.b - m.c, m.a + m.d) * RAD, k: Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) };
}

/**
 * Re-expresses a (draft) layer's transform after its parent space changed.
 * `lt`/`ec` are the layer's clock and evaluation context at the current time.
 * Returns false when the result is only approximate (animated properties
 * under a non-uniform scale or a 3D change); the static pose at the current
 * time is always exact.
 */
export function rebase(l: Layer, oldParent: DOMMatrix, newParent: DOMMatrix, lt: number, ec: EvalContext): boolean {
  if (isThreeD(l)) return rebase3D(l, newParent.inverse().multiply(oldParent), lt, ec);
  // 2D layers are drawn with the 2D part of their world matrix.
  const D = flat(newParent).inverse().multiply(flat(oldParent));
  if (Number.isNaN(D.a)) return false;
  if (D.isIdentity) return true;
  const sim = similarity(D);
  const anyKeyed = ['position', 'rotation', 'scale', 'skew', 'skewAxis', 'anchor'].some((k) => keyed(l, k));
  if (!sim && !anyKeyed) return decompose2D(l, D.multiply(localMatrix(l, lt, ec, undefined, undefined, false)));
  // Similarities (rotation, uniform scale, translation) map every keyframe exactly.
  const { rot, k } = sim ?? nearestSimilarity(D);
  mapProp(l, 'position', (v) => {
    const q = D.transformPoint(new DOMPoint((v as Vec2)[0], (v as Vec2)[1]));
    return [round(q.x), round(q.y)];
  });
  if (Math.abs(rot) > 1e-9) mapProp(l, 'rotation', (v) => round((v as number) + rot));
  if (Math.abs(k - 1) > 1e-9) mapProp(l, 'scale', (v) => [round((v as Vec2)[0] * k), round((v as Vec2)[1] * k)]);
  return !!sim;
}

/**
 * Sets static position, rotation, skew and scale from a 2D local matrix M
 * (M = T(p) · R(rot) · SkewX(skew) · S · T(−anchor), with the skew axis at 0).
 * A mirrored X scale stays mirrored instead of becoming a 180° turn.
 */
function decompose2D(l: Layer, M: DOMMatrix): boolean {
  const { a, b, c, d } = M;
  const len0 = Math.hypot(a, b);
  if (len0 < 1e-12) return false;
  const sx = (getProp(l, 'scale').value as Vec2)[0] < 0 ? -len0 : len0;
  const theta = Math.atan2(b / sx, a / sx);
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  // R(−θ) · column 1 = (sy·tan(skew), sy).
  const sy = -c * sn + d * cs;
  const skew = Math.abs(sy) > 1e-12 ? Math.atan((c * cs + d * sn) / sy) * RAD : 0;
  const [ax, ay] = getProp(l, 'anchor').value as Vec2;
  const p = M.transformPoint(new DOMPoint(ax, ay));
  setValue(l, 'position', [round(p.x), round(p.y)]);
  setValue(l, 'rotation', round(unwrap(theta * RAD, getProp(l, 'rotation').value as number)));
  setValue(l, 'scale', [round(sx * 100), round(sy * 100)]);
  return setSkew(l, skew);
}

/** Writes a decomposed skew (axis 0); false when it's beyond the ±85° the model allows. */
function setSkew(l: Layer, skew: number): boolean {
  // Round-trip noise shouldn't leave a 0.0001° skew behind.
  const v = Math.abs(skew) < 5e-4 ? 0 : skew;
  if (v !== 0 || (getProp(l, 'skew').value as number) !== 0) {
    setValue(l, 'skew', round(Math.max(-85, Math.min(85, v))));
    setValue(l, 'skewAxis', 0);
  }
  return Math.abs(skew) <= 85;
}

/** 3D layers and cameras: T(x,y,z) · Rz · Ry · Rx · Skew · S · T(−anchor). */
function rebase3D(l: Layer, D: DOMMatrix, lt: number, ec: EvalContext): boolean {
  if (Number.isNaN(D.a)) return false;
  if (D.isIdentity) return true;
  const cam = l.type === 'camera';
  const keys = ['position', 'z', 'rotation', 'rotX', 'rotY', ...(cam ? [] : ['scale', 'skew', 'skewAxis', 'anchor'])];
  const anyKeyed = keys.some((k) => keyed(l, k));
  if (!anyKeyed) return decompose3D(l, D.multiply(localMatrix(l, lt, ec, undefined, undefined, false)));
  // Animated: map positions (with the Z of the same moment) through D, and
  // apply a flat change's rotation and scale; a 3D change can't be kept exactly.
  const oldPos = copyProp(getProp(l, 'position'));
  const oldZ = copyProp(getProp(l, 'z'));
  // Static values pair with the other property's value at the current time.
  const now = lt - l.start;
  mapProp(l, 'position', (v, t) => {
    const q = D.transformPoint(new DOMPoint((v as Vec2)[0], (v as Vec2)[1], valueAt(oldZ, t ?? now) as number));
    return [round(q.x), round(q.y)];
  });
  mapProp(l, 'z', (v, t) => {
    const [x, y] = valueAt(oldPos, t ?? now) as Vec2;
    return round(D.transformPoint(new DOMPoint(x, y, v as number)).z);
  });
  const sim = D.is2D ? similarity(D) : null;
  if (sim) {
    if (Math.abs(sim.rot) > 1e-9) mapProp(l, 'rotation', (v) => round((v as number) + sim.rot));
    if (!cam && Math.abs(sim.k - 1) > 1e-9) mapProp(l, 'scale', (v) => [round((v as Vec2)[0] * sim.k), round((v as Vec2)[1] * sim.k)]);
  }
  return !!sim && (!cam || Math.abs(sim.k - 1) < 1e-6);
}

interface PropCopy {
  value: PropValue;
  keys?: { t: number; v: PropValue }[];
}

/** A plain copy of a property's values (props may be immer drafts). */
function copyProp(p: { value: PropValue; keys?: { t: number; v: PropValue }[] }): PropCopy {
  return { value: cloneValue(p.value), keys: p.keys?.map((k) => ({ t: k.t, v: cloneValue(k.v) })) };
}

/** A property's value at a local time (keys of other properties may sit elsewhere). */
function valueAt(p: PropCopy, t: number): PropValue {
  const ks = p.keys;
  if (!ks?.length) return p.value;
  if (t <= ks[0].t) return ks[0].v;
  if (t >= ks[ks.length - 1].t) return ks[ks.length - 1].v;
  // Linear in between is close enough for re-expressing a companion property.
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i].t) {
      const u = (t - ks[i - 1].t) / Math.max(1e-9, ks[i].t - ks[i - 1].t);
      const a = ks[i - 1].v;
      const b = ks[i].v;
      if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
      if (Array.isArray(a) && Array.isArray(b)) return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      return a;
    }
  }
  return p.value;
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scaleV = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Sets static position/Z, rotations, skew and scale from a 3D local matrix
 * M = T · Rz(rotation) · Ry(rotY) · Rx(rotX) · SkewX(skew) · diag(sx, sy, 1) · T(−anchor).
 */
function decompose3D(l: Layer, M: DOMMatrix): boolean {
  const cam = l.type === 'camera';
  const [ax, ay] = cam ? [0, 0] : (getProp(l, 'anchor').value as Vec2);
  const p = M.transformPoint(new DOMPoint(ax, ay, 0));
  const c0: V3 = [M.m11, M.m12, M.m13];
  const c1: V3 = [M.m21, M.m22, M.m23];
  const c2: V3 = [M.m31, M.m32, M.m33];
  const len0 = len(c0);
  if (len0 < 1e-12) return false;
  let r0: V3;
  let r1: V3;
  let r2: V3;
  let sx = 1;
  let sy = 1;
  let shear = 0;
  if (cam) {
    // A camera is all about where it looks (Z), then its roll (X).
    r0 = scaleV(c0, 1 / len0);
    const z = sub(c2, scaleV(r0, dot(c2, r0)));
    r2 = len(z) > 1e-12 ? scaleV(z, 1 / len(z)) : cross(r0, [0, 1, 0]);
    r1 = cross(r2, r0);
  } else {
    // A layer is flat: only its X and Y axes show, so rebuild the frame from
    // them exactly (mirrored scales stay mirrored).
    const [osx, osy] = getProp(l, 'scale').value as Vec2;
    sx = osx < 0 ? -len0 : len0;
    r0 = scaleV(c0, 1 / sx);
    const y = sub(c1, scaleV(r0, dot(c1, r0)));
    const ly = len(y);
    r1 = ly > 1e-12 ? scaleV(y, (osy < 0 ? -1 : 1) / ly) : cross(scaleV(c2, 1 / Math.max(1e-12, len(c2))), r0);
    r2 = cross(r0, r1);
    sy = dot(c1, r1);
    shear = Math.abs(sy) > 1e-12 ? dot(c1, r0) / sy : 0;
  }
  // R = Rz(γ) · Ry(β) · Rx(α); columns r0, r1, r2.
  const beta = Math.asin(Math.max(-1, Math.min(1, -r0[2])));
  let alpha: number;
  let gamma: number;
  if (Math.abs(Math.cos(beta)) > 1e-6) {
    alpha = Math.atan2(r1[2], r2[2]);
    gamma = Math.atan2(r0[1], r0[0]);
  } else {
    // Gimbal lock: put everything into Z.
    alpha = 0;
    gamma = Math.atan2(-r1[0], r1[1]);
  }
  setValue(l, 'position', [round(p.x), round(p.y)]);
  setValue(l, 'z', round(p.z));
  setValue(l, 'rotation', round(unwrap(gamma * RAD, getProp(l, 'rotation').value as number)));
  setValue(l, 'rotY', round(unwrap(beta * RAD, getProp(l, 'rotY').value as number)));
  setValue(l, 'rotX', round(unwrap(alpha * RAD, getProp(l, 'rotX').value as number)));
  if (cam) return true;
  setValue(l, 'scale', [round(sx * 100), round(sy * 100)]);
  return setSkew(l, Math.atan(shear) * RAD);
}
