import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compileExpr } from '../../model/expr';
import { parseColor, splitAlpha, toHex } from '../../model/color';
import { endMerge } from '../../state/store';
import { Icon } from '../icons';

const MATH_ENV = {
  time: 0,
  frame: 0,
  fps: 30,
  value: 0,
  index: 0,
  width: 0,
  height: 0,
  inPoint: 0,
  outPoint: 0,
  duration: 0,
  seed: 0,
  valueAt: () => 0,
  keyRange: null,
};

/** Accepts plain numbers or quick math like "1920/2" or "45*2". */
export function parseNumber(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  if (s.trim() !== '' && Number.isFinite(n)) return n;
  try {
    const v = compileExpr(s)(MATH_ENV);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function fmt(v: number, precision: number) {
  const r = Number(v.toFixed(precision));
  return Object.is(r, -0) ? '0' : String(r);
}

export interface NumberFieldProps {
  value: number;
  onChange: (v: number, final: boolean) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  precision?: number;
  label?: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
}

/** Number input you can drag horizontally to scrub (Shift = ×10, Alt = ×0.1). */
export function NumberField({ value, onChange, step = 1, min, max, unit, precision = 2, label, className, title, disabled }: NumberFieldProps) {
  const [text, setText] = useState(fmt(value, precision));
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean; id: number } | null>(null);

  useEffect(() => {
    if (!editing) setText(fmt(value, precision));
  }, [value, editing, precision]);

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

  const commit = () => {
    const n = parseNumber(text);
    if (n !== null) onChange(clamp(n), true);
    else setText(fmt(value, precision));
    setEditing(false);
    endMerge();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || editing || e.button !== 0) return;
    drag.current = { x: e.clientX, start: value, moved: false, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = clamp(d.start + Math.round(dx / 2) * step * mult);
    onChange(Number(v.toFixed(Math.max(precision, 3))), false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(d.id);
    if (d.moved) {
      endMerge();
      return;
    }
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  return (
    <label className={`num ${className ?? ''} ${disabled ? 'disabled' : ''}`} title={title}>
      {label && <span className="num-label">{label}</span>}
      <span className="num-box" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <input
          ref={inputRef}
          value={text}
          readOnly={!editing}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(fmt(value, precision));
              setEditing(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const dir = e.key === 'ArrowUp' ? 1 : -1;
              const v = clamp(value + dir * step * (e.shiftKey ? 10 : 1));
              onChange(v, true);
              setText(fmt(v, precision));
            }
          }}
        />
        {unit && <span className="num-unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Slider({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number, final: boolean) => void }) {
  return (
    <input
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value), false)}
      onPointerUp={() => endMerge()}
      style={{ ['--pct' as string]: `${((value - min) / (max - min || 1)) * 100}%` }}
    />
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string, final: boolean) => void }) {
  const { hex, alpha } = splitAlpha(value);
  const [hexText, setHexText] = useState(hex);
  useEffect(() => setHexText(hex), [hex]);
  const withA = (h: string, a: number) => {
    const [r, g, b] = parseColor(h);
    return toHex([r, g, b, a]);
  };
  return (
    <span className="color-field">
      <span className="swatch" style={{ ['--c' as string]: value }}>
        <input type="color" value={hex} onChange={(e) => onChange(withA(e.target.value, alpha), false)} onBlur={() => endMerge()} />
      </span>
      <input
        className="hex"
        value={hexText}
        onChange={(e) => setHexText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        onBlur={() => {
          const t = hexText.startsWith('#') ? hexText : `#${hexText}`;
          if (/^#[0-9a-f]{6}$/i.test(t)) onChange(withA(t, alpha), true);
          else setHexText(hex);
        }}
      />
      <NumberField className="alpha" value={Math.round(alpha * 100)} min={0} max={100} unit="%" precision={0} onChange={(v, f) => onChange(withA(hex, v / 100), f)} title="Opacity" />
    </span>
  );
}

export function Select<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[] | readonly T[]; onChange: (v: T) => void; className?: string }) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <select className={`select ${className ?? ''}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="knob" />
      {label && <span className="toggle-label">{label}</span>}
    </button>
  );
}

export function Section({ title, children, right, defaultOpen = true, id }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean; id?: string }) {
  const key = `xm.sec.${id ?? title}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? '0' : '1');
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header>
        <button type="button" className="section-title" onClick={toggle}>
          <Icon name={open ? 'down' : 'next'} size={14} />
          {title}
        </button>
        {right && <div className="section-right">{right}</div>}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function IconButton({ icon, title, onClick, active, className, disabled, size }: { icon: Parameters<typeof Icon>[0]['name']; title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; className?: string; disabled?: boolean; size?: number }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'active' : ''} ${className ?? ''}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={size} />
    </button>
  );
}
