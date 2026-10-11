import { describe, expect, it } from 'vitest';
import { createLayer, createProject } from '../src/model/schema';
import type { Layer, Project } from '../src/model/types';
import { applyNateStyle, cutTimes, hasNateStyle, planAccents, removeNateStyle } from '../src/model/nate';
import { TEMPLATES } from '../src/model/templates';

function project(spans: [number, number][], audio = false): Project {
  const p = createProject({ name: 'nate video', width: 1080, height: 1920, fps: 30, duration: 6 });
  p.layers = spans.map(([start, end], i) => createLayer(p, 'shape', { name: `Clip ${i + 1}`, shape: 'rect', start, end }));
  if (audio) p.layers.push(createLayer(p, 'audio', { name: 'Song', start: 0, end: 6 }));
  return p;
}

const names = (p: Project) => p.layers.map((l) => l.name);
const group = (p: Project) => p.layers.find((l) => l.name === 'Nate · clips')!;

/** Every keyframed property of a layer and its effects has keys in time order, one per time. */
function keysOrdered(l: Layer) {
  const props = [...Object.values(l.props), ...l.effects.flatMap((e) => Object.values(e.props))];
  return props.every((pr) => !pr.keys || pr.keys.every((k, i) => i === 0 || k.t > pr.keys![i - 1].t));
}

describe('Nate style', () => {
  it('groups the clips and adds the intro, grade, hits, spins and flashes', () => {
    const p = project([
      [0, 1.5],
      [1.5, 2.5],
      [2.5, 3.5],
      [3.5, 4.5],
      [4.5, 6],
    ]);
    const r = applyNateStyle(p);
    expect(hasNateStyle(p)).toBe(true);
    const g = group(p);
    expect(g.children!.map((c) => c.name)).toEqual(['Clip 1', 'Clip 2', 'Clip 3', 'Clip 4', 'Clip 5']);
    // Cuts at 1.5, 2.5, 3.5, 4.5: the third one spins, the others hit and flash.
    expect(r.spins).toBe(1);
    expect(r.flashes).toBe(4);
    expect(g.props.rotation.keys!.map((k) => k.v)).toEqual([0, 180, 360]);
    expect(names(p)).toEqual(expect.arrayContaining(['Nate · name', 'Nate · quote', 'Nate · look', 'Nate · blue intro', 'Nate · letterbox top', 'Nate · letterbox bottom']));
    // The intro (name, quote, blue grade) lasts until the first cut.
    expect(p.layers.find((l) => l.name === 'Nate · name')!.end).toBe(1.5);
    expect(p.layers.every(keysOrdered)).toBe(true);
    expect(keysOrdered(g)).toBe(true);
  });

  it('applies again without duplicating and keeps the typed name and quote', () => {
    const p = project([
      [0, 2],
      [2, 4],
      [4, 6],
    ]);
    applyNateStyle(p);
    p.layers.find((l) => l.name === 'Nate · name')!.text = 'ZANE';
    p.layers.find((l) => l.name === 'Nate · quote')!.text = '"HOTTEST GIRL"';
    const before = p.layers.length;
    applyNateStyle(p);
    expect(p.layers.length).toBe(before);
    expect(p.layers.filter((l) => l.name === 'Nate · clips')).toHaveLength(1);
    expect(p.layers.find((l) => l.name === 'Nate · name')!.text).toBe('ZANE');
    expect(p.layers.find((l) => l.name === 'Nate · quote')!.text).toBe('"HOTTEST GIRL"');
    removeNateStyle(p);
    expect(names(p)).toEqual(['Clip 1', 'Clip 2', 'Clip 3']);
  });

  it('hits on the beats of the music and keeps the song at the bottom', () => {
    const p = project([[0, 6]], true);
    const beats = [0.5, 1.0, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5].map((t) => ({ t, strength: 0.9 }));
    const r = applyNateStyle(p, { beats });
    expect(r.beatSynced).toBe(true);
    expect(p.layers[p.layers.length - 1].name).toBe('Song');
    // No cuts: every fourth beat spins, the rest shake.
    const amount = group(p).effects.find((e) => e.type === 'shake')!.props.amount.keys!;
    const peaks = amount.filter((k) => (k.v as number) > 0).map((k) => k.t);
    expect(peaks.length + r.spins).toBe(beats.filter((b) => b.t > 1.7).length);
    for (const t of peaks) expect(beats.some((b) => Math.abs(b.t - t) < 1 / 30 + 1e-9)).toBe(true);
  });

  it('plans cuts first and keeps hits 0.3 s apart', () => {
    const acc = planAccents([1, 2], [{ t: 1.1, strength: 1 }, { t: 1.5, strength: 0.8 }, { t: 1.6, strength: 0.3 }], [[0, 3]], 0.8, 3);
    expect(acc.map((a) => [a.t, a.cut])).toEqual([
      [1, true],
      [1.5, false],
      [2, true],
    ]);
  });

  it('finds cuts at clip starts', () => {
    const p = project([
      [0, 1],
      [1, 2],
      [1, 3],
    ]);
    expect(cutTimes(p.layers, 30, 6)).toEqual([1]);
  });

  it('builds the Nate video template with clip slots', () => {
    const t = TEMPLATES.find((x) => x.id === 'nate')!;
    const p = t.build();
    const g = group(p);
    expect(g.children!.every((c) => c.placeholder)).toBe(true);
    expect(g.children!.length).toBe(9);
    expect(p.layers.every(keysOrdered)).toBe(true);
  });
});
