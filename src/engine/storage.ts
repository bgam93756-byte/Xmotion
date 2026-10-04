import type { AssetMeta, Layer, Project } from '../model/types';
import { uid } from '../model/ids';

const DB_NAME = 'xmotion';
const DB_VERSION = 2;

export interface ProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  modified: number;
  thumb?: string;
}

interface ProjectRecord extends ProjectSummary {
  project: Project;
}

interface AssetRecord {
  id: string;
  meta: AssetMeta;
  blob: Blob;
}

let dbp: Promise<IDBDatabase> | null = null;

let blocked = false;
const blockedListeners = new Set<(blocked: boolean) => void>();

/**
 * Tells when opening storage waits on another tab that still has an older
 * version open (it must be closed before the upgrade can finish).
 */
export function onStorageBlocked(fn: (blocked: boolean) => void): () => void {
  blockedListeners.add(fn);
  if (blocked) fn(true);
  return () => void blockedListeners.delete(fn);
}

function setBlocked(b: boolean) {
  if (blocked === b) return;
  blocked = b;
  blockedListeners.forEach((fn) => fn(b));
}

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('elements')) d.createObjectStore('elements', { keyPath: 'id' });
      };
      req.onblocked = () => setBlocked(true);
      req.onsuccess = () => {
        setBlocked(false);
        const d = req.result;
        // Let a newer version in another tab upgrade instead of waiting on us.
        d.onversionchange = () => {
          d.close();
          dbp = null;
        };
        res(d);
      };
      req.onerror = () => {
        dbp = null;
        rej(req.error);
      };
    });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }),
  );
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll());
  return all
    .map(({ project: _p, ...summary }) => summary)
    .sort((a, b) => b.modified - a.modified);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const r = await tx<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id));
  return r?.project;
}

export async function saveProject(project: Project, thumb?: string): Promise<void> {
  const prev = thumb ? undefined : await tx<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(project.id));
  const rec: ProjectRecord = {
    id: project.id,
    name: project.name,
    width: project.width,
    height: project.height,
    duration: project.duration,
    modified: project.modified,
    thumb: thumb ?? prev?.thumb,
    project,
  };
  await tx('projects', 'readwrite', (s) => s.put(rec));
}

export async function deleteProject(id: string): Promise<void> {
  const project = await loadProject(id);
  await tx('projects', 'readwrite', (s) => s.delete(id));
  if (!project) return;
  // Drop assets nothing else references (other projects, saved elements, the clipboard).
  const used = await usedAssets();
  for (const a of project.assets) if (!used.has(a.id)) await tx('assets', 'readwrite', (s) => s.delete(a.id));
}

async function usedAssets(): Promise<Set<string>> {
  const projects = await tx<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll());
  const elements = await listElements();
  const used = new Set(projects.flatMap((r) => r.project.assets.map((a) => a.id)));
  for (const e of elements) for (const a of e.assets) used.add(a.id);
  try {
    const clip = JSON.parse(localStorage.getItem('xm.clipboard') ?? 'null') as { assets?: AssetMeta[] } | null;
    for (const a of clip?.assets ?? []) used.add(a.id);
  } catch {
    /* no clipboard */
  }
  return used;
}

/* ---------- Elements: reusable layers saved across projects ---------- */

export interface ElementRecord {
  id: string;
  name: string;
  created: number;
  /** Top to bottom, in the coordinates of the comp they came from. */
  layers: Layer[];
  assets: AssetMeta[];
  width: number;
  height: number;
  thumb?: string;
}

export async function listElements(): Promise<ElementRecord[]> {
  const all = await tx<ElementRecord[]>('elements', 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.created - a.created);
}

export async function saveElement(rec: ElementRecord): Promise<void> {
  await tx('elements', 'readwrite', (s) => s.put(rec));
}

export async function deleteElement(id: string): Promise<void> {
  const rec = await tx<ElementRecord | undefined>('elements', 'readonly', (s) => s.get(id));
  await tx('elements', 'readwrite', (s) => s.delete(id));
  if (!rec) return;
  const used = await usedAssets();
  for (const a of rec.assets) if (!used.has(a.id)) await tx('assets', 'readwrite', (s) => s.delete(a.id));
}

export async function duplicateProject(id: string): Promise<Project | undefined> {
  const r = await tx<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id));
  if (!r) return;
  const now = Date.now();
  const copy: Project = { ...structuredClone(r.project), id: uid('P'), name: `${r.project.name} copy`, created: now, modified: now };
  await saveProject(copy, r.thumb);
  return copy;
}

export async function putAsset(meta: AssetMeta, blob: Blob): Promise<void> {
  await tx('assets', 'readwrite', (s) => s.put({ id: meta.id, meta, blob } satisfies AssetRecord));
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return tx<AssetRecord | undefined>('assets', 'readonly', (s) => s.get(id));
}

/* ---------- Portable project bundles (.xmotion) ---------- */

const MAGIC = 'XMOTION1';

/**
 * Bundle layout: MAGIC, uint32 header length, JSON header, then raw asset bytes
 * back-to-back. Keeps big videos out of base64.
 */
export async function exportBundle(project: Project): Promise<Blob> {
  const parts: Blob[] = [];
  const index: { meta: AssetMeta; size: number }[] = [];
  for (const meta of project.assets) {
    const rec = await getAsset(meta.id);
    if (!rec) continue;
    index.push({ meta, size: rec.blob.size });
    parts.push(rec.blob);
  }
  const header = new TextEncoder().encode(JSON.stringify({ project, assets: index }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([MAGIC, len, header, ...parts], { type: 'application/octet-stream' });
}

export async function importBundle(file: Blob): Promise<Project> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const magic = new TextDecoder().decode(bytes.slice(0, MAGIC.length));
  let project: Project;
  let assets: { meta: AssetMeta; size: number }[] = [];
  let offset = 0;
  if (magic === MAGIC) {
    const hlen = new DataView(buf, MAGIC.length, 4).getUint32(0, true);
    const start = MAGIC.length + 4;
    const header = JSON.parse(new TextDecoder().decode(bytes.slice(start, start + hlen)));
    project = header.project;
    assets = header.assets;
    offset = start + hlen;
  } else {
    // Plain JSON project (no media).
    project = JSON.parse(new TextDecoder().decode(bytes));
  }
  if (!project || project.version !== 1 || !Array.isArray(project.layers)) throw new Error('Not an Xmotion project file');
  for (const a of assets) {
    const blob = new Blob([buf.slice(offset, offset + a.size)], { type: a.meta.mime });
    offset += a.size;
    await putAsset(a.meta, blob);
  }
  const now = Date.now();
  const imported: Project = { ...project, id: uid('P'), modified: now };
  await saveProject(imported);
  return imported;
}
