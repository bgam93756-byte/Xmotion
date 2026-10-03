/** Elements: layers saved to a library on the device, reusable in any project. */
import type { Layer } from '../model/types';
import { allLayers, isInside } from '../model/tree';
import { uid } from '../model/ids';
import { thumbnail } from '../engine/renderer';
import { deleteElement, listElements, saveElement, type ElementRecord } from '../engine/storage';
import { assetsOf, insertClip, selectedIds, toast, useEditor } from './store';

export type { ElementRecord };
export { listElements, deleteElement };

const listeners = new Set<() => void>();

/** Subscribe to library changes (returns an unsubscribe function). */
export function onElementsChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Saves layers (default: the selection) as a named element. */
export async function saveAsElement(name?: string, ids = selectedIds()): Promise<ElementRecord | null> {
  const { project, time } = useEditor.getState();
  if (!project) return null;
  const layers: Layer[] = allLayers(project).filter((l) => ids.includes(l.id) && !ids.some((o) => o !== l.id && isInside(project, l.id, o)));
  if (!layers.length) {
    toast('Select a layer to save as an element');
    return null;
  }
  let thumb: string | undefined;
  try {
    thumb = thumbnail({ ...project, layers }, Math.min(time, project.duration));
  } catch {
    thumb = undefined;
  }
  const rec: ElementRecord = {
    id: uid('E'),
    name: name?.trim() || layers[0].name,
    created: Date.now(),
    layers: structuredClone(layers),
    assets: assetsOf(project, layers),
    width: project.width,
    height: project.height,
    thumb,
  };
  await saveElement(rec);
  listeners.forEach((fn) => fn());
  toast(`Saved “${rec.name}” to Elements`);
  return rec;
}

/** Inserts an element into the open project, scaled to fit when the comp size differs. */
export async function insertElement(rec: ElementRecord) {
  const { project } = useEditor.getState();
  if (!project) return;
  const layers = structuredClone(rec.layers);
  const k = Math.min(project.width / rec.width, project.height / rec.height);
  const dx = (project.width - rec.width * k) / 2;
  const dy = (project.height - rec.height * k) / 2;
  if (Math.abs(k - 1) > 1e-3 || dx || dy) {
    for (const l of layers) {
      if (l.parent && layers.some((x) => x.id === l.parent)) continue;
      const pos = l.props.position;
      const map = (v: unknown) => {
        const [x, y] = v as [number, number];
        return [x * k + dx, y * k + dy] as [number, number];
      };
      if (pos) {
        pos.value = map(pos.value);
        pos.keys?.forEach((key) => (key.v = map(key.v)));
      }
      const sc = l.props.scale;
      const scale = (v: unknown) => [(v as [number, number])[0] * k, (v as [number, number])[1] * k] as [number, number];
      if (sc) {
        sc.value = scale(sc.value);
        sc.keys?.forEach((key) => (key.v = scale(key.v)));
      } else if (Math.abs(k - 1) > 1e-3) l.props.scale = { value: [100 * k, 100 * k] };
    }
  }
  // Clips keep their timing relative to the earliest one, starting at the playhead.
  const t0 = Math.min(...layers.map((l) => l.start));
  const { time } = useEditor.getState();
  const start = time >= project.duration - 0.05 ? 0 : time;
  const shift = (l: Layer, d: number) => {
    l.start += d;
    l.end += d;
    l.children?.forEach((c) => shift(c, d));
  };
  for (const l of layers) shift(l, start - t0);
  await insertClip({ layers, assets: rec.assets });
}

export async function removeElement(id: string) {
  await deleteElement(id);
  listeners.forEach((fn) => fn());
}
