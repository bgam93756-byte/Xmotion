import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { Keyframe, Layer, Project } from '../model/types';
import { findDef } from '../model/schema';
import { EFFECT_DEFS } from '../model/effectDefs';
import { media } from '../engine/media';
import {
  endMerge,
  frameTime,
  layerById,
  moveKey,
  openSheet,
  patchLayer,
  select,
  setTime,
  stop,
  update,
  useEditor,
  type KeySel,
} from '../state/store';
import { haptic } from '../platform';
import { Icon, type IconName } from './icons';

const TYPE_ICON: Record<Layer['type'], IconName> = {
  shape: 'polygon',
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'music',
  null: 'null',
  adjustment: 'adjust',
};

export function layerIcon(l: Layer): IconName {
  if (l.type === 'shape') return l.shape === 'path' ? 'pen' : (l.shape ?? 'rect');
  return TYPE_ICON[l.type];
}

interface Geo {
  pps: number;
  padL: number;
  fps: number;
}

/** All animated property paths of a layer, with display labels. */
function animatedPaths(l: Layer): { path: string; label: string; keys: Keyframe[] }[] {
  const out: { path: string; label: string; keys: Keyframe[] }[] = [];
  for (const [k, p] of Object.entries(l.props)) if (p.keys?.length) out.push({ path: k, label: findDef(l, k)?.label ?? k, keys: p.keys });
  for (const e of l.effects)
    for (const [k, p] of Object.entries(e.props))
      if (p.keys?.length) {
        const path = `fx.${e.id}.${k}`;
        out.push({ path, label: `${EFFECT_DEFS[e.type]?.label ?? e.type} · ${findDef(l, path)?.label ?? k}`, keys: p.keys });
      }
  return out;
}

export function Timeline() {
  const project = useEditor((s) => s.project)!;
  const selectedId = useEditor((s) => s.selectedId);
  const pps = useEditor((s) => s.tlZoom);
  const keySel = useEditor((s) => s.keySel);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const fromScroll = useRef(false);
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const touches = useRef(new Map<number, number>());

  const NW = width < 700 ? 124 : 184;
  const trackView = Math.max(50, width - NW);
  const padL = trackView / 2;
  const geo: Geo = { pps, padL, fps: project.fps };
  const trackW = padL * 2 + project.duration * pps;

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

  const onScroll = () => {
    const el = scrollRef.current!;
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
    <div className="timeline" style={{ ['--nw' as string]: `${NW}px` }}>
      <div
        ref={scrollRef}
        className="tl-scroll"
        onScroll={onScroll}
        onPointerDown={(e) => {
          touches.current.set(e.pointerId, e.clientX);
          if (useEditor.getState().playing) stop();
          if (touches.current.size === 2) {
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
          {project.layers.map((l) => (
            <LayerRows key={l.id} layer={l} project={project} geo={geo} trackW={trackW} selected={l.id === selectedId} keySel={keySel} />
          ))}
          {!project.layers.length && (
            <div className="tl-empty" style={{ left: NW + 12 }}>
              Tap <b>+ Add</b> to add text, shapes, photos, video or music.
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
  project,
  geo,
  trackW,
  selected,
  keySel,
}: {
  layer: Layer;
  project: Project;
  geo: Geo;
  trackW: number;
  selected: boolean;
  keySel: KeySel | null;
}) {
  const expanded = useEditor((s) => s.expanded[layer.id]);
  const paths = animatedPaths(layer);
  const showKeys = (selected || expanded) && paths.length > 0;
  const toggleVis = () => patchLayer(layer.id, { visible: !layer.visible });
  return (
    <>
      <div className={`tl-row ${selected ? 'selected' : ''} ${layer.visible ? '' : 'hidden-layer'}`}>
        <div
          className="tl-name"
          onClick={() => {
            select(layer.id);
            haptic();
          }}
          onDoubleClick={() => openSheet('props')}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/x-layer', layer.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/x-layer');
            if (!id || id === layer.id) return;
            update((p) => {
              const from = p.layers.findIndex((l) => l.id === id);
              const [l] = p.layers.splice(from, 1);
              p.layers.splice(p.layers.findIndex((x) => x.id === layer.id), 0, l);
            });
          }}
        >
          <span className="tl-icon" style={{ color: layer.label }}>
            <Icon name={layerIcon(layer)} size={15} />
          </span>
          <span className="tl-label">{layer.name}</span>
          {paths.length > 0 && (
            <button
              type="button"
              className="tl-mini"
              title="Show keyframes"
              onClick={(e) => {
                e.stopPropagation();
                useEditor.setState((s) => ({ expanded: { ...s.expanded, [layer.id]: !expanded } }));
              }}
            >
              <Icon name={showKeys ? 'down' : 'next'} size={12} />
            </button>
          )}
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
        </div>
        <div className="tl-track" style={{ width: trackW }}>
          <ClipBar layer={layer} project={project} geo={geo} selected={selected} paths={paths} />
        </div>
      </div>
      {showKeys &&
        paths.map((p) => (
          <div key={p.path} className="tl-row sub">
            <div className="tl-name sub" title={p.label}>
              <span className="tl-label">{p.label}</span>
            </div>
            <div className="tl-track" style={{ width: trackW }}>
              {p.keys.map((k) => (
                <Diamond key={k.id} layer={layer} path={p.path} k={k} geo={geo} selected={keySel?.keyId === k.id} />
              ))}
            </div>
          </div>
        ))}
    </>
  );
});

function ClipBar({ layer, project, geo, selected, paths }: { layer: Layer; project: Project; geo: Geo; selected: boolean; paths: { keys: Keyframe[] }[] }) {
  const left = geo.padL + layer.start * geo.pps;
  const w = Math.max(4, (layer.end - layer.start) * geo.pps);
  const drag = useRef<{ mode: 'move' | 'l' | 'r'; x0: number; start: number; end: number; moved: boolean; id: number } | null>(null);
  const lastTap = useRef(0);

  const down = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (layer.locked && mode !== 'move') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, start: layer.start, end: layer.end, moved: false, id: e.pointerId };
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
      const targets = [useEditor.getState().time, 0, project.duration];
      for (const s of targets) if (Math.abs(t - s) * geo.pps < 8) return s;
      return frameTime(t);
    };
    const dt = dxPx / geo.pps;
    const minLen = 1 / project.fps;
    if (d.mode === 'move') {
      const len = d.end - d.start;
      let ns = snap(Math.max(0, d.start + dt));
      const ne = snap(ns + len);
      if (Math.abs(ne - (ns + len)) > 1e-9) ns = ne - len;
      patchLayer(layer.id, { start: Math.max(0, ns), end: Math.max(0, ns) + len }, `clip:${layer.id}:${d.id}`);
    } else if (d.mode === 'l') {
      const ns = Math.min(d.end - minLen, Math.max(0, snap(d.start + dt)));
      const delta = ns - layer.start;
      update((p) => {
        const l = layerById(p, layer.id);
        if (!l) return;
        // Keep content and keyframes where they are in comp time.
        if (l.trimIn !== undefined) l.trimIn = Math.max(0, l.trimIn + delta * (l.speed ?? 1));
        for (const pr of Object.values(l.props)) pr.keys?.forEach((k) => (k.t -= delta));
        for (const e2 of l.effects) for (const pr of Object.values(e2.props)) pr.keys?.forEach((k) => (k.t -= delta));
        l.start = ns;
      }, `clip:${layer.id}:${d.id}`);
    } else {
      const ne = Math.max(d.start + minLen, snap(d.end + dt));
      patchLayer(layer.id, { end: ne }, `clip:${layer.id}:${d.id}`);
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(d.id);
    endMerge();
    if (!d.moved) {
      const now = Date.now();
      if (now - lastTap.current < 350) openSheet('props');
      lastTap.current = now;
      select(layer.id);
      haptic();
    }
  };

  const keyTimes = [...new Set(paths.flatMap((p) => p.keys.map((k) => k.t)))];

  return (
    <div
      className={`clip ${selected ? 'selected' : ''} ${layer.locked ? 'locked' : ''}`}
      style={{ left, width: w, ['--c' as string]: layer.label }}
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
      {selected && (
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

function Diamond({ layer, path, k, geo, selected }: { layer: Layer; path: string; k: Keyframe; geo: Geo; selected: boolean }) {
  const drag = useRef<{ x0: number; t0: number; moved: boolean; id: number } | null>(null);
  const sel: KeySel = { layerId: layer.id, path, keyId: k.id };
  return (
    <span
      className={`diamond ${selected ? 'selected' : ''} ease-${k.ease}`}
      style={{ left: geo.padL + (layer.start + k.t) * geo.pps }}
      title={`${k.ease} @ ${(layer.start + k.t).toFixed(2)}s`}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x0: e.clientX, t0: k.t, moved: false, id: e.pointerId };
        useEditor.setState({ keySel: sel, selectedId: layer.id });
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
          setTime(layer.start + k.t);
          haptic();
        }
      }}
    />
  );
}
