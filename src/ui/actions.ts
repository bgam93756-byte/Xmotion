import type { LayerType, ShapeKind, Vec2 } from '../model/types';
import { createLayer } from '../model/schema';
import { media } from '../engine/media';
import { putAsset } from '../engine/storage';
import { addLayer, openSheet, toast, update, useEditor } from '../state/store';
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

export function addSpecial(type: Extract<LayerType, 'null' | 'adjustment'>) {
  const p = get().project;
  if (!p) return;
  addLayer(createLayer(p, type, { start: startTime() }));
  openSheet(null);
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
