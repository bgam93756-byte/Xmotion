import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../model/types';
import { PROJECT_PRESETS, createProject } from '../model/schema';
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
import { pickFiles, saveFile } from '../platform';
import { Icon } from './icons';
import { NumberField } from './controls/fields';

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
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Icon name="upload" size={16} /> Import project
        </button>
      </header>

      <section className="home-hero">
        <button type="button" className="new-card" onClick={() => setCreating(true)}>
          <span className="new-plus">
            <Icon name="plus" size={28} />
          </span>
          <span>
            <b>New project</b>
            <small>Stories, Reels, YouTube, square…</small>
          </span>
        </button>
      </section>

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
          <p className="hint">No projects yet. Everything you make is saved on this device automatically.</p>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card">
                <button type="button" className="project-open" onClick={() => void openById(p.id)}>
                  <span className="project-thumb" style={{ aspectRatio: `${p.width} / ${p.height}` }}>
                    {p.thumb ? <img src={p.thumb} alt="" /> : <Icon name="video" size={28} />}
                  </span>
                  <b className="ellipsis">{p.name}</b>
                  <small>
                    {p.width}×{p.height} · {p.duration.toFixed(1)}s · {timeAgo(p.modified)}
                  </small>
                </button>
                <button type="button" className="project-more" aria-label="More" onClick={() => setMenu(menu === p.id ? null : p.id)}>
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

      {error && <p className="warn pad">{error}</p>}
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

function NewProjectSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Project) => void }) {
  const [name, setName] = useState('My video');
  const [size, setSize] = useState({ w: 1080, h: 1920 });
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(10);
  const [bg, setBg] = useState('#101014');
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
            {PROJECT_PRESETS.map((p) => (
              <button key={p.label} type="button" className={`ratio ${size.w === p.w && size.h === p.h ? 'on' : ''}`} onClick={() => setSize({ w: p.w, h: p.h })}>
                <span className="ratio-box" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
                <small>{p.label}</small>
              </button>
            ))}
          </div>
          <div className="row">
            <span className="row-label">Size</span>
            <NumberField label="W" value={size.w} min={16} max={7680} precision={0} onChange={(v) => setSize({ ...size, w: Math.round(v) })} />
            <NumberField label="H" value={size.h} min={16} max={7680} precision={0} onChange={(v) => setSize({ ...size, h: Math.round(v) })} />
          </div>
          <h4>Frame rate</h4>
          <div className="chips">
            {[24, 25, 30, 60].map((f) => (
              <button key={f} type="button" className={`chip ${fps === f ? 'on' : ''}`} onClick={() => setFps(f)}>
                {f} fps
              </button>
            ))}
          </div>
          <div className="row">
            <span className="row-label">Duration</span>
            <NumberField value={duration} min={0.5} max={3600} step={0.5} unit="s" onChange={setDuration} />
            <span className="row-label">Background</span>
            <input type="color" className="color-input" value={bg} onChange={(e) => setBg(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn primary big"
            onClick={() => onCreate(createProject({ name: name.trim() || 'Untitled', width: size.w, height: size.h, fps, duration, background: bg }))}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
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
