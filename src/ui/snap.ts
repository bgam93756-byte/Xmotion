/**
 * Snapping for viewport drags. Everything here is in comp pixels and pure: the
 * viewport collects the target lines once per drag and snaps a moving box.
 */
import type { Vec2 } from '../model/types';

/** Axis-aligned box in comp pixels. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What a moving box can snap to: vertical lines (x), horizontal lines (y) and an optional grid. */
export interface SnapTargets {
  x: number[];
  y: number[];
  /** Grid spacing, or null when the grid is off. */
  grid: number | null;
  width: number;
  height: number;
}

export interface SnapResult {
  /** Offset to add to the box. */
  dx: number;
  dy: number;
  /** Lines the snapped box lines up with (for drawing). */
  lines: { x: number[]; y: number[] };
}

export function boxOf(pts: Vec2[]): Box | null {
  if (!pts.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return Number.isFinite(x0 + y0 + x1 + y1) ? { x0, y0, x1, y1 } : null;
}

export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export function moveBox(b: Box, dx: number, dy: number): Box {
  return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy };
}

/** Left, center, right. */
export const edgesX = (b: Box) => [b.x0, (b.x0 + b.x1) / 2, b.x1];
/** Top, middle, bottom. */
export const edgesY = (b: Box) => [b.y0, (b.y0 + b.y1) / 2, b.y1];

/**
 * Snap lines from the comp (edges and center), guides and other layers' boxes.
 * Grid lines are matched arithmetically, so they aren't listed.
 */
export function snapTargets(opts: { width: number; height: number; guides?: { v: number[]; h: number[] } | null; grid?: number | null; boxes?: Box[] }): SnapTargets {
  const { width, height } = opts;
  const x = [0, width / 2, width];
  const y = [0, height / 2, height];
  if (opts.guides) {
    x.push(...opts.guides.v);
    y.push(...opts.guides.h);
  }
  for (const b of opts.boxes ?? []) {
    x.push(...edgesX(b));
    y.push(...edgesY(b));
  }
  return { x, y, grid: opts.grid && opts.grid > 0 ? opts.grid : null, width, height };
}

/** Nearest grid line to v inside [0, extent], or null. */
function gridLine(v: number, grid: number | null, extent: number): number | null {
  if (!grid) return null;
  const g = Math.round(v / grid) * grid;
  return g >= 0 && g <= extent ? g : null;
}

/** Smallest offset (within tol) that puts one of `edges` on a line, or null. */
export function snapAxis(edges: number[], lines: number[], grid: number | null, extent: number, tol: number): number | null {
  let best: number | null = null;
  const consider = (off: number) => {
    if (Math.abs(off) <= tol && (best === null || Math.abs(off) < Math.abs(best))) best = off;
  };
  for (const e of edges) {
    for (const l of lines) consider(l - e);
    const g = gridLine(e, grid, extent);
    if (g !== null) consider(g - e);
  }
  return best;
}

/** Lines (from the targets or the grid) that any of `edges` sits on. */
function touching(edges: number[], lines: number[], grid: number | null, extent: number, eps: number): number[] {
  const out: number[] = [];
  const add = (l: number) => {
    if (!out.some((o) => Math.abs(o - l) < eps)) out.push(l);
  };
  for (const e of edges) {
    for (const l of lines) if (Math.abs(l - e) < eps) add(l);
    const g = gridLine(e, grid, extent);
    if (g !== null && Math.abs(g - e) < eps) add(g);
  }
  return out;
}

/** Snaps a box's left/center/right and top/middle/bottom to the targets, independently per axis. */
export function snapBox(box: Box, t: SnapTargets, tol: number): SnapResult {
  const dx = snapAxis(edgesX(box), t.x, t.grid, t.width, tol) ?? 0;
  const dy = snapAxis(edgesY(box), t.y, t.grid, t.height, tol) ?? 0;
  const b = moveBox(box, dx, dy);
  const eps = Math.max(1e-3, tol * 0.02);
  return {
    dx,
    dy,
    lines: { x: touching(edgesX(b), t.x, t.grid, t.width, eps), y: touching(edgesY(b), t.y, t.grid, t.height, eps) },
  };
}

/** Snaps a single value (a guide being dragged) to comp edges/center, other lines and the grid. */
export function snapValue(v: number, lines: number[], grid: number | null, extent: number, tol: number): number {
  const off = snapAxis([v], [0, extent / 2, extent, ...lines], grid, extent, tol);
  return off === null ? v : v + off;
}
