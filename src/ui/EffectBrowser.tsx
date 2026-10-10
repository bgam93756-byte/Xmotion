import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Layer } from '../model/types';
import { EFFECT_DEFS, EFFECT_LIST } from '../model/effectDefs';
import { CATEGORIES } from '../effects';
import { IconButton } from './controls/fields';
import { Icon, type IconName } from './icons';
import { useBackHandler } from './back';

const CATEGORY_ICON: Record<string, IconName> = {
  'Blur & Sharpen': 'drop',
  'Glow & Light': 'sun',
  Color: 'palette',
  'Keying & Matte': 'key',
  Distort: 'wave',
  Generate: 'sparkle',
  Stylize: 'brush',
  'Tiles & Repeat': 'grid',
  Transition: 'swap',
  '3D & Perspective': 'cube',
  Motion: 'move',
  Text: 'text',
  Shape: 'shapes',
};

type EffectDef = (typeof EFFECT_LIST)[number];

const RECENT_KEY = 'xm.recentFx';
function recentFx(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Add-effect browser: categories first (like Alight Motion), then the effects
 * of one category; searching looks through all of them.
 */
export function EffectBrowser({ layer, onPick, onClose }: { layer: Layer; onPick: (type: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  useBackHandler(true, () => (query ? setQ('') : cat ? setCat(null) : onClose()));

  // Text effects need a text layer (except counters), shape effects a shape or text.
  const fits = (d: EffectDef) =>
    (d.category !== 'Text' || layer.type === 'text' || d.type === 'countUpDown' || d.type === 'timecode') && (d.category !== 'Shape' || layer.type === 'shape' || layer.type === 'text');
  const usable = EFFECT_LIST.filter(fits);
  const matches = (d: EffectDef) => d.label.toLowerCase().includes(query) || d.description.toLowerCase().includes(query) || d.category.toLowerCase().includes(query);
  const list = query ? usable.filter(matches) : cat ? usable.filter((d) => d.category === cat) : [];
  const recent = recentFx()
    .map((t) => EFFECT_DEFS[t])
    .filter((d): d is EffectDef => !!d && fits(d));
  const cats = CATEGORIES.map((c) => ({ name: c, count: usable.filter((d) => d.category === c).length })).filter((c) => c.count > 0);

  const pick = (type: string) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([type, ...recentFx().filter((t) => t !== type)].slice(0, 8)));
    } catch {
      /* storage unavailable */
    }
    onPick(type);
  };

  const title = query ? 'Search effects' : (cat ?? `Add effect · ${usable.length}`);
  // Portal: the docked properties panel scrolls, which would trap a fixed overlay.
  return createPortal(
    <div className="sheet-layer modal fx-picker" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Add effect">
        <div className="sheet-head">
          <span className="sheet-grip" />
          {cat && !query && <IconButton icon="back" title="All categories" className="fx-back" onClick={() => setCat(null)} />}
          <span className="sheet-title">{title}</span>
          <IconButton icon="close" title="Close" onClick={onClose} />
        </div>
        <div className="fx-search">
          <input className="text-input" placeholder="Search effects (glow, shake, blur, 3D…)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="sheet-body fx-list">
          {!query && !cat && (
            <>
              {recent.length > 0 && (
                <>
                  <h4>Recent</h4>
                  <div className="chips">
                    {recent.map((d) => (
                      <button key={d.type} type="button" className="chip" onClick={() => pick(d.type)}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <h4>Categories</h4>
              <div className="fx-cats">
                {cats.map((c) => (
                  <button key={c.name} type="button" className="fx-cat" onClick={() => setCat(c.name)}>
                    <span className="fx-cat-icon">
                      <Icon name={CATEGORY_ICON[c.name] ?? 'fx'} size={20} />
                    </span>
                    <span className="fx-cat-text">
                      <b>{c.name}</b>
                      <small>{c.count === 1 ? '1 effect' : `${c.count} effects`}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {list.map((d) => (
            <button key={d.type} type="button" className="fx-item" onClick={() => pick(d.type)}>
              <b>
                {d.label}
                {query && <small> · {d.category}</small>}
              </b>
              <span>{d.description}</span>
            </button>
          ))}
          {query && !list.length && <p className="hint">No effects match “{q}”.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
