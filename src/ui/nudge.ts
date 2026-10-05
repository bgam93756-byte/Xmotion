import type { Layer, Project, Vec2 } from '../model/types';
import { evalPropAt, num } from '../model/animate';
import { isInside } from '../model/tree';
import { ctxFor, parentMatrix, propClock, timesOf, worldMatrix } from '../engine/transform';
import { activeCamera, screenDeltaToWorld } from '../engine/camera';
import { layerById, update, useEditor, writeValue } from '../state/store';

/** Moves layers by a few pixels (arrow keys), as one undo step per run of presses. */
export function nudge(ids: string | string[], [dx, dy]: [number, number]) {
  const { project, time } = useEditor.getState();
  if (!project) return;
  const list = typeof ids === 'string' ? [ids] : ids;
  const moves: { id: string; pos: Vec2; z?: number }[] = [];
  for (const id of list) {
    const l = layerById(project, id);
    if (!l || l.locked) continue;
    // Layers that follow a selected parent or group already move with it.
    if (list.some((o) => o !== id && (isInside(project, id, o) || followsParent(project, id, o)))) continue;
    const [x, y] = evalPropAt(l, 'position', propClock(project, l, 'position', time), ctxFor(project, l)) as Vec2;
    const [px, py, pz] = parentDelta(project, l, time, dx, dy);
    const z = l.threeD ? num(l, 'z', propClock(project, l, 'z', time), ctxFor(project, l)) + pz : undefined;
    moves.push({ id, pos: [x + px, y + py], z });
  }
  if (!moves.length) return;
  update((p) => {
    for (const m of moves) {
      const l = layerById(p, m.id);
      if (!l) continue;
      writeValue(p, l, 'position', m.pos, time);
      if (m.z !== undefined && Math.abs(m.z - num(l, 'z', propClock(p, l, 'z', time), ctxFor(p, l))) > 1e-9) writeValue(p, l, 'z', m.z, time);
    }
  }, `nudge:${list.join(',')}`);
}

/**
 * A screen move of (dx, dy) comp pixels in the space the layer's position
 * lives in (its parent or group may be rotated or scaled; 3D layers move on
 * the plane facing the camera).
 */
function parentDelta(project: Project, l: Layer, time: number, dx: number, dy: number): [number, number, number] {
  const pm = parentMatrix(project, l, time);
  if (l.threeD) {
    const { ec, lt } = timesOf(project, l, time);
    const [ax, ay] = evalPropAt(l, 'anchor', lt, ec) as Vec2;
    const at = worldMatrix(project, l, time).transformPoint(new DOMPoint(ax, ay, 0));
    const [wx, wy, wz] = screenDeltaToWorld(activeCamera(project, time), [at.x, at.y, at.z], dx, dy);
    const inv = pm.inverse();
    const a = inv.transformPoint(new DOMPoint(at.x, at.y, at.z));
    const b = inv.transformPoint(new DOMPoint(at.x + wx, at.y + wy, at.z + wz));
    return Number.isNaN(a.x) ? [dx, dy, 0] : [b.x - a.x, b.y - a.y, b.z - a.z];
  }
  const inv = (pm.is2D ? pm : new DOMMatrix([pm.a, pm.b, pm.c, pm.d, pm.e, pm.f])).inverse();
  if (Number.isNaN(inv.a)) return [dx, dy, 0];
  return [inv.a * dx + inv.c * dy, inv.b * dx + inv.d * dy, 0];
}

/** True when `parentId` is somewhere up the layer's parent chain. */
function followsParent(project: Project, id: string, parentId: string) {
  for (let cur = layerById(project, id)?.parent; cur; cur = layerById(project, cur)?.parent) if (cur === parentId) return true;
  return false;
}
