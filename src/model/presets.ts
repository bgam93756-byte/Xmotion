import type { EaseName, Layer, Project, PropValue, Vec2 } from './types';
import { keyedValue } from './animate';
import { cloneValue, createEffect, findDef, getProp, propOwner } from './schema';
import { uid } from './ids';

type K = [t: number, v: PropValue, ease: EaseName];

function setKeys(l: Layer, path: string, ks: K[]) {
  const o = propOwner(l, path);
  if (!o) return;
  const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(findDef(l, path)?.def ?? 0) });
  const lo = Math.min(...ks.map((k) => k[0])) - 1e-3;
  const hi = Math.max(...ks.map((k) => k[0])) + 1e-3;
  const kept = (prop.keys ?? []).filter((k) => k.t < lo || k.t > hi);
  prop.keys = [...kept, ...ks.map(([t, v, ease]) => ({ id: uid('k'), t, v: cloneValue(v), ease }))].sort((a, b) => a.t - b.t);
}

/** Current (keyed or static) value at a local time. */
const at = (l: Layer, path: string, localT: number) => keyedValue(getProp(l, path), localT);
const v2 = (v: PropValue) => v as Vec2;

export interface AnimPreset {
  id: string;
  label: string;
  group: 'In' | 'Out' | 'Loop' | 'Text';
  textOnly?: boolean;
  apply: (l: Layer, p: Project) => void;
}

const DUR = 0.6;
const len = (l: Layer) => l.end - l.start;
const inDur = (l: Layer) => Math.min(DUR, len(l) / 2);
const outStart = (l: Layer) => len(l) - inDur(l);

export const ANIM_PRESETS: AnimPreset[] = [
  {
    id: 'fadeIn',
    label: 'Fade in',
    group: 'In',
    apply: (l) => setKeys(l, 'opacity', [[0, 0, 'easeOut'], [inDur(l), at(l, 'opacity', inDur(l)), 'easeInOut']]),
  },
  {
    id: 'popIn',
    label: 'Pop in',
    group: 'In',
    apply: (l) => {
      const s = v2(at(l, 'scale', inDur(l)));
      setKeys(l, 'scale', [[0, [0, 0], 'backOut'], [inDur(l), s, 'easeInOut']]);
      setKeys(l, 'opacity', [[0, 0, 'linear'], [inDur(l) / 3, at(l, 'opacity', inDur(l)), 'easeInOut']]);
    },
  },
  {
    id: 'slideLeft',
    label: 'Slide in ←',
    group: 'In',
    apply: (l, p) => {
      const pos = v2(at(l, 'position', inDur(l)));
      setKeys(l, 'position', [[0, [pos[0] + p.width * 0.6, pos[1]], 'easeOut'], [inDur(l), pos, 'easeInOut']]);
    },
  },
  {
    id: 'slideRight',
    label: 'Slide in →',
    group: 'In',
    apply: (l, p) => {
      const pos = v2(at(l, 'position', inDur(l)));
      setKeys(l, 'position', [[0, [pos[0] - p.width * 0.6, pos[1]], 'easeOut'], [inDur(l), pos, 'easeInOut']]);
    },
  },
  {
    id: 'slideUp',
    label: 'Rise up',
    group: 'In',
    apply: (l, p) => {
      const pos = v2(at(l, 'position', inDur(l)));
      setKeys(l, 'position', [[0, [pos[0], pos[1] + p.height * 0.15], 'easeOut'], [inDur(l), pos, 'easeInOut']]);
      setKeys(l, 'opacity', [[0, 0, 'easeOut'], [inDur(l), at(l, 'opacity', inDur(l)), 'easeInOut']]);
    },
  },
  {
    id: 'dropIn',
    label: 'Drop & bounce',
    group: 'In',
    apply: (l, p) => {
      const d = Math.min(1, len(l) / 2);
      const pos = v2(at(l, 'position', d));
      setKeys(l, 'position', [[0, [pos[0], pos[1] - p.height * 0.7], 'bounce'], [d, pos, 'easeInOut']]);
    },
  },
  {
    id: 'zoomIn',
    label: 'Zoom in',
    group: 'In',
    apply: (l) => {
      const s = v2(at(l, 'scale', inDur(l)));
      setKeys(l, 'scale', [[0, [s[0] * 3, s[1] * 3], 'easeOut'], [inDur(l), s, 'easeInOut']]);
      setKeys(l, 'opacity', [[0, 0, 'easeOut'], [inDur(l), at(l, 'opacity', inDur(l)), 'easeInOut']]);
    },
  },
  {
    id: 'spinIn',
    label: 'Spin in',
    group: 'In',
    apply: (l) => {
      const s = v2(at(l, 'scale', inDur(l)));
      const r = at(l, 'rotation', inDur(l)) as number;
      setKeys(l, 'scale', [[0, [0, 0], 'easeOut'], [inDur(l), s, 'easeInOut']]);
      setKeys(l, 'rotation', [[0, r - 180, 'easeOut'], [inDur(l), r, 'easeInOut']]);
    },
  },
  {
    id: 'blurIn',
    label: 'Blur in',
    group: 'In',
    apply: (l) => {
      let fx = l.effects.find((e) => e.type === 'blur');
      if (!fx) {
        fx = createEffect('blur');
        l.effects.push(fx);
      }
      setKeys(l, `fx.${fx.id}.amount`, [[0, 80, 'easeOut'], [inDur(l), 0, 'easeInOut']]);
      setKeys(l, 'opacity', [[0, 0, 'easeOut'], [inDur(l), at(l, 'opacity', inDur(l)), 'easeInOut']]);
    },
  },
  {
    id: 'fadeOut',
    label: 'Fade out',
    group: 'Out',
    apply: (l) => setKeys(l, 'opacity', [[outStart(l), at(l, 'opacity', outStart(l)), 'easeIn'], [len(l), 0, 'linear']]),
  },
  {
    id: 'popOut',
    label: 'Pop out',
    group: 'Out',
    apply: (l) => setKeys(l, 'scale', [[outStart(l), at(l, 'scale', outStart(l)), 'backIn'], [len(l), [0, 0], 'linear']]),
  },
  {
    id: 'slideOut',
    label: 'Slide out →',
    group: 'Out',
    apply: (l, p) => {
      const pos = v2(at(l, 'position', outStart(l)));
      setKeys(l, 'position', [[outStart(l), pos, 'easeIn'], [len(l), [pos[0] + p.width * 0.6, pos[1]], 'linear']]);
    },
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    group: 'Out',
    apply: (l) => {
      const s = v2(at(l, 'scale', outStart(l)));
      setKeys(l, 'scale', [[outStart(l), s, 'easeIn'], [len(l), [s[0] * 3, s[1] * 3], 'linear']]);
      setKeys(l, 'opacity', [[outStart(l), at(l, 'opacity', outStart(l)), 'easeIn'], [len(l), 0, 'linear']]);
    },
  },
  { id: 'float', label: 'Float', group: 'Loop', apply: (l) => setExpr(l, 'position', 'value + [0, sin(time * 2) * 20]') },
  { id: 'pulse', label: 'Pulse', group: 'Loop', apply: (l) => setExpr(l, 'scale', 'value * (1 + sin(time * 5) * 0.06)') },
  { id: 'spin', label: 'Spin forever', group: 'Loop', apply: (l) => setExpr(l, 'rotation', 'value + time * 90') },
  { id: 'swing', label: 'Swing', group: 'Loop', apply: (l) => setExpr(l, 'rotation', 'value + sin(time * 3) * 12') },
  { id: 'wiggle', label: 'Wiggle', group: 'Loop', apply: (l) => setExpr(l, 'position', 'wiggle(2, 25)') },
  { id: 'flicker', label: 'Flicker', group: 'Loop', apply: (l) => setExpr(l, 'opacity', 'random() > 0.12 ? value : value * 0.25') },
  { id: 'typewriter', label: 'Typewriter', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'typewriter', 'char', 'linear', 0.06) },
  { id: 'textFade', label: 'Letters fade', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'fade', 'char', 'linear', 0.05) },
  { id: 'textPop', label: 'Letters pop', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'pop', 'char', 'linear', 0.05) },
  { id: 'wordsUp', label: 'Words rise', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'slideUp', 'word', 'easeOut', 0.18) },
  { id: 'textDrop', label: 'Letters drop', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'drop', 'char', 'linear', 0.06) },
  { id: 'scramble', label: 'Decode', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'scramble', 'char', 'linear', 0.05) },
  { id: 'linesBlur', label: 'Lines blur in', group: 'Text', textOnly: true, apply: (l) => textReveal(l, 'blurIn', 'line', 'easeOut', 0.35) },
];

function setExpr(l: Layer, path: string, expr: string) {
  const o = propOwner(l, path);
  if (!o) return;
  const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(findDef(l, path)?.def ?? 0) });
  prop.expr = expr;
}

function textReveal(l: Layer, animator: Layer['animator'], unit: Layer['animUnit'], ease: EaseName, perUnit: number) {
  l.animator = animator;
  l.animUnit = unit;
  const text = l.text ?? '';
  const units = unit === 'line' ? text.split('\n').length : unit === 'word' ? text.split(/\s+/).filter(Boolean).length : text.replace(/\s/g, '').length;
  const d = Math.min(len(l) * 0.8, Math.max(0.4, units * perUnit + 0.3));
  setKeys(l, 'reveal', [[0, 0, ease], [d, 100, 'linear']]);
}
