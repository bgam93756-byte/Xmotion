import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Keyframe, Layer, MaskMode, Project } from '../model/types';
import { findDef } from '../model/schema';
import { EFFECT_DEFS } from '../model/effectDefs';
import { isInside, walk } from '../model/tree';
import { media } from '../engine/media';
import {
  endMerge,
  frameTime,
  layerById,
  moveKey,
  moveLayerTo,
  openGraph,
  openSheet,
  patchLayer,
  select,
  setCollapsed,
  setTime,
  shiftInPoint,
  stop,
  toggleSelect,
  update,
  useEditor,
} from '../state/store';
import { haptic } from '../platform';
import { Icon, type IconName } from './icons';
import './timeline.css';

const TYPE_ICON: Record<Layer['type'], IconName> = {
  shape: 'polygon',
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'music',
  null: 'null',
  adjustment: 'adjust',
  group: 'group',
  camera: 'camera',
};

export function layerIcon(l: Layer): IconName {
  if (l.type === 'shape') return l.shape === 'path' ? 'pen' : (l.shape ?? 'rect');
  return TYPE_ICON[l.type];
}

const MASK_LABEL: Record<MaskMode, string> = {
  none: '',
  alpha: 'Alpha mask',
  alphaInv: 'Inverted alpha mask',
  luma: 'Luma mask',
  lumaInv: 'Inverted luma mask',
};

/** Hold time (ms) for a long-press on a row header (adds/removes it from the selection). */
const LONG_PRESS = 450;
const RULER_H = 26;

interface Geo {
  pps: number;
  padL: number;
  fps: number;
  duration: number;
}

/** A layer row: the layer tree flattened depth first, without the children of closed groups. */
interface Row {
  layer: Layer;
  /** The group holding the layer (null at the root). */
  group: Layer | null;
  index: number;
  depth: number;
  /** Name of the closest time-remapped group around the layer. */
  retimedBy: string | null;
  /** The layer or a group around it is hidden. */
  hidden: boolean;
}

function visibleRows(list: Layer[], group: Layer | null = null, depth = 0, retimedBy: string | null = null, hiddenIn = false, out: Row[] = []): Row[] {
  list.forEach((layer, index) => {
    const hidden = hiddenIn || !layer.visible;
    out.push({ layer, group, index, depth, retimedBy, hidden });
    if (layer.type === 'group' && !layer.collapsed && layer.children?.length)
      visibleRows(layer.children, layer, depth + 1, layer.timeRemapOn ? layer.name : retimedBy, hidden, out);
  });
  return out;
}

/** Drop position while reordering rows: above/below a row in its container, or into a group (at the top). */
interface Drop {
  target: string;
  mode: 'above' | 'below' | 'into';
}

type MarkKind = 'top' | 'bottom' | 'into';

/** All animated property paths of a layer, with display labels (time remapping first). */
function animatedPaths(l: Layer): { path: string; label: string; keys: Keyframe[] }[] {
  const out: { path: string; label: string; keys: Keyframe[] }[] = [];
  const remap = l.timeRemapOn ? l.props.timeRemap : undefined;
  if (remap?.keys?.length) out.push({ path: 'timeRemap', label: findDef(l, 'timeRemap')?.label ?? 'Time remap', keys: remap.keys });
  for (const [k, p] of Object.entries(l.props))
    if (k !== 'timeRemap' && p.keys?.length) out.push({ path: k, label: findDef(l, k)?.label ?? k, keys: p.keys });
  for (const e of l.effects)
    for (const [k, p] of Object.entries(e.props))
      if (p.keys?.length) {
        const path = `fx.${e.id}.${k}`;
        out.push({ path, label: `${EFFECT_DEFS[e.type]?.label ?? e.type} · ${findDef(l, path)?.label ?? k}`, keys: p.keys });
      }
  return out;
}

/**
 * Moves a (draft) layer's in point to `ns` while its content stays where it is
 * in time: media trim, keyframes (relative to start) and time remapping compensate.
 */
interface RowGestures {
  down(e: React.PointerEvent, id: string): void;
  move(e: React.PointerEvent): void;
  up(e: React.PointerEvent): void;
  cancel(e: React.PointerEvent): void;
  click(e: React.MouseEvent, id: string): void;
}

interface Gesture {
  id: string;
  pointer: number;
  x0: number;
  y0: number;
  y: number;
  /** Mouse anywhere on the header, touch only from the layer icon (the rest scrolls). */
  canDrag: boolean;
  dragging: boolean;
  timer: number;
  raf: number;
}

/**
 * Row header gestures: tap selects (double tap opens properties), Ctrl/Cmd/Shift
 * click or long-press toggles multi-selection, dragging reorders the layer tree.
 */
function useRowGestures(scrollRef: { current: HTMLDivElement | null }, rowsRef: { current: Row[] }) {
  const [reorder, setReorder] = useState<{ id: string; drop: Drop | null } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const lastTap = useRef({ id: '', at: 0 });

  const api = useMemo(() => {
    const rowOf = (id: string) => rowsRef.current.find((r) => r.layer.id === id);

    /** Where a dragged layer would land with the pointer at clientY (null if nowhere valid). */
    const dropAt = (y: number, dragId: string): Drop | null => {
      const el = scrollRef.current;
      const p = useEditor.getState().project;
      const rows = rowsRef.current;
      if (!el || !p || !rows.length) return null;
      const blocks = [...el.querySelectorAll<HTMLElement>('.tl-block')];
      if (!blocks.length) return null;
      let drop: Drop | null = null;
      if (y < blocks[0].getBoundingClientRect().top) drop = { target: rows[0].layer.id, mode: 'above' };
      else if (y >= blocks[blocks.length - 1].getBoundingClientRect().bottom) {
        const last = rows.findLast((r) => r.depth === 0);
        if (last) drop = { target: last.layer.id, mode: 'below' };
      } else
        for (const b of blocks) {
          const r = b.getBoundingClientRect();
          if (y < r.top || y >= r.bottom) continue;
          const row = rowOf(b.dataset.id ?? '');
          if (!row) break;
          const group = row.layer.type === 'group';
          const main = (b.firstElementChild as HTMLElement).getBoundingClientRect();
          if (y < main.bottom) {
            const f = (y - main.top) / main.height;
            drop = { target: row.layer.id, mode: group ? (f < 0.3 ? 'above' : f > 0.7 ? 'below' : 'into') : f < 0.5 ? 'above' : 'below' };
          } else drop = { target: row.layer.id, mode: group ? 'into' : 'below' };
          break;
        }
      if (!drop || drop.target === dragId) return null;
      const row = rowOf(drop.target);
      const container = drop.mode === 'into' ? drop.target : (row?.group?.id ?? null);
      // A group can't go into itself or one of its own groups.
      if (!row || (container && (container === dragId || isInside(p, container, dragId)))) return null;
      return drop;
    };

    const show = (g: Gesture) => {
      const drop = dropAt(g.y, g.id);
      setReorder((prev) => (prev?.id === g.id && prev.drop?.target === drop?.target && prev.drop?.mode === drop?.mode ? prev : { id: g.id, drop }));
    };

    // Scrolls the list while a dragged row is held near the top or bottom edge.
    const autoScroll = () => {
      const g = gesture.current;
      const el = scrollRef.current;
      if (!g?.dragging || !el) return;
      const b = el.getBoundingClientRect();
      const top = b.top + RULER_H + 24;
      const bottom = b.bottom - 24;
      const v = g.y < top ? g.y - top : g.y > bottom ? g.y - bottom : 0;
      if (v) {
        const before = el.scrollTop;
        el.scrollTop += Math.max(-14, Math.min(14, v / 2));
        if (el.scrollTop !== before) show(g);
      }
      g.raf = requestAnimationFrame(autoScroll);
    };

    const apply = (id: string, drop: Drop) => {
      const row = rowOf(drop.target);
      if (!row) return;
      if (drop.mode === 'into') {
        moveLayerTo(id, row.layer.id, 0);
        if (row.layer.collapsed) setCollapsed(row.layer.id, false);
      } else moveLayerTo(id, row.group?.id ?? null, row.index + (drop.mode === 'below' ? 1 : 0));
      haptic();
    };

    const finish = (commit: boolean) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      clearTimeout(g.timer);
      cancelAnimationFrame(g.raf);
      if (!g.dragging) return;
      const drop = commit ? dropAt(g.y, g.id) : null;
      setReorder(null);
      if (drop) apply(g.id, drop);
    };

    const gestures: RowGestures = {
      down(e, id) {
        if (e.button !== 0 || (e.target as Element).closest('button')) return;
        suppressClick.current = false;
        finish(false);
        const mouse = e.pointerType === 'mouse';
        const g: Gesture = {
          id,
          pointer: e.pointerId,
          x0: e.clientX,
          y0: e.clientY,
          y: e.clientY,
          canDrag: mouse || !!(e.target as Element).closest('.tl-grip'),
          dragging: false,
          timer: 0,
          raf: 0,
        };
        if (!mouse)
          g.timer = window.setTimeout(() => {
            if (gesture.current !== g) return;
            gesture.current = null;
            suppressClick.current = true;
            toggleSelect(id);
            haptic('medium');
          }, LONG_PRESS);
        if (g.canDrag) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        gesture.current = g;
      },
      move(e) {
        const g = gesture.current;
        if (!g || e.pointerId !== g.pointer) return;
        g.y = e.clientY;
        if (!g.dragging) {
          if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 6) return;
          clearTimeout(g.timer);
          if (!g.canDrag) {
            // Touch outside the icon: the list scrolls instead.
            gesture.current = null;
            return;
          }
          g.dragging = true;
          suppressClick.current = true;
          haptic();
          g.raf = requestAnimationFrame(autoScroll);
        }
        show(g);
      },
      up(e) {
        if (gesture.current?.pointer === e.pointerId) finish(true);
      },
      cancel(e) {
        if (gesture.current?.pointer === e.pointerId) finish(false);
      },
      click(e, id) {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        haptic();
        if (e.ctrlKey || e.metaKey || e.shiftKey) return toggleSelect(id);
        const now = Date.now();
        const double = lastTap.current.id === id && now - lastTap.current.at < 350;
        lastTap.current = { id, at: double ? 0 : now };
        select(id);
        if (double) openSheet('props');
      },
    };
    return { gestures, cancel: () => finish(false) };
  }, [scrollRef, rowsRef]);

  useEffect(() => api.cancel, [api]);
  return { ...api, reorder };
}

/** Vertical scroll of the layer list, kept while the timeline is unmounted. */
let savedScrollTop = 0;

export function Timeline() {
  const project = useEditor((s) => s.project)!;
  const selectedId = useEditor((s) => s.selectedId);
  const selection = useEditor((s) => s.selection);
  const pps = useEditor((s) => s.tlZoom);
  const keySel = useEditor((s) => s.keySel);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const fromScroll = useRef(false);
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const touches = useRef(new Map<number, number>());

  const compact = width < 700;
  const NW = compact ? 150 : 196;
  /** Indent per tree level (px). */
  const step = compact ? 6 : 14;
  const trackView = Math.max(50, width - NW);
  const padL = trackView / 2;
  const geo = useMemo<Geo>(() => ({ pps, padL, fps: project.fps, duration: project.duration }), [pps, padL, project.fps, project.duration]);
  const trackW = padL * 2 + project.duration * pps;

  const rows = useMemo(() => visibleRows(project.layers), [project.layers]);
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const hasGroups = rows.some((r) => r.layer.type === 'group');
  const selected = new Set(selection.length ? selection : selectedId ? [selectedId] : []);
  const { gestures, cancel: cancelRowDrag, reorder } = useRowGestures(scrollRef, rowsRef);

  // Drop indicator: a line above/below a row (below an open group = after its last visible
  // descendant), or a highlighted group row for "into".
  const marks = useMemo(() => {
    const m = new Map<string, { kind: MarkKind; depth: number }>();
    const d = reorder?.drop;
    const i = d ? rows.findIndex((r) => r.layer.id === d.target) : -1;
    if (!d || i < 0) return m;
    const r = rows[i];
    if (d.mode === 'above') m.set(r.layer.id, { kind: 'top', depth: r.depth });
    else if (d.mode === 'into') m.set(r.layer.id, { kind: 'into', depth: r.depth + 1 });
    else {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1].depth > r.depth) j++;
      m.set(rows[j].layer.id, { kind: 'bottom', depth: r.depth });
    }
    return m;
  }, [reorder, rows]);

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Keep the playhead (fixed at the centre) in sync with the current time.
  useEffect(() => {
    const el = scrollRef.current!;
    el.scrollLeft = useEditor.getState().time * pps;
    return useEditor.subscribe((s, prev) => {
      if (s.time === prev.time && s.tlZoom === prev.tlZoom) return;
      if (fromScroll.current) {
        fromScroll.current = false;
        return;
      }
      el.scrollLeft = s.time * s.tlZoom;
    });
  }, [pps, width]);

  // The graph editor replaces the timeline; come back to the same rows.
  useLayoutEffect(() => {
    scrollRef.current!.scrollTop = savedScrollTop;
  }, []);

  // Bring the selected layer's row into view (e.g. picked on the canvas inside a group).
  useEffect(() => {
    const el = scrollRef.current;
    const row = selectedId ? el?.querySelector<HTMLElement>(`.tl-block[data-id="${CSS.escape(selectedId)}"] > .tl-row.main`) : null;
    if (!el || !row) return;
    const ruler = el.querySelector<HTMLElement>('.tl-ruler-row')?.offsetHeight ?? 0;
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top;
    if (top < ruler) el.scrollTop += top - ruler;
    else if (top + row.offsetHeight > el.clientHeight) el.scrollTop += top + row.offsetHeight - el.clientHeight;
  }, [selectedId, rows]);

  const onScroll = () => {
    const el = scrollRef.current!;
    savedScrollTop = el.scrollTop;
    const s = useEditor.getState();
    // While playing, scroll position follows the clock; user input pauses first (pointerdown/wheel).
    if (s.playing) return;
    const t = el.scrollLeft / pps;
    const tol = Math.max(0.5 / project.fps, 1.5 / pps);
    if (Math.abs(t - s.time) <= tol) return;
    fromScroll.current = true;
    setTime(Math.min(project.duration, t));
    fromScroll.current = false;
  };

  const zoomBy = (k: number) => useEditor.setState((s) => ({ tlZoom: Math.min(600, Math.max(8, s.tlZoom * k)) }));

  useEffect(() => {
    const el = scrollRef.current!;
    const wheel = (e: WheelEvent) => {
      if (useEditor.getState().playing && Math.abs(e.deltaX) > Math.abs(e.deltaY)) stop();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(Math.exp(-e.deltaY * 0.01));
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  return (
    <div className={`timeline ${reorder ? 'reordering' : ''}`} style={{ ['--nw' as string]: `${NW}px` }}>
      <div
        ref={scrollRef}
        className="tl-scroll"
        onScroll={onScroll}
        onPointerDown={(e) => {
          touches.current.set(e.pointerId, e.clientX);
          if (useEditor.getState().playing) stop();
          if (touches.current.size === 2) {
            cancelRowDrag();
            const [a, b] = [...touches.current.values()];
            pinch.current = { d0: Math.abs(b - a) || 1, z0: pps };
          }
        }}
        onPointerMove={(e) => {
          if (!touches.current.has(e.pointerId)) return;
          touches.current.set(e.pointerId, e.clientX);
          if (pinch.current && touches.current.size === 2) {
            const [a, b] = [...touches.current.values()];
            const z = Math.min(600, Math.max(8, pinch.current.z0 * (Math.abs(b - a) / pinch.current.d0)));
            useEditor.setState({ tlZoom: z });
          }
        }}
        onPointerUp={(e) => {
          touches.current.delete(e.pointerId);
          if (touches.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          touches.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        <div className="tl-inner" style={{ width: NW + trackW }}>
          <div className="tl-row tl-ruler-row">
            <div className="tl-name tl-corner">
              <button type="button" className="tl-zoom" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom timeline out">
                <Icon name="minus" size={14} />
              </button>
              <button type="button" className="tl-zoom" onClick={() => zoomBy(1.4)} aria-label="Zoom timeline in">
                <Icon name="plus" size={14} />
              </button>
            </div>
            <Ruler project={project} geo={geo} width={trackW} />
          </div>
          {rows.map((r) => {
            const mark = marks.get(r.layer.id);
            return (
              <LayerRows
                key={r.layer.id}
                layer={r.layer}
                indent={Math.min(r.depth, 4) * step}
                caretSpace={hasGroups}
                compact={compact}
                retimedBy={r.retimedBy}
                dimmed={r.hidden}
                parentName={r.layer.parent ? (layerById(project, r.layer.parent)?.name ?? null) : null}
                geo={geo}
                trackW={trackW}
                selected={selected.has(r.layer.id)}
                primary={r.layer.id === selectedId}
                keyId={keySel?.layerId === r.layer.id ? keySel.keyId : null}
                mark={mark?.kind ?? null}
                markIndent={mark ? Math.min(mark.depth, 4) * step : 0}
                dragging={reorder?.id === r.layer.id}
                gestures={gestures}
              />
            );
          })}
          {!rows.length && (
            <div className="tl-empty" style={{ left: NW + 12 }}>
              Tap <b>+</b> to add text, shapes, photos, video or music.
            </div>
          )}
          <div className="tl-row tl-spacer" />
        </div>
      </div>
      <div className="tl-playhead" style={{ left: NW + padL }}>
        <span />
      </div>
    </div>
  );
}

function Ruler({ project, geo, width }: { project: Project; geo: Geo; width: number }) {
  const steps = [1 / project.fps, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const step = steps.find((s) => s * geo.pps >= 56) ?? 120;
  const minor = step / 5;
  const ticks: ReactElement[] = [];
  for (let t = 0; t <= project.duration + 1e-6; t += minor) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    const x = geo.padL + t * geo.pps;
    ticks.push(
      <div key={t.toFixed(4)} className={`tick ${major ? 'major' : ''}`} style={{ left: x }}>
        {major && <span>{formatRuler(t, step)}</span>}
      </div>,
    );
    if (ticks.length > 3000) break;
  }
  return (
    <div className="tl-track tl-ruler" style={{ width }}>
      <div className="tl-range" style={{ left: geo.padL, width: project.duration * geo.pps }} />
      {ticks}
    </div>
  );
}

function formatRuler(t: number, step: number) {
  if (step < 1) return `${t.toFixed(step < 0.1 ? 2 : 1)}s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

const LayerRows = memo(function LayerRows({
  layer,
  indent,
  caretSpace,
  compact,
  retimedBy,
  dimmed,
  parentName,
  geo,
  trackW,
  selected,
  primary,
  keyId,
  mark,
  markIndent,
  dragging,
  gestures,
}: {
  layer: Layer;
  /** Header indent for the tree depth (px). */
  indent: number;
  /** Reserve room for a group caret so icons line up. */
  caretSpace: boolean;
  /** Narrow screens: row buttons only on the selected row, to leave room for names. */
  compact: boolean;
  retimedBy: string | null;
  /** Hidden itself or inside a hidden group. */
  dimmed: boolean;
  parentName: string | null;
  geo: Geo;
  trackW: number;
  selected: boolean;
  primary: boolean;
  keyId: string | null;
  mark: MarkKind | null;
  markIndent: number;
  dragging: boolean;
  gestures: RowGestures;
}) {
  const expanded = useEditor((s) => s.expanded[layer.id]);
  const graphPath = useEditor((s) => (s.graph?.layerId === layer.id ? s.graph.path : null));
  const paths = animatedPaths(layer);
  // Keyframe lanes follow the selection unless opened/closed explicitly.
  const showKeys = paths.length > 0 && (expanded ?? primary);
  const isGroup = layer.type === 'group';
  const toggleVis = () => patchLayer(layer.id, { visible: !layer.visible });
  /** Keys of time-remapped properties (or inside a remapped group) live on another clock. */
  const onCompClock = (path: string) => !retimedBy && (path === 'timeRemap' || !layer.timeRemapOn);

  const badges: { icon: IconName; title: string }[] = [];
  if (layer.maskMode && layer.maskMode !== 'none') badges.push({ icon: 'mask', title: MASK_LABEL[layer.maskMode] });
  if (layer.threeD) badges.push({ icon: 'cube', title: '3D layer' });
  if (layer.timeRemapOn) badges.push({ icon: 'clock', title: 'Time remapping' });
  if (parentName) badges.push({ icon: 'link', title: `Parent: ${parentName}` });

  return (
    <div
      className={`tl-block ${dragging ? 'dragging' : ''} ${mark ? `drop-${mark}` : ''}`}
      data-id={layer.id}
      style={{ ['--ind' as string]: `${indent}px`, ['--mind' as string]: `${markIndent}px` }}
    >
      <div className={`tl-row main ${selected ? 'selected' : ''} ${dimmed ? 'hidden-layer' : ''} ${isGroup ? 'group' : ''}`}>
        <div
          className="tl-name"
          onPointerDown={(e) => gestures.down(e, layer.id)}
          onPointerMove={gestures.move}
          onPointerUp={gestures.up}
          onPointerCancel={gestures.cancel}
          onClick={(e) => gestures.click(e, layer.id)}
          onDoubleClick={(e) => !(e.ctrlKey || e.metaKey || e.shiftKey) && openSheet('props')}
          onContextMenu={(e) => e.preventDefault()}
        >
          {isGroup ? (
            <button
              type="button"
              className="tl-caret"
              aria-label={layer.collapsed ? 'Open group' : 'Close group'}
              aria-expanded={!layer.collapsed}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed(layer.id, !layer.collapsed);
                haptic();
              }}
            >
              <Icon name={layer.collapsed ? 'next' : 'down'} size={13} />
            </button>
          ) : (
            caretSpace && <span className="tl-caret-space" />
          )}
          <span className="tl-icon tl-grip" style={{ color: layer.label }} title="Drag to reorder">
            <Icon name={layerIcon(layer)} size={15} />
          </span>
          <span className="tl-text">
            <span className="tl-label">{layer.name}</span>
            {badges.length > 0 && (
              <span className="tl-badges">
                {badges.map((b) => (
                  <span key={b.icon} role="img" title={b.title} aria-label={b.title}>
                    <Icon name={b.icon} size={10} />
                  </span>
                ))}
              </span>
            )}
          </span>
          {paths.length > 0 && (!compact || primary) && (
            <button
              type="button"
              className="tl-mini"
              title={showKeys ? 'Hide keyframes' : 'Show keyframes'}
              onClick={(e) => {
                e.stopPropagation();
                useEditor.setState((s) => ({ expanded: { ...s.expanded, [layer.id]: !showKeys } }));
              }}
            >
              <Icon name={showKeys ? 'down' : 'next'} size={12} />
            </button>
          )}
          {(!compact || primary || !layer.visible) && (
          <button
            type="button"
            className="tl-mini"
            title={layer.visible ? 'Hide' : 'Show'}
            onClick={(e) => {
              e.stopPropagation();
              toggleVis();
            }}
          >
            <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={13} />
          </button>
          )}
        </div>
        <div className="tl-track" style={{ width: trackW }}>
          <ClipBar layer={layer} geo={geo} selected={selected} primary={primary} paths={paths.filter((p) => onCompClock(p.path))} retimedBy={retimedBy} />
        </div>
      </div>
      {showKeys &&
        paths.map((p) => (
          <div key={p.path} className="tl-row sub">
            <div className="tl-name sub" title={p.label}>
              <span className="tl-label">{p.label}</span>
              <button
                type="button"
                className={`tl-graph ${graphPath === p.path ? 'on' : ''}`}
                title="Graph editor"
                aria-label={`${p.label} curves`}
                onClick={() => openGraph(graphPath === p.path ? null : layer.id, p.path)}
              >
                <Icon name="graph" size={12} />
              </button>
            </div>
            <div className="tl-track" style={{ width: trackW }}>
              {p.keys.map((k) => (
                <Diamond key={k.id} layer={layer} path={p.path} k={k} geo={geo} selected={keyId === k.id} direct={onCompClock(p.path)} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
});

/** Start/end of every layer inside a group (any depth), by id. */
function spansInside(groupId: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const p = useEditor.getState().project;
  walk((p && layerById(p, groupId)?.children) || [], (c) => void out.set(c.id, [c.start, c.end]));
  return out;
}

function ClipBar({
  layer,
  geo,
  selected,
  primary,
  paths,
  retimedBy,
}: {
  layer: Layer;
  geo: Geo;
  selected: boolean;
  primary: boolean;
  paths: { keys: Keyframe[] }[];
  retimedBy: string | null;
}) {
  const left = geo.padL + layer.start * geo.pps;
  const w = Math.max(4, (layer.end - layer.start) * geo.pps);
  const drag = useRef<{
    mode: 'move' | 'l' | 'r';
    x0: number;
    start: number;
    end: number;
    moved: boolean;
    id: number;
    /** Moving a group: start/end of every layer inside it when the drag began. */
    kids: Map<string, [number, number]> | null;
  } | null>(null);
  const lastTap = useRef(0);
  const isGroup = layer.type === 'group';

  const down = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (layer.locked && mode !== 'move') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const kids = isGroup && mode === 'move' ? spansInside(layer.id) : null;
    drag.current = { mode, x0: e.clientX, start: layer.start, end: layer.end, moved: false, id: e.pointerId, kids };
    endMerge();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dxPx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dxPx) < 4) return;
    if (!d.moved) select(layer.id);
    d.moved = true;
    if (layer.locked) return;
    const snap = (t: number) => {
      // Snap to the playhead and comp edges.
      const targets = [useEditor.getState().time, 0, geo.duration];
      for (const s of targets) if (Math.abs(t - s) * geo.pps < 8) return s;
      return frameTime(t);
    };
    const dt = dxPx / geo.pps;
    const minLen = 1 / geo.fps;
    const merge = `clip:${layer.id}:${d.id}`;
    if (d.mode === 'move') {
      const len = d.end - d.start;
      let ns = snap(Math.max(0, d.start + dt));
      const ne = snap(ns + len);
      if (Math.abs(ne - (ns + len)) > 1e-9) ns = ne - len;
      ns = Math.max(0, ns);
      const kids = d.kids;
      if (kids) {
        // A group carries everything inside it along.
        const delta = ns - d.start;
        update((p) => {
          const g = layerById(p, layer.id);
          if (!g) return;
          g.start = ns;
          g.end = ns + len;
          walk(g.children ?? [], (c) => {
            const o = kids.get(c.id);
            if (!o) return;
            c.start = o[0] + delta;
            c.end = o[1] + delta;
          });
        }, merge);
      } else patchLayer(layer.id, { start: ns, end: ns + len }, merge);
    } else if (d.mode === 'l') {
      // Groups trim only themselves; their layers keep their times.
      const ns = Math.min(d.end - minLen, Math.max(0, snap(d.start + dt)));
      update((p) => {
        const l = layerById(p, layer.id);
        if (l && Math.abs(ns - l.start) > 1e-9) shiftInPoint(l, ns);
      }, merge);
    } else {
      const ne = Math.max(d.start + minLen, snap(d.end + dt));
      patchLayer(layer.id, { end: ne }, merge);
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(d.id);
    endMerge();
    if (!d.moved) {
      haptic();
      if (e.ctrlKey || e.metaKey || e.shiftKey) return toggleSelect(layer.id);
      const now = Date.now();
      if (now - lastTap.current < 350) openSheet('props');
      lastTap.current = now;
      select(layer.id);
    }
  };

  const keyTimes = [...new Set(paths.flatMap((p) => p.keys.map((k) => k.t)))];

  return (
    <div
      className={`clip ${selected ? 'selected' : ''} ${layer.locked ? 'locked' : ''} ${isGroup ? 'group' : ''} ${retimedBy ? 'retimed' : ''}`}
      style={{ left, width: w, ['--c' as string]: layer.label }}
      title={retimedBy ? `Runs on the time-remapped clock of "${retimedBy}": its start and end are in that group's time` : undefined}
      onPointerDown={down('move')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {(layer.type === 'audio' || layer.type === 'video') && <Waveform layer={layer} width={w} />}
      <span className="clip-name">{layer.name}</span>
      {keyTimes.map((t) => (
        <span key={t} className="clip-key" style={{ left: t * geo.pps }} />
      ))}
      {primary && (
        <>
          <span className="clip-handle l" onPointerDown={down('l')} onPointerMove={move} onPointerUp={up} />
          <span className="clip-handle r" onPointerDown={down('r')} onPointerMove={move} onPointerUp={up} />
        </>
      )}
    </div>
  );
}

function Waveform({ layer, width }: { layer: Layer; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const off = media.onChange(() => force((n) => n + 1));
    return () => void off();
  }, []);
  const peaks = media.peaks(layer.asset);
  const dur = media.get(layer.asset)?.meta.duration;
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks || !dur) return;
    const w = Math.min(4000, Math.round(width));
    const h = 28;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const span = (layer.end - layer.start) * (layer.speed ?? 1);
    for (let x = 0; x < w; x++) {
      const st = (layer.trimIn ?? 0) + (x / w) * span;
      const i = Math.floor((st / dur) * peaks.length);
      const v = peaks[i] ?? 0;
      const bh = Math.max(1, v * h * (layer.volume ?? 1));
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [peaks, dur, width, layer.trimIn, layer.speed, layer.start, layer.end, layer.volume]);
  return <canvas ref={ref} className="waveform" />;
}

/**
 * A keyframe on its property lane, at layer.start + k.t; drag to retime, tap to
 * jump to it. Keys on a time-remapped clock (`direct` false) sit at their
 * layer time, which isn't a comp time, so tapping them doesn't move the playhead.
 */
function Diamond({ layer, path, k, geo, selected, direct }: { layer: Layer; path: string; k: Keyframe; geo: Geo; selected: boolean; direct: boolean }) {
  const drag = useRef<{ x0: number; t0: number; moved: boolean; id: number } | null>(null);
  const sel = { layerId: layer.id, path, keyId: k.id };
  return (
    <span
      className={`diamond ${selected ? 'selected' : ''} ${direct ? '' : 'retimed'} ease-${k.ease}`}
      style={{ left: geo.padL + (layer.start + k.t) * geo.pps }}
      title={direct ? `${k.ease} @ ${(layer.start + k.t).toFixed(2)}s` : `${k.ease} @ ${k.t.toFixed(2)}s of the layer's remapped time`}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x0: e.clientX, t0: k.t, moved: false, id: e.pointerId };
        useEditor.setState({ keySel: sel, selectedId: layer.id, selection: [] });
        endMerge();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x0;
        if (!d.moved && Math.abs(dx) < 4) return;
        d.moved = true;
        moveKey(sel, Math.max(-layer.start, d.t0 + dx / geo.pps), `key:${k.id}:${d.id}`);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        endMerge();
        if (d && !d.moved) {
          if (direct) setTime(layer.start + k.t);
          haptic();
        }
      }}
    />
  );
}
