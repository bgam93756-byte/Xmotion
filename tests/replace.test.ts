import { describe, expect, it } from 'vitest';
import { createLayer, createProject } from '../src/model/schema';
import type { AssetMeta, Vec2 } from '../src/model/types';
import { canReplace, replaceWithMedia } from '../src/model/replace';

const video = (w: number, h: number): AssetMeta => ({ id: 'a1', name: 'clip.mp4', kind: 'video', mime: 'video/mp4', width: w, height: h, duration: 3 });

describe('Replace', () => {
  it('turns a clip slot into a video that covers it, keeping keyframes and effects', () => {
    const p = createProject({ width: 1080, height: 1920 });
    const slot = createLayer(p, 'shape', {
      shape: 'rect',
      placeholder: true,
      start: 1,
      end: 2,
      props: {
        size: { value: [1080, 1920] },
        anchor: { value: [10, 20] },
        scale: { value: [100, 100], keys: [{ id: 'k1', t: 0, v: [100, 100], ease: 'linear' }, { id: 'k2', t: 0.5, v: [120, 120], ease: 'linear' }] },
        fill: { value: '#ff0000' },
      },
      effects: [],
    });
    expect(canReplace(slot)).toBe(true);
    replaceWithMedia(p, slot, video(540, 960));
    expect(slot.type).toBe('video');
    expect(slot.asset).toBe('a1');
    expect(slot.placeholder).toBeUndefined();
    expect(slot.shape).toBeUndefined();
    expect(slot.props.fill).toBeUndefined();
    expect(slot.props.size).toBeUndefined();
    // 540×960 has to grow 2× to cover 1080×1920; the pivot stays on the same spot.
    expect(slot.props.scale.keys!.map((k) => k.v)).toEqual([
      [200, 200],
      [240, 240],
    ]);
    expect(slot.props.anchor.value).toEqual([5, 10]);
    expect([slot.start, slot.end]).toEqual([1, 2]);
    expect(p.assets.map((a) => a.id)).toEqual(['a1']);
  });

  it('covers the old picture when swapping media of another shape', () => {
    const p = createProject({ width: 1920, height: 1080 });
    p.assets.push({ id: 'old', name: 'wide.jpg', kind: 'image', mime: 'image/jpeg', width: 1920, height: 1080 });
    const img = createLayer(p, 'image', { asset: 'old', props: { scale: { value: [50, 50] } } });
    replaceWithMedia(p, img, video(1080, 1080));
    const [sx] = img.props.scale.value as Vec2;
    expect(sx).toBeCloseTo(50 * (1920 / 1080), 1);
    expect(img.trimIn).toBe(0);
  });

  it('leaves plain shapes alone', () => {
    const p = createProject();
    expect(canReplace(createLayer(p, 'shape', { shape: 'rect' }))).toBe(false);
    expect(canReplace(createLayer(p, 'text'))).toBe(false);
  });
});
