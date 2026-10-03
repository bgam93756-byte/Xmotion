import { useRef } from 'react';
import type { Bezier } from '../../model/types';
import { applyEase } from '../../model/easing';

const S = 168;
const PAD = 36;

/** Draggable cubic-bezier curve editor (y may overshoot for anticipation/overshoot curves). */
export function BezierEditor({ value, onChange, preview }: { value: Bezier; onChange: (b: Bezier, final: boolean) => void; preview?: (x: number) => number }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<0 | 1 | null>(null);
  const toPx = (x: number, y: number) => [PAD + x * S, PAD + (1 - y) * S] as const;
  const [x1, y1, x2, y2] = value;
  const p0 = toPx(0, 0);
  const p1 = toPx(x1, y1);
  const p2 = toPx(x2, y2);
  const p3 = toPx(1, 1);

  const fromEvent = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const sx = (S + PAD * 2) / r.width;
    const x = ((e.clientX - r.left) * sx - PAD) / S;
    const y = 1 - ((e.clientY - r.top) * sx - PAD) / S;
    return [Math.min(1, Math.max(0, x)), Math.min(1.6, Math.max(-0.6, y))];
  };
  const move = (e: React.PointerEvent, final: boolean) => {
    if (dragging.current === null) return;
    const [x, y] = fromEvent(e);
    const r = (n: number) => Math.round(n * 100) / 100;
    onChange(dragging.current === 0 ? [r(x), r(y), x2, y2] : [x1, y1, r(x), r(y)], final);
  };

  let samples = '';
  if (preview) {
    for (let i = 0; i <= 40; i++) {
      const x = i / 40;
      const [px, py] = toPx(x, preview(x));
      samples += `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    }
  }

  return (
    <svg
      ref={svg}
      className="bezier"
      viewBox={`0 0 ${S + PAD * 2} ${S + PAD * 2}`}
      onPointerMove={(e) => move(e, false)}
      onPointerUp={(e) => {
        move(e, true);
        dragging.current = null;
      }}
    >
      <rect x={PAD} y={PAD} width={S} height={S} className="bz-frame" />
      {[0.25, 0.5, 0.75].map((g) => (
        <g key={g} className="bz-grid">
          <line x1={PAD + g * S} x2={PAD + g * S} y1={PAD} y2={PAD + S} />
          <line y1={PAD + g * S} y2={PAD + g * S} x1={PAD} x2={PAD + S} />
        </g>
      ))}
      {preview ? (
        <path d={samples} className="bz-curve" />
      ) : (
        <path d={`M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`} className="bz-curve" />
      )}
      {!preview && (
        <>
          <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} className="bz-arm" />
          <line x1={p3[0]} y1={p3[1]} x2={p2[0]} y2={p2[1]} className="bz-arm" />
          {[p1, p2].map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r={8}
              className="bz-handle"
              onPointerDown={(e) => {
                dragging.current = i as 0 | 1;
                svg.current!.setPointerCapture(e.pointerId);
              }}
            />
          ))}
        </>
      )}
    </svg>
  );
}

export const easePreview = (name: Parameters<typeof applyEase>[0], bez?: Bezier) => (x: number) => applyEase(name, x, bez);
