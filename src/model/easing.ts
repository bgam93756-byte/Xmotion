import type { Bezier, EaseName } from './types';

export const BEZIER_PRESETS: Partial<Record<EaseName, Bezier>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.55, 0, 1, 0.45],
  easeOut: [0, 0.55, 0.45, 1],
  easeInOut: [0.65, 0, 0.35, 1],
};

export const EASE_LABELS: Record<EaseName, string> = {
  linear: 'Linear',
  hold: 'Hold',
  ease: 'Ease',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In-Out',
  backIn: 'Back In',
  backOut: 'Back Out (overshoot)',
  elastic: 'Elastic',
  bounce: 'Bounce',
  custom: 'Custom curve',
};

/** Returns y for a CSS-style cubic-bezier(x1, y1, x2, y2) at progress x. */
export function cubicBezier([x1, y1, x2, y2]: Bezier, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  // Newton-Raphson, falling back to bisection for flat slopes.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - x;
    if (Math.abs(err) < 1e-6) return sampleY(t);
    const d = slopeX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 40; i++) {
    const v = sampleX(t);
    if (Math.abs(v - x) < 1e-6) break;
    if (v < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

function bounceOut(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** Maps linear progress (0..1) through the named easing curve. */
export function applyEase(name: EaseName, x: number, bez?: Bezier): number {
  switch (name) {
    case 'linear':
      return x;
    case 'hold':
      return x >= 1 ? 1 : 0;
    case 'backIn': {
      const c1 = 1.70158;
      return (c1 + 1) * x * x * x - c1 * x * x;
    }
    case 'backOut': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'elastic': {
      if (x === 0 || x === 1) return x;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    case 'bounce':
      return bounceOut(x);
    case 'custom':
      return cubicBezier(bez ?? [0.25, 0.1, 0.25, 1], x);
    default:
      return cubicBezier(BEZIER_PRESETS[name] ?? [0, 0, 1, 1], x);
  }
}

/** Bezier handles shown in the curve editor for a given easing. */
export function bezierFor(name: EaseName, bez?: Bezier): Bezier {
  if (name === 'custom' && bez) return bez;
  return BEZIER_PRESETS[name] ?? [0.25, 0.1, 0.25, 1];
}
