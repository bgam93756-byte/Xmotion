/**
 * Layers form a tree: project.layers is the root container and group layers
 * hold `children`. These helpers find and walk layers anywhere in the tree.
 */
import { isDraft } from 'immer';
import type { Layer, Project } from './types';

export interface Found {
  layer: Layer;
  /** The container list holding the layer. */
  list: Layer[];
  index: number;
  /** The group containing the layer (null at the root). */
  group: Layer | null;
}

function findIn(list: Layer[], id: string, group: Layer | null): Found | null {
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l.id === id) return { layer: l, list, index: i, group };
    if (l.children?.length) {
      const f = findIn(l.children, id, l);
      if (f) return f;
    }
  }
  return null;
}

/** Calls fn for every layer, depth first, top to bottom. */
export function walk(list: Layer[], fn: (layer: Layer, group: Layer | null, depth: number) => void, group: Layer | null = null, depth = 0) {
  for (const l of list) {
    fn(l, group, depth);
    if (l.children?.length) walk(l.children, fn, l, depth + 1);
  }
}

interface Index {
  byId: Map<string, Found>;
  all: Layer[];
  /** The root's entries when the index was built (to notice in-place edits). */
  top: Layer[];
}

const cache = new WeakMap<Layer[], Index>();

function build(root: Layer[]): { ix: Index; drafts: boolean } {
  const byId = new Map<string, Found>();
  const all: Layer[] = [];
  let drafts = isDraft(root);
  const visit = (list: Layer[], group: Layer | null) => {
    list.forEach((layer, i) => {
      if (!drafts && isDraft(layer)) drafts = true;
      byId.set(layer.id, { layer, list, index: i, group });
      all.push(layer);
      if (layer.children?.length) visit(layer.children, layer);
    });
  };
  visit(root, null);
  return { ix: { byId, all, top: root.slice() }, drafts };
}

/**
 * Index of a layer tree, cached per root array. Trees that still hold immer
 * drafts (inside a store update) are indexed but never cached: the drafts are
 * revoked once the update finishes, while the root array may live on.
 */
function index(root: Layer[]): Index {
  const ix = cache.get(root);
  if (ix && ix.top.length === root.length && ix.top.every((l, i) => root[i] === l)) return ix;
  const built = build(root);
  if (built.drafts) cache.delete(root);
  else cache.set(root, built.ix);
  return built.ix;
}

/** Finds a layer anywhere in the tree (works on immer drafts too). */
export function findLayer(project: Project, id: string | null | undefined): Found | null {
  if (!id) return null;
  if (isDraft(project.layers)) return findIn(project.layers, id, null);
  const hit = index(project.layers).byId.get(id);
  if (hit && hit.list[hit.index] === hit.layer) return hit;
  // Arrays edited in place (outside the store's immutable updates) leave the
  // index stale, so search directly and drop the cached index.
  const found = findIn(project.layers, id, null);
  if (found || hit) cache.delete(project.layers);
  return found;
}

/** Every layer in the tree, depth first (parents before children). */
export function allLayers(project: Project): Layer[] {
  if (isDraft(project.layers)) {
    const out: Layer[] = [];
    walk(project.layers, (l) => out.push(l));
    return out;
  }
  return index(project.layers).all;
}

/** Groups containing a layer, outermost first. */
export function ancestors(project: Project, id: string): Layer[] {
  const out: Layer[] = [];
  let f = findLayer(project, id);
  while (f?.group) {
    out.unshift(f.group);
    f = findLayer(project, f.group.id);
  }
  return out;
}

export function isInside(project: Project, id: string, groupId: string): boolean {
  return ancestors(project, id).some((g) => g.id === groupId);
}

/** Visible and active in every enclosing group (ignores time remapping). */
export function effectiveWindow(project: Project, layer: Layer): { visible: boolean; start: number; end: number } {
  let visible = layer.visible;
  let start = layer.start;
  let end = layer.end;
  for (const g of ancestors(project, layer.id)) {
    visible &&= g.visible;
    if (!g.timeRemapOn) {
      start = Math.max(start, g.start);
      end = Math.min(end, g.end);
    }
  }
  return { visible, start, end };
}
