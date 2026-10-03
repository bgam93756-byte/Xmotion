import type { Vec2 } from '../model/types';
import { evalPropAt } from '../model/animate';
import { ctxFor } from '../engine/transform';
import { layerById, setPropValue, useEditor } from '../state/store';

/** Moves a layer by a few pixels (arrow keys). */
export function nudge(id: string, [dx, dy]: [number, number]) {
  const { project, time } = useEditor.getState();
  const l = project && layerById(project, id);
  if (!project || !l || l.locked) return;
  const [x, y] = evalPropAt(l, 'position', time, ctxFor(project, l)) as Vec2;
  setPropValue(id, 'position', [x + dx, y + dy], `nudge:${id}`);
}
