import type { Project, Vec2 } from '../model/types';
import { evalPropAt } from '../model/animate';
import { isInside } from '../model/tree';
import { ctxFor, propClock } from '../engine/transform';
import { layerById, update, useEditor, writeValue } from '../state/store';

/** Moves layers by a few pixels (arrow keys), as one undo step per run of presses. */
export function nudge(ids: string | string[], [dx, dy]: [number, number]) {
  const { project, time } = useEditor.getState();
  if (!project) return;
  const list = typeof ids === 'string' ? [ids] : ids;
  const moves: [string, Vec2][] = [];
  for (const id of list) {
    const l = layerById(project, id);
    if (!l || l.locked) continue;
    // Layers that follow a selected parent or group already move with it.
    if (list.some((o) => o !== id && (isInside(project, id, o) || followsParent(project, id, o)))) continue;
    const [x, y] = evalPropAt(l, 'position', propClock(project, l, 'position', time), ctxFor(project, l)) as Vec2;
    moves.push([id, [x + dx, y + dy]]);
  }
  if (!moves.length) return;
  update((p) => {
    for (const [id, v] of moves) {
      const l = layerById(p, id);
      if (l) writeValue(p, l, 'position', v, time);
    }
  }, `nudge:${list.join(',')}`);
}

/** True when `parentId` is somewhere up the layer's parent chain. */
function followsParent(project: Project, id: string, parentId: string) {
  for (let cur = layerById(project, id)?.parent; cur; cur = layerById(project, cur)?.parent) if (cur === parentId) return true;
  return false;
}
