import { useEffect, useRef, useState } from 'react';
import { useBackHandler } from './back';
import { setView, toast, update, useEditor, type ViewSettings } from '../state/store';
import { Icon } from './icons';
import './viewport.css';

const GRID_SIZES = [20, 40, 60, 100];

type Flag = 'grid' | 'guides' | 'thirds' | 'safe' | 'snap';

const FLAGS: { key: Flag; label: string }[] = [
  { key: 'grid', label: 'Grid' },
  { key: 'guides', label: 'Guides' },
  { key: 'thirds', label: 'Rule of thirds' },
  { key: 'safe', label: 'Safe areas' },
  { key: 'snap', label: 'Snapping' },
];

/** Adds a guide through the comp center (and makes guides visible). */
function addGuide(axis: 'v' | 'h') {
  update((p) => {
    p.guides ??= { v: [], h: [] };
    p.guides[axis].push(Math.round(axis === 'v' ? p.width / 2 : p.height / 2));
  });
  if (!useEditor.getState().view.guides) setView({ guides: true });
}

function clearGuides() {
  update((p) => {
    p.guides = { v: [], h: [] };
  });
  toast('Guides cleared');
}

/** Viewport corner button with grid, guides, overlays and snapping options. */
export function ViewMenu() {
  const view = useEditor((s) => s.view);
  const guideCount = useEditor((s) => (s.project?.guides ? s.project.guides.v.length + s.project.guides.h.length : 0));
  const [open, setOpen] = useState(false);
  useBackHandler(open, () => setOpen(false));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close the menu without also deselecting the layer.
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const overlays = view.grid || view.thirds || view.safe;
  const set = (patch: Partial<ViewSettings>) => setView(patch);

  return (
    <div className="view-menu" ref={ref}>
      <button
        type="button"
        className={`view-btn ${open ? 'open' : ''} ${overlays ? 'on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="View options"
        aria-expanded={open}
        title="Grid, guides & snapping"
      >
        <Icon name="grid" size={17} />
      </button>
      {open && (
        <div className="view-pop" role="menu">
          {FLAGS.map(({ key, label }) => (
            <button key={key} type="button" role="switch" aria-checked={view[key]} className={`view-row toggle ${view[key] ? 'on' : ''}`} onClick={() => set({ [key]: !view[key] })}>
              <span className="view-row-label">{label}</span>
              <span className="knob" />
            </button>
          ))}
          <div className="view-sub">Grid size</div>
          <div className="seg view-seg" role="radiogroup" aria-label="Grid size">
            {GRID_SIZES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={view.gridSize === n} className={view.gridSize === n ? 'on' : ''} onClick={() => set({ gridSize: n, grid: true })}>
                {n}
              </button>
            ))}
          </div>
          <div className="view-sep" />
          <button type="button" className="view-act" onClick={() => addGuide('v')}>
            <Icon name="guides" size={16} /> Add vertical guide
          </button>
          <button type="button" className="view-act" onClick={() => addGuide('h')}>
            <Icon name="guides" size={16} /> Add horizontal guide
          </button>
          <button type="button" className="view-act danger" disabled={!guideCount} onClick={clearGuides}>
            <Icon name="trash" size={16} /> Clear guides{guideCount ? ` (${guideCount})` : ''}
          </button>
          <p className="view-hint">Drag a guide to move it, drop it outside the canvas to remove it.</p>
        </div>
      )}
    </div>
  );
}
