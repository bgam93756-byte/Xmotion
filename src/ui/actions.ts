import type { LayerType, Project, Prop, ShapeKind, Vec2 } from '../model/types';
import { createLayer, nextName, type NewLayerOpts } from '../model/schema';
import { canReplace, replaceWithMedia } from '../model/replace';
import { NATE, applyNateStyle, hasNateStyle, type Beat, type NateResult } from '../model/nate';
import { detectOnsets, monoOf } from '../engine/beats';
import { allLayers, findLayer } from '../model/tree';
import { media } from '../engine/media';
import { putAsset } from '../engine/storage';
import { worldMatrix } from '../engine/transform';
import { addLayer, deleteLayers, layerById, openPanel, openSheet, selectedIds, toast, update, useEditor } from '../state/store';
import { saveAsElement } from '../state/elements';
import { haptic, pickFiles } from '../platform';

const get = () => useEditor.getState();

/** New layers start at the playhead (or 0 when the playhead is at the very end). */
function startTime() {
  const { project, time } = get();
  if (!project) return 0;
  return time >= project.duration - 0.05 ? 0 : time;
}

/**
 * Adds a shape; `extra` sets more of its properties (e.g. 3 sides for a
 * triangle), `round` rounds its corners and `base` names it ("Triangle 1").
 */
export function addShape(shape: ShapeKind, extra: Record<string, Prop> = {}, round = false, base?: string) {
  const p = get().project;
  if (!p) return;
  const side = Math.round(Math.min(p.width, p.height) * 0.35);
  const props: Record<string, Prop> = { size: { value: [side, side] }, ...extra };
  if (round) props.radius = { value: Math.round(side * 0.18) };
  addLayer(createLayer(p, 'shape', { shape, start: startTime(), props, ...(base ? { name: nextName(p, base) } : {}) }));
  openSheet(null);
  haptic();
}

export function addText() {
  const p = get().project;
  if (!p) return;
  const size = Math.round(Math.min(p.width, p.height) * 0.11);
  addLayer(createLayer(p, 'text', { start: startTime(), props: { fontSize: { value: size } } }));
  // Straight to the text box (Edit text panel on phones).
  openPanel('type');
  haptic();
}

export function addSpecial(type: Extract<LayerType, 'null' | 'adjustment' | 'camera' | 'group'>) {
  const { project: p, time, selectedId } = get();
  if (!p) return;
  const opts: NewLayerOpts = { start: startTime() };
  if (type === 'group') {
    // An empty group spans the whole comp and pivots on its position, so its
    // transform is identity and layers moved into it later stay where they are.
    // Built in its container's space: the comp center seen from that group.
    const c: Vec2 = [Math.round(p.width / 2), Math.round(p.height / 2)];
    const g = findLayer(p, selectedId)?.group;
    const q = g ? worldMatrix(p, g, time).inverse().transformPoint(new DOMPoint(c[0], c[1])) : null;
    const at: Vec2 = q && !Number.isNaN(q.x) ? [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100] : c;
    Object.assign(opts, { start: 0, end: p.duration, props: { position: { value: at }, anchor: { value: [...at] as Vec2 } } });
    addLayer(createLayer(p, type, opts), undefined, false);
    openSheet(null);
    haptic();
    return;
  }
  // A camera films the whole comp, so it goes on top of the root (the top-most camera wins).
  addLayer(createLayer(p, type, opts), type === 'camera' ? { group: null, index: 0 } : undefined);
  openSheet(null);
  haptic();
  if (type === 'camera' && !allLayers(p).some((l) => l.threeD)) toast('Turn on 3D for layers so the camera sees them');
}

/** Selects every layer in the selected layer's container (the root when nothing is selected). */
export function selectAll() {
  const { project: p, selectedId } = get();
  if (!p) return;
  const f = findLayer(p, selectedId);
  const ids = (f ? f.list : p.layers).map((l) => l.id);
  if (!ids.length) return;
  useEditor.setState({ selectedId: f ? f.layer.id : ids[0], selection: ids.length > 1 ? ids : [], keySel: null });
}

export function deleteSelection() {
  deleteLayers(selectedIds());
}

/** Asks for a name and saves the selected layers to the Elements library. */
export async function saveSelectionAsElement() {
  const { project: p } = get();
  const ids = selectedIds();
  const first = p && layerById(p, ids[0]);
  if (!first) return toast('Select layers to save as an element');
  const name = window.prompt('Element name', ids.length > 1 ? `${first.name} + ${ids.length - 1}` : first.name);
  if (name === null) return;
  await saveAsElement(name, ids);
}

export function addDrawing(points: Vec2[], color: string, width: number) {
  const p = get().project;
  if (!p || points.length < 2) return;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  const local = points.map(([x, y]) => [Math.round((x - cx) * 10) / 10, Math.round((y - cy) * 10) / 10] as Vec2);
  addLayer(
    createLayer(p, 'shape', {
      shape: 'path',
      points: local,
      start: startTime(),
      at: [cx, cy],
      props: { strokeColor: { value: color }, strokeWidth: { value: width } },
    }),
  );
}

export async function importMedia(accept = 'image/*,video/*,audio/*,.ttf,.otf,.woff,.woff2') {
  const files = await pickFiles(accept);
  if (files.length) await importFiles(files);
}

export async function importFiles(files: File[]) {
  openSheet(null);
  for (const file of files) {
    try {
      toast(`Importing ${file.name}…`);
      const meta = await media.probe(file);
      await putAsset(meta, file);
      await media.register(meta, file);
      const p = get().project;
      if (!p) return;
      update((d) => {
        d.assets.push(meta);
      });
      if (meta.kind === 'font') {
        toast(`Font “${meta.fontFamily}” added — pick it in a text layer`);
        continue;
      }
      const start = startTime();
      const project = get().project!;
      const layer = createLayer(project, meta.kind, {
        name: file.name.replace(/\.[^.]+$/, ''),
        asset: meta.id,
        start,
        end: meta.duration ? Math.min(project.duration, start + meta.duration) : project.duration,
      });
      if (meta.width && meta.height) {
        const k = Math.min(1, project.width / meta.width, project.height / meta.height);
        layer.props.scale = { value: [Math.round(k * 1000) / 10, Math.round(k * 1000) / 10] };
      }
      // Grow the comp to fit a longer clip.
      if (meta.duration && start + meta.duration > project.duration && project.layers.length === 0) {
        update((d) => {
          d.duration = Math.ceil(start + meta.duration!);
        });
        layer.end = start + meta.duration;
      }
      addLayer(layer);
      haptic();
    } catch (e) {
      toast((e as Error).message || `Couldn't import ${file.name}`);
    }
  }
}

/* ---------------- Replace ---------------- */

export { canReplace };

/**
 * Replace, like Alight Motion's: swaps a photo, video or template clip slot
 * for another photo or video, keeping its timing, animation and effects.
 */
export async function replaceMedia(layerId: string) {
  const [file] = await pickFiles('image/*,video/*', false);
  const p0 = get().project;
  const l0 = p0 && layerById(p0, layerId);
  if (!file || !l0 || !canReplace(l0)) return;
  try {
    toast(`Importing ${file.name}…`);
    const meta = await media.probe(file);
    if (meta.kind !== 'image' && meta.kind !== 'video') return toast('Pick a photo or a video');
    await putAsset(meta, file);
    await media.register(meta, file);
    update((d) => {
      const l = layerById(d, layerId);
      if (l) replaceWithMedia(d, l, meta);
    });
    haptic();
    toast(`Replaced with ${file.name}`);
  } catch (e) {
    toast((e as Error).message || `Couldn't import ${file.name}`);
  }
}

/* ---------------- Nate style ---------------- */

/** Beats of the project's music (top-level audio layers), in comp time. */
async function musicBeats(p: Project): Promise<Beat[]> {
  const out: Beat[] = [];
  for (const l of p.layers) {
    if (l.type !== 'audio' || !l.asset || l.muted || !l.visible) continue;
    const buf = await media.audioBuffer(l.asset);
    if (!buf) continue;
    const speed = l.speed ?? 1;
    const trim = l.trimIn ?? 0;
    for (const o of detectOnsets(monoOf(buf), buf.sampleRate)) {
      const t = l.start + (o.t - trim) / speed;
      if (t >= l.start && t < l.end) out.push({ t, strength: o.strength });
    }
  }
  return out;
}

/**
 * One tap Nate-style edit of the open project: its clips get the blue intro,
 * chrome name, glowing quote, hits, spins and flashes, synced to the beats
 * of its music when it has some. Tapping it again re-syncs (one undo step).
 */
export async function applyNateStyleNow() {
  const p = get().project;
  if (!p) return;
  openSheet(null);
  // Already styled: its clips are in the "Nate · clips" group, and tapping again re-syncs.
  if (!hasNateStyle(p) && !p.layers.some((l) => l.type !== 'audio' && l.type !== 'camera' && !l.name.startsWith(NATE))) {
    toast('Add your clips first (+ › Image & Video), then tap Nate style');
    return;
  }
  const hasMusic = p.layers.some((l) => l.type === 'audio' && l.asset);
  if (hasMusic) toast('Finding the beats…');
  const beats = hasMusic ? await musicBeats(p) : [];
  let result: NateResult | null = null;
  update((d) => {
    result = applyNateStyle(d, { beats });
  });
  const r = result as NateResult | null;
  if (!r) return;
  useEditor.setState({ time: 0 });
  haptic('medium');
  toast(
    `Nate style: ${r.hits} hits, ${r.spins} spins, ${r.flashes} flashes${r.beatSynced ? ' on the beat' : ''}. Edit “Nate · name” and “Nate · quote”; Undo removes it.`,
  );
}
