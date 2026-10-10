import { useEffect, useRef, useState, type ReactNode } from 'react';
import { saveProject } from '../engine/storage';
import { thumbnail } from '../engine/renderer';
import { findLayer } from '../model/tree';
import {
  closeProject,
  copyLayers,
  deleteKey,
  duplicateLayers,
  groupLayers,
  layerById,
  moveLayer,
  openGraph,
  openPanel,
  openSheet,
  pasteLayer,
  patchLayer,
  redo,
  select,
  selectedIds,
  selectedKey,
  setTime,
  splitLayer,
  stepFrames,
  toast,
  togglePlay,
  undo,
  ungroup,
  useEditor,
  type Sheet as SheetKind,
} from '../state/store';
import type { Layer } from '../model/types';
import { Viewport } from './Viewport';
import { Timeline, layerIcon } from './Timeline';
import { GraphEditor } from './GraphEditor';
import { CategoryPanel, Inspector, layerCategories } from './Inspector';
import { ExportSheet } from './ExportSheet';
import { AddSheet } from './AddSheet';
import { MoreSheet } from './MoreSheet';
import { HelpSheet } from './HelpSheet';
import { Icon, type IconName } from './icons';
import { IconButton } from './controls/fields';
import { deleteSelection, importFiles, selectAll } from './actions';
import { useBackHandler } from './back';
import './sheets.css';

export function formatTime(t: number, fps: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.round((t - Math.floor(t)) * fps) % fps;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

const WIDE_QUERY = '(min-width: 900px) and (min-height: 560px)';

/** Wide screens (iPad, desktop) keep a side inspector; phones use the panels under the timeline. */
export const isWideScreen = () => matchMedia(WIDE_QUERY).matches;

function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const m = matchMedia(WIDE_QUERY);
    const fn = () => setWide(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);
  return wide;
}

/** Number of selected layers that exist (0, 1, or the multi-selection size). */
function useSelectionCount() {
  return useEditor((s) => {
    if (s.selection.length > 1) return s.selection.length;
    return s.project && layerById(s.project, s.selectedId) ? 1 : 0;
  });
}

export function Editor() {
  const wide = useWide();
  const sheet = useEditor((s) => s.sheet);
  const selCount = useSelectionCount();
  // The graph editor replaces the timeline while its layer exists.
  const graph = useEditor((s) => !!s.graph && !!s.project && !!findLayer(s.project, s.graph.layerId));
  useAutosave();
  useShortcuts();
  useEditorBack();
  useClosePanelOnDeselect();
  const [dropping, setDropping] = useState(false);
  // Phones, like Alight Motion: a selected layer shows its actions and property
  // categories under the timeline; a category opens its panel there.
  const selecting = !wide && selCount > 0;
  const editing = !wide && selCount === 1 && sheet === 'props';

  return (
    <div
      className={`editor ${wide ? 'wide' : 'narrow'} ${graph ? 'has-graph' : ''} ${selecting ? 'selecting' : ''} ${editing ? 'editing' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <TopBar />
      <div className="ed-view">
        <Viewport />
      </div>
      <Transport />
      <div className={`ed-timeline ${graph ? 'graphing' : ''}`}>
        {graph ? <GraphEditor /> : <Timeline />}
        {!graph && (
          <button type="button" className="fab" title="Add layer" aria-label="Add layer" onClick={() => openSheet('add')}>
            <Icon name="plus" size={28} />
          </button>
        )}
      </div>
      {wide && (
        <aside className="ed-inspector">
          <Inspector />
        </aside>
      )}
      {selecting && !editing && <SelectionBar />}
      {editing && (
        <section className="ed-props" aria-label="Properties">
          <PhonePanel />
        </section>
      )}
      {selecting && <CategoryBar />}
      {sheet === 'add' && (
        <Sheet kind="add" title="Add layer">
          <AddSheet />
        </Sheet>
      )}
      {sheet === 'more' && (
        <Sheet kind="more" title="More">
          <MoreSheet />
        </Sheet>
      )}
      {sheet === 'export' && (
        <Sheet kind="export" title="Export">
          <ExportSheet />
        </Sheet>
      )}
      {sheet === 'help' && (
        <Sheet kind="help" title="Help & shortcuts">
          <HelpSheet />
        </Sheet>
      )}
      {sheet === 'project' && (
        <Sheet kind="project" title="Project settings">
          <Inspector />
        </Sheet>
      )}
      {dropping && <div className="drop-overlay">Drop photos, videos, audio or fonts</div>}
      <Toast />
    </div>
  );
}

function Sheet({ kind, title, children, modal = true, bare }: { kind: Exclude<SheetKind, null>; title: string; children: ReactNode; modal?: boolean; bare?: boolean }) {
  const close = () => openSheet(null);
  return (
    <div className={`sheet-layer ${modal ? 'modal' : 'docked'} sheet-${kind}`} onPointerDown={(e) => modal && e.target === e.currentTarget && close()}>
      <div className={`sheet ${bare ? 'bare' : ''}`} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <span className="sheet-grip" />
          <span className="sheet-title">{title}</span>
          <IconButton icon="close" title="Close" onClick={close} />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Project settings: a sheet on phones, the inspector (nothing selected) on wide screens. */
function openProjectSettings() {
  select(null);
  openSheet(isWideScreen() ? null : 'project');
}

function TopBar() {
  const project = useEditor((s) => s.project)!;
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const saveState = useEditor((s) => s.saveState);
  return (
    <header className="topbar">
      <IconButton icon="back" title="Projects" onClick={() => void leaveEditor()} />
      <button type="button" className="proj-name" onClick={openProjectSettings}>
        <span className="ellipsis">{project.name}</span>
        <small>
          {project.width}×{project.height} · {project.fps}fps · {saveState === 'saved' ? 'Saved' : 'Saving…'}
        </small>
      </button>
      <div className="topbar-actions">
        <IconButton icon="undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <IconButton icon="settings" title="Project settings" onClick={openProjectSettings} />
        <IconButton icon="help" title="Help" onClick={() => openSheet('help')} />
        <button type="button" className="btn primary export-btn" onClick={() => openSheet('export')}>
          <Icon name="share" size={16} />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}

function Transport() {
  const playing = useEditor((s) => s.playing);
  const time = useEditor((s) => s.time);
  const loop = useEditor((s) => s.loop);
  const project = useEditor((s) => s.project)!;
  return (
    <div className="transport">
      <span className="tc">
        {formatTime(time, project.fps)}
        <small> / {formatTime(project.duration, project.fps)}</small>
      </span>
      <div className="transport-btns">
        <IconButton icon="start" title="Go to start (Home)" onClick={() => setTime(0)} />
        <IconButton icon="prev" title="Previous frame (,)" onClick={() => stepFrames(-1)} />
        <button type="button" className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <IconButton icon="next" title="Next frame (.)" onClick={() => stepFrames(1)} />
        <IconButton icon="end" title="Go to end (End)" onClick={() => setTime(project.duration)} />
      </div>
      <IconButton icon="loop" title="Loop playback" active={loop} onClick={() => useEditor.setState({ loop: !loop })} />
    </div>
  );
}

function renameLayer(layer: Layer) {
  const name = window.prompt('Layer name', layer.name);
  if (name !== null && name.trim()) patchLayer(layer.id, { name: name.trim() });
}

function Act({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className="sel-btn" onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

/** Phones: actions for the selected layer(s), above the category bar. */
function SelectionBar() {
  const project = useEditor((s) => s.project)!;
  const selectedId = useEditor((s) => s.selectedId);
  const multi = useEditor((s) => s.selection.length > 1 && s.selection.length);
  const layer = multi ? undefined : layerById(project, selectedId);
  return (
    <div className="sel-bar">
      {layer ? (
        <button type="button" className="sel-name" title="Rename layer" onClick={() => renameLayer(layer)}>
          <span className="sel-icon" style={{ color: layer.label }}>
            <Icon name={layerIcon(layer)} size={16} />
          </span>
          <span className="ellipsis">{layer.name}</span>
          <Icon name="edit" size={12} className="sel-edit" />
        </button>
      ) : (
        <span className="sel-name">
          <span className="sel-icon">
            <Icon name="layers" size={16} />
          </span>
          <span className="ellipsis">{multi} layers</span>
        </span>
      )}
      <div className="sel-acts">
        {layer ? <Act icon="scissors" label="Split" onClick={() => splitLayer(layer.id)} /> : <Act icon="group" label="Group" onClick={() => groupLayers()} />}
        <Act icon="copy" label="Duplicate" onClick={() => duplicateLayers(selectedIds())} />
        <Act icon="trash" label="Delete" onClick={deleteSelection} />
        <Act icon="more" label="More" onClick={() => openSheet('more')} />
        <Act icon="check" label="Done" onClick={() => select(null)} />
      </div>
    </div>
  );
}

/**
 * Phones: the selected layer's property categories (Move & Transform, Effects,
 * Color & Fill…). Tapping one opens its panel; tapping it again closes it.
 * With several layers selected, it lists them instead.
 */
function CategoryBar() {
  const project = useEditor((s) => s.project)!;
  const selectedId = useEditor((s) => s.selectedId);
  const selection = useEditor((s) => s.selection);
  const sheet = useEditor((s) => s.sheet);
  const tab = useEditor((s) => s.propTab);
  const keyHere = useEditor((s) => !!s.keySel && s.keySel.layerId === s.selectedId && !!selectedKey(s.project, s.keySel));
  const barRef = useRef<HTMLElement>(null);
  const layer = selection.length > 1 ? undefined : layerById(project, selectedId);
  const cats = layer ? layerCategories(layer, keyHere) : [];
  const current = layer && sheet === 'props' ? (cats.find((c) => c.id === tab) ?? cats.find((c) => c.id !== 'keyframe'))?.id : undefined;

  useEffect(() => {
    barRef.current?.querySelector('.cat-btn.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  if (!layer) {
    const layers = selection.map((id) => layerById(project, id)).filter((l): l is Layer => !!l);
    return (
      <nav className="cat-bar multi" aria-label="Selected layers">
        {layers.map((l) => (
          <button key={l.id} type="button" className="cat-chip" title="Edit only this layer" onClick={() => select(l.id)}>
            <span style={{ color: l.label }}>
              <Icon name={layerIcon(l)} size={16} />
            </span>
            <span className="ellipsis">{l.name}</span>
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav className="cat-bar" ref={barRef} aria-label="Layer properties">
      {cats.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`cat-btn ${current === c.id ? 'on' : ''} ${c.id === 'keyframe' ? 'key' : ''}`}
          aria-pressed={current === c.id}
          onClick={() => (current === c.id ? openSheet(null) : openPanel(c.id))}
        >
          <Icon name={c.icon} size={20} />
          <span>{c.label}</span>
        </button>
      ))}
    </nav>
  );
}

function PhonePanel() {
  const project = useEditor((s) => s.project)!;
  const selectedId = useEditor((s) => s.selectedId);
  const layer = layerById(project, selectedId);
  return layer ? <CategoryPanel project={project} layer={layer} /> : null;
}

/**
 * Android back button: close what is open, step out of the selection, then
 * leave the project. A panel that is set but not on screen (the properties
 * panel on wide screens or with several layers selected, the graph of a
 * deleted layer) closes along the way, so every press changes something.
 */
function useEditorBack() {
  useBackHandler(true, () => {
    const s = useEditor.getState();
    const p = s.project;
    const single = s.selection.length <= 1 && !!p && !!layerById(p, s.selectedId);
    if (s.sheet && (s.sheet !== 'props' || (single && !isWideScreen()))) return openSheet(null);
    if (s.sheet) openSheet(null);
    if (s.tool !== 'select') return useEditor.setState({ tool: 'select' });
    if (s.graph) {
      openGraph(null);
      if (p && findLayer(p, s.graph.layerId)) return;
    }
    if (s.selectedId || s.selection.length) return select(null);
    void leaveEditor();
  });
}

/** The properties panel belongs to a selected layer: close it once nothing is selected. */
function useClosePanelOnDeselect() {
  useEffect(
    () =>
      useEditor.subscribe((s, prev) => {
        if (s.sheet === 'props' && !s.selectedId && prev.selectedId) openSheet(null);
      }),
    [],
  );
}

function Toast() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id} role="status">
      {toast.msg}
    </div>
  );
}

/* ---------------- persistence ---------------- */

async function persist(withThumb: boolean) {
  const { project, time } = useEditor.getState();
  if (!project) return;
  useEditor.setState({ saveState: 'saving' });
  let thumb: string | undefined;
  if (withThumb) {
    try {
      thumb = thumbnail(project, Math.min(project.duration * 0.5, Math.max(time, 1)));
    } catch {
      thumb = undefined;
    }
  }
  await saveProject(project, thumb);
  if (useEditor.getState().project === project) useEditor.setState({ saveState: 'saved' });
}

export async function leaveEditor() {
  await persist(true).catch(() => undefined);
  closeProject();
}

function useAutosave() {
  const lastThumb = useRef(0);
  useEffect(() => {
    let timer = 0;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project === prev.project || !s.project) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = Date.now();
        const withThumb = now - lastThumb.current > 8000;
        if (withThumb) lastThumb.current = now;
        void persist(withThumb);
      }, 700);
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') void persist(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsub();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}

/* ---------------- keyboard ---------------- */

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Panels with their own keys (e.g. the graph editor) mark them handled.
      if (e.defaultPrevented || el.closest('input, textarea, select, [contenteditable]')) return;
      const s = useEditor.getState();
      const p = s.project;
      if (!p) return;
      const mod = e.ctrlKey || e.metaKey;
      const sel = layerById(p, s.selectedId);
      const ids = selectedIds();
      const k = e.key.toLowerCase();
      const handled = () => e.preventDefault();
      if (k === ' ') return handled(), togglePlay();
      if (mod && k === 'z') return handled(), e.shiftKey ? redo() : undo();
      if (mod && k === 'y') return handled(), redo();
      if (mod && k === 'e') return handled(), openSheet('export');
      if (mod && k === 'v') return handled(), pasteLayer();
      if (mod && k === 'a') return handled(), selectAll();
      if (k === ',') return handled(), stepFrames(e.shiftKey ? -p.fps : -1);
      if (k === '.') return handled(), stepFrames(e.shiftKey ? p.fps : 1);
      if (k === 'home') return handled(), setTime(0);
      if (k === 'end') return handled(), setTime(p.duration);
      if (k === 'escape') {
        handled();
        if (s.sheet) return openSheet(null);
        if (s.tool === 'anchor') useEditor.setState({ tool: 'select' });
        return select(null);
      }
      if (k === '?') return handled(), openSheet('help');
      if (k === 'p' && !mod) return handled(), useEditor.setState({ tool: s.tool === 'pen' ? 'select' : 'pen' });
      if (k === 'v' && !mod) return handled(), useEditor.setState({ tool: 'select' });
      if (k === 'y' && !mod) return handled(), useEditor.setState({ tool: s.tool === 'anchor' ? 'select' : 'anchor' });
      if (!sel) return;
      if (k === 'delete' || k === 'backspace') {
        handled();
        if (s.keySel && selectedKey(p, s.keySel)) deleteKey(s.keySel);
        else deleteSelection();
        return;
      }
      if (mod && k === 'g') {
        handled();
        if (!e.shiftKey) return groupLayers(ids);
        if (sel.type === 'group') return ungroup(sel.id);
        return toast('Select a group to ungroup it');
      }
      if (mod && k === 'd') return handled(), duplicateLayers(ids);
      if (mod && k === 'c') return handled(), copyLayers(ids);
      if (mod && (e.key === ']' || e.key === '[')) {
        handled();
        const at = findLayer(p, sel.id);
        const to = at ? at.index + (e.key === ']' ? -1 : 1) : -1;
        if (at && to >= 0 && to < at.list.length) moveLayer(sel.id, to);
        return;
      }
      if (k === 's' && !mod) return handled(), splitLayer(sel.id);
      if (k.startsWith('arrow')) {
        handled();
        const n = e.shiftKey ? 10 : 1;
        const d = { arrowleft: [-n, 0], arrowright: [n, 0], arrowup: [0, -n], arrowdown: [0, n] }[k] as [number, number];
        void import('./nudge').then((m) => m.nudge(ids, d));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
