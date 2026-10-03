import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { Bezier, EaseName, Keyframe, Layer, Project, Prop, PropValue, Vec2 } from '../model/types';
import { applyEase, BEZIER_PRESETS, EASE_LABELS } from '../model/easing';
import { keyedValue } from '../model/animate';
import { findDef, getProp, type PropDef } from '../model/schema';
import { EFFECT_DEFS } from '../model/effectDefs';
import { ancestors, findLayer } from '../model/tree';
import { splitAlpha } from '../model/color';
import { propClock } from '../engine/transform';
import { endMerge, moveKey, openGraph, setKeyEase, setKeyValue, setTime, stop, toast, useEditor, type KeySel } from '../state/store';
import { haptic } from '../platform';
import { Icon } from './icons';
import './graph.css';

type Kind = 'number' | 'vec2' | 'color';
type Mode = 'value' | 'speed';
/** value: the property's value · speed: how fast it changes · ease: each segment's easing (0 → 1) · strip: a color over time. */
type LaneKind = 'value' | 'speed' | 'ease' | 'strip';
type Pt = [number, number];
type Ranges = Partial<Record<LaneKind, [number, number]>>;

/** Horizontal view: time at the left edge and pixels per second. */
interface View {
  t0: number;
  pps: number;
}

interface Lane {
  kind: LaneKind;
  top: number;
  bottom: number;
  /** Room above the curves (more when the lane has a title). */
  pt: number;
  /** Values shown from the bottom to the top of the lane. */
  lo: number;
  hi: number;
}

/** A segment's easing space on screen: (0, 0) is its first keyframe, (1, 1) the next one. */
interface Frame {
  lane: LaneKind;
  seg: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bez: Bezier;
  /** The handles are the ease itself (bezier eases); otherwise a starting point for a custom curve. */
  exact: boolean;
  /** Both keyframes hold the same value, so the ease is shown in a stand-in frame. */
  ghost: boolean;
  /** Handles as drawn (moved off their keyframe when too close to grab). */
  h1: Pt;
  h2: Pt;
}

interface Layout {
  lanes: Lane[];
  /** Curves of the value or speed lane as (time, value). */
  series: { cls: 'v' | 'x' | 'y'; pts: Pt[] }[];
  /** Easing curves of the visible segments as (time, progress). */
  eases: { seg: number; pts: Pt[] }[];
  frames: Frame[];
  /** Sample times on the property clock. */
  ts: number[];
}

type Gesture =
  | { kind: 'key'; id: number; keyId: string; comp: 0 | 1 | null; timeOnly: boolean; x0: number; y0: number; t0: number; v0: number; vPerPx: number; moved: boolean }
  | { kind: 'handle'; id: number; keyId: string; which: 1 | 2; x0: number; y0: number; bez: Bezier; u0: number; w0: number; du: number; dw: number; moved: boolean }
  | { kind: 'pan'; id: number; x0: number; y0: number; t00: number; moved: boolean; lane: LaneKind | null }
  | { kind: 'scrub'; id: number }
  | { kind: 'pinch'; d0: number; pps0: number; tAnchor: number };

const RULER = 24;
/** Room above and below a lane's curves (keyframes stay inside); TITLED leaves the top-left corner to a title. */
const PAD = 12;
const TITLED = 22;
const GAP = 8;
const STRIP = 44;
/** Touch radius of keyframes and handles (36px targets). */
const HIT = 18;
/** Handles closer than this to their keyframe are drawn further out so both can be grabbed. */
const MIN_ARM = 24;
/** Segments flatter than this (px) edit their ease in a stand-in frame. */
const FLAT = 4;
const PPS_MIN = 1;
const PPS_MAX = 12000;

const PRESETS: EaseName[] = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'elastic', 'bounce', 'hold'];
/** Starting handles for eases a cubic bezier can only approximate. */
const APPROX: Partial<Record<EaseName, Bezier>> = {
  backIn: [0.36, 0, 0.66, -0.56],
  backOut: [0.34, 1.56, 0.64, 1],
  elastic: [0.3, 1.6, 0.45, 1],
  bounce: [0.3, 0.9, 0.5, 1],
};

// Remembered while the app runs.
let lastMode: Mode = 'value';
let lastLock = false;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => clamp(n, -1e5, 1e5).toFixed(1);
const easeAt = (k: Keyframe, x: number) => applyEase(k.ease, x, k.bez);
const shortEase = (e: EaseName) => EASE_LABELS[e].replace(/ \(.*\)$/, '');

function kindOf(v: PropValue): Kind {
  return typeof v === 'number' ? 'number' : typeof v === 'string' ? 'color' : 'vec2';
}

/** Bezier handles of a keyframe's ease (exact for bezier eases, an approximation for the others). */
function handlesOf(k: Keyframe): { bez: Bezier; exact: boolean } {
  if (k.ease === 'custom') return { bez: k.bez ?? [0.25, 0.1, 0.25, 1], exact: true };
  const b = BEZIER_PRESETS[k.ease];
  return b ? { bez: b, exact: true } : { bez: APPROX[k.ease] ?? [0, 0, 1, 1], exact: false };
}

/** Index of the keyframe a local time falls after (-1 before the first). */
function segAt(keys: Keyframe[], lt: number): number {
  if (lt < keys[0].t) return -1;
  let lo = 0;
  let hi = keys.length - 1;
  if (lt >= keys[hi].t) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= lt) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Size of the change across a segment (vec2: distance; colors: 1, as progress). */
function change(a: PropValue, b: PropValue): number {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(b - a);
  if (Array.isArray(a) && Array.isArray(b)) return Math.hypot(b[0] - a[0], b[1] - a[1]);
  return 1;
}

/** Average slope of a keyframe's ease over [x - h, x + h] (one-sided at the ends). */
function slope(k: Keyframe, x: number, h: number): number {
  if (k.ease === 'hold') return 0;
  const a = Math.max(0, x - h);
  const b = Math.min(1, x + h);
  return b > a ? (easeAt(k, b) - easeAt(k, a)) / (b - a) : 0;
}

/** Rate of change per second at a local time (h: sampling step in seconds). */
function speedAt(keys: Keyframe[], lt: number, h: number, scale: number): number {
  const i = segAt(keys, lt);
  if (i < 0 || i >= keys.length - 1) return 0;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return 0;
  return (change(a.v, b.v) * scale * Math.abs(slope(a, (lt - a.t) / span, h / span))) / span;
}

/** Times to sample between t0 and t1: every ~3px, plus each keyframe and the instant before it (steps). */
function sampleTimes(keys: Keyframe[], start: number, t0: number, t1: number, pps: number): number[] {
  const n = clamp(Math.ceil(((t1 - t0) * pps) / 3), 2, 1500);
  const ts: number[] = [];
  for (let j = 0; j <= n; j++) ts.push(t0 + ((t1 - t0) * j) / n);
  for (const k of keys) {
    const t = start + k.t;
    if (t > t0 && t < t1) ts.push(t - 1e-7, t);
  }
  return ts.sort((a, b) => a - b);
}

/** A segment's easing over the visible part of [a, b], as (time, progress). */
function easePoints(k: Keyframe, a: number, b: number, t0: number, t1: number, pps: number): Pt[] {
  const lo = Math.max(a, t0);
  const hi = Math.min(b, t1);
  if (b <= a || hi < lo) return [];
  const n = clamp(Math.ceil(((hi - lo) * pps) / 3), 2, 400);
  const pts: Pt[] = [];
  for (let j = 0; j <= n; j++) {
    const t = lo + ((hi - lo) * j) / n;
    pts.push([t, easeAt(k, (t - a) / (b - a))]);
  }
  // Exact at the next keyframe (a hold jumps there).
  if (hi === b) pts.splice(n, 1, [b, easeAt(k, 1 - 1e-9)], [b, 1]);
  return pts;
}

/** A whole ease from 0 to 1, as (progress in time, progress in value). */
function easeShape(k: Keyframe): Pt[] {
  const pts: Pt[] = [];
  for (let j = 0; j <= 48; j++) pts.push([j / 48, easeAt(k, j === 48 ? 1 - 1e-9 : j / 48)]);
  pts.push([1, 1]);
  return pts;
}

/** Smallest "nice" step (1, 2, 2.5 or 5 × 10ⁿ) of at least `raw`. */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5]) if (m * p >= raw - 1e-12) return m * p;
  return 10 * p;
}

/** Decimals needed to write multiples of a step. */
function decimals(step: number): number {
  let d = 0;
  while (d < 6 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++;
  return d;
}

function fmtNum(v: number, d = 2): string {
  const r = Number(v.toFixed(d));
  return Object.is(r, -0) ? '0' : String(r);
}

function fmtTime(t: number, step: number): string {
  if (Math.abs(t) < 1e-9) return '0s';
  if (step < 1 || Math.abs(t) < 60) return `${fmtNum(t, step < 1 ? 2 : 0)}s`;
  const s = Math.round(Math.abs(t));
  return `${t < 0 ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtValue(v: PropValue, unit: string): string {
  if (typeof v === 'number') return `${fmtNum(v)}${unit}`;
  if (Array.isArray(v)) return `${fmtNum(v[0])}${unit}, ${fmtNum(v[1])}${unit}`;
  return v.toUpperCase();
}

/** Ruler step: the first round time (single frames when zoomed far in) that leaves room for a label. */
function timeStep(pps: number, fps: number): number {
  const steps = [1 / fps, 2 / fps, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].sort((a, b) => a - b);
  return steps.find((s) => s * pps >= 60) ?? 600;
}

/** Value under a vertical drag: rounded to about a pixel's worth and kept inside the property's limits. */
function quantize(v: number, perPx: number, def: PropDef | undefined): number {
  const q = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, perPx))));
  const out = Number((Math.round(v / q) * q).toFixed(6));
  if (def?.options) return clamp(Math.round(out), 0, def.options.length - 1);
  return clamp(out, def?.min ?? -Infinity, def?.max ?? Infinity);
}

function padded(lo: number, hi: number, f: number): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  const p = hi - lo > 1e-9 ? (hi - lo) * f : Math.max(1, Math.abs(lo) * 0.1);
  return [lo - p, hi + p];
}

const innerH = (l: Lane) => Math.max(1, l.bottom - l.top - l.pt - PAD);
const yOf = (l: Lane, v: number) => l.bottom - PAD - ((v - l.lo) / (l.hi - l.lo)) * innerH(l);

function pathOf(pts: Pt[]): string {
  let d = '';
  for (let i = 0; i < pts.length; i++) d += `${i ? 'L' : 'M'}${r1(pts[i][0])},${r1(pts[i][1])}`;
  return d;
}

/** Moves a handle drawn too close to its keyframe out to MIN_ARM (along the segment when it sits on the key). */
function away(anchor: Pt, p: Pt, toward: Pt): Pt {
  let dx = p[0] - anchor[0];
  let dy = p[1] - anchor[1];
  let d = Math.hypot(dx, dy);
  const chord = Math.hypot(toward[0] - anchor[0], toward[1] - anchor[1]);
  const min = Math.min(MIN_ARM, chord * 0.4);
  if (d >= min) return p;
  if (d < 1e-6) {
    dx = toward[0] - anchor[0];
    dy = toward[1] - anchor[1];
    d = chord || 1;
  }
  return [anchor[0] + (dx / d) * min, anchor[1] + (dy / d) * min];
}

function frameOf(lane: LaneKind, seg: number, x0: number, y0: number, x1: number, y1: number, k: Keyframe, ghost: boolean): Frame {
  const { bez, exact } = handlesOf(k);
  const at = (u: number, w: number): Pt => [x0 + u * (x1 - x0), y0 + w * (y1 - y0)];
  return { lane, seg, x0, y0, x1, y1, bez, exact, ghost, h1: away([x0, y0], at(bez[0], bez[1]), [x1, y1]), h2: away([x1, y1], at(bez[2], bez[3]), [x0, y0]) };
}

/** Under the ruler: the main lane, plus the ease lane when there's room for one. */
function laneBoxes(kinds: LaneKind[], h: number): { kind: LaneKind; top: number; bottom: number }[] {
  const first = kinds[0] === 'strip' ? STRIP : Math.round((h - RULER - GAP) * 0.56);
  if (kinds.length === 1 || h - RULER - GAP - first < 64) return [{ kind: kinds[0], top: RULER, bottom: h }];
  return [
    { kind: kinds[0], top: RULER, bottom: RULER + first },
    { kind: kinds[1], top: RULER + first + GAP, bottom: h },
  ];
}

/** Lanes, curves and handle frames for the current view. */
function layout(o: { prop: Prop; keys: Keyframe[]; start: number; kind: Kind; mode: Mode; w: number; h: number; view: View; selId: string | null; frozen: Ranges | null }): Layout {
  const { prop, keys, start, kind, mode, view, selId } = o;
  const { t0, pps } = view;
  const t1 = t0 + o.w / pps;
  const main: LaneKind = mode === 'speed' ? 'speed' : kind === 'color' ? 'strip' : 'value';
  const boxes = laneBoxes(keys.length > 1 && (mode === 'speed' || kind !== 'number') ? [main, 'ease'] : [main], o.h);
  const ts = sampleTimes(keys, start, t0 - 8 / pps, t1 + 8 / pps, pps);

  const series: Layout['series'] = [];
  if (main === 'value') {
    const vals = ts.map((t) => keyedValue(prop, t - start));
    if (kind === 'vec2') {
      series.push({ cls: 'x', pts: vals.map((v, i) => [ts[i], (v as Vec2)[0]]) });
      series.push({ cls: 'y', pts: vals.map((v, i) => [ts[i], (v as Vec2)[1]]) });
    } else series.push({ cls: 'v', pts: vals.map((v, i) => [ts[i], v as number]) });
  } else if (main === 'speed') {
    // Colors change by progress: percent per second.
    const scale = kind === 'color' ? 100 : 1;
    series.push({ cls: 'v', pts: ts.map((t) => [t, speedAt(keys, t - start, 1.5 / pps, scale)]) });
  }

  // Segments in view, and the ones with handles: not holds, wide enough for two handles (zoom in
  // for more), and bezier eases (others only once selected, as the start of a custom curve).
  const segs: number[] = [];
  for (let i = 0; i < keys.length - 1; i++) if (start + keys[i + 1].t >= t0 && start + keys[i].t <= t1) segs.push(i);
  const handled = segs.filter((i) => {
    const k = keys[i];
    const sel = k.id === selId;
    return k.ease !== 'hold' && (keys[i + 1].t - k.t) * pps >= (sel ? 40 : 56) && (sel || handlesOf(k).exact);
  });
  const hasEase = boxes.some((b) => b.kind === 'ease');
  const eases = hasEase ? segs.map((i) => ({ seg: i, pts: easePoints(keys[i], start + keys[i].t, start + keys[i + 1].t, t0, t1, pps) })) : [];

  const range = (k: LaneKind): [number, number] => {
    const f = o.frozen?.[k];
    if (f) return f;
    let lo = Infinity;
    let hi = -Infinity;
    const add = (v: number) => {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    };
    if (k === 'speed') {
      // Eases that end (or start) vertically have an infinite speed there: a spike a sample or
      // two wide that would flatten the rest, so the top 1.5% of samples may run off the lane.
      const s = series[0].pts.map(([, v]) => v).sort((a, b) => b - a);
      const top = s[Math.min(s.length - 1, Math.floor(s.length * 0.015))] ?? 0;
      return [0, top > 1e-9 ? top * 1.08 : 1];
    }
    if (k === 'ease') {
      add(0);
      add(1);
      for (const e of eases) for (const [, v] of e.pts) add(v);
      for (const i of handled) {
        const { bez } = handlesOf(keys[i]);
        add(bez[1]);
        add(bez[3]);
      }
      return padded(lo, hi, 0.06);
    }
    if (k === 'value') {
      for (const s of series) for (const [, v] of s.pts) add(v);
      if (kind === 'number')
        for (const i of handled) {
          const a = keys[i].v as number;
          const b = keys[i + 1].v as number;
          const { bez } = handlesOf(keys[i]);
          add(a + bez[1] * (b - a));
          add(a + bez[3] * (b - a));
        }
      return padded(lo, hi, 0.08);
    }
    return [0, 1];
  };
  const lanes: Lane[] = boxes.map((b) => {
    const [lo, hi] = range(b.kind);
    const titled = b.kind === 'ease' || b.kind === 'speed' || (b.kind === 'value' && kind === 'vec2');
    return { ...b, pt: titled ? TITLED : PAD, lo, hi };
  });

  const X = (t: number) => (t - t0) * pps;
  const frames: Frame[] = [];
  for (const lane of lanes) {
    if (lane.kind !== 'ease' && !(lane.kind === 'value' && kind === 'number')) continue;
    for (const i of handled) {
      const a = keys[i];
      const b = keys[i + 1];
      const x0 = X(start + a.t);
      const x1 = X(start + b.t);
      if (lane.kind === 'ease') {
        frames.push(frameOf('ease', i, x0, yOf(lane, 0), x1, yOf(lane, 1), a, false));
        continue;
      }
      const y0 = yOf(lane, a.v as number);
      let y1 = yOf(lane, b.v as number);
      let ghost = false;
      if (Math.abs(y1 - y0) < FLAT) {
        // Same value on both keys: the ease changes nothing yet; edit it in a stand-in frame once selected.
        if (a.id !== selId) continue;
        const g = clamp(innerH(lane) * 0.4, 20, 90);
        y1 = y0 - g >= lane.top + lane.pt ? y0 - g : y0 + g;
        ghost = true;
      }
      frames.push(frameOf('value', i, x0, y0, x1, y1, a, ghost));
    }
  }
  return { lanes, series, eases, frames, ts };
}

function fitView(keys: Keyframe[], start: number, w: number, fps: number): View {
  const a = start + keys[0].t;
  const b = start + keys[keys.length - 1].t;
  const span = keys.length > 1 ? Math.max(b - a, 4 / fps) : 2;
  const pad = Math.min(40, w * 0.12);
  const pps = clamp((w - 2 * pad) / span, PPS_MIN, PPS_MAX);
  return { t0: (a + b) / 2 - w / 2 / pps, pps };
}

function clampView(v: View, w: number, end: number): View {
  const pps = clamp(v.pps, PPS_MIN, PPS_MAX);
  const vis = w / pps;
  return { pps, t0: clamp(v.t0, -vis * 0.75, Math.max(0, end) - vis * 0.25) };
}

/** Zooms time by k around screen x. */
function zoomAt(v: View, x: number, k: number): View {
  const pps = clamp(v.pps * k, PPS_MIN, PPS_MAX);
  return { pps, t0: v.t0 + x / v.pps - x / pps };
}

function easeIcon(e: EaseName): string {
  if (e === 'hold') return 'M3,20H21V4';
  let d = '';
  for (let i = 0; i <= 24; i++) d += `${i ? 'L' : 'M'}${(3 + (i / 24) * 18).toFixed(1)},${(20 - applyEase(e, i / 24) * 16).toFixed(1)}`;
  return d;
}

const EASE_ICONS = Object.fromEntries(PRESETS.map((e) => [e, easeIcon(e)])) as Record<EaseName, string>;

/** "Effect · Parameter" for effect paths, else the property's label. */
function propLabel(layer: Layer, path: string): string {
  const label = findDef(layer, path)?.label ?? path.split('.').pop() ?? path;
  if (!path.startsWith('fx.')) return label;
  const fx = layer.effects.find((e) => e.id === path.split('.')[1]);
  return fx ? `${EFFECT_DEFS[fx.type]?.label ?? fx.type} · ${label}` : label;
}

/** Selects a keyframe (and its layer, like the timeline does). */
function selectKey(layerId: string, path: string, keyId: string) {
  const keySel: KeySel = { layerId, path, keyId };
  useEditor.setState(useEditor.getState().selectedId === layerId ? { keySel } : { keySel, selectedId: layerId, selection: [] });
}

/** Graph editor for the property in `useEditor.graph`; takes the timeline's place while open. */
export function GraphEditor(): ReactElement | null {
  const graph = useEditor((s) => s.graph);
  const project = useEditor((s) => s.project);
  if (!graph) return null;
  const layer = project ? findLayer(project, graph.layerId)?.layer : undefined;
  const prop = layer ? getProp(layer, graph.path) : undefined;
  if (!project || !layer || !prop?.keys?.length) return <NothingToShow layer={layer} path={graph.path} />;
  return <GraphPanel key={`${graph.layerId}|${graph.path}`} project={project} layer={layer} path={graph.path} prop={prop} />;
}

function CloseButton() {
  return (
    <button type="button" className="ge-btn ge-close" title="Close the graph editor" aria-label="Close graph editor" onClick={() => openGraph(null)}>
      <Icon name="close" size={18} />
    </button>
  );
}

/** Shown when the layer or the property's keyframes are gone (deleted, undone, …). */
function NothingToShow({ layer, path }: { layer?: Layer; path: string }) {
  return (
    <div className="graph-editor">
      <div className="ge-head">
        <div className="ge-title">
          <b className="ge-prop">Graph editor</b>
        </div>
        <CloseButton />
      </div>
      <div className="ge-empty">
        <Icon name="graph" size={22} />
        <b>Nothing to show</b>
        <span>{layer ? `${propLabel(layer, path)} on ${layer.name} has no keyframes.` : 'The layer is gone.'}</span>
      </div>
    </div>
  );
}

function GraphPanel({ project, layer, path, prop }: { project: Project; layer: Layer; path: string; prop: Prop }) {
  const keys = prop.keys!;
  const keySel = useEditor((s) => s.keySel);
  const [mode, setModeState] = useState<Mode>(lastMode);
  const [lock, setLockState] = useState(lastLock);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  /** Value ranges held still while a keyframe or handle is dragged (so it stays under the finger). */
  const [frozen, setFrozen] = useState<Ranges | null>(null);
  /** Readout while a handle is dragged. */
  const [dragNote, setDragNote] = useState<string | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View | null>(null);
  const geoRef = useRef<Layout | null>(null);
  const bounds = useRef({ w: 0, end: 0 });
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gid = 'ge' + useId().replace(/[^\w-]/g, '');

  const fps = project.fps;
  const start = layer.start;
  const kind = kindOf(keys[0].v);
  const def = findDef(layer, path);
  const unit = def?.unit ?? '';
  const label = propLabel(layer, path);
  // Keys sit at layer.start + k.t on the property clock; it is comp time unless time remapping is involved.
  const direct = !ancestors(project, layer.id).some((g) => g.timeRemapOn) && (path === 'timeRemap' || !layer.timeRemapOn);
  // The layer's in/out points are on this clock unless the layer itself is remapped.
  const ownClock = path === 'timeRemap' || !layer.timeRemapOn;
  const end = Math.max(project.duration, start + keys[keys.length - 1].t);
  const selKey = keySel?.layerId === layer.id && keySel.path === path ? keys.find((k) => k.id === keySel.keyId) : undefined;
  const selIndex = selKey ? keys.indexOf(selKey) : -1;
  const selId = selKey?.id ?? null;

  const commitView = (v: View) => {
    viewRef.current = v;
    setView(v);
  };

  useLayoutEffect(() => {
    const el = plotRef.current!;
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Fit the keyframes when the graph opens (once the plot has a size).
  useLayoutEffect(() => {
    if (!viewRef.current && size.w > 0) commitView(fitView(keys, start, size.w, fps));
  }, [size.w]);

  const geo = useMemo(
    () => (view && size.w > 0 && size.h > 0 ? layout({ prop, keys, start, kind, mode, w: size.w, h: size.h, view, selId, frozen }) : null),
    [prop, keys, start, kind, mode, size.w, size.h, view, selId, frozen],
  );

  useLayoutEffect(() => {
    geoRef.current = geo;
    bounds.current = { w: size.w, end };
  });

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms time around the pointer; plain wheel pans.
  useEffect(() => {
    const el = svgRef.current!;
    const wheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      const unitPx = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const { w, end: until } = bounds.current;
      if (e.ctrlKey || e.metaKey) {
        const x = e.clientX - el.getBoundingClientRect().left;
        commitView(clampView(zoomAt(v, x, Math.exp(-e.deltaY * unitPx * 0.01)), w, until));
      } else {
        const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unitPx;
        commitView(clampView({ t0: v.t0 + d / v.pps, pps: v.pps }, w, until));
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const setMode = (m: Mode) => {
    lastMode = m;
    setModeState(m);
  };
  const toggleLock = () => {
    lastLock = !lock;
    setLockState(!lock);
    toast(lock ? 'Drag freely' : 'Drags keep to one axis: time or value');
  };
  const fit = () => size.w > 0 && commitView(fitView(keys, start, size.w, fps));
  const setEase = (e: EaseName) => {
    if (!selKey) return toast('Tap a keyframe or a curve first');
    if (selIndex === keys.length - 1) return toast('Easing runs from a keyframe to the next one: pick an earlier keyframe');
    setKeyEase({ layerId: layer.id, path, keyId: selKey.id }, e);
    haptic();
  };

  /* ---------------- gestures ---------------- */

  const toLocal = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  /** The keyframe as it is in the store right now (the drag may have run ahead of the render). */
  const liveKey = (keyId: string) => {
    const p = useEditor.getState().project;
    const l = p && findLayer(p, layer.id)?.layer;
    return l ? getProp(l, path).keys?.find((k) => k.id === keyId) : undefined;
  };

  const freeze = (g: Layout) => setFrozen(Object.fromEntries(g.lanes.map((l) => [l.kind, [l.lo, l.hi]])) as Ranges);
  const stopEdit = () => {
    endMerge();
    setFrozen(null);
    setDragNote(null);
  };

  const seek = (x: number) => {
    const v = viewRef.current;
    if (v) setTime(v.t0 + x / v.pps);
  };

  const startPinch = () => {
    const v = viewRef.current;
    const [a, b] = [...pointers.current.values()];
    if (!v || !b) return;
    const cx = (a[0] + b[0]) / 2;
    gesture.current = { kind: 'pinch', d0: Math.max(24, Math.hypot(b[0] - a[0], b[1] - a[1])), pps0: v.pps, tAnchor: v.t0 + cx / v.pps };
  };

  /** Tap on empty space: selects the segment under it (near its curve in the value lane), else clears the keyframe selection. */
  const tapAt = (p: Pt, laneKind: LaneKind | null) => {
    const g = geoRef.current;
    const v = viewRef.current;
    if (!g || !v || !laneKind) return;
    const lt = v.t0 + p[0] / v.pps - start;
    const i = segAt(keys, lt);
    let hit = i >= 0 && i < keys.length - 1;
    const lane = g.lanes.find((l) => l.kind === 'value');
    if (hit && laneKind === 'value' && lane) {
      const val = keyedValue(prop, lt);
      const ys = typeof val === 'number' ? [val] : Array.isArray(val) ? val : [];
      hit = ys.some((y) => Math.abs(yOf(lane, y) - p[1]) < 24);
    }
    if (hit) {
      selectKey(layer.id, path, keys[i].id);
      haptic();
    } else if (selKey) useEditor.setState({ keySel: null });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const g = geoRef.current;
    const v = viewRef.current;
    if (!g || !v) return;
    const p = toLocal(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size > 1) {
      // A second finger turns any drag into a pinch.
      const gs = gesture.current;
      if (gs?.kind === 'key' || gs?.kind === 'handle') stopEdit();
      if (pointers.current.size === 2) startPinch();
      return;
    }
    if (useEditor.getState().playing) stop();
    const el = (e.target as Element).closest<SVGElement>('[data-g]');
    const laneKind = (el?.dataset.lane ?? null) as LaneKind | null;
    if (el?.dataset.g === 'key') {
      const k = keys.find((x) => x.id === el.dataset.key);
      const lane = g.lanes.find((l) => l.kind === laneKind);
      if (!k || !lane) return;
      const comp = el.dataset.c === '0' ? 0 : el.dataset.c === '1' ? 1 : null;
      const v0 = comp === null ? (typeof k.v === 'number' ? k.v : 0) : (k.v as Vec2)[comp];
      selectKey(layer.id, path, k.id);
      endMerge();
      freeze(g);
      gesture.current = { kind: 'key', id: e.pointerId, keyId: k.id, comp, timeOnly: lane.kind !== 'value', x0: p[0], y0: p[1], t0: k.t, v0, vPerPx: (lane.hi - lane.lo) / innerH(lane), moved: false };
      return;
    }
    if (el?.dataset.g === 'h') {
      const seg = Number(el.dataset.seg);
      const f = g.frames.find((x) => x.lane === laneKind && x.seg === seg);
      const k = keys[seg];
      if (!f || !k) return;
      const which = el.dataset.h === '2' ? 2 : 1;
      // Start from the handle where it is drawn, so it stays under the finger.
      const hp = which === 1 ? f.h1 : f.h2;
      const fw = f.x1 - f.x0;
      const fh = f.y1 - f.y0;
      selectKey(layer.id, path, k.id);
      endMerge();
      freeze(g);
      gesture.current = { kind: 'handle', id: e.pointerId, keyId: k.id, which, x0: p[0], y0: p[1], bez: f.bez, u0: (hp[0] - f.x0) / fw, w0: (hp[1] - f.y0) / fh, du: 1 / fw, dw: 1 / fh, moved: false };
      return;
    }
    if (el?.dataset.g === 'ruler' && direct) {
      gesture.current = { kind: 'scrub', id: e.pointerId };
      seek(p[0]);
      return;
    }
    gesture.current = { kind: 'pan', id: e.pointerId, x0: p[0], y0: p[1], t00: v.t0, moved: false, lane: g.lanes.find((l) => p[1] >= l.top && p[1] <= l.bottom)?.kind ?? null };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toLocal(e);
    pointers.current.set(e.pointerId, p);
    const gs = gesture.current;
    const v = viewRef.current;
    if (!gs || !v) return;
    if (gs.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!b) return;
      const pps = clamp((gs.pps0 * Math.max(24, Math.hypot(b[0] - a[0], b[1] - a[1]))) / gs.d0, PPS_MIN, PPS_MAX);
      commitView(clampView({ t0: gs.tAnchor - (a[0] + b[0]) / 2 / pps, pps }, size.w, end));
      return;
    }
    if (gs.id !== e.pointerId) return;
    if (gs.kind === 'scrub') return seek(p[0]);
    let dx = p[0] - gs.x0;
    let dy = p[1] - gs.y0;
    if (!gs.moved) {
      if (Math.hypot(dx, dy) < (gs.kind === 'pan' ? 6 : 4)) return;
      gs.moved = true;
      if (gs.kind !== 'pan') haptic();
    }
    if (gs.kind === 'pan') return commitView(clampView({ t0: gs.t00 - dx / v.pps, pps: v.pps }, size.w, end));
    // Shift or the axis lock: only along the main direction of the drag.
    if (gs.kind === 'key' && gs.timeOnly) dy = 0;
    else if (e.shiftKey || lock) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const k = liveKey(gs.keyId);
    if (!k) return;
    const s: KeySel = { layerId: layer.id, path, keyId: gs.keyId };
    if (gs.kind === 'key') {
      const merge = `graph:${gs.keyId}`;
      // Not before 0 on the property clock; the store snaps to frames.
      const lt = Math.max(-start, gs.t0 + dx / v.pps);
      if (Math.round(lt * fps) !== Math.round(k.t * fps)) moveKey(s, lt, merge);
      if (gs.timeOnly) return;
      const val = quantize(gs.v0 - dy * gs.vPerPx, gs.vPerPx, def);
      const next: PropValue = gs.comp === null ? val : gs.comp === 0 ? [val, (k.v as Vec2)[1]] : [(k.v as Vec2)[0], val];
      if (JSON.stringify(next) !== JSON.stringify(k.v)) setKeyValue(s, next, merge);
      return;
    }
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const u = r3(clamp(gs.u0 + dx * gs.du, 0, 1));
    const w = r3(clamp(gs.w0 + dy * gs.dw, -5, 6));
    const bez: Bezier = gs.which === 1 ? [u, w, gs.bez[2], gs.bez[3]] : [gs.bez[0], gs.bez[1], u, w];
    setKeyEase(s, 'custom', bez, `ease:${gs.keyId}`);
    setDragNote(`Curve ${bez.map((n) => fmtNum(n)).join(', ')}`);
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const gs = gesture.current;
    if (!gs) return;
    if (gs.kind === 'pinch') {
      // The finger left behind keeps panning.
      if (pointers.current.size < 2) {
        const [rest] = [...pointers.current.entries()];
        const v = viewRef.current;
        gesture.current = rest && v ? { kind: 'pan', id: rest[0], x0: rest[1][0], y0: rest[1][1], t00: v.t0, moved: true, lane: null } : null;
      }
      return;
    }
    if (gs.id !== e.pointerId) return;
    gesture.current = null;
    const tap = e.type === 'pointerup' && gs.kind !== 'scrub' && !gs.moved;
    if (gs.kind === 'key' || gs.kind === 'handle') {
      stopEdit();
      const k = gs.kind === 'key' && tap ? liveKey(gs.keyId) : undefined;
      if (k) {
        haptic();
        if (direct) setTime(start + k.t);
      }
    } else if (gs.kind === 'pan' && tap) tapAt(toLocal(e), gs.lane);
  };

  /* ---------------- drawing ---------------- */

  let plot: ReactNode = null;
  if (geo && view) {
    const { w, h } = size;
    const { t0, pps } = view;
    const t1 = t0 + w / pps;
    const X = (t: number) => (t - t0) * pps;
    const step = timeStep(pps, fps);
    const minor = step * pps >= 100 ? step / 5 : step / 2;
    const majors: number[] = [];
    for (let i = Math.ceil(t0 / step); i * step <= t1 && majors.length < 200; i++) majors.push(i * step);
    const minors: number[] = [];
    for (let i = Math.ceil(t0 / minor); i * minor <= t1 && minors.length < 1000; i++) minors.push(i * minor);
    const selSeg = selIndex >= 0 && selIndex < keys.length - 1 ? selIndex : -1;
    const keyOrder = [...keys].sort((a, b) => (a.id === selId ? 1 : 0) - (b.id === selId ? 1 : 0));
    const shadeL = clamp(X(ownClock ? layer.start : 0), 0, w);
    const shadeR = ownClock ? clamp(X(layer.end), 0, w) : w;

    const keyMark = (k: Keyframe, lane: Lane, y: number, comp: 0 | 1 | null) => {
      const x = X(start + k.t);
      if (x < -HIT || x > w + HIT) return null;
      const sel = k.id === selId;
      const color = lane.kind === 'strip' ? splitAlpha(k.v as string) : null;
      const what = comp === null ? fmtValue(k.v, unit) : `${comp ? 'Y' : 'X'} ${fmtValue((k.v as Vec2)[comp], unit)}`;
      return (
        <g key={`${k.id}${comp ?? ''}`} className="ge-keymark" data-g="key" data-key={k.id} data-c={comp ?? ''} data-lane={lane.kind} transform={`translate(${r1(x)} ${r1(y)})`}>
          <circle className="ge-hit" r={HIT} />
          {color ? (
            <circle className={`ge-swatch ${sel ? 'sel' : ''}`} r={8} fill={color.hex} fillOpacity={color.alpha} />
          ) : (
            <rect className={`ge-key ${sel ? 'sel' : ''}`} x={-5} y={-5} width={10} height={10} rx={1.5} transform="rotate(45)" />
          )}
          <title>{`${fmtNum(start + k.t)}s · ${what}`}</title>
        </g>
      );
    };

    const laneDecor = (lane: Lane) => {
      const out: ReactNode[] = [];
      const key = (s: string) => `${lane.kind}${s}`;
      if (lane.kind === 'strip') return out;
      if (lane.kind === 'ease') {
        for (const v of [0, 0.5, 1]) {
          const y = yOf(lane, v);
          out.push(<line key={key(`g${v}`)} className={`ge-grid ${v === 0.5 ? '' : 'zero'}`} x1={0} x2={w} y1={y} y2={y} />);
          if (v !== 0.5)
            out.push(
              <text key={key(`l${v}`)} className="ge-label" x={6} y={y - 4}>
                {v * 100}%
              </text>,
            );
        }
        return out;
      }
      // About a line every 36px, and at least two so short lanes still show a scale.
      const vStep = niceStep((lane.hi - lane.lo) / Math.max(2, innerH(lane) / 36));
      const d = decimals(vStep);
      for (let i = Math.ceil(lane.lo / vStep), n = 0; i * vStep <= lane.hi && n < 60; i++, n++) {
        const v = i * vStep;
        const y = yOf(lane, v);
        out.push(<line key={key(`g${i}`)} className={`ge-grid ${i === 0 ? 'zero' : ''}`} x1={0} x2={w} y1={y} y2={y} />);
        // Labels sit above their line (titled lanes keep their curves below the title).
        if (y - 12 >= lane.top)
          out.push(
            <text key={key(`l${i}`)} className="ge-label" x={6} y={y - 4}>
              {fmtNum(v, d)}
              {lane.kind === 'value' ? unit : ''}
            </text>,
          );
      }
      return out;
    };

    const laneTitle = (lane: Lane) => {
      const y = lane.top + 11;
      if (lane.kind === 'ease')
        return (
          <text className="ge-ltitle" x={8} y={y}>
            Ease
          </text>
        );
      if (lane.kind === 'speed') {
        const per = kind === 'color' ? '%/s' : unit ? `${unit}/s` : '';
        return (
          <text className="ge-ltitle" x={8} y={y}>
            Speed{per && <tspan className="ge-unit">{` · ${per}`}</tspan>}
          </text>
        );
      }
      if (lane.kind === 'value' && kind === 'vec2')
        return (
          <g className="ge-legend" transform={`translate(8 ${y - 4})`}>
            <line className="ge-curve x" x1={0} x2={14} y1={0} y2={0} />
            <text x={19} y={4}>
              X
            </text>
            <line className="ge-curve y" x1={36} x2={50} y1={0} y2={0} />
            <text x={55} y={4}>
              Y
            </text>
          </g>
        );
      return null;
    };

    const main = geo.lanes[0];
    const easeLane = geo.lanes.find((l) => l.kind === 'ease');
    const stripStops =
      main.kind === 'strip'
        ? geo.ts.map((t, i) => {
            const { hex, alpha } = splitAlpha(keyedValue(prop, t - start) as string);
            return <stop key={i} offset={clamp(X(t) / w, 0, 1)} stopColor={hex} stopOpacity={alpha} />;
          })
        : null;

    plot = (
      <>
        {stripStops && (
          <defs>
            {/* Checkerboard under the color strip, for transparent colors. */}
            <pattern id={`${gid}-ck`} width={12} height={12} patternUnits="userSpaceOnUse">
              <rect width={12} height={12} fill="#2a2c36" />
              <rect width={6} height={6} fill="#1b1d25" />
              <rect x={6} y={6} width={6} height={6} fill="#1b1d25" />
            </pattern>
            <linearGradient id={`${gid}-cg`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
              {stripStops}
            </linearGradient>
          </defs>
        )}
        {geo.lanes.map((l) => (
          <rect key={l.kind} className="ge-lane" x={0} y={l.top} width={w} height={l.bottom - l.top} />
        ))}
        {geo.lanes.map((l) => majors.map((t) => <line key={`${l.kind}t${t}`} className="ge-grid" x1={X(t)} x2={X(t)} y1={l.top} y2={l.bottom} />))}
        {geo.lanes.map((l) => laneDecor(l))}
        {/* Outside the layer's in/out points (and before 0) keyframes do nothing. */}
        {geo.lanes.map((l) => (
          <g key={`${l.kind}sh`}>
            {shadeL > 0 && <rect className="ge-shade" x={0} y={l.top} width={shadeL} height={l.bottom - l.top} />}
            {shadeR < w && <rect className="ge-shade" x={shadeR} y={l.top} width={w - shadeR} height={l.bottom - l.top} />}
          </g>
        ))}

        {main.kind === 'strip' && (
          <>
            <rect className="ge-strip" x={0} y={main.top + 6} width={w} height={STRIP - 12} fill={`url(#${gid}-ck)`} />
            <rect className="ge-strip" x={0} y={main.top + 6} width={w} height={STRIP - 12} fill={`url(#${gid}-cg)`} />
            {keys.length === 1 && (
              <text className="ge-hint" x={w / 2} y={(main.top + STRIP + main.bottom) / 2} textAnchor="middle">
                Add another keyframe to shape the easing
              </text>
            )}
          </>
        )}
        {/* The selected keyframe's segment (where the presets apply) glows. */}
        {selSeg >= 0 &&
          geo.series.map((s) => (
            <path
              key={`glow${s.cls}`}
              className={`ge-glow ${s.cls}`}
              d={pathOf(s.pts.filter(([t]) => t >= start + keys[selSeg].t && t <= start + keys[selSeg + 1].t).map(([t, v]) => [X(t), yOf(main, v)]))}
            />
          ))}
        {geo.series.map((s) => (
          <path key={s.cls} className={`ge-curve ${s.cls}`} d={pathOf(s.pts.map(([t, v]) => [X(t), yOf(main, v)]))} />
        ))}
        {easeLane &&
          geo.eases.map((e) => (
            <path key={`e${e.seg}`} className={`ge-curve ease ${e.seg === selSeg ? 'sel' : ''}`} d={pathOf(e.pts.map(([t, v]) => [X(t), yOf(easeLane, v)]))} />
          ))}
        {geo.frames
          .filter((f) => f.ghost)
          .map((f) => (
            <path key={`gh${f.seg}`} className="ge-curve ease ghost" d={pathOf(easeShape(keys[f.seg]).map(([u, v]) => [f.x0 + u * (f.x1 - f.x0), f.y0 + v * (f.y1 - f.y0)]))} />
          ))}

        {geo.frames.map((f) => (
          <g key={`${f.lane}h${f.seg}`} className={`ge-hpair ${f.exact ? '' : 'approx'}`}>
            <line className="ge-arm" x1={f.x0} y1={f.y0} x2={f.h1[0]} y2={f.h1[1]} />
            <line className="ge-arm" x1={f.x1} y1={f.y1} x2={f.h2[0]} y2={f.h2[1]} />
            <circle className="ge-end" cx={f.x0} cy={f.y0} r={2.5} />
            <circle className="ge-end" cx={f.x1} cy={f.y1} r={2.5} />
            {[f.h1, f.h2].map((hp, j) => (
              <g key={j} data-g="h" data-lane={f.lane} data-seg={f.seg} data-h={j + 1} transform={`translate(${r1(hp[0])} ${r1(hp[1])})`}>
                <circle className="ge-hit" r={HIT - 2} />
                <circle className="ge-handle" r={5} />
                <title>{f.exact ? 'Drag to shape the easing' : `Drag to turn ${shortEase(keys[f.seg].ease)} into a custom curve`}</title>
              </g>
            ))}
          </g>
        ))}

        {main.kind === 'value' && kind === 'vec2' && ([0, 1] as const).map((c) => keyOrder.map((k) => keyMark(k, main, yOf(main, (k.v as Vec2)[c]), c)))}
        {main.kind === 'value' && kind === 'number' && keyOrder.map((k) => keyMark(k, main, yOf(main, k.v as number), null))}
        {main.kind === 'speed' && keyOrder.map((k) => keyMark(k, main, yOf(main, 0), null))}
        {main.kind === 'strip' && keyOrder.map((k) => keyMark(k, main, main.top + STRIP / 2, null))}
        {geo.lanes.map((l) => (
          <g key={`${l.kind}title`}>{laneTitle(l)}</g>
        ))}

        <g className="ge-ruler">
          <rect data-g="ruler" className={`ge-ruler-bg ${direct ? 'scrub' : ''}`} x={0} y={0} width={w} height={RULER}>
            <title>{direct ? 'Drag to move the playhead' : "Time on the layer's remapped clock"}</title>
          </rect>
          {minors.map((t) => (
            <line key={`m${t}`} className="ge-tick" x1={X(t)} x2={X(t)} y1={RULER - 4} y2={RULER} />
          ))}
          {majors.map((t) => (
            <g key={`M${t}`}>
              <line className="ge-tick major" x1={X(t)} x2={X(t)} y1={RULER - 9} y2={RULER} />
              <text className="ge-tlabel" x={X(t) + 3} y={RULER - 11}>
                {fmtTime(t, step)}
              </text>
            </g>
          ))}
        </g>
        <Playhead project={project} layer={layer} path={path} view={view} w={w} h={h} />
      </>
    );
  }

  const segSelected = selIndex >= 0 && selIndex < keys.length - 1;
  let readout: ReactNode = dragNote;
  if (!readout && selKey)
    readout = (
      <>
        {kind === 'color' && <i className="ge-sw" style={{ background: selKey.v as string }} />}
        <span>{`${fmtNum(start + selKey.t)}s · ${fmtValue(selKey.v, unit)}`}</span>
        {segSelected && <span className="ge-ro-ease">{shortEase(selKey.ease)}</span>}
      </>
    );

  return (
    <div className="graph-editor">
      <div className="ge-head">
        <div className="ge-title" title={`${layer.name} · ${label}`}>
          <span className="ge-layer">{layer.name}</span>
          <span className="ge-sep" aria-hidden="true">
            ·
          </span>
          <span className="ge-propline">
            <b className="ge-prop">{label}</b>
            {prop.expr && (
              <span className="ge-badge" title="The expression on this property isn't part of the curves" aria-label="Has an expression (not shown)">
                <Icon name="fx" size={13} />
              </span>
            )}
          </span>
        </div>
        <div className="ge-tools">
          <div className="ge-seg" role="group" aria-label="Graph type">
            {(['value', 'speed'] as const).map((m) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'value' ? 'Value' : 'Speed'}
              </button>
            ))}
          </div>
          <button type="button" className="ge-btn" title="Fit the keyframes in view" aria-label="Fit keyframes" onClick={fit}>
            <Icon name="fit" size={16} />
            <span>Fit</span>
          </button>
          <button
            type="button"
            className={`ge-btn ${lock ? 'on' : ''}`}
            title="Drag along one axis only: time or value (or hold Shift)"
            aria-label="Drag along one axis"
            aria-pressed={lock}
            onClick={toggleLock}
          >
            <Icon name={lock ? 'lock' : 'unlock'} size={16} />
            <span>Axis</span>
          </button>
          <CloseButton />
        </div>
        <div className={`ge-eases ${segSelected ? '' : 'idle'}`} role="group" aria-label="Easing of the selected keyframe">
          {PRESETS.map((e) => (
            <button
              key={e}
              type="button"
              className={`ge-ease ${segSelected && selKey?.ease === e ? 'on' : ''}`}
              title={EASE_LABELS[e]}
              aria-label={EASE_LABELS[e]}
              aria-pressed={segSelected && selKey?.ease === e}
              onClick={() => setEase(e)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={EASE_ICONS[e]} />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="ge-plot" ref={plotRef}>
        <svg
          ref={svgRef}
          className="ge-svg"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          aria-label={`${label} curves`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          {plot}
        </svg>
        {readout && <div className="ge-readout">{readout}</div>}
      </div>
    </div>
  );
}

/** The playhead on the property clock (re-renders on its own while playing). */
function Playhead({ project, layer, path, view, w, h }: { project: Project; layer: Layer; path: string; view: View; w: number; h: number }) {
  const time = useEditor((s) => s.time);
  const x = (propClock(project, layer, path, time) - view.t0) * view.pps;
  if (!Number.isFinite(x) || x < -8 || x > w + 8) return null;
  return (
    <g className="ge-playhead">
      <line x1={x} x2={x} y1={0} y2={h} />
      <path d={`M${r1(x - 6)},0h12l-6,8z`} />
    </g>
  );
}
