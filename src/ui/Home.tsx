import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../model/types';
import { createProject } from '../model/schema';
import { TEMPLATES } from '../model/templates';
import { media } from '../engine/media';
import { thumbnail } from '../engine/renderer';
import {
  deleteProject,
  duplicateProject,
  exportBundle,
  getAsset,
  importBundle,
  listProjects,
  loadProject,
  onStorageBlocked,
  saveProject,
  type ProjectSummary,
} from '../engine/storage';
import { openProject } from '../state/store';
import { listElements, onElementsChange, removeElement, type ElementRecord } from '../state/elements';
import { pickFiles, saveFile } from '../platform';
import { Icon } from './icons';
import { NumberField } from './controls/fields';
import { useBackHandler } from './back';

async function open(project: Project) {
  media.clear();
  await Promise.all(
    project.assets.map(async (a) => {
      const rec = await getAsset(a.id);
      if (rec) await media.register(a, rec.blob);
    }),
  );
  openProject(project);
}

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [tab, setTab] = useState<'projects' | 'elements'>('projects');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Android back: close the menu, then go back to Projects (with nothing open the app closes).
  useBackHandler(!!menu, () => setMenu(null));
  useBackHandler(tab === 'elements', () => setTab('projects'));

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch((e) => {
        setProjects([]);
        setError(`Storage unavailable: ${(e as Error).message}`);
      });
  useEffect(
    () =>
      onStorageBlocked((blocked) =>
        setError(blocked ? 'Xmotion is open in another tab. Close it to finish updating your projects.' : null),
      ),
    [],
  );
  useEffect(() => {
    void refresh();
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startProject = (p: Project) =>
    run('Creating project…', async () => {
      await saveProject(p, safeThumb(p));
      await open(p);
    });

  const openById = (id: string) =>
    run('Opening…', async () => {
      const p = await loadProject(id);
      if (!p) throw new Error('Project not found');
      await open(p);
    });

  const templateThumbs = useMemo(() => TEMPLATES.map((t) => safeThumb(t.build(), 1.6)), []);

  return (
    <div className="home">
      <header className="home-head">
        <div className="logo">
          <span className="logo-mark">
            <Icon name="sparkle" size={20} />
          </span>
          <span>Xmotion</span>
        </div>
        <button
          type="button"
          className="btn ghost small"
          onClick={() =>
            void pickFiles('.xmotion,.json,application/octet-stream', false).then(
              ([f]) =>
                f &&
                run('Importing…', async () => {
                  await importBundle(f);
                  await refresh();
                }),
            )
          }
        >
          <Icon name="upload" size={16} /> Import
        </button>
      </header>

      <nav className="home-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'projects'} className={tab === 'projects' ? 'on' : ''} onClick={() => setTab('projects')}>
          Projects
        </button>
        <button type="button" role="tab" aria-selected={tab === 'elements'} className={tab === 'elements' ? 'on' : ''} onClick={() => setTab('elements')}>
          Elements
        </button>
      </nav>

      {tab === 'projects' ? (
        <>
          {projects?.length === 0 && (
            <section className="home-hero">
              <button type="button" className="new-card" onClick={() => setCreating(true)}>
                <span className="new-plus">
                  <Icon name="plus" size={28} />
                </span>
                <span>
                  <b>New project</b>
                  <small>Stories, Reels, TikTok, YouTube, square…</small>
                </span>
              </button>
            </section>
          )}

          <section>
            <h3>Start from a template</h3>
            <div className="template-row">
              {TEMPLATES.map((t, i) => (
                <button key={t.id} type="button" className="template-card" onClick={() => void startProject(t.build())}>
                  <img src={templateThumbs[i]} alt="" />
                  <b>{t.name}</b>
                  <small>{t.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Your projects</h3>
            {projects === null ? (
              <p className="hint">Loading…</p>
            ) : projects.length === 0 ? (
              <p className="hint">No projects yet. Tap + to start one. Everything you make is saved on this device automatically.</p>
            ) : (
              <div className="project-list">
                {projects.map((p) => (
                  <div key={p.id} className="project-row">
                    <button type="button" className="project-open" onClick={() => void openById(p.id)}>
                      <span className="project-thumb">{p.thumb ? <img src={p.thumb} alt="" /> : <Icon name="video" size={24} />}</span>
                      <span className="project-text">
                        <b className="ellipsis">{p.name}</b>
                        <small>
                          {p.width}×{p.height} · {formatDuration(p.duration)}
                        </small>
                        <small>{timeAgo(p.modified)}</small>
                      </span>
                    </button>
                    <button type="button" className="project-more" aria-label={`More for ${p.name}`} onClick={() => setMenu(menu === p.id ? null : p.id)}>
                      <Icon name="more" size={18} />
                    </button>
                    {menu === p.id && (
                      <div className="menu" onMouseLeave={() => setMenu(null)}>
                        <button
                          type="button"
                          onClick={() =>
                            run('Duplicating…', async () => {
                              setMenu(null);
                              await duplicateProject(p.id);
                              await refresh();
                            })
                          }
                        >
                          <Icon name="copy" size={16} /> Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run('Packing project…', async () => {
                              setMenu(null);
                              const full = await loadProject(p.id);
                              if (full) await saveFile(await exportBundle(full), `${p.name.replace(/[^\w\- ]+/g, '') || 'project'}.xmotion`);
                            })
                          }
                        >
                          <Icon name="share" size={16} /> Share project file
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setMenu(null);
                            if (confirm(`Delete “${p.name}”? This can’t be undone.`)) void run('Deleting…', async () => (await deleteProject(p.id), await refresh()));
                          }}
                        >
                          <Icon name="trash" size={16} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <ElementsTab />
      )}

      {error && <p className="warn pad">{error}</p>}
      <button type="button" className="fab home-fab" title="New project" aria-label="New project" onClick={() => setCreating(true)}>
        <Icon name="plus" size={28} />
      </button>
      {creating && <NewProjectSheet onClose={() => setCreating(false)} onCreate={(p) => void startProject(p)} />}
      {busy && (
        <div className="busy">
          <span className="spinner" />
          {busy}
        </div>
      )}
    </div>
  );
}

/** Saved elements: reusable layers, added to a project from + › Elements. */
function ElementsTab() {
  const [items, setItems] = useState<ElementRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void listElements()
        .then((list) => alive && setItems(list))
        .catch(() => alive && setItems([]));
    load();
    const off = onElementsChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  const remove = (rec: ElementRecord) => {
    if (window.confirm(`Delete “${rec.name}” from Elements? Projects that use it keep their copy.`)) void removeElement(rec.id);
  };
  return (
    <section>
      <p className="hint home-el-hint">
        Elements are layers you saved to reuse: select layers in a project, then <b>More › Save as element</b>. Add them to any project with <b>+ › Elements</b>.
      </p>
      {items && !items.length && <p className="hint">No elements yet.</p>}
      {!!items?.length && (
        <div className="el-grid home-el-grid">
          {items.map((rec) => (
            <div key={rec.id} className="el-item">
              <div className="el-insert static">
                <span className="el-thumb">{rec.thumb ? <img src={rec.thumb} alt="" draggable={false} /> : <Icon name="bookmark" size={24} />}</span>
                <span className="el-name ellipsis">{rec.name}</span>
              </div>
              <button type="button" className="el-del" onClick={() => remove(rec)} aria-label={`Delete ${rec.name}`} title="Delete element">
                <span>
                  <Icon name="trash" size={14} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const RATIOS: { label: string; hint: string; w: number; h: number }[] = [
  { label: '9:16', hint: 'TikTok, Reels, Stories', w: 9, h: 16 },
  { label: '16:9', hint: 'YouTube', w: 16, h: 9 },
  { label: '1:1', hint: 'Square', w: 1, h: 1 },
  { label: '4:5', hint: 'Portrait post', w: 4, h: 5 },
  { label: '3:4', hint: 'Tall', w: 3, h: 4 },
  { label: '4:3', hint: 'Classic', w: 4, h: 3 },
  { label: '21:9', hint: 'Cinematic', w: 21, h: 9 },
];

const RESOLUTIONS = [
  { label: '480p', side: 480 },
  { label: '720p', side: 720 },
  { label: '1080p', side: 1080 },
  { label: '1440p', side: 1440 },
  { label: '4K', side: 2160 },
];

const BACKGROUNDS = [
  { label: 'Black', color: '#000000' },
  { label: 'Dark', color: '#101014' },
  { label: 'White', color: '#ffffff' },
  { label: 'Green screen', color: '#00b140' },
];

/** Width and height for an aspect ratio whose short side is `side` (even numbers, for video encoders). */
function sizeFor(r: { w: number; h: number }, side: number) {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return r.w <= r.h ? { w: side, h: even((side * r.h) / r.w) } : { w: even((side * r.w) / r.h), h: side };
}

function NewProjectSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Project) => void }) {
  const [name, setName] = useState('My video');
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [side, setSide] = useState(1080);
  /** Typed width/height (replaces ratio × resolution until one is picked again). */
  const [custom, setCustom] = useState<{ w: number; h: number } | null>(null);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(10);
  const [bg, setBg] = useState('#101014');
  useBackHandler(true, onClose);
  const size = custom ?? sizeFor(ratio, side);
  return (
    <div className="sheet-layer modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="New project">
        <div className="sheet-head">
          <span className="sheet-grip" />
          <span className="sheet-title">New project</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body new-project">
          <input className="text-input big" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
          <h4>Aspect ratio</h4>
          <div className="ratio-grid">
            {RATIOS.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`ratio ${!custom && ratio === r ? 'on' : ''}`}
                title={r.hint}
                onClick={() => {
                  setRatio(r);
                  setCustom(null);
                }}
              >
                <span className="ratio-box" style={{ aspectRatio: `${r.w} / ${r.h}` }} />
                <b>{r.label}</b>
                <small>{r.hint}</small>
              </button>
            ))}
          </div>
          <h4>Resolution</h4>
          <div className="chips">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`chip ${!custom && side === r.side ? 'on' : ''}`}
                onClick={() => {
                  setSide(r.side);
                  setCustom(null);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="row">
            <span className="row-label">Size</span>
            <NumberField label="W" value={size.w} min={16} max={7680} precision={0} onChange={(v) => setCustom({ ...size, w: Math.round(v) })} />
            <NumberField label="H" value={size.h} min={16} max={7680} precision={0} onChange={(v) => setCustom({ ...size, h: Math.round(v) })} />
          </div>
          <h4>Frame rate</h4>
          <div className="chips">
            {[24, 25, 30, 50, 60, 120].map((f) => (
              <button key={f} type="button" className={`chip ${fps === f ? 'on' : ''}`} onClick={() => setFps(f)}>
                {f} fps
              </button>
            ))}
          </div>
          <h4>Background</h4>
          <div className="chips bg-chips">
            {BACKGROUNDS.map((b) => (
              <button key={b.color} type="button" className={`chip ${bg === b.color ? 'on' : ''}`} onClick={() => setBg(b.color)}>
                <span className="bg-swatch" style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
            <label className="chip bg-custom" title="Custom color">
              <span className="bg-swatch" style={{ background: bg }} />
              Custom
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <span className="row-label">Duration</span>
            <NumberField value={duration} min={0.5} max={3600} step={0.5} unit="s" onChange={setDuration} />
          </div>
          <button
            type="button"
            className="btn primary big"
            onClick={() => onCreate(createProject({ name: name.trim() || 'Untitled', width: size.w, height: size.h, fps, duration, background: bg }))}
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  );
}

/** "9.5s", "42s", "2:05". */
function formatDuration(s: number) {
  const t = Math.round(s);
  if (t < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function safeThumb(p: Project, t = 1.5): string | undefined {
  try {
    return thumbnail(p, Math.min(t, p.duration));
  } catch {
    return undefined;
  }
}

function timeAgo(ms: number) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}
