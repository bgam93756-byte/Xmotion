import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import type { Bezier, EaseName, Keyframe, Layer, Project, PropValue } from '../model/types';
import { evalPropAt, keyAt, sortKeys } from '../model/animate';
import { cloneValue, createEffect, findDef, getProp, propOwner } from '../model/schema';
import { uid } from '../model/ids';
import { audioPlayer } from '../engine/audio';
import { media } from '../engine/media';
import { ctxFor, parentMatrix, worldMatrix } from '../engine/transform';

setAutoFreeze(false);

export type Tool = 'select' | 'pen';
export type Sheet = null | 'props' | 'add' | 'export' | 'project' | 'help';

export interface KeySel {
  layerId: string;
  path: string;
  keyId: string;
}

export interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  time: number;
  playing: boolean;
  loop: boolean;
  selectedId: string | null;
  keySel: KeySel | null;
  tool: Tool;
  /** px per second in the timeline */
  tlZoom: number;
  expanded: Record<string, boolean>;
  previewQuality: 'auto' | 'full' | 'half' | 'quarter';
  saveState: 'saved' | 'saving' | 'unsaved';
  clipboard: Layer | null;
  toast: { msg: string; id: number } | null;
  /** Bottom sheet / dialog currently shown. */
  sheet: Sheet;
  /** Pen tool brush */
  brush: { color: string; width: number };
}

const MAX_HISTORY = 150;
let lastMerge: { key: string; at: number } | null = null;

export const useEditor = create<EditorState>(() => ({
  project: null,
  past: [],
  future: [],
  time: 0,
  playing: false,
  loop: true,
  selectedId: null,
  keySel: null,
  tool: 'select',
  tlZoom: 80,
  expanded: {},
  previewQuality: 'auto',
  saveState: 'saved',
  clipboard: null,
  toast: null,
  sheet: null,
  brush: { color: '#ffffff', width: 12 },
}));

export function openSheet(sheet: Sheet) {
  useEditor.setState({ sheet });
}

const get = useEditor.getState;
const set = useEditor.setState;

export function toast(msg: string) {
  const id = Date.now();
  set({ toast: { msg, id } });
  setTimeout(() => {
    if (get().toast?.id === id) set({ toast: null });
  }, 2600);
}

/* ---------------- project & history ---------------- */

export function openProject(project: Project) {
  stop();
  set({ project, past: [], future: [], time: 0, selectedId: null, keySel: null, tool: 'select', saveState: 'saved', expanded: {}, sheet: null });
}

export function closeProject() {
  stop();
  media.pauseAll();
  set({ project: null, past: [], future: [], selectedId: null, keySel: null, sheet: null });
}

/**
 * Applies an immutable update. Updates sharing `merge` within a short window
 * collapse into one undo step (used for drags and slider scrubbing).
 */
export function update(recipe: (p: Project) => void, merge?: string) {
  const { project, past } = get();
  if (!project) return;
  const next = produce(project, (d) => {
    recipe(d);
  });
  if (next === project) return;
  next.modified = Date.now();
  const now = performance.now();
  const merging = !!merge && lastMerge?.key === merge && now - lastMerge.at < 1500;
  lastMerge = merge ? { key: merge, at: now } : null;
  set({
    project: next,
    past: merging ? past : [...past.slice(-MAX_HISTORY), project],
    future: [],
    saveState: 'unsaved',
  });
}

/** Ends any running merge so the next edit becomes its own undo step. */
export function endMerge() {
  lastMerge = null;
}

export function undo() {
  const { past, project, future } = get();
  if (!past.length || !project) return;
  lastMerge = null;
  const prev = past[past.length - 1];
  set({ project: prev, past: past.slice(0, -1), future: [project, ...future], saveState: 'unsaved' });
  fixSelection();
}

export function redo() {
  const { past, project, future } = get();
  if (!future.length || !project) return;
  lastMerge = null;
  set({ project: future[0], past: [...past, project], future: future.slice(1), saveState: 'unsaved' });
  fixSelection();
}

function fixSelection() {
  const { project, selectedId } = get();
  if (selectedId && !project?.layers.some((l) => l.id === selectedId)) set({ selectedId: null, keySel: null });
}

export function layerById(p: Project, id: string | null | undefined): Layer | undefined {
  return id ? p.layers.find((l) => l.id === id) : undefined;
}

export function selectedLayer(): Layer | undefined {
  const { project, selectedId } = get();
  return project ? layerById(project, selectedId) : undefined;
}

export function select(id: string | null) {
  set({ selectedId: id, keySel: id === get().keySel?.layerId ? get().keySel : null });
}

export function frameTime(t: number) {
  const p = get().project;
  if (!p) return t;
  return Math.min(Math.max(0, Math.round(t * p.fps) / p.fps), p.duration);
}

/* ---------------- layers ---------------- */

export function addLayer(layer: Layer, index = 0) {
  update((p) => {
    p.layers.splice(index, 0, layer);
  });
  set({ selectedId: layer.id, keySel: null });
}

export function patchLayer(id: string, patch: Partial<Layer>, merge?: string) {
  update((p) => {
    const l = layerById(p, id);
    if (l) Object.assign(l, patch);
  }, merge);
}

export function deleteLayer(id: string) {
  update((p) => {
    p.layers = p.layers.filter((l) => l.id !== id);
    for (const l of p.layers) if (l.parent === id) l.parent = null;
  });
  if (get().selectedId === id) set({ selectedId: null, keySel: null });
}

function cloneLayer(l: Layer, nameSuffix = ' copy'): Layer {
  const c = structuredClone(l);
  c.id = uid('L');
  c.name = l.name + nameSuffix;
  c.effects.forEach((e) => (e.id = uid('fx')));
  // Effect ids changed; property paths are relative so nothing else references them.
  return c;
}

export function duplicateLayer(id: string) {
  const p = get().project;
  const l = p && layerById(p, id);
  if (!p || !l) return;
  const c = cloneLayer(l);
  addLayer(c, p.layers.indexOf(l));
}

export function moveLayer(id: string, toIndex: number) {
  update((p) => {
    const i = p.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [l] = p.layers.splice(i, 1);
    p.layers.splice(Math.max(0, Math.min(p.layers.length, toIndex)), 0, l);
  });
}

/** Splits a clip at the playhead into two layers. */
export function splitLayer(id: string) {
  const { project: p, time } = get();
  const l = p && layerById(p, id);
  if (!p || !l || time <= l.start + 1e-3 || time >= l.end - 1e-3) {
    toast('Move the playhead inside the clip to split it');
    return;
  }
  const delta = time - l.start;
  const second = cloneLayer(l, '');
  second.start = time;
  if (second.trimIn !== undefined) second.trimIn = (l.trimIn ?? 0) + delta * (l.speed ?? 1);
  const shift = (props: Record<string, { keys?: Keyframe[] }>) => {
    for (const pr of Object.values(props)) pr.keys?.forEach((k) => (k.t -= delta));
  };
  shift(second.props);
  second.effects.forEach((e) => shift(e.props));
  update((d) => {
    const orig = layerById(d, id)!;
    orig.end = time;
    d.layers.splice(d.layers.indexOf(orig), 0, second);
  });
  set({ selectedId: second.id });
}

export function copyLayer(id: string) {
  const p = get().project;
  const l = p && layerById(p, id);
  if (l) set({ clipboard: structuredClone(l) });
}

export function pasteLayer() {
  const { clipboard, project } = get();
  if (!clipboard || !project) return;
  const c = cloneLayer(clipboard, '');
  if (c.parent && !layerById(project, c.parent)) c.parent = null;
  addLayer(c, 0);
}

/** Re-parents a layer while keeping it visually in place. */
export function setParent(id: string, parentId: string | null) {
  const { project: p, time } = get();
  const l = p && layerById(p, id);
  if (!p || !l) return;
  // Prevent cycles.
  for (let cur = parentId; cur; cur = layerById(p, cur)?.parent ?? null) if (cur === id) return toast("Can't parent a layer to its own child");
  const world = worldMatrix(p, l, time);
  const target = { ...l, parent: parentId };
  const parentM = parentMatrix(p, target, time);
  const local = parentM.inverse().multiply(world);
  const ec = ctxFor(p, l);
  const anchor = evalPropAt(l, 'anchor', time, ec) as [number, number];
  // Position is where the anchor lands in parent space.
  const pos = local.transformPoint(new DOMPoint(anchor[0], anchor[1]));
  const rot = (Math.atan2(local.b, local.a) * 180) / Math.PI;
  const sx = Math.hypot(local.a, local.b) * 100;
  const det = local.a * local.d - local.b * local.c;
  const sy = (det / Math.hypot(local.a, local.b)) * 100;
  update((d) => {
    const dl = layerById(d, id)!;
    dl.parent = parentId;
    if (!getProp(dl, 'position').keys?.length) dl.props.position = { ...dl.props.position, value: [pos.x, pos.y] };
    if (!getProp(dl, 'rotation').keys?.length) dl.props.rotation = { ...dl.props.rotation, value: rot };
    if (!getProp(dl, 'scale').keys?.length) dl.props.scale = { ...dl.props.scale, value: [sx, sy] };
  });
}

/* ---------------- properties & keyframes ---------------- */

const DEFAULT_EASE: EaseName = 'easeInOut';

/** Writes a value; creates/updates a keyframe at the playhead when the property is animated. */
export function writeValue(d: Layer, path: string, value: PropValue, compT: number, fps: number) {
  const o = propOwner(d, path);
  if (!o) return;
  let p = o.owner[o.key];
  if (!p) {
    const def = findDef(d, path);
    p = o.owner[o.key] = { value: cloneValue(def?.def ?? value) };
  }
  if (p.keys?.length) {
    const local = compT - d.start;
    const k = keyAt(p, local, fps);
    if (k) k.v = cloneValue(value);
    else {
      p.keys.push({ id: uid('k'), t: Math.round(local * fps) / fps, v: cloneValue(value), ease: DEFAULT_EASE });
      sortKeys(p);
    }
  } else p.value = cloneValue(value);
}

export function setPropValue(layerId: string, path: string, value: PropValue, merge?: string) {
  const { time } = get();
  update((p) => {
    const l = layerById(p, layerId);
    if (l) writeValue(l, path, value, time, p.fps);
  }, merge ?? `prop:${layerId}:${path}`);
}

/** Stopwatch: start animating (keyframe at playhead) or remove all keyframes. */
export function toggleAnimated(layerId: string, path: string) {
  const { time } = get();
  update((p) => {
    const l = layerById(p, layerId);
    if (!l) return;
    const o = propOwner(l, path);
    if (!o) return;
    const current = evalPropAt(l, path, time, { project: p, index: 1 });
    const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(current) });
    if (prop.keys?.length) {
      prop.value = cloneValue(current);
      delete prop.keys;
    } else {
      prop.keys = [{ id: uid('k'), t: Math.round((time - l.start) * p.fps) / p.fps, v: cloneValue(current), ease: DEFAULT_EASE }];
    }
  });
  set({ expanded: { ...get().expanded, [layerId]: true } });
}

/** Adds a keyframe at the playhead (or removes the one already there). */
export function toggleKeyAtPlayhead(layerId: string, path: string) {
  const { time } = get();
  update((p) => {
    const l = layerById(p, layerId);
    if (!l) return;
    const o = propOwner(l, path);
    if (!o) return;
    const local = time - l.start;
    const current = evalPropAt(l, path, time, { project: p, index: 1 });
    const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(current) });
    const existing = keyAt(prop, local, p.fps);
    if (existing) {
      prop.keys = prop.keys!.filter((k) => k !== existing);
      if (!prop.keys.length) {
        prop.value = cloneValue(existing.v);
        delete prop.keys;
      }
    } else {
      (prop.keys ??= []).push({ id: uid('k'), t: Math.round(local * p.fps) / p.fps, v: cloneValue(current), ease: DEFAULT_EASE });
      sortKeys(prop);
    }
  });
}

function findKey(p: Project, s: KeySel) {
  const l = layerById(p, s.layerId);
  if (!l) return null;
  const o = propOwner(l, s.path);
  const prop = o?.owner[o.key];
  const key = prop?.keys?.find((k) => k.id === s.keyId);
  return key && prop ? { l, prop, key } : null;
}

export function moveKey(s: KeySel, localT: number, merge: string) {
  update((p) => {
    const f = findKey(p, s);
    if (!f) return;
    f.key.t = Math.round(localT * p.fps) / p.fps;
    sortKeys(f.prop);
  }, merge);
}

export function deleteKey(s: KeySel) {
  update((p) => {
    const f = findKey(p, s);
    if (!f) return;
    f.prop.keys = f.prop.keys!.filter((k) => k.id !== s.keyId);
    if (!f.prop.keys.length) {
      f.prop.value = f.key.v;
      delete f.prop.keys;
    }
  });
  set({ keySel: null });
}

export function setKeyEase(s: KeySel, ease: EaseName, bez?: Bezier, merge?: string) {
  update((p) => {
    const f = findKey(p, s);
    if (!f) return;
    f.key.ease = ease;
    if (bez) f.key.bez = bez;
    else delete f.key.bez;
  }, merge);
}

export function setExpr(layerId: string, path: string, expr: string | undefined) {
  update((p) => {
    const l = layerById(p, layerId);
    if (!l) return;
    const o = propOwner(l, path);
    if (!o) return;
    const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(getProp(l, path).value) });
    if (expr === undefined) delete prop.expr;
    else prop.expr = expr;
  }, `expr:${layerId}:${path}`);
}

export function addEffect(layerId: string, type: string) {
  update((p) => {
    layerById(p, layerId)?.effects.push(createEffect(type));
  });
}

/* ---------------- playback ---------------- */

let raf = 0;

export function setTime(t: number) {
  const p = get().project;
  if (!p) return;
  const ft = frameTime(t);
  if (get().playing) {
    stop();
    set({ time: ft });
    play();
  } else set({ time: ft });
}

export function play() {
  const p = get().project;
  if (!p || get().playing) return;
  let from = get().time;
  if (from >= p.duration - 1e-3) from = 0;
  set({ playing: true, time: from });
  void audioPlayer.start(p, from);
  const startedAt = performance.now();
  let base = from;
  let clock = startedAt;
  const tick = (now: number) => {
    const s = get();
    if (!s.playing || !s.project) return;
    let t = base + (now - clock) / 1000;
    const dur = s.project.duration;
    if (t >= dur) {
      if (s.loop) {
        base = 0;
        clock = now;
        t = 0;
        void audioPlayer.start(s.project, 0);
      } else {
        set({ playing: false, time: dur });
        audioPlayer.stop();
        return;
      }
    }
    const ft = Math.floor(t * s.project.fps + 1e-6) / s.project.fps;
    if (ft !== s.time) set({ time: ft });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function stop() {
  cancelAnimationFrame(raf);
  audioPlayer.stop();
  if (get().playing) set({ playing: false });
}

export function togglePlay() {
  audioPlayer.unlock();
  if (get().playing) stop();
  else play();
}

export function stepFrames(n: number) {
  const p = get().project;
  if (!p) return;
  stop();
  set({ time: frameTime(get().time + n / p.fps) });
}
