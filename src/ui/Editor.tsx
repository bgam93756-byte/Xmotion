import { useEffect, useRef, useState, type ReactNode } from 'react';
import { saveProject } from '../engine/storage';
import { thumbnail } from '../engine/renderer';
import {
  closeProject,
  copyLayer,
  deleteKey,
  deleteLayer,
  duplicateLayer,
  layerById,
  moveLayer,
  openSheet,
  pasteLayer,
  redo,
  select,
  setTime,
  splitLayer,
  stepFrames,
  togglePlay,
  undo,
  useEditor,
  type Sheet as SheetKind,
} from '../state/store';
import { Viewport } from './Viewport';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { ExportSheet } from './ExportSheet';
import { AddSheet } from './AddSheet';
import { HelpSheet } from './HelpSheet';
import { Icon } from './icons';
import { IconButton } from './controls/fields';
import { addText, importFiles } from './actions';

export function formatTime(t: number, fps: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.round((t - Math.floor(t)) * fps) % fps;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

function useWide() {
  const q = '(min-width: 900px) and (min-height: 560px)';
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const fn = () => setWide(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);
  return wide;
}

export function Editor() {
  const wide = useWide();
  const sheet = useEditor((s) => s.sheet);
  useAutosave();
  useShortcuts();
  const [dropping, setDropping] = useState(false);

  return (
    <div
      className={`editor ${wide ? 'wide' : 'narrow'}`}
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
      <div className="ed-timeline">
        <Timeline />
      </div>
      <BottomBar />
      {wide && (
        <aside className="ed-inspector">
          <Inspector />
        </aside>
      )}
      {!wide && sheet === 'props' && (
        <Sheet kind="props" title="Properties" modal={false} bare>
          <Inspector />
        </Sheet>
      )}
      {sheet === 'add' && (
        <Sheet kind="add" title="Add layer">
          <AddSheet />
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

function TopBar() {
  const project = useEditor((s) => s.project)!;
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const saveState = useEditor((s) => s.saveState);
  return (
    <header className="topbar">
      <IconButton icon="back" title="Projects" onClick={() => void leaveEditor()} />
      <button type="button" className="proj-name" onClick={() => (select(null), openSheet(matchMedia('(min-width: 900px)').matches ? null : 'project'))}>
        <span className="ellipsis">{project.name}</span>
        <small>
          {project.width}×{project.height} · {project.fps}fps · {saveState === 'saved' ? 'Saved' : 'Saving…'}
        </small>
      </button>
      <div className="topbar-actions">
        <IconButton icon="undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <IconButton icon="help" title="Help" onClick={() => openSheet('help')} className="hide-xs" />
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

function BottomBar() {
  const selectedId = useEditor((s) => s.selectedId);
  const tool = useEditor((s) => s.tool);
  const project = useEditor((s) => s.project)!;
  const layer = layerById(project, selectedId);
  const Btn = ({ icon, label, onClick, active, primary }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; active?: boolean; primary?: boolean }) => (
    <button type="button" className={`bb-btn ${active ? 'active' : ''} ${primary ? 'primary' : ''}`} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="bottombar">
      <Btn icon="plus" label="Add" primary onClick={() => openSheet('add')} />
      {layer ? (
        <>
          <Btn icon="settings" label="Edit" onClick={() => openSheet('props')} />
          <Btn icon="scissors" label="Split" onClick={() => splitLayer(layer.id)} />
          <Btn icon="copy" label="Duplicate" onClick={() => duplicateLayer(layer.id)} />
          <Btn icon="trash" label="Delete" onClick={() => deleteLayer(layer.id)} />
          <Btn icon="close" label="Done" onClick={() => select(null)} />
        </>
      ) : (
        <>
          <Btn icon="pen" label="Draw" active={tool === 'pen'} onClick={() => useEditor.setState({ tool: tool === 'pen' ? 'select' : 'pen' })} />
          <Btn icon="text" label="Text" onClick={addText} />
          <Btn icon="settings" label="Project" onClick={() => openSheet(matchMedia('(min-width: 900px)').matches ? null : 'project')} />
          <Btn icon="fit" label="Fit" onClick={() => window.dispatchEvent(new Event('xm:fit'))} />
        </>
      )}
    </nav>
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
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const s = useEditor.getState();
      const p = s.project;
      if (!p) return;
      const mod = e.ctrlKey || e.metaKey;
      const sel = layerById(p, s.selectedId);
      const k = e.key.toLowerCase();
      const handled = () => e.preventDefault();
      if (k === ' ') return handled(), togglePlay();
      if (mod && k === 'z') return handled(), e.shiftKey ? redo() : undo();
      if (mod && k === 'y') return handled(), redo();
      if (mod && k === 'e') return handled(), openSheet('export');
      if (mod && k === 'v') return handled(), pasteLayer();
      if (k === ',') return handled(), stepFrames(e.shiftKey ? -p.fps : -1);
      if (k === '.') return handled(), stepFrames(e.shiftKey ? p.fps : 1);
      if (k === 'home') return handled(), setTime(0);
      if (k === 'end') return handled(), setTime(p.duration);
      if (k === 'escape') return handled(), s.sheet ? openSheet(null) : select(null);
      if (k === '?') return handled(), openSheet('help');
      if (k === 'p' && !mod) return handled(), useEditor.setState({ tool: s.tool === 'pen' ? 'select' : 'pen' });
      if (k === 'v' && !mod) return handled(), useEditor.setState({ tool: 'select' });
      if (!sel) return;
      if (k === 'delete' || k === 'backspace') {
        handled();
        if (s.keySel) deleteKey(s.keySel);
        else deleteLayer(sel.id);
        return;
      }
      if (mod && k === 'd') return handled(), duplicateLayer(sel.id);
      if (mod && k === 'c') return handled(), copyLayer(sel.id);
      if (mod && e.key === ']') return handled(), moveLayer(sel.id, p.layers.indexOf(sel) - 1);
      if (mod && e.key === '[') return handled(), moveLayer(sel.id, p.layers.indexOf(sel) + 1);
      if (k === 's' && !mod) return handled(), splitLayer(sel.id);
      if (k.startsWith('arrow')) {
        handled();
        const n = e.shiftKey ? 10 : 1;
        const d = { arrowleft: [-n, 0], arrowright: [n, 0], arrowup: [0, -n], arrowdown: [0, n] }[k] as [number, number];
        void import('./nudge').then((m) => m.nudge(sel.id, d));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
