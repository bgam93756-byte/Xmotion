import { describe, expect, it } from 'vitest';
import { detectOnsets } from '../src/engine/beats';

const SR = 22050;

/** A kick drum: a 60 Hz thump that decays over ~150 ms. */
function kick(buf: Float32Array, t: number, gain = 1) {
  const s = Math.round(t * SR);
  for (let i = 0; i < SR * 0.25 && s + i < buf.length; i++) buf[s + i] += gain * Math.sin((2 * Math.PI * 60 * i) / SR) * Math.exp(-i / (SR * 0.05));
}

/** Seeded noise for a quiet bed under the beats. */
function noise(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646 - 0.5;
  };
}

describe('detectOnsets', () => {
  it('finds kicks within 20 ms', () => {
    const buf = new Float32Array(SR * 4);
    const r = noise(7);
    for (let i = 0; i < buf.length; i++) buf[i] = r() * 0.01;
    const times = [0.5, 1.0, 1.5, 2.0, 2.75, 3.25];
    times.forEach((t) => kick(buf, t));
    const found = detectOnsets(buf, SR);
    expect(found.length).toBe(times.length);
    found.forEach((o, i) => expect(Math.abs(o.t - times[i])).toBeLessThan(0.02));
  });

  it('ranks loud hits above soft ones and keeps them apart', () => {
    const buf = new Float32Array(SR * 3);
    kick(buf, 0.5, 1);
    kick(buf, 1.0, 0.3);
    // A second hit 100 ms after a loud one is dropped (min gap 0.25 s).
    kick(buf, 2.0, 1);
    kick(buf, 2.1, 0.5);
    const found = detectOnsets(buf, SR);
    expect(found.map((o) => Math.round(o.t * 10) / 10)).toEqual([0.5, 1.0, 2.0]);
    expect(found[1].strength).toBeLessThan(found[0].strength);
  });

  it('returns nothing for silence', () => {
    expect(detectOnsets(new Float32Array(SR), SR)).toEqual([]);
  });
});
