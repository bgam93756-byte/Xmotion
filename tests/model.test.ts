import { describe, expect, it } from 'vitest';
import { applyEase, cubicBezier } from '../src/model/easing';
import { compileExpr, validateExpr, type ExprEnv } from '../src/model/expr';
import { interpolate, keyedValue } from '../src/model/animate';
import { lerpColor, parseColor } from '../src/model/color';
import type { Prop } from '../src/model/types';

const env = (over: Partial<ExprEnv> = {}): ExprEnv => ({
  time: 1,
  frame: 30,
  fps: 30,
  value: [100, 200],
  index: 1,
  width: 1920,
  height: 1080,
  inPoint: 0,
  outPoint: 5,
  duration: 5,
  seed: 1,
  valueAt: () => 0,
  keyRange: null,
  ...over,
});

describe('easing', () => {
  it('maps endpoints exactly', () => {
    for (const e of ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'elastic', 'bounce'] as const) {
      expect(applyEase(e, 0)).toBeCloseTo(0, 5);
      expect(applyEase(e, 1)).toBeCloseTo(1, 5);
    }
  });
  it('solves cubic bezier', () => {
    expect(cubicBezier([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 4);
    expect(cubicBezier([0.42, 0, 0.58, 1], 0.5)).toBeCloseTo(0.5, 4);
  });
  it('hold jumps at the end', () => {
    expect(applyEase('hold', 0.99)).toBe(0);
  });
});

describe('expressions', () => {
  it('does vector math with broadcasting', () => {
    expect(compileExpr('value + [10, -20]')(env())).toEqual([110, 180]);
    expect(compileExpr('value * 2')(env())).toEqual([200, 400]);
    expect(compileExpr('value[1] / 2')(env())).toBe(100);
  });
  it('supports precedence, ternary, power and functions', () => {
    expect(compileExpr('2 + 3 * 4')(env())).toBe(14);
    expect(compileExpr('-2 ^ 2')(env())).toBe(-4);
    expect(compileExpr('time > 0.5 ? 1 : 0')(env())).toBe(1);
    expect(compileExpr('Math.max(1, 5, 3)')(env())).toBe(5);
    expect(compileExpr('linear(time, 0, 2, 0, 100)')(env())).toBe(50);
    expect(compileExpr('clamp(150, 0, 100)')(env())).toBe(100);
  });
  it('wiggle stays near the value and is deterministic', () => {
    const a = compileExpr('wiggle(2, 10)')(env()) as number[];
    const b = compileExpr('wiggle(2, 10)')(env()) as number[];
    expect(a).toEqual(b);
    expect(Math.abs(a[0] - 100)).toBeLessThanOrEqual(20);
  });
  it('rejects unsafe or invalid code', () => {
    expect(validateExpr('constructor')).toMatch(/Unknown name/);
    expect(validateExpr('alert(1)')).toMatch(/Unknown function/);
    expect(validateExpr('toString()')).toMatch(/Unknown function/);
    expect(validateExpr('__proto__')).toMatch(/Unknown name/);
    expect(validateExpr('value +')).toBeTruthy();
    expect(validateExpr('a = 1')).toBeTruthy();
    expect(validateExpr('sin(time) * 30')).toBeNull();
  });
  it('loops keyframes', () => {
    const e = env({ time: 2.5, keyRange: [0, 1], valueAt: (t) => t * 10 });
    expect(compileExpr('loop()')(e)).toBeCloseTo(5);
    expect(compileExpr('pingpong()')(env({ time: 1.25, keyRange: [0, 1], valueAt: (t) => t }))).toBeCloseTo(0.75);
  });
});

describe('keyframes', () => {
  const prop: Prop = {
    value: 0,
    keys: [
      { id: 'a', t: 0, v: 0, ease: 'linear' },
      { id: 'b', t: 1, v: 100, ease: 'hold' },
      { id: 'c', t: 2, v: 50, ease: 'linear' },
    ],
  };
  it('interpolates and clamps', () => {
    expect(keyedValue(prop, -1)).toBe(0);
    expect(keyedValue(prop, 0.25)).toBe(25);
    expect(keyedValue(prop, 1.5)).toBe(100);
    expect(keyedValue(prop, 3)).toBe(50);
  });
  it('interpolates vectors and colors', () => {
    expect(interpolate([0, 10], [10, 20], 0.5)).toEqual([5, 15]);
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(parseColor('#ff000080')[3]).toBeCloseTo(0.5, 2);
  });
});
