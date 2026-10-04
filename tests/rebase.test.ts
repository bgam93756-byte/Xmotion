import { describe, expect, it } from 'vitest';
import { createLayer, createProject } from '../src/model/schema';
import type { Layer, Vec2 } from '../src/model/types';
import { installDOMMatrix } from './dommatrix';

installDOMMatrix();
const { localMatrix } = await import('../src/engine/transform');
const { rebase } = await import('../src/state/rebase');

const project = createProject({ width: 1080, height: 1080 });
const ec = { project, index: 1 };

/** Deterministic pseudo-random numbers. */
function rng(seed: number) {
  return (a: number, b: number) => {
    seed = (seed * 16807) % 2147483647;
    return a + ((seed - 1) / 2147483646) * (b - a);
  };
}

const flat = (m: DOMMatrix) => (m.is2D ? m : new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));

function randomLayer(r: (a: number, b: number) => number, threeD: boolean): Layer {
  const v = (value: unknown) => ({ value }) as never;
  return createLayer(project, 'shape', {
    threeD,
    props: {
      size: v([r(50, 400), r(50, 400)]),
      position: v([r(100, 900), r(100, 900)]),
      z: v(r(-200, 200)),
      rotation: v(r(-180, 180)),
      rotX: v(threeD ? r(-60, 60) : 0),
      rotY: v(threeD ? r(-60, 60) : 0),
      scale: v([r(-150, 200), r(-150, 200)]),
      anchor: v([r(-50, 50), r(-50, 50)]),
      skew: v(r(-30, 30)),
      skewAxis: v(r(-90, 90)),
    },
  });
}

function randomParent(r: (a: number, b: number) => number, threeD: boolean): DOMMatrix {
  const m = new DOMMatrix().translateSelf(r(-300, 300), r(-300, 300), threeD ? r(-200, 200) : 0);
  m.rotateSelf(r(-180, 180));
  if (threeD) m.rotateSelf(r(-60, 60), r(-60, 60), 0);
  m.rotateSelf(r(-90, 90));
  m.skewXSelf(r(-30, 30));
  return m.scaleSelf(r(0.4, 2) * (r(0, 1) < 0.3 ? -1 : 1), r(0.4, 2));
}

/** The layer's corners in comp space (2D layers use the 2D part of the matrix). */
function corners(l: Layer, parent: DOMMatrix): number[][] {
  const w = parent.multiply(localMatrix(l, 0, ec, undefined, undefined, false));
  const m = l.threeD ? w : flat(w);
  return [
    [-100, -80],
    [120, -60],
    [-90, 140],
    [130, 110],
  ].map(([u, v]) => {
    const q = m.transformPoint(new DOMPoint(u, v, 0));
    return [q.x, q.y, l.threeD ? q.z : 0];
  });
}

const maxDiff = (a: number[][], b: number[][]) => Math.max(...a.flatMap((p, i) => p.map((v, j) => Math.abs(v - b[i][j]))));

describe('rebase (keeping layers in place)', () => {
  it('keeps static 2D layers exactly in place under any affine parent change', () => {
    const r = rng(11);
    for (let i = 0; i < 40; i++) {
      const l = randomLayer(r, false);
      const oldP = randomParent(r, false);
      const newP = randomParent(r, false);
      const before = corners(l, oldP);
      expect(rebase(l, oldP, newP, 0, ec)).toBe(true);
      expect(maxDiff(before, corners(l, newP))).toBeLessThan(0.01);
    }
  });

  it('keeps static 3D layers exactly in place under 3D parent changes', () => {
    const r = rng(29);
    for (let i = 0; i < 40; i++) {
      const l = randomLayer(r, true);
      const oldP = randomParent(r, true);
      const newP = randomParent(r, true);
      const before = corners(l, oldP);
      if (!rebase(l, oldP, newP, 0, ec)) continue; // beyond the ±85° skew the model allows
      expect(maxDiff(before, corners(l, newP))).toBeLessThan(0.01);
    }
  });

  it('maps every keyframe exactly when the change is a similarity', () => {
    const l = createLayer(project, 'shape', {
      props: {
        position: {
          value: [0, 0],
          keys: [
            { id: 'a', t: 0, v: [100, 200], ease: 'linear' },
            { id: 'b', t: 1, v: [500, 300], ease: 'linear' },
          ],
        },
        rotation: { value: 0, keys: [{ id: 'c', t: 0, v: 10, ease: 'linear' }] },
        scale: { value: [100, 100], keys: [{ id: 'd', t: 0.5, v: [80, 120], ease: 'linear' }] },
      },
    });
    const oldP = new DOMMatrix().translateSelf(40, -30).rotateSelf(25).scaleSelf(1.5);
    const newP = new DOMMatrix();
    const at = (t: number, layer: Layer, parent: DOMMatrix) => flat(parent.multiply(localMatrix(layer, t, ec, undefined, undefined, false)));
    const before = [0, 0.5, 1].map((t) => at(t, l, oldP));
    expect(rebase(l, oldP, newP, 0, ec)).toBe(true);
    [0, 0.5, 1].forEach((t, i) => {
      const m = at(t, l, newP);
      for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) expect(m[k]).toBeCloseTo(before[i][k], 3);
    });
    expect(l.props.rotation.keys![0].v).toBeCloseTo(35, 6);
    expect((l.props.scale.keys![0].v as Vec2)[0]).toBeCloseTo(120, 6);
  });

  it('reports animated layers under a non-uniform change as approximate', () => {
    const l = createLayer(project, 'shape', { props: { rotation: { value: 0, keys: [{ id: 'k', t: 0, v: 30, ease: 'linear' }] } } });
    expect(rebase(l, new DOMMatrix().scaleSelf(2, 1), new DOMMatrix(), 0, ec)).toBe(false);
  });

  it("doesn't turn a mirrored scale into a rotation", () => {
    const l = createLayer(project, 'shape', { props: { scale: { value: [-100, 100] }, rotation: { value: 20 } } });
    rebase(l, new DOMMatrix().scaleSelf(1, 2), new DOMMatrix(), 0, ec);
    expect((l.props.scale.value as Vec2)[0]).toBeLessThan(0);
    expect(l.props.rotation.value as number).toBeGreaterThan(-90);
    expect(l.props.rotation.value as number).toBeLessThan(90);
  });
});
