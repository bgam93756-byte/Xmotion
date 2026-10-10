import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import type { AssetMeta, Bezier, EaseName, Effect, Layer, Project, Prop, PropValue, Vec2 } from '../model/types';
import { evalPropAt, keyAt, sortKeys, vec, type EvalContext } from '../model/animate';
import { PROJECT_VERSION, cloneValue, createEffect, createLayer, defaultZoom, findDef, getProp, propOwner, type PropKind } from '../model/schema';
import { allLayers, ancestors, findLayer, isInside, walk } from '../model/tree';
import { uid } from '../model/ids';
import { audioPlayer } from '../engine/audio';
import { media } from '../engine/media';
import { getAsset } from '../engine/storage';
import { rebase } from './rebase';
import { corners, ctxFor, isMaskLayer, localBounds, localMatrix, parentMatrix, propClock, timesOf, worldMatrix } from '../engine/transform';

setAutoFreeze(false);

export type Tool = 'select' | 'pen' | 'anchor';
export type Sheet = null | 'props' | 'add' | 'export' | 'project' | 'help' | 'more';

export interface KeySel {
  layerId: string;
  path: string;
  keyId: string;
}

/** Copied layers with the assets they use (kept across projects). */
export interface LayerClip {
  layers: Layer[];
  assets: AssetMeta[];
}

export interface PropClip {
  kind: PropKind;
  label: string;
  prop: Prop;
}

/** Canvas overlays and snapping. */
export interface ViewSettings {
  grid: boolean;
  /** Grid spacing in comp pixels. */
  gridSize: number;
  guides: boolean;
  thirds: boolean;
  safe: boolean;
  snap: boolean;
}

export interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  time: number;
  playing: boolean;
  loop: boolean;
  selectedId: string | null;
  /** Multi-selection (layer ids, including selectedId); empty when one or no layer is selected. */
  selection: string[];
  keySel: KeySel | null;
  tool: Tool;
  /** px per second in the timeline */
  tlZoom: number;
  expanded: Record<string, boolean>;
  previewQuality: 'auto' | 'full' | 'half' | 'quarter';
  saveState: 'saved' | 'saving' | 'unsaved';
  clipboard: LayerClip | null;
  fxClipboard: Effect[] | null;
  propClipboard: PropClip | null;
  view: ViewSettings;
  toast: { msg: string; id: number } | null;
  /** Bottom sheet / dialog currently shown. */
  sheet: Sheet;
  /** Property category shown in the phone properties panel (sheet 'props'). */
  propTab: string;
  /** Pen tool brush */
  brush: { color: string; width: number };
  /** Property shown in the graph editor. */
  graph: { layerId: string; path: string } | null;
}

const MAX_HISTORY = 150;

/**
 * Pointers currently down. Edits that share a merge key collapse into one undo
 * step: for a drag (a pointer is down) however long it takes, otherwise when
 * they come within 1.5 s (slider and keyboard nudges).
 */
const pointers = new Set<number>();
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => pointers.add(e.pointerId), true);
  const lift = (e: PointerEvent) => pointers.delete(e.pointerId);
  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', lift, true);
  window.addEventListener('blur', () => pointers.clear());
}
const CLIP_KEY = 'xm.clipboard';
const VIEW_KEY = 'xm.view';

function loadClip(): LayerClip | null {
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    const c = raw ? (JSON.parse(raw) as LayerClip) : null;
    return c && Array.isArray(c.layers) ? c : null;
  } catch {
    return null;
  }
}

function loadView(): ViewSettings {
  const def: ViewSettings = { grid: false, gridSize: 60, guides: true, thirds: false, safe: false, snap: true };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') };
  } catch {
    return def;
  }
}

export function setView(patch: Partial<ViewSettings>) {
  const view = { ...get().view, ...patch };
  set({ view });
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* private mode */
  }
}
let lastMerge: { key: string; at: number } | null = null;

export const useEditor = create<EditorState>(() => ({
  project: null,
  past: [],
  future: [],
  time: 0,
  playing: false,
  loop: true,
  selectedId: null,
  selection: [],
  keySel: null,
  tool: 'select',
  tlZoom: 80,
  expanded: {},
  previewQuality: 'auto',
  saveState: 'saved',
  clipboard: loadClip(),
  fxClipboard: null,
  propClipboard: null,
  view: loadView(),
  toast: null,
  sheet: null,
  propTab: 'transform',
  brush: { color: '#ffffff', width: 12 },
  graph: null,
}));

export function openSheet(sheet: Sheet) {
  useEditor.setState({ sheet });
}

/** Phones: opens the properties panel on a category (Move & Transform, Effects…). */
export function openPanel(tab: string) {
  useEditor.setState({ sheet: 'props', propTab: tab });
}

/** Shows a property's curves in the graph editor (null closes it). */
export function openGraph(layerId: string | null, path?: string) {
  useEditor.setState({ graph: layerId && path ? { layerId, path } : null });
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
  // Groups, masks, 3D and time remapping need version 2; older apps refuse it.
  if (project.version !== PROJECT_VERSION) project = { ...project, version: PROJECT_VERSION };
  set({ project, past: [], future: [], time: 0, selectedId: null, selection: [], keySel: null, tool: 'select', saveState: 'saved', expanded: {}, sheet: null, graph: null });
}

export function closeProject() {
  stop();
  media.pauseAll();
  set({ project: null, past: [], future: [], selectedId: null, selection: [], keySel: null, sheet: null });
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
  const merging = !!merge && lastMerge?.key === merge && (pointers.size > 0 || now - lastMerge.at < 1500);
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

/** Which groups are open is view state: undo/redo keep the current one. */
function keepCollapsed(target: Project, from: Project): Project {
  const closed = new Map<string, boolean>();
  walk(from.layers, (l) => {
    if (l.type === 'group') closed.set(l.id, !!l.collapsed);
  });
  const differs = allLayers(target).some((l) => l.type === 'group' && closed.has(l.id) && !!l.collapsed !== closed.get(l.id));
  if (!differs) return target;
  return produce(target, (d) => {
    walk(d.layers, (l) => {
      if (l.type === 'group' && closed.has(l.id)) l.collapsed = closed.get(l.id);
    });
  });
}

export function undo() {
  const { past, project, future } = get();
  if (!past.length || !project) return;
  lastMerge = null;
  const prev = keepCollapsed(past[past.length - 1], project);
  set({ project: prev, past: past.slice(0, -1), future: [project, ...future], saveState: 'unsaved' });
  fixSelection();
}

export function redo() {
  const { past, project, future } = get();
  if (!future.length || !project) return;
  lastMerge = null;
  set({ project: keepCollapsed(future[0], project), past: [...past, project], future: future.slice(1), saveState: 'unsaved' });
  fixSelection();
}

function fixSelection() {
  const { project, selectedId, selection } = get();
  const exists = (id: string) => !!project && !!findLayer(project, id);
  if (selectedId && !exists(selectedId)) set({ selectedId: null, keySel: null });
  if (selection.some((id) => !exists(id))) set({ selection: selection.filter(exists) });
}

export function layerById(p: Project, id: string | null | undefined): Layer | undefined {
  return findLayer(p, id)?.layer;
}

export function selectedLayer(): Layer | undefined {
  const { project, selectedId } = get();
  return project ? layerById(project, selectedId) : undefined;
}

export function select(id: string | null) {
  set({ selectedId: id, selection: [], keySel: id === get().keySel?.layerId ? get().keySel : null });
  reveal(id);
}

/** Adds or removes a layer from the multi-selection. */
export function toggleSelect(id: string) {
  const { selectedId, selection } = get();
  const cur = selection.length ? selection : selectedId ? [selectedId] : [];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  set({ selection: next.length > 1 ? next : [], selectedId: next.length ? next[next.length - 1] : null, keySel: null });
}

/** The selected layer ids (multi-selection, or just the selected layer). */
export function selectedIds(): string[] {
  const { selectedId, selection } = get();
  return selection.length ? selection : selectedId ? [selectedId] : [];
}

export function frameTime(t: number) {
  const p = get().project;
  if (!p) return t;
  return Math.min(Math.max(0, Math.round(t * p.fps) / p.fps), p.duration);
}

/* ---------------- layers ---------------- */

/** A container's layer list: a group's children, or the root for null. */
function listOf(p: Project, groupId: string | null | undefined): Layer[] {
  if (!groupId) return p.layers;
  const g = layerById(p, groupId);
  return g?.type === 'group' ? (g.children ??= []) : p.layers;
}

/** The comp transform of a container (identity at the root). */
function containerMatrix(p: Project, groupId: string | null | undefined, t: number): DOMMatrix {
  const g = groupId ? layerById(p, groupId) : undefined;
  return g ? worldMatrix(p, g, t) : new DOMMatrix();
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Parent spaces and clocks of layers before a structural change (to keep them in place after). */
function snapshot(p: Project, ids: Iterable<string>, t: number) {
  const out = new Map<string, { parent: DOMMatrix; lt: number; ec: EvalContext }>();
  for (const id of ids) {
    const l = layerById(p, id);
    if (!l) continue;
    const { ec, lt } = timesOf(p, l, t);
    out.set(id, { parent: parentMatrix(p, l, t), lt, ec });
  }
  return out;
}

const INEXACT = "Some animated layers couldn't be kept exactly in place; check their keyframes";
let lastInexact = -Infinity;

/** Tells once (not on every move of a drag) that animated layers were only kept approximately. */
function warnInexact() {
  const now = performance.now();
  if (now - lastInexact > 3000) toast(INEXACT);
  lastInexact = now;
}

/** Re-expresses snapshotted layers in their new parent space, on the draft after the tree changed. */
function restore(d: Project, snap: ReturnType<typeof snapshot>, t: number) {
  let exact = true;
  for (const [id, s] of snap) {
    const l = layerById(d, id);
    if (l && !rebase(l, s.parent, parentMatrix(d, l, t), s.lt, s.ec)) exact = false;
  }
  if (!exact) warnInexact();
}

/**
 * Moves a (draft) layer's in point to `start` without moving its content:
 * keyframes, media trim and time-remap values shift with it.
 */
export function shiftInPoint(l: Layer, start: number) {
  const delta = start - l.start;
  if (!delta) return;
  if (l.trimIn !== undefined) l.trimIn = Math.max(0, l.trimIn + delta * (l.speed ?? 1));
  for (const [key, pr] of Object.entries(l.props)) {
    // Remap values are seconds after the start, so they shift with it too.
    const remap = key === 'timeRemap' && !!l.timeRemapOn;
    pr.keys?.forEach((k) => {
      k.t -= delta;
      if (remap) k.v = (k.v as number) - delta;
    });
    if (remap && !pr.keys?.length) pr.value = (pr.value as number) - delta;
  }
  for (const e of l.effects) for (const pr of Object.values(e.props)) pr.keys?.forEach((k) => (k.t -= delta));
  l.start = start;
}

/** Widens a group (and the groups around it) so a layer's time span shows inside it. */
function coverSpan(d: Project, groupId: string | null, start: number, end: number) {
  for (let g = groupId ? layerById(d, groupId) : undefined; g && !g.timeRemapOn; g = findLayer(d, g.id)?.group ?? undefined) {
    if (start < g.start) shiftInPoint(g, start);
    if (end > g.end) g.end = end;
  }
}

/** Opens collapsed groups around a layer so its timeline row shows (not an undo step). */
function reveal(id: string | null) {
  const p = get().project;
  if (!p || !id) return;
  const closed = ancestors(p, id).filter((g) => g.collapsed);
  if (!closed.length) return;
  set({
    project: produce(p, (d) => {
      for (const g of closed) {
        const dg = layerById(d, g.id);
        if (dg) dg.collapsed = false;
      }
    }),
  });
}

/** Where new layers go: above the selected layer, in its group. */
function insertionPoint(p: Project): { group: string | null; index: number } {
  const f = findLayer(p, get().selectedId);
  return f ? { group: f.group?.id ?? null, index: f.index } : { group: null, index: 0 };
}

/**
 * Inserts layers (top to bottom order) into a container in one undo step.
 * Layers in comp coordinates (`compSpace`: new layers, the clipboard,
 * Elements) are re-expressed in the group's space so they stay in place.
 */
function insertLayers(layers: Layer[], at?: { group: string | null; index: number }, compSpace = true, assets: AssetMeta[] = []) {
  const { project, time } = get();
  if (!project || !layers.length) return;
  const target = at ?? insertionPoint(project);
  const space = compSpace && target.group ? containerMatrix(project, target.group, time) : null;
  let exact = true;
  update((p) => {
    for (const a of assets) if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
    const list = listOf(p, target.group);
    const siblings = new Set(list.map((l) => l.id).concat(layers.map((l) => l.id)));
    for (const l of layers) {
      if (l.parent && !siblings.has(l.parent)) l.parent = null;
      if (space && !l.parent && !rebase(l, new DOMMatrix(), space, time, { project, index: 1 })) exact = false;
    }
    list.splice(Math.max(0, Math.min(list.length, target.index)), 0, ...layers);
  });
  if (!exact) warnInexact();
  const ids = layers.map((l) => l.id);
  set({ selectedId: ids[0], selection: ids.length > 1 ? ids : [], keySel: null });
  reveal(ids[0]);
}

/**
 * Adds a layer above the selected one (or at `at`). A layer made in comp
 * coordinates is re-expressed in its group's space; pass `compSpace` false
 * when it is already in the target container's space.
 */
export function addLayer(layer: Layer, at?: { group: string | null; index: number }, compSpace = true) {
  insertLayers([layer], at, compSpace);
}

export function patchLayer(id: string, patch: Partial<Layer>, merge?: string) {
  update((p) => {
    const l = layerById(p, id);
    if (l) Object.assign(l, patch);
  }, merge);
}

/** Group open/closed in the timeline (not an undo step). */
export function setCollapsed(id: string, collapsed: boolean) {
  const p = get().project;
  if (!p) return;
  set({
    project: produce(p, (d) => {
      const l = layerById(d, id);
      if (l) l.collapsed = collapsed;
    }),
    saveState: 'unsaved',
  });
}

export function deleteLayers(ids: string[]) {
  const { project: p, time } = get();
  if (!p || !ids.length) return;
  const gone = new Set<string>();
  for (const id of ids) {
    const l = layerById(p, id);
    if (l) walk([l], (x) => void gone.add(x.id));
  }
  // Children of deleted parents stay where they are.
  const orphans = allLayers(p).filter((l) => l.parent && gone.has(l.parent) && !gone.has(l.id));
  const snap = snapshot(
    p,
    orphans.map((l) => l.id),
    time,
  );
  update((d) => {
    // Splice in place so the lists stay drafts.
    const prune = (list: Layer[]) => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (gone.has(list[i].id)) list.splice(i, 1);
        else if (list[i].children) prune(list[i].children!);
      }
    };
    prune(d.layers);
    walk(d.layers, (l) => {
      if (l.parent && gone.has(l.parent)) l.parent = null;
    });
    restore(d, snap, time);
  });
  fixSelection();
}

export function deleteLayer(id: string) {
  deleteLayers([id]);
}

/** Deep copies with fresh ids; parent links and effect references inside the copy follow it. */
export function cloneLayers(layers: Layer[], nameSuffix = ' copy'): Layer[] {
  const copy = structuredClone(layers);
  const ids = new Map<string, string>();
  walk(copy, (l) => {
    const id = uid('L');
    ids.set(l.id, id);
    l.id = id;
    l.effects.forEach((e) => (e.id = uid('fx')));
  });
  walk(copy, (l) => {
    if (l.parent) l.parent = ids.get(l.parent) ?? l.parent;
    for (const e of l.effects) for (const k in e.refs ?? {}) e.refs![k] = ids.get(e.refs![k]) ?? e.refs![k];
  });
  if (nameSuffix) copy.forEach((l) => (l.name += nameSuffix));
  return copy;
}

export function duplicateLayer(id: string) {
  duplicateLayers([id]);
}

/** Duplicates layers next to the originals, in whichever groups they are (one undo step). */
export function duplicateLayers(ids: string[]) {
  const p = get().project;
  if (!p) return;
  const lists = new Map<Layer[], { group: string | null; index: number; layers: Layer[] }>();
  for (const l of topLevelSelection(p, ids)) {
    const f = findLayer(p, l.id)!;
    const entry = lists.get(f.list) ?? { group: f.group?.id ?? null, index: f.index, layers: [] };
    entry.index = Math.min(entry.index, f.index);
    entry.layers.push(l);
    lists.set(f.list, entry);
  }
  const plan = [...lists.values()].map((e) => ({ ...e, layers: cloneLayers(e.layers) }));
  if (!plan.length) return;
  update((d) => {
    for (const e of plan) listOf(d, e.group).splice(e.index, 0, ...e.layers);
  });
  const ids2 = plan.flatMap((e) => e.layers.map((l) => l.id));
  set({ selectedId: ids2[0], selection: ids2.length > 1 ? ids2 : [], keySel: null });
}

/** Moves a layer within its container (index 0 = top). */
export function moveLayer(id: string, toIndex: number) {
  update((p) => {
    const f = findLayer(p, id);
    if (!f) return;
    const [l] = f.list.splice(f.index, 1);
    f.list.splice(Math.max(0, Math.min(f.list.length, toIndex)), 0, l);
  });
}

/** Moves a layer into another container (a group or the root), keeping it in place on screen. */
export function moveLayerTo(id: string, groupId: string | null, index: number) {
  const { project: p, time } = get();
  const f = p && findLayer(p, id);
  if (!p || !f) return;
  if (groupId && (groupId === id || isInside(p, groupId, id))) return toast("Can't move a group into itself");
  if ((f.group?.id ?? null) === groupId) {
    const to = index > f.index ? index - 1 : index;
    if (to !== f.index) moveLayer(id, to);
    return;
  }
  const snap = snapshot(p, [id, ...f.list.filter((l) => l.parent === id).map((l) => l.id)], time);
  update((d) => {
    const from = findLayer(d, id)!;
    const [l] = from.list.splice(from.index, 1);
    for (const sib of from.list) if (sib.parent === id) sib.parent = null;
    l.parent = null;
    const list = listOf(d, groupId);
    list.splice(Math.max(0, Math.min(list.length, index)), 0, l);
    // A group only shows its children inside its own time span.
    coverSpan(d, groupId, l.start, l.end);
    restore(d, snap, time);
  });
}

/** Wraps layers of one container in a new group, pivoting at their center. */
export function groupLayers(ids = selectedIds()) {
  const { project: p, time } = get();
  if (!p || !ids.length) return;
  const found = ids.map((id) => findLayer(p, id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (!found.length) return;
  const container = found[0].group?.id ?? null;
  const same = found.filter((f) => (f.group?.id ?? null) === container).sort((a, b) => a.index - b.index);
  if (same.length < found.length) toast('Only layers from the same group were grouped');
  const moving = new Set(same.map((f) => f.layer.id));

  // Pivot at the center of the layers' bounds, in container space.
  const inv = containerMatrix(p, container, time).inverse();
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const f of same) {
    const { ec, lt } = timesOf(p, f.layer, time);
    const m = inv.multiply(worldMatrix(p, f.layer, time));
    for (const [x, y] of corners(localBounds(f.layer, lt, ec, time))) {
      const q = m.transformPoint(new DOMPoint(x, y));
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
  }
  const c: Vec2 = Number.isFinite(x0) ? [round2((x0 + x1) / 2), round2((y0 + y1) / 2)] : [p.width / 2, p.height / 2];
  const group = createLayer(p, 'group', {
    start: Math.min(...same.map((f) => f.layer.start)),
    end: Math.max(...same.map((f) => f.layer.end)),
    props: { position: { value: c }, anchor: { value: [...c] as Vec2 } },
  });
  // Parent links can't cross the group boundary.
  const cut = allLayers(p).filter((l) => l.parent && moving.has(l.id) !== moving.has(l.parent) && same[0].list.includes(l));
  const snap = snapshot(
    p,
    cut.map((l) => l.id),
    time,
  );
  update((d) => {
    const list = listOf(d, container);
    const kids: Layer[] = [];
    for (let i = list.length - 1; i >= 0; i--) if (moving.has(list[i].id)) kids.unshift(...list.splice(i, 1));
    for (const l of [...kids, ...list]) if (l.parent && moving.has(l.id) !== moving.has(l.parent)) l.parent = null;
    group.children = kids;
    list.splice(Math.min(same[0].index, list.length), 0, group);
    restore(d, snap, time);
  });
  set({ selectedId: group.id, selection: [], keySel: null, expanded: { ...get().expanded } });
}

/** Moves a group's layers back into its container, keeping them in place. */
export function ungroup(id: string) {
  const { project: p, time } = get();
  const f = p && findLayer(p, id);
  if (!p || !f || f.layer.type !== 'group') return;
  const g = f.layer;
  const kids = g.children ?? [];
  const lost: string[] = [];
  if ((getProp(g, 'opacity').value as number) < 100 || getProp(g, 'opacity').keys?.length) lost.push('opacity');
  if (g.effects.length) lost.push('effects');
  if (isMaskLayer(g)) lost.push('mask');
  if (g.timeRemapOn) lost.push('time remapping');
  if (['position', 'rotation', 'scale', 'anchor', 'skew', 'skewAxis'].some((k) => getProp(g, k).keys?.length)) lost.push('animation (layers keep the pose at the playhead)');
  if (lost.length) toast(`Removed the group's ${lost.join(', ')}`);
  // Layers parented to the group lose their parent; they stay in place too.
  const parented = f.list.filter((l) => l.parent === id);
  const snap = snapshot(p, [...kids.filter((k) => !k.parent).map((k) => k.id), ...parented.map((l) => l.id)], time);
  update((d) => {
    const at = findLayer(d, id)!;
    const children = at.layer.children ?? [];
    // The group only showed its children inside its own span (on the comp clock unless remapped).
    if (!g.timeRemapOn)
      for (const c of children) {
        const start = Math.min(g.start, c.end - 0.1);
        if (c.start < start) shiftInPoint(c, start);
        c.end = Math.min(c.end, Math.max(g.end, c.start + 0.1));
      }
    for (const l of at.list) if (l.parent === id) l.parent = null;
    at.list.splice(at.index, 1, ...children);
    restore(d, snap, time);
  });
  set({ selectedId: kids[0]?.id ?? null, selection: kids.length > 1 ? kids.map((k) => k.id) : [], keySel: null });
}

/** Splits a clip at the playhead into two layers. */
export function splitLayer(id: string) {
  const { project: p, time } = get();
  const l = p && layerById(p, id);
  const ct = p && l ? timesOf(p, l, time).ct : time;
  if (!p || !l || ct <= l.start + 1e-3 || ct >= l.end - 1e-3) {
    toast('Move the playhead inside the clip to split it');
    return;
  }
  const [second] = cloneLayers([l], '');
  shiftInPoint(second, ct);
  update((d) => {
    const f = findLayer(d, id)!;
    f.layer.end = ct;
    f.list.splice(f.index, 0, second);
  });
  set({ selectedId: second.id, selection: [] });
}

/* ---------------- clipboard & elements ---------------- */

/** Assets (media and fonts) used by layers. */
export function assetsOf(p: Project, layers: Layer[]): AssetMeta[] {
  const ids = new Set<string>();
  const fonts = new Set<string>();
  walk(layers, (l) => {
    if (l.asset) ids.add(l.asset);
    if (l.type === 'text' && l.font) fonts.add(l.font);
  });
  return p.assets.filter((a) => ids.has(a.id) || (a.kind === 'font' && !!a.fontFamily && fonts.has(a.fontFamily)));
}

/**
 * Copies of layers in comp space: each one not parented inside the set gets its
 * parent's or group's transform baked in, so it lands where it was seen
 * (used by the clipboard and Elements).
 */
export function bakeToComp(p: Project, layers: Layer[], t: number): Layer[] {
  const ids = new Set(layers.map((l) => l.id));
  let exact = true;
  const out = layers.map((l) => {
    const c = structuredClone(l);
    if (c.parent && ids.has(c.parent)) return c;
    const { ec, lt } = timesOf(p, l, t);
    if (!rebase(c, parentMatrix(p, l, t), new DOMMatrix(), lt, ec)) exact = false;
    c.parent = null;
    return c;
  });
  if (!exact) warnInexact();
  return out;
}

/** The selected layers worth copying: top to bottom, without layers already inside a selected group. */
export function topLevelSelection(p: Project, ids: string[]): Layer[] {
  return allLayers(p).filter((l) => ids.includes(l.id) && !ids.some((o) => o !== l.id && isInside(p, l.id, o)));
}

/** Copies layers (top to bottom); they can be pasted into any project. */
export function copyLayers(ids = selectedIds()) {
  const { project: p, time } = get();
  if (!p) return;
  const layers = topLevelSelection(p, ids);
  if (!layers.length) return;
  const clip: LayerClip = { layers: bakeToComp(p, layers, time), assets: assetsOf(p, layers) };
  set({ clipboard: clip });
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(clip));
  } catch {
    /* too big to persist; stays in memory */
  }
  toast(layers.length > 1 ? `${layers.length} layers copied` : 'Layer copied');
}

export function copyLayer(id: string) {
  copyLayers([id]);
}

/** Loads assets into the media registry (from this device's storage); false if some are missing. */
export async function loadAssets(assets: AssetMeta[]): Promise<boolean> {
  let ok = true;
  for (const a of assets) {
    if (media.has(a.id)) continue;
    const rec = await getAsset(a.id);
    if (rec) await media.register(rec.meta, rec.blob);
    else ok = false;
  }
  return ok;
}

/** Inserts copied layers (or an element, both in comp space) above the selection. */
export async function insertClip(clip: LayerClip) {
  if (!get().project) return;
  if (!(await loadAssets(clip.assets))) toast('Some media is missing on this device');
  const p = get().project;
  if (!p) return;
  const layers = cloneLayers(clip.layers, '');
  const pasted = new Set<string>();
  walk(layers, (l) => void pasted.add(l.id));
  walk(layers, (l) => {
    for (const e of l.effects) for (const k in e.refs ?? {}) if (!pasted.has(e.refs![k]) && !findLayer(p, e.refs![k])) delete e.refs![k];
  });
  insertLayers(layers, undefined, true, clip.assets);
}

export function pasteLayer() {
  const clip = get().clipboard;
  if (clip) void insertClip(clip);
}

/** Cameras and audio don't draw, so effects would be invisible (and a camera would move). */
export const takesEffects = (l: Layer) => l.type !== 'camera' && l.type !== 'audio';

export function copyEffects(layerId: string, effectId?: string) {
  const p = get().project;
  const l = p && layerById(p, layerId);
  if (!l) return;
  const list = l.effects.filter((e) => !effectId || e.id === effectId);
  if (!list.length) return toast('No effects to copy');
  set({ fxClipboard: structuredClone(list) });
  toast(list.length > 1 ? `${list.length} effects copied` : 'Effect copied');
}

export function pasteEffects(layerId: string) {
  const fx = get().fxClipboard;
  const target = get().project && layerById(get().project!, layerId);
  if (!fx?.length || !target) return;
  if (!takesEffects(target)) return toast(`${target.type === 'camera' ? 'Cameras' : 'Audio layers'} can't have effects`);
  update((p) => {
    const l = layerById(p, layerId);
    if (!l) return;
    for (const e of structuredClone(fx)) {
      e.id = uid('fx');
      for (const k in e.refs ?? {}) if (!findLayer(p, e.refs![k]) || e.refs![k] === layerId) delete e.refs![k];
      l.effects.push(e);
    }
  });
}

export function copyProp(layerId: string, path: string) {
  const p = get().project;
  const l = p && layerById(p, layerId);
  const def = l && findDef(l, path);
  if (!l || !def) return;
  set({ propClipboard: { kind: def.kind, label: def.label, prop: structuredClone(getProp(l, path)) } });
  toast(`${def.label} copied`);
}

/** Pastes a copied value, or its keyframes starting at the playhead. */
export function pasteProp(layerId: string, path: string) {
  const { project, propClipboard: c, time } = get();
  const l = project && layerById(project, layerId);
  const def = l && findDef(l, path);
  if (!project || !l || !def || !c) return;
  if (def.kind !== c.kind) return toast(`Can't paste ${c.label} into ${def.label}`);
  const local = Math.round((propClock(project, l, path, time) - l.start) * project.fps) / project.fps;
  update((p) => {
    const dl = layerById(p, layerId);
    const o = dl && propOwner(dl, path);
    if (!o) return;
    const prop = structuredClone(c.prop);
    if (prop.keys?.length) {
      const shift = local - prop.keys[0].t;
      prop.keys.forEach((k) => {
        k.id = uid('k');
        k.t = Math.round((k.t + shift) * p.fps) / p.fps;
      });
    }
    o.owner[o.key] = prop;
  });
}

/** Resets a property; position goes back to the comp center (as new layers start). */
export function resetProp(layerId: string, path: string) {
  const { project, time } = get();
  const layer = project && layerById(project, layerId);
  if (!project || !layer) return;
  let value: PropValue | undefined;
  if (path === 'position') {
    const inv = parentMatrix(project, layer, time).inverse();
    const c = Number.isNaN(inv.a) ? new DOMPoint(project.width / 2, project.height / 2) : inv.transformPoint(new DOMPoint(project.width / 2, project.height / 2));
    value = [round2(c.x), round2(c.y)];
  } else if (layer.type === 'camera' && (path === 'z' || path === 'zoom')) {
    value = path === 'z' ? -defaultZoom(project) : defaultZoom(project);
  }
  update((p) => {
    const l = layerById(p, layerId);
    const def = l && findDef(l, path);
    const o = l && propOwner(l, path);
    // A remap of 0 would freeze the clip; its neutral state is the identity.
    if (l && path === 'timeRemap') identityRemap(l, p.fps);
    else if (def && o) o.owner[o.key] = { value: cloneValue(value ?? def.def) };
  });
}

/* ---------------- time remapping, 3D, anchor ---------------- */

/** Time remap keys 0→0 and end→end: the clip plays as if not remapped. */
function identityRemap(l: Layer, fps: number) {
  const dur = Math.round((l.end - l.start) * fps) / fps;
  l.props.timeRemap = {
    value: 0,
    keys: [
      { id: uid('k'), t: 0, v: 0, ease: 'linear' },
      { id: uid('k'), t: dur, v: dur, ease: 'linear' },
    ],
  };
}

/** Turns time remapping on (keys 0→0 and end→end, so nothing changes yet) or off. */
export function setTimeRemap(layerId: string, on: boolean) {
  update((p) => {
    const l = layerById(p, layerId);
    if (!l) return;
    l.timeRemapOn = on;
    if (on) identityRemap(l, p.fps);
    else delete l.props.timeRemap;
  });
  if (on) set({ expanded: { ...get().expanded, [layerId]: true } });
}

/**
 * Moves the anchor point (pivot) to a new local position and moves the layer
 * so nothing shifts on screen. A keyframed anchor shifts as a whole; position
 * follows at every keyframe (exact unless rotation, scale or skew are animated).
 */
export function setAnchor(layerId: string, anchor: Vec2, merge?: string) {
  const { project: p, time } = get();
  const l = p && layerById(p, layerId);
  if (!p || !l) return;
  const { ec, lt } = timesOf(p, l, time);
  const old = vec(l, 'anchor', lt, ec);
  const da: Vec2 = [anchor[0] - old[0], anchor[1] - old[1]];
  if (!da[0] && !da[1]) return;
  // Where the pivot change lands in parent space at layer time t: the layer's
  // rotation, skew and scale applied to it.
  const shiftAt = (t: number): [number, number, number] => {
    const m = localMatrix(l, t, ec, undefined, undefined, false);
    const a = m.transformPoint(new DOMPoint(old[0], old[1]));
    const b = m.transformPoint(new DOMPoint(old[0] + da[0], old[1] + da[1]));
    return [b.x - a.x, b.y - a.y, b.z - a.z];
  };
  const linearKeys = ['rotation', 'scale', 'skew', 'skewAxis', ...(l.threeD ? ['rotX', 'rotY'] : [])].filter((k) => getProp(l, k).keys?.length);
  const now = shiftAt(lt);
  const at = (keyT?: number) => (keyT === undefined || !linearKeys.length ? now : shiftAt(l.start + keyT));
  update((pp) => {
    const dl = layerById(pp, layerId);
    if (!dl) return;
    const pos = (dl.props.position ??= { value: cloneValue(getProp(dl, 'position').value) });
    const move = (v: PropValue, d: number[]) => [round2((v as Vec2)[0] + d[0]), round2((v as Vec2)[1] + d[1])] as Vec2;
    pos.value = move(pos.value, now);
    pos.keys?.forEach((k) => (k.v = move(k.v, at(k.t))));
    if (dl.threeD) {
      const z = (dl.props.z ??= { value: getProp(dl, 'z').value });
      z.value = round2((z.value as number) + now[2]);
      z.keys?.forEach((k) => (k.v = round2((k.v as number) + at(k.t)[2])));
    }
    const an = (dl.props.anchor ??= { value: [0, 0] });
    const shiftAnchor = (v: PropValue) => [round2((v as Vec2)[0] + da[0]), round2((v as Vec2)[1] + da[1])] as Vec2;
    an.value = an.keys?.length ? shiftAnchor(an.value) : [round2(anchor[0]), round2(anchor[1])];
    an.keys?.forEach((k) => (k.v = shiftAnchor(k.v)));
  }, merge);
  if (linearKeys.length) warnInexact();
}

/** Re-parents a layer (to a sibling) while keeping it visually in place. */
export function setParent(id: string, parentId: string | null) {
  const { project: p, time } = get();
  const f = p && findLayer(p, id);
  if (!p || !f) return;
  if (parentId && !f.list.some((l) => l.id === parentId)) return toast('A parent must be in the same group');
  // Prevent cycles.
  for (let cur = parentId; cur; cur = layerById(p, cur)?.parent ?? null) if (cur === id) return toast("Can't parent a layer to its own child");
  const snap = snapshot(p, [id], time);
  update((d) => {
    const dl = layerById(d, id)!;
    dl.parent = parentId;
    restore(d, snap, time);
  });
}

/* ---------------- properties & keyframes ---------------- */

const DEFAULT_EASE: EaseName = 'easeInOut';

/** Writes a value; creates/updates a keyframe at the playhead when the property is animated. */
export function writeValue(project: Project, d: Layer, path: string, value: PropValue, compT: number) {
  const fps = project.fps;
  const o = propOwner(d, path);
  if (!o) return;
  let p = o.owner[o.key];
  if (!p) {
    const def = findDef(d, path);
    p = o.owner[o.key] = { value: cloneValue(def?.def ?? value) };
  }
  if (p.keys?.length) {
    const local = propClock(project, d, path, compT) - d.start;
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
    if (l) writeValue(p, l, path, value, time);
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
    const clock = propClock(p, l, path, time);
    const current = evalPropAt(l, path, clock, ctxFor(p, l));
    const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(current) });
    if (prop.keys?.length) {
      prop.value = cloneValue(current);
      delete prop.keys;
    } else {
      prop.keys = [{ id: uid('k'), t: Math.round((clock - l.start) * p.fps) / p.fps, v: cloneValue(current), ease: DEFAULT_EASE }];
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
    const clock = propClock(p, l, path, time);
    const local = clock - l.start;
    const current = evalPropAt(l, path, clock, ctxFor(p, l));
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

/** Whether every one of the properties has a keyframe at the playhead. */
export function keyedAtPlayhead(project: Project, layer: Layer, paths: string[], time: number): boolean {
  return (
    paths.length > 0 &&
    paths.every((path) => {
      const prop = getProp(layer, path);
      return !!prop.keys?.length && !!keyAt(prop, propClock(project, layer, path, time) - layer.start, project.fps);
    })
  );
}

/**
 * Keyframes several properties at the playhead in one step (a panel's ◆ button),
 * or removes their keyframes there when every one of them already has one.
 */
export function toggleKeysAtPlayhead(layerId: string, paths: string[]) {
  const { time } = get();
  update((p) => {
    const l = layerById(p, layerId);
    if (!l) return;
    const ctx = ctxFor(p, l);
    // Values are read before any key changes.
    const items = paths.flatMap((path) => {
      const o = propOwner(l, path);
      if (!o) return [];
      const clock = propClock(p, l, path, time);
      return [{ o, local: clock - l.start, current: evalPropAt(l, path, clock, ctx) }];
    });
    const remove = keyedAtPlayhead(p, l, paths, time);
    for (const { o, local, current } of items) {
      const prop = o.owner[o.key] ?? (o.owner[o.key] = { value: cloneValue(current) });
      const existing = prop.keys?.length ? keyAt(prop, local, p.fps) : undefined;
      if (remove) {
        if (!existing) continue;
        prop.keys = prop.keys!.filter((k) => k !== existing);
        if (!prop.keys.length) {
          prop.value = cloneValue(existing.v);
          delete prop.keys;
        }
      } else if (!existing) {
        (prop.keys ??= []).push({ id: uid('k'), t: Math.round(local * p.fps) / p.fps, v: cloneValue(current), ease: DEFAULT_EASE });
        sortKeys(prop);
      }
    }
  });
  set({ expanded: { ...get().expanded, [layerId]: true } });
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

/** Sets a keyframe's value (graph editor). */
export function setKeyValue(s: KeySel, v: PropValue, merge?: string) {
  update((p) => {
    const f = findKey(p, s);
    if (f) f.key.v = cloneValue(v);
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
    const l = layerById(p, layerId);
    if (l && takesEffects(l)) l.effects.push(createEffect(type));
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
