import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { allLayers, ancestors, effectiveWindow, findLayer, isInside, walk } from '../src/model/tree';
import { createLayer, createProject, defaultZoom } from '../src/model/schema';
import type { Layer, Project, Vec2 } from '../src/model/types';

/**
 * Node has no DOMMatrix, and the engine needs one (already when its modules
 * load). This minimal stand-in follows the Geometry Interfaces spec for the
 * methods the engine uses: 4×4 matrices on column vectors, mCR = column C,
 * row R, stored column-major.
 */
function installDOMMatrix() {
  if ('DOMMatrix' in globalThis) return;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  class Matrix {
    m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    is2D = true;
    constructor(init?: number[]) {
      if (init?.length === 6) {
        const [a, b, c, d, e, f] = init;
        this.m = [a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1];
      } else if (init?.length === 16) {
        this.m = [...init];
        this.is2D = false;
      }
    }
    private static of(m: number[], is2D: boolean) {
      const r = new Matrix(m);
      r.is2D = is2D;
      return r;
    }
    multiplySelf(o: Matrix) {
      const r = new Array<number>(16).fill(0);
      for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row] += this.m[k * 4 + row] * o.m[c * 4 + k];
      this.m = r;
      this.is2D &&= o.is2D;
      return this;
    }
    multiply(o: Matrix) {
      return Matrix.of(this.m, this.is2D).multiplySelf(o);
    }
    translateSelf(x = 0, y = 0, z = 0) {
      return this.multiplySelf(Matrix.of([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1], z === 0));
    }
    translate(x = 0, y = 0, z = 0) {
      return Matrix.of(this.m, this.is2D).translateSelf(x, y, z);
    }
    scaleSelf(sx = 1, sy = sx, sz = 1) {
      return this.multiplySelf(Matrix.of([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1], sz === 1));
    }
    rotateSelf(rx = 0, ry?: number, rz?: number) {
      if (ry === undefined && rz === undefined) [rx, ry, rz] = [0, 0, rx];
      const [z, y, x] = [rad(rz ?? 0), rad(ry ?? 0), rad(rx)];
      // Post-multiplies Z, then Y, then X rotations, as CSS rotate3d() matrices.
      this.multiplySelf(Matrix.of([Math.cos(z), Math.sin(z), 0, 0, -Math.sin(z), Math.cos(z), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], true));
      this.multiplySelf(Matrix.of([Math.cos(y), 0, -Math.sin(y), 0, 0, 1, 0, 0, Math.sin(y), 0, Math.cos(y), 0, 0, 0, 0, 1], y === 0));
      return this.multiplySelf(Matrix.of([1, 0, 0, 0, 0, Math.cos(x), Math.sin(x), 0, 0, -Math.sin(x), Math.cos(x), 0, 0, 0, 0, 1], x === 0));
    }
    skewXSelf(deg = 0) {
      return this.multiplySelf(Matrix.of([1, 0, 0, 0, Math.tan(rad(deg)), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], true));
    }
    inverse() {
      // Gauss-Jordan on [A | I] with A row-major.
      const a = Array.from({ length: 4 }, (_, r) => [0, 1, 2, 3].map((c) => this.m[c * 4 + r]).concat([0, 1, 2, 3].map((c) => (c === r ? 1 : 0))));
      for (let col = 0; col < 4; col++) {
        let piv = col;
        for (let r = col + 1; r < 4; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
        if (Math.abs(a[piv][col]) < 1e-12) return Matrix.of(new Array(16).fill(NaN), false);
        [a[col], a[piv]] = [a[piv], a[col]];
        const p = a[col][col];
        a[col] = a[col].map((v) => v / p);
        for (let r = 0; r < 4; r++) if (r !== col) a[r] = a[r].map((v, i) => v - a[r][col] * a[col][i]);
      }
      return Matrix.of(
        Array.from({ length: 16 }, (_, i) => a[i % 4][4 + Math.floor(i / 4)]),
        this.is2D,
      );
    }
  }
  const names = ['m11', 'm12', 'm13', 'm14', 'm21', 'm22', 'm23', 'm24', 'm31', 'm32', 'm33', 'm34', 'm41', 'm42', 'm43', 'm44'];
  const alias: Record<string, number> = { a: 0, b: 1, c: 4, d: 5, e: 12, f: 13 };
  for (const [key, i] of [...names.map((n, i) => [n, i] as const), ...Object.entries(alias)]) {
    Object.defineProperty(Matrix.prototype, key, {
      get(this: Matrix) {
        return this.m[i];
      },
      set(this: Matrix, v: number) {
        this.m[i] = v;
      },
    });
  }
  Object.assign(globalThis, { DOMMatrix: Matrix });
}

installDOMMatrix();
const { activeCamera, apply3, depthAt, homography, inv3, mul3, projectLocal, projectPoint, rayToLayer, screenDeltaToWorld, NEAR } = await import('../src/engine/camera');
type Mat3 = import('../src/engine/camera').Mat3;
const { worldMatrix } = await import('../src/engine/transform');

/**
 *  A          (shape)
 *  G1         (group, 1–6 s)
 *    B        (text)
 *    G2       (group, 2–5 s)
 *      C      (shape)
 *      D      (null)
 *    E        (shape)
 *  F          (shape)
 */
function tree() {
  const p = createProject({ width: 1000, height: 600, duration: 10 });
  const make = (id: string, type: Layer['type'], extra: Partial<Layer> = {}) => createLayer(p, type, { id, name: id, ...extra });
  const C = make('C', 'shape');
  const D = make('D', 'null');
  const G2 = make('G2', 'group', { start: 2, end: 5, children: [C, D] });
  const B = make('B', 'text');
  const E = make('E', 'shape');
  const G1 = make('G1', 'group', { start: 1, end: 6, children: [B, G2, E] });
  const A = make('A', 'shape');
  const F = make('F', 'shape');
  p.layers = [A, G1, F];
  return { p, A, B, C, D, E, F, G1, G2 };
}

describe('layer tree', () => {
  it('finds layers in nested groups', () => {
    const { p, A, C, E, G1, G2 } = tree();
    expect(findLayer(p, 'C')).toEqual({ layer: C, list: G2.children, index: 0, group: G2 });
    expect(findLayer(p, 'E')).toMatchObject({ layer: E, index: 2, group: G1 });
    expect(findLayer(p, 'G2')).toMatchObject({ layer: G2, list: G1.children, index: 1, group: G1 });
    expect(findLayer(p, 'A')).toEqual({ layer: A, list: p.layers, index: 0, group: null });
    expect(findLayer(p, 'nope')).toBeNull();
    expect(findLayer(p, null)).toBeNull();
  });

  it('lists layers depth first, parents before children', () => {
    const { p } = tree();
    expect(allLayers(p).map((l) => l.id)).toEqual(['A', 'G1', 'B', 'G2', 'C', 'D', 'E', 'F']);
    const seen: string[] = [];
    walk(p.layers, (l, g, depth) => seen.push(`${l.id}:${g?.id ?? '-'}:${depth}`));
    expect(seen).toEqual(['A:-:0', 'G1:-:0', 'B:G1:1', 'G2:G1:1', 'C:G2:2', 'D:G2:2', 'E:G1:1', 'F:-:0']);
  });

  it('lists ancestors outermost first', () => {
    const { p } = tree();
    expect(ancestors(p, 'C').map((g) => g.id)).toEqual(['G1', 'G2']);
    expect(ancestors(p, 'E').map((g) => g.id)).toEqual(['G1']);
    expect(ancestors(p, 'A')).toEqual([]);
    expect(isInside(p, 'D', 'G1')).toBe(true);
    expect(isInside(p, 'D', 'G2')).toBe(true);
    expect(isInside(p, 'B', 'G2')).toBe(false);
    expect(isInside(p, 'G1', 'G1')).toBe(false);
  });

  it('limits the time window and visibility by the enclosing groups', () => {
    const { p, C, G1, G2, F } = tree();
    expect(effectiveWindow(p, C)).toEqual({ visible: true, start: 2, end: 5 });
    expect(effectiveWindow(p, F)).toEqual({ visible: true, start: 0, end: 10 });
    G1.visible = false;
    expect(effectiveWindow(p, C).visible).toBe(false);
    // A time-remapped group plays its content on its own clock, so its window doesn't clip.
    G2.timeRemapOn = true;
    expect(effectiveWindow(p, C)).toEqual({ visible: false, start: 1, end: 6 });
  });

  it('works on immer drafts and sees replaced layer arrays', () => {
    const { p } = tree();
    expect(findLayer(p, 'D')?.layer.name).toBe('D');
    const next = produce(p, (d) => {
      expect(allLayers(d).map((l) => l.id)).toEqual(['A', 'G1', 'B', 'G2', 'C', 'D', 'E', 'F']);
      const f = findLayer(d, 'D')!;
      f.layer.name = 'Renamed';
      f.list.splice(f.index, 1);
      d.layers.push(f.layer);
    });
    expect(findLayer(p, 'D')?.group?.id).toBe('G2');
    expect(findLayer(next, 'D')).toMatchObject({ group: null, index: 3 });
    expect(findLayer(next, 'D')?.layer.name).toBe('Renamed');
    expect(allLayers(next).map((l) => l.id)).toEqual(['A', 'G1', 'B', 'G2', 'C', 'E', 'F', 'D']);
  });
});

const close = (a: ArrayLike<number> | null | undefined, b: ArrayLike<number>, digits = 6) => {
  expect(a).toBeTruthy();
  expect(a!.length).toBe(b.length);
  for (let i = 0; i < b.length; i++) expect(a![i]).toBeCloseTo(b[i], digits);
};

const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('camera math', () => {
  it('inverts 3×3 matrices', () => {
    const m: Mat3 = [2, 0.5, 30, -0.3, 1.5, -12, 0.001, 0.002, 1];
    const inv = inv3(m)!;
    close(mul3(m, inv), I3);
    close(mul3(inv, m), I3);
    close(mul3(m, I3), m);
    expect(inv3([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull();
    // Composition order: (a·b) applied to a point = a applied to (b applied to the point).
    const b: Mat3 = [0.5, 0, 4, 0.2, 2, -1, 0, 0.01, 1];
    const [x, y, w] = apply3(b, 3, -7);
    const q = apply3(m, x / w, y / w).map((v) => v * w);
    close(apply3(mul3(m, b), 3, -7), q);
  });

  it('maps the z = 0 plane 1:1 through the default camera', () => {
    const p = createProject({ width: 1280, height: 720 });
    const cam = activeCamera(p, 0);
    expect(cam.layer).toBeNull();
    expect(cam.zoom).toBe(defaultZoom(p));
    // Any flat layer transform: its plane projects exactly where 2D drawing puts it.
    const world = new DOMMatrix().translateSelf(300, 200).rotateSelf(30).scaleSelf(1.5, 0.8);
    const H = homography(cam, world);
    for (const [u, v] of [
      [0, 0],
      [100, -40],
      [-250, 333],
    ] as Vec2[]) {
      close(projectLocal(H, u, v), [world.a * u + world.c * v + world.e, world.b * u + world.d * v + world.f]);
      expect(depthAt(H, u, v)).toBeCloseTo(cam.zoom, 6);
    }
    // A camera layer left at its defaults is the same camera.
    p.layers = [createLayer(p, 'camera')];
    const layerCam = activeCamera(p, 0);
    expect(layerCam.layer?.type).toBe('camera');
    close(homography(layerCam, world), H);
  });

  it('projects points with perspective and culls points behind the camera', () => {
    const p = createProject({ width: 1000, height: 1000 });
    const cam = activeCamera(p, 0);
    const f = cam.zoom;
    close(projectPoint(cam, 700, 300, 0)!.p, [700, 300]);
    // Twice as far away: half the distance from the center.
    const far = projectPoint(cam, 700, 300, f)!;
    close(far.p, [500 + 100, 500 - 100]);
    expect(far.depth).toBeCloseTo(2 * f, 6);
    expect(projectPoint(cam, 500, 500, -f + NEAR / 2)).toBeNull();
    // Dragging on screen moves a point on the camera-facing plane, scaled by its depth.
    close(screenDeltaToWorld(cam, [700, 300, 0], 10, -4), [10, -4, 0]);
    close(screenDeltaToWorld(cam, [700, 300, f], 10, -4), [20, -8, 0]);
  });

  it('casts screen points back onto a 3D layer (inverse of the projection)', () => {
    const p = createProject({ width: 1920, height: 1080 });
    const zoom = defaultZoom(p);
    const cam = createLayer(p, 'camera', {
      props: { position: { value: [900, 600] }, z: { value: -zoom * 1.3 }, rotX: { value: -6 }, rotY: { value: 9 }, rotation: { value: 3 }, zoom: { value: zoom } },
    });
    const card = createLayer(p, 'shape', {
      threeD: true,
      props: {
        position: { value: [760, 420] },
        z: { value: 350 },
        rotX: { value: 25 },
        rotY: { value: -40 },
        rotation: { value: 15 },
        scale: { value: [120, 80] },
        anchor: { value: [10, -20] },
        size: { value: [400, 300] },
      },
    });
    p.layers = [cam, card];
    const camera = activeCamera(p, 0);
    expect(camera.layer?.id).toBe(cam.id);
    const H = homography(camera, worldMatrix(p, card, 0));
    for (const [u, v] of [
      [0, 0],
      [-200, -150],
      [200, -150],
      [200, 150],
      [-120, 90],
    ] as Vec2[]) {
      const screen = projectLocal(H, u, v);
      expect(screen).not.toBeNull();
      close(rayToLayer(p, card, screen!, 0, camera), [u, v], 5);
    }
  });

  it('follows the top-most visible, active camera', () => {
    const p = createProject({ width: 800, height: 800, duration: 10 });
    const near = createLayer(p, 'camera', { name: 'Near', start: 0, end: 4, props: { z: { value: -500 } } });
    const far = createLayer(p, 'camera', { name: 'Far', props: { z: { value: -3000 } } });
    p.layers = [near, far];
    expect(activeCamera(p, 1).layer?.name).toBe('Near');
    expect(activeCamera(p, 5).layer?.name).toBe('Far');
    near.visible = false;
    expect(activeCamera(p, 1).layer?.name).toBe('Far');
    far.visible = false;
    expect(activeCamera(p, 1).layer).toBeNull();
  });
});
