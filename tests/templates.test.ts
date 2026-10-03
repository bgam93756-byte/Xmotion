import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/model/templates';
import { allLayers, findLayer, walk } from '../src/model/tree';
import type { Layer, Project } from '../src/model/types';

const build = (id: string): Project => TEMPLATES.find((t) => t.id === id)!.build();

const layers = (p: Project) => {
  const out: Layer[] = [];
  walk(p.layers, (l) => out.push(l));
  return out;
};

describe('templates', () => {
  it('build valid layer trees', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      const p = t.build();
      const all = layers(p);
      expect(new Set(all.map((l) => l.id)).size, t.id).toBe(all.length);
      // The tree index is cached per layers array: building must not leave it stale.
      expect(allLayers(p), t.id).toEqual(all);
      for (const l of all) {
        const where = `${t.id} › ${l.name}`;
        const found = findLayer(p, l.id);
        expect(found?.layer, where).toBe(l);
        if (l.parent) {
          // Parents are other layers of the same container.
          const siblings = found!.list.map((s) => s.id);
          expect(l.parent, where).not.toBe(l.id);
          expect(siblings, where).toContain(l.parent);
        }
        expect(l.end, where).toBeGreaterThan(l.start);
        for (const [key, prop] of Object.entries(l.props)) {
          const ts = (prop.keys ?? []).map((k) => k.t);
          expect(ts, `${where}.${key}`).toEqual([...ts].sort((a, b) => a - b));
          for (const k of ts) expect(k >= 0 && k <= l.end - l.start, `${where}.${key} @${k}`).toBe(true);
        }
      }
    }
  });

  it('3D Card Flip: 3D faces on a flipping 3D null, filmed by a dollying camera', () => {
    const p = build('cardflip');
    const all = layers(p);
    const camera = all.find((l) => l.type === 'camera')!;
    expect(camera.props.z.keys?.length).toBeGreaterThan(1);
    const pivot = all.find((l) => l.type === 'null')!;
    expect(pivot.threeD).toBe(true);
    expect(pivot.props.rotY.keys?.map((k) => k.v)).toContain(180);
    const faces = all.filter((l) => l.parent === pivot.id);
    expect(faces).toHaveLength(4);
    for (const f of faces) expect(f.threeD).toBe(true);
    // Front and back face opposite ways.
    expect(faces.filter((f) => f.props.rotY?.value === 180)).toHaveLength(2);
  });

  it('Mask Reveal: an animated alpha mask above the title inside a group', () => {
    const p = build('maskreveal');
    const group = p.layers.find((l) => l.type === 'group')!;
    const [mask, ...rest] = group.children!;
    expect(mask.maskMode).toBe('alpha');
    expect(mask.props.size.keys?.length).toBeGreaterThan(1);
    expect(mask.props.position.keys?.length).toBeGreaterThan(1);
    expect(rest.some((l) => l.type === 'text')).toBe(true);
    expect(p.layers.some((l) => l !== group && l.type === 'shape' && !l.maskMode)).toBe(true);
  });

  it('Parallax Depth: 3D layers at several depths, a panning camera and motion blur', () => {
    const p = build('parallax');
    expect(p.motionBlur.on).toBe(true);
    const all = layers(p);
    const camera = all.find((l) => l.type === 'camera')!;
    const [a, b] = camera.props.position.keys!;
    expect(a.v).not.toEqual(b.v);
    const depths = new Set(all.filter((l) => l.threeD).map((l) => l.props.z?.value));
    expect(depths.size).toBeGreaterThanOrEqual(4);
  });
});
