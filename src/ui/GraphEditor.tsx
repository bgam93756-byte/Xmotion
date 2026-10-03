import type { ReactElement } from 'react';
import { useEditor } from '../state/store';

/** Graph editor for the property in `useEditor.graph` (placeholder; being built). */
export function GraphEditor(): ReactElement | null {
  const graph = useEditor((s) => s.graph);
  if (!graph) return null;
  return <div className="graph-editor" />;
}
