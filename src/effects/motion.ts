import { fbm1, hash1, seedFromString } from '../model/noise';
import { DEG, WAVES, ang, col, num, opt, pct, px, wave, type EffectSpec } from './types';

export const MOTION_EFFECTS: EffectSpec[] = [
  {
    type: 'shake',
    label: 'Auto-Shake',
    category: 'Motion',
    description: 'Automatically shakes a layer to create energetic movement.',
    props: [px('amount', 'Amount', 20, 500), num('speed', 'Frequency', 8, 0, 60), num('rotation', 'Rotation', 2, 0, 90, { unit: '°' })],
    transform: (e, out) => {
      const s = seedFromString(e.layer.id) + e.seed;
      const x = e.t * e.n('speed');
      out.dx += fbm1(x, s, 2) * e.n('amount');
      out.dy += fbm1(x, s + 50, 2) * e.n('amount');
      out.rot += fbm1(x, s + 99, 2) * e.n('rotation');
    },
  },
  {
    type: 'oscillate',
    label: 'Oscillate',
    category: 'Motion',
    description: 'Makes a layer move back and forth repeatedly.',
    props: [opt('wave', 'Wave', WAVES), ang('angle', 'Direction', 0), px('amplitude', 'Amplitude', 60, 2000), num('frequency', 'Frequency (Hz)', 1, 0, 30, { step: 0.05 }), num('phase', 'Phase', 0, -360, 360, { unit: '°' })],
    transform: (e, out) => {
      const v = wave(e.o('wave'), e.local * e.n('frequency') + e.n('phase') / 360) * e.n('amplitude');
      out.dx += Math.cos(e.n('angle') * DEG) * v;
      out.dy += Math.sin(e.n('angle') * DEG) * v;
    },
  },
  {
    type: 'pulseSize',
    label: 'Pulse Size',
    category: 'Motion',
    description: 'Makes a layer repeatedly grow and shrink.',
    props: [opt('wave', 'Wave', WAVES), pct('amount', 'Amount', 15, 0, 200), num('frequency', 'Frequency (Hz)', 1.5, 0, 30, { step: 0.05 }), num('phase', 'Phase', 0, -360, 360, { unit: '°' })],
    transform: (e, out) => {
      const k = 1 + (e.n('amount') / 100) * (0.5 + 0.5 * wave(e.o('wave'), e.local * e.n('frequency') + e.n('phase') / 360));
      out.sx *= k;
      out.sy *= k;
    },
  },
  {
    type: 'spin',
    label: 'Spin',
    category: 'Motion',
    description: 'Rotates the layer continuously.',
    props: [num('speed', 'Speed (°/s)', 90, -3600, 3600)],
    transform: (e, out) => {
      out.rot += e.n('speed') * e.local;
    },
  },
  {
    type: 'swing',
    label: 'Swing',
    category: 'Motion',
    description: 'Animates a layer with swinging movement (set the anchor at the pivot).',
    props: [num('amplitude', 'Swing angle', 20, 0, 180, { unit: '°' }), num('frequency', 'Frequency (Hz)', 1, 0, 20, { step: 0.05 }), pct('damping', 'Damping', 0), num('phase', 'Phase', 0, -360, 360, { unit: '°' })],
    transform: (e, out) => {
      const damp = Math.exp(-(e.n('damping') / 100) * 3 * e.local);
      out.rot += Math.sin((e.local * e.n('frequency') + e.n('phase') / 360) * Math.PI * 2) * e.n('amplitude') * damp;
    },
  },
  {
    type: 'randomJitter',
    label: 'Random Jitter',
    category: 'Motion',
    description: 'Adds irregular, random jumps in position, rotation and size.',
    props: [px('amount', 'Position jitter', 10, 500), num('rotation', 'Rotation jitter', 3, 0, 180, { unit: '°' }), pct('scale', 'Scale jitter', 0, 0, 100), num('speed', 'Jumps / sec', 12, 0, 60), num('seed', 'Random seed', 1, 0, 9999, { step: 1 })],
    transform: (e, out) => {
      const step = Math.floor(e.local * e.n('speed'));
      const s = seedFromString(e.layer.id) + e.n('seed') * 13.1;
      const r = (k: number) => hash1(step * 3.17 + k, s) * 2 - 1;
      out.dx += r(1) * e.n('amount');
      out.dy += r(2) * e.n('amount');
      out.rot += r(3) * e.n('rotation');
      const k = 1 + r(4) * (e.n('scale') / 100);
      out.sx *= k;
      out.sy *= k;
    },
  },
  {
    type: 'flipLayer',
    label: 'Flip Layer',
    category: 'Motion',
    description: 'Flips a layer to create a mirrored orientation.',
    props: [opt('axis', 'Flip', ['Horizontal', 'Vertical', 'Both'])],
    transform: (e, out) => {
      const a = e.o('axis');
      if (a === 0 || a === 2) out.sx *= -1;
      if (a === 1 || a === 2) out.sy *= -1;
    },
  },
  {
    type: 'moveAlongPath',
    label: 'Move Along Path',
    category: 'Motion',
    description: 'Animates a layer along a path — pick a shape or drawing layer as the path.',
    props: [pct('progress', 'Progress (animate me)', 0, -1000, 1000), opt('orient', 'Orient along path', ['Yes', 'No']), num('rotation', 'Extra rotation', 0, -360, 360, { unit: '°' }), num('speed', 'Auto speed (loops/s)', 0, -10, 10, { step: 0.05 })],
    refs: [{ key: 'path', label: 'Path layer', hint: 'A shape or drawing layer (it can be hidden)' }],
    transform: () => {
      /* Resolved in engine/transform.ts, which can read the referenced layer's outline. */
    },
  },
  {
    type: 'blink',
    label: 'Blink',
    category: 'Motion',
    description: 'Makes a layer flash on and off.',
    props: [num('frequency', 'Blinks / sec', 2, 0, 30, { step: 0.05 }), pct('duty', 'Time visible', 50, 1, 99), pct('softness', 'Softness', 0, 0, 100), pct('low', 'Off opacity', 0)],
    opacity: (e) => {
      const f = (e.local * e.n('frequency')) % 1;
      const duty = e.n('duty') / 100;
      const soft = (e.n('softness') / 100) * 0.25;
      let on: number;
      if (soft <= 0) on = f < duty ? 1 : 0;
      else on = Math.min(smooth(0, soft, f), 1 - smooth(duty - soft, duty, f));
      const low = e.n('low') / 100;
      return low + (1 - low) * on;
    },
  },
  {
    type: 'flicker',
    label: 'Flicker',
    category: 'Motion',
    description: 'Creates rapid random changes in visibility.',
    props: [pct('amount', 'Amount', 60), num('speed', 'Flickers / sec', 15, 0, 60), pct('chance', 'Flicker chance', 40)],
    opacity: (e) => {
      const step = Math.floor(e.local * e.n('speed'));
      const r = hash1(step * 1.37 + 5, seedFromString(e.layer.id));
      if (r > e.n('chance') / 100) return 1;
      return 1 - (e.n('amount') / 100) * hash1(step * 2.11 + 9, seedFromString(e.layer.id));
    },
  },
  {
    type: 'pulseOpacity',
    label: 'Pulse Opacity',
    category: 'Motion',
    description: 'Makes opacity repeatedly increase and decrease.',
    props: [opt('wave', 'Wave', WAVES), pct('amount', 'Amount', 60), num('frequency', 'Frequency (Hz)', 1, 0, 30, { step: 0.05 }), num('phase', 'Phase', 0, -360, 360, { unit: '°' })],
    opacity: (e) => 1 - (e.n('amount') / 100) * (0.5 + 0.5 * wave(e.o('wave'), e.local * e.n('frequency') + e.n('phase') / 360)),
  },
  {
    type: 'fadeInOut',
    label: 'Fade In/Out',
    category: 'Motion',
    description: 'Gradually fades a layer in at its start and out at its end.',
    props: [num('in', 'Fade in (s)', 0.5, 0, 30, { step: 0.05 }), num('out', 'Fade out (s)', 0.5, 0, 30, { step: 0.05 })],
    opacity: (e) => {
      let k = 1;
      if (e.n('in') > 0) k *= Math.min(1, Math.max(0, e.local / e.n('in')));
      if (e.n('out') > 0) k *= Math.min(1, Math.max(0, (e.dur - e.local) / e.n('out')));
      return k;
    },
  },
  {
    type: 'timeQuantization',
    label: 'Time Quantization',
    category: 'Motion',
    description: 'Reduces temporal smoothness to create stepped or choppy motion (stop-motion look).',
    props: [num('fps', 'Frame rate', 8, 1, 60, { step: 1 })],
    time: (e) => e.layer.start + Math.floor(e.local * e.n('fps') + 1e-6) / Math.max(1, e.n('fps')),
  },
  {
    type: 'echo',
    label: 'Echo Keyframes',
    category: 'Motion',
    description: 'Creates repeated visual echoes (trails) from the layer’s animation.',
    props: [num('count', 'Echoes', 5, 1, 30, { step: 1 }), num('delay', 'Delay (s)', 0.06, 0.01, 2, { step: 0.01 }), pct('start', 'Starting intensity', 60), pct('decay', 'Decay', 70), opt('order', 'Echoes are', ['Behind', 'In front'])],
    render: 'echo',
  },
];

function smooth(a: number, b: number, x: number) {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a || 1)));
  return k * k * (3 - 2 * k);
}

export const SHAPE_EFFECTS: EffectSpec[] = [
  {
    type: 'drawingProgress',
    label: 'Drawing Progress',
    category: 'Shape',
    description: 'Animates a drawing or stroke as it is gradually revealed (text layers reveal letter by letter).',
    props: [pct('progress', 'Progress (animate me)', 50), pct('start', 'Start', 0)],
    shape: (e) => ({ progress: [e.n('start') / 100, e.n('progress') / 100] }),
    text: (e) => ({ reveal: e.n('progress') }),
  },
  {
    type: 'strokeColor',
    label: 'Stroke Color',
    category: 'Shape',
    description: 'Changes the color of a shape or text outline (turns the stroke on).',
    props: [col('color', 'Stroke color', '#ffcc00'), px('width', 'Width (0 = keep)', 0, 200)],
    shape: (e) => {
      const [r, g, b, a] = e.c('color');
      const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
      return { strokeColor: `#${h(r)}${h(g)}${h(b)}${h(a)}`, strokeWidth: e.n('width') > 0 ? e.n('width') : undefined };
    },
  },
  {
    type: 'strokeTaper',
    label: 'Stroke Taper',
    category: 'Shape',
    description: 'Makes a stroke narrow or widen along its length.',
    props: [pct('start', 'Start width', 0, 0, 300), pct('end', 'End width', 100, 0, 300), pct('middle', 'Middle width', 100, 0, 300)],
    shape: (e) => ({ taper: [e.n('start') / 100, e.n('end') / 100, e.n('middle') / 100] }),
  },
];

export const TEXT_EFFECTS: EffectSpec[] = [
  {
    type: 'textProgress',
    label: 'Text Progress',
    category: 'Text',
    description: 'Reveals text progressively, letter by letter.',
    props: [pct('progress', 'Progress (animate me)', 50), opt('unit', 'Reveal by', ['Letter', 'Word', 'Line'])],
    text: (e) => ({ reveal: e.n('progress'), unit: (['char', 'word', 'line'] as const)[e.o('unit')] }),
  },
  {
    type: 'textRandomizer',
    label: 'Text Randomizer',
    category: 'Text',
    description: 'Randomizes text characters, like a decoding display.',
    props: [pct('amount', 'Randomness', 50), num('speed', 'Changes / sec', 15, 0, 60)],
    text: (e) => ({ random: { amount: e.n('amount') / 100, speed: e.n('speed') } }),
  },
  {
    type: 'textSpacing',
    label: 'Text Spacing',
    category: 'Text',
    description: 'Adjusts spacing between text characters.',
    props: [num('spacing', 'Letter spacing', 20, -200, 1000, { unit: 'px' })],
    text: (e) => ({ tracking: e.n('spacing') }),
  },
  {
    type: 'textTransform',
    label: 'Text Transform',
    category: 'Text',
    description: 'Moves, rotates and scales characters within a range — animate the range for kinetic text.',
    props: [
      { key: 'offset', label: 'Position', kind: 'vec2', def: [0, -40], unit: 'px' },
      ang('rotation', 'Rotation', 0),
      pct('scale', 'Scale', 100, 0, 500),
      pct('opacity', 'Opacity', 100),
      pct('rangeStart', 'Range start', 0),
      pct('rangeEnd', 'Range end', 100),
      pct('falloff', 'Smoothness', 30),
      num('stagger', 'Wave', 0, 0, 10, { step: 0.1 }),
    ],
    text: (e) => {
      const [ox, oy] = e.v('offset');
      const rs = e.n('rangeStart') / 100;
      const re = e.n('rangeEnd') / 100;
      const fall = Math.max(0.0001, e.n('falloff') / 100);
      const st = e.n('stagger');
      return {
        glyph: (i, n) => {
          const x = n > 1 ? i / (n - 1) : 0;
          const lo = Math.min(rs, re);
          const hi = Math.max(rs, re);
          let w = Math.min(smooth(lo - fall, lo, x), 1 - smooth(hi, hi + fall, x));
          if (lo <= 0) w = Math.max(w, x <= hi ? 1 - smooth(hi, hi + fall, x) : 0);
          if (st > 0) w *= 0.5 + 0.5 * Math.sin(e.local * st * Math.PI * 2 - i * 0.6);
          return { dx: ox * w, dy: oy * w, rot: e.n('rotation') * w, scale: 1 + (e.n('scale') / 100 - 1) * w, alpha: 1 + (e.n('opacity') / 100 - 1) * w };
        },
      };
    },
  },
  {
    type: 'countUpDown',
    label: 'Count Up/Down',
    category: 'Text',
    description: 'Displays a number that counts up or down. On text layers, “#” in the text is replaced by the number.',
    props: [num('from', 'From', 0, -1e9, 1e9), num('to', 'To', 100, -1e9, 1e9), num('decimals', 'Decimals', 0, 0, 6, { step: 1 }), opt('ease', 'Easing', ['Linear', 'Ease out', 'Ease in-out']), opt('grouping', 'Thousands separator', ['None', '1,000', '1 000'], 1), num('duration', 'Duration (s, 0 = layer)', 0, 0, 3600)],
    text: (e, text) => ({ text: placeNumber(text, countValue(e)) }),
  },
  {
    type: 'timecode',
    label: 'Timecode',
    category: 'Text',
    description: 'Displays a timecode counter. On text layers, “#” in the text is replaced by the timecode.',
    props: [opt('format', 'Format', ['HH:MM:SS:FF', 'MM:SS', 'MM:SS.ms', 'Seconds', 'Frames']), num('offset', 'Start at (s)', 0, -86400, 86400), opt('source', 'Time', ['Composition', 'Layer'])],
    text: (e, text) => ({ text: placeNumber(text, formatTimecode(e.o('source') ? e.local : e.t, e.n('offset'), e.o('format'), e.fps)) }),
  },
];

function placeNumber(text: string, value: string) {
  return text.includes('#') ? text.replace(/#/g, value) : value;
}

function countValue(e: Parameters<NonNullable<EffectSpec['text']>>[0]): string {
  const d = e.n('duration') > 0 ? e.n('duration') : e.dur;
  let k = Math.min(1, Math.max(0, e.local / Math.max(0.0001, d)));
  const ease = e.o('ease');
  if (ease === 1) k = 1 - Math.pow(1 - k, 3);
  if (ease === 2) k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const v = e.n('from') + (e.n('to') - e.n('from')) * k;
  const dec = Math.round(e.n('decimals'));
  let s = Math.abs(v).toFixed(dec);
  const g = e.o('grouping');
  if (g) {
    const [int, frac] = s.split('.');
    s = int.replace(/\B(?=(\d{3})+(?!\d))/g, g === 1 ? ',' : ' ') + (frac ? `.${frac}` : '');
  }
  return (v < 0 ? '-' : '') + s;
}

function formatTimecode(t: number, offset: number, format: number, fps: number): string {
  const time = Math.max(0, t + offset);
  const p2 = (n: number) => String(Math.floor(n)).padStart(2, '0');
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);
  const f = Math.floor((time - Math.floor(time)) * fps + 1e-6);
  switch (format) {
    case 1:
      return `${p2(m + h * 60)}:${p2(s)}`;
    case 2:
      return `${p2(m + h * 60)}:${p2(s)}.${String(Math.floor((time % 1) * 1000)).padStart(3, '0')}`;
    case 3:
      return time.toFixed(2);
    case 4:
      return String(Math.floor(time * fps + 1e-6));
    default:
      return `${p2(h)}:${p2(m)}:${p2(s)}:${p2(f)}`;
  }
}
