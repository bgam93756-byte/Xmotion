/**
 * 3D camera math. Comp space is x right, y down, z into the screen. The
 * camera looks along +z from its position; with no camera layer a default one
 * sits `zoom` pixels in front of the comp center, so z = 0 maps 1:1 to the comp.
 */
import type { Layer, Project, Vec2 } from '../model/types';
import { num } from '../model/animate';
import { defaultZoom } from '../model/schema';
import { walk } from '../model/tree';
import { isActive, timesOf, worldMatrix } from './transform';

export interface Camera {
  /** World → camera space. */
  view: DOMMatrix;
  zoom: number;
  /** Projection center (comp center). */
  cx: number;
  cy: number;
  layer: Layer | null;
}

/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Nearest depth (comp pixels in front of the camera) that is still drawn. */
export const NEAR = 1;

/** The top-most visible, active camera layer, or the default camera. */
export function activeCamera(project: Project, compT: number): Camera {
  let cam: Layer | null = null;
  walk(project.layers, (l) => {
    if (cam || l.type !== 'camera' || !l.visible) return;
    if (isActive(l, timesOf(project, l, compT).ct)) cam = l;
  });
  const cx = project.width / 2;
  const cy = project.height / 2;
  if (!cam) {
    const zoom = defaultZoom(project);
    return { view: new DOMMatrix().translate(-cx, -cy, zoom), zoom, cx, cy, layer: null };
  }
  const c: Layer = cam;
  const { ec, lt } = timesOf(project, c, compT);
  const world = worldMatrix(project, c, compT);
  return { view: world.inverse(), zoom: Math.max(1, num(c, 'zoom', lt, ec)), cx, cy, layer: c };
}

/** Projects a world-space point; null when it is behind the camera. */
export function projectPoint(cam: Camera, x: number, y: number, z: number): { p: Vec2; depth: number } | null {
  const v = cam.view;
  const X = v.m11 * x + v.m21 * y + v.m31 * z + v.m41;
  const Y = v.m12 * x + v.m22 * y + v.m32 * z + v.m42;
  const Z = v.m13 * x + v.m23 * y + v.m33 * z + v.m43;
  if (Z < NEAR) return null;
  return { p: [cam.cx + (cam.zoom * X) / Z, cam.cy + (cam.zoom * Y) / Z], depth: Z };
}

/**
 * Homography taking a layer's local plane (u, v, 1) to homogeneous comp
 * screen coordinates. The third component of the result is the camera depth.
 */
export function homography(cam: Camera, world: DOMMatrix): Mat3 {
  const P = cam.view.multiply(world);
  const { zoom: f, cx, cy } = cam;
  // Rows of P restricted to (u, v, 1): columns 1, 2 and 4.
  const r0 = [P.m11, P.m21, P.m41];
  const r1 = [P.m12, P.m22, P.m42];
  const r2 = [P.m13, P.m23, P.m43];
  return [
    f * r0[0] + cx * r2[0], f * r0[1] + cx * r2[1], f * r0[2] + cx * r2[2],
    f * r1[0] + cy * r2[0], f * r1[1] + cy * r2[1], f * r1[2] + cy * r2[2],
    r2[0], r2[1], r2[2],
  ];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9) as Mat3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export function inv3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

export function apply3(m: Mat3, x: number, y: number): [number, number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5], m[6] * x + m[7] * y + m[8]];
}

/** Column-major Float32Array for a GLSL mat3 uniform. */
export function glMat3(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/** A point on a layer's plane projected to the comp (null when behind the camera). */
export function projectLocal(H: Mat3, u: number, v: number): Vec2 | null {
  const [x, y, w] = apply3(H, u, v);
  if (w < NEAR) return null;
  return [x / w, y / w];
}

/** Depth of a local point in front of the camera. */
export function depthAt(H: Mat3, u: number, v: number): number {
  return H[6] * u + H[7] * v + H[8];
}

/** Where a comp-screen point hits a 3D layer's plane, in its local coordinates. */
export function rayToLayer(project: Project, layer: Layer, p: Vec2, compT: number, cam: Camera): Vec2 | null {
  const inv = inv3(homography(cam, worldMatrix(project, layer, compT)));
  if (!inv) return null;
  const [u, v, w] = apply3(inv, p[0], p[1]);
  // w = 1 / depth: positive and below 1/NEAR when the hit is in front of the camera.
  if (w <= 0 || w > 1 / NEAR) return null;
  return [u / w, v / w];
}

/**
 * Converts a screen-space drag (comp pixels) at a world point into a world
 * delta on the plane facing the camera through that point.
 */
export function screenDeltaToWorld(cam: Camera, at: [number, number, number], dx: number, dy: number): [number, number, number] {
  const v = cam.view;
  const Z = v.m13 * at[0] + v.m23 * at[1] + v.m33 * at[2] + v.m43;
  const k = Math.max(NEAR, Z) / cam.zoom;
  // Camera-space delta (dx·k, dy·k, 0) back to world: the inverse view's linear part.
  const w = v.inverse();
  const cx = dx * k;
  const cy = dy * k;
  return [w.m11 * cx + w.m21 * cy, w.m12 * cx + w.m22 * cy, w.m13 * cx + w.m23 * cy];
}
