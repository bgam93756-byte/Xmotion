import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBackHandler } from './back';
import { createPortal } from 'react-dom';
import type { Layer } from '../model/types';
import { getProp, type PropDef } from '../model/schema';
import { copyProp, openGraph, openSheet, pasteProp, resetProp, useEditor } from '../state/store';
import { Icon, type IconName } from './icons';
import './inspector.css';

export interface MenuItem {
  icon: IconName;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Small popover menu next to an element (its rect), portalled to the body so
 * the transformed properties sheet can't trap it. Closes on an outside tap,
 * Escape, resize or after picking an item.
 */
export function PopoverMenu({ anchor, title, items, onClose }: { anchor: DOMRect; title?: string; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useBackHandler(true, () => close.current());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Below the anchor when it fits, otherwise above; always inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const { innerWidth: vw, innerHeight: vh } = window;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const below = anchor.bottom + 4;
    const top = below + h <= vh - m ? below : Math.max(m, Math.min(vh - h - m, anchor.top - h - 4));
    setPos({ left: Math.max(m, Math.min(anchor.left, vw - w - m)), top });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [anchor]);

  useEffect(() => {
    // Capture phase on window runs before the editor's shortcuts: while the
    // menu is open keys belong to it (Space/Delete must not reach the editor).
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!btns.length) return;
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const d = e.key === 'ArrowDown' ? 1 : -1;
        btns[(i + d + btns.length) % btns.length].focus();
      }
    };
    const onResize = () => close.current();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return createPortal(
    // Closing on click (not pointerdown) keeps the tap from reaching whatever is underneath.
    <div className="pm-layer" onClick={(e) => e.target === e.currentTarget && onClose()} onContextMenu={(e) => e.preventDefault()}>
      <div ref={ref} className="menu prop-menu" role="menu" aria-label={title} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
        {title && <div className="prop-menu-title ellipsis">{title}</div>}
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            className={it.danger ? 'danger' : ''}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            <Icon name={it.icon} size={16} />
            <span className="ellipsis">{it.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Menu of a property (layer property or effect parameter): copy / paste its
 * value or keyframes, reset it, open it in the graph editor, plus `extra`
 * items from the row (expression actions).
 */
export function PropMenu({ layer, path, def, anchor, onClose, extra = [] }: { layer: Layer; path: string; def: PropDef; anchor: DOMRect; onClose: () => void; extra?: MenuItem[] }) {
  const clip = useEditor((s) => s.propClipboard);
  const prop = getProp(layer, path);
  const animated = !!prop.keys?.length;
  const canPaste = !!clip && clip.kind === def.kind;
  const items: MenuItem[] = [
    { icon: 'copy', label: animated ? 'Copy keyframes' : 'Copy value', onSelect: () => copyProp(layer.id, path) },
    {
      icon: 'paste',
      label: clip && canPaste ? `Paste ${clip.label} ${clip.prop.keys?.length ? 'keyframes' : 'value'}` : 'Paste',
      disabled: !canPaste,
      onSelect: () => pasteProp(layer.id, path),
    },
    {
      icon: 'reset',
      label: 'Reset to default',
      disabled: !animated && !prop.expr && sameValue(prop.value, def.def),
      onSelect: () => resetProp(layer.id, path),
    },
  ];
  if (animated)
    items.push({
      icon: 'graph',
      label: 'Show in graph editor',
      onSelect: () => {
        openGraph(layer.id, path);
        // On phones the docked properties sheet covers the timeline area.
        if (useEditor.getState().sheet === 'props') openSheet(null);
      },
    });
  return <PopoverMenu anchor={anchor} title={def.label} items={[...items, ...extra]} onClose={onClose} />;
}
