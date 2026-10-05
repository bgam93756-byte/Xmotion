import type { LayerType, ShapeKind, Vec2 } from '../model/types';
import { createLayer, type NewLayerOpts } from '../model/schema';
import { allLayers, findLayer } from '../model/tree';
import { media } from '../engine/media';
import { putAsset } from '../engine/storage';
import { worldMatrix } from '../engine/transform';
import { addLayer, deleteLayers, layerById, openSheet, selectedIds, toast, update, useEditor } from '../state/store';
import { saveAsElement } from '../state/elements';
import { haptic, pickFiles } from '../platform';

const get = () => useEditor.getState();

/** New layers start at the playhead (or 0 when the playhead is at the very end). */
function startTime() {
  const { project, time } = get();
  if (!project) return 0;
  return time >= project.duration - 0.05 ? 0 : time;
}

export function addShape(shape: ShapeKind) {
  const p = get().project;
  if (!p) return;
  const side = Math.round(Math.min(p.width, p.height) * 0.35);
  addLayer(createLayer(p, 'shape', { shape, start: startTime(), props: { size: { value: [side, side] } } }));
  openSheet(null);
  haptic();
}

export function addText() {
  const p = get().project;
  if (!p) return;
  const size = Math.round(Math.min(p.width, p.height) * 0.11);
  addLayer(createLayer(p, 'text', { start: startTime(), props: { fontSize: { value: size } } }));
  openSheet('props');
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
