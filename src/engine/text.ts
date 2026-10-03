import type { Layer, TextAnimator, TextAnimUnit } from '../model/types';
import { applyEase } from '../model/easing';
import { hash1 } from '../model/noise';
import { ensureFont, fontCss } from './fonts';
import type { Rect } from './shapes';

export interface Glyph {
  ch: string;
  x: number;
  y: number;
  w: number;
  char: number;
  word: number;
  line: number;
}

export interface TextLayout {
  glyphs: Glyph[];
  lines: { text: string; x: number; y: number }[];
  bounds: Rect;
  counts: { char: number; word: number; line: number };
  font: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

const cache = new Map<string, TextLayout>();

export function layoutText(layer: Layer, fontSize: number, tracking: number, lineHeightPct: number): TextLayout {
  const family = layer.font ?? 'Inter';
  const weight = layer.weight ?? 400;
  const italic = !!layer.italic;
  ensureFont(family, weight, italic);
  const text = layer.text ?? '';
  const align = layer.align ?? 'center';
  const size = Math.max(1, fontSize);
  const key = `${text}|${family}|${weight}|${italic}|${size.toFixed(2)}|${tracking.toFixed(2)}|${lineHeightPct.toFixed(1)}|${align}|${document.fonts.status}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const ctx = mctx();
  const font = fontCss(family, weight, size, italic);
  ctx.font = font;
  const rawLines = text.split('\n');
  const lh = (size * lineHeightPct) / 100;
  const widths = rawLines.map((l) => (l.length ? ctx.measureText(l).width + (l.length - 1) * tracking : 0));
  const maxW = Math.max(1, ...widths);
  const glyphs: Glyph[] = [];
  const lines: TextLayout['lines'] = [];
  let charIdx = 0;
  let wordIdx = 0;
  rawLines.forEach((line, li) => {
    const lw = widths[li];
    const x0 = align === 'left' ? -maxW / 2 : align === 'right' ? maxW / 2 - lw : -lw / 2;
    const y = (li - (rawLines.length - 1) / 2) * lh;
    lines.push({ text: line, x: x0, y });
    let prevSpace = true;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const before = i === 0 ? 0 : ctx.measureText(line.slice(0, i)).width;
      const after = ctx.measureText(line.slice(0, i + 1)).width;
      const space = /\s/.test(ch);
      if (!space && prevSpace && glyphs.length) wordIdx++;
      prevSpace = space;
      glyphs.push({ ch, x: x0 + before + i * tracking, y, w: after - before, char: space ? charIdx : charIdx++, word: wordIdx, line: li });
    }
    // Words never span lines.
    prevSpace = true;
  });
  const h = (rawLines.length - 1) * lh + size * 1.2;
  const layout: TextLayout = {
    glyphs,
    lines,
    bounds: { x: -maxW / 2, y: -h / 2, w: maxW, h },
    counts: { char: Math.max(1, charIdx), word: glyphs.length ? wordIdx + 1 : 1, line: rawLines.length },
    font,
  };
  if (cache.size > 400) cache.clear();
  cache.set(key, layout);
  return layout;
}

export interface TextPaint {
  fill: string | CanvasGradient | null;
  stroke: string | null;
  strokeWidth: number;
  reveal: number;
  waveAmp: number;
  waveFreq: number;
  time: number;
  fontSize: number;
  /** Overrides from text effects. */
  animator?: TextAnimator;
  unit?: TextAnimUnit;
  random?: { amount: number; speed: number };
  glyph?: (index: number, count: number) => { dx: number; dy: number; rot: number; scale: number; alpha: number };
}

const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=?';
const supportsFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

export function drawText(ctx: CanvasRenderingContext2D, layer: Layer, layout: TextLayout, p: TextPaint) {
  ctx.font = layout.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const anim = p.animator ?? layer.animator ?? 'none';
  const reveal = Math.min(1, Math.max(0, p.reveal / 100));
  const hasStroke = !!p.stroke && p.strokeWidth > 0;
  if (hasStroke) {
    ctx.strokeStyle = p.stroke!;
    ctx.lineWidth = p.strokeWidth * 2;
  }
  if (p.fill) ctx.fillStyle = p.fill;

  const simple = anim === 'none' && reveal >= 1 && p.waveAmp === 0 && !p.random && !p.glyph;
  if (simple && layout.glyphs.every((g, i, arr) => i === 0 || g.line !== arr[i - 1].line || Math.abs(g.x - (arr[i - 1].x + arr[i - 1].w)) < 0.01)) {
    // Fast path keeps the font's kerning and ligatures intact.
    for (const l of layout.lines) {
      if (hasStroke) ctx.strokeText(l.text, l.x, l.y);
      if (p.fill) ctx.fillText(l.text, l.x, l.y);
    }
    return;
  }

  const unit = p.unit ?? layer.animUnit ?? 'char';
  const N = layout.counts[unit];
  const soft = anim === 'typewriter' || anim === 'scramble' ? 1 : Math.max(1, Math.min(4, N * 0.35));
  const baseAlpha = ctx.globalAlpha;
  for (const g of layout.glyphs) {
    if (g.ch === ' ' || g.ch === '\t') continue;
    const idx = g[unit];
    let u = anim === 'none' ? 1 : Math.min(1, Math.max(0, (reveal * (N + soft) - idx) / soft));
    if (anim === 'none' && reveal < 1) u = (reveal * N) > idx ? 1 : 0;
    let alpha = 1;
    let scale = 1;
    let dy = 0;
    let ch = g.ch;
    let blur = 0;
    switch (anim) {
      case 'typewriter':
        alpha = u >= 1 ? 1 : 0;
        break;
      case 'fade':
        alpha = applyEase('easeOut', u);
        break;
      case 'pop':
        scale = applyEase('backOut', u);
        alpha = Math.min(1, u * 2.5);
        break;
      case 'slideUp':
        dy = (1 - applyEase('easeOut', u)) * p.fontSize * 0.8;
        alpha = applyEase('easeOut', u);
        break;
      case 'drop':
        dy = -(1 - applyEase('bounce', u)) * p.fontSize * 1.2;
        alpha = u > 0 ? Math.min(1, u * 4) : 0;
        break;
      case 'scramble':
        alpha = u > 0 ? 1 : 0;
        if (u > 0 && u < 1) ch = SCRAMBLE[Math.floor(hash1(g.char * 13.7 + Math.floor(p.time * 24)) * SCRAMBLE.length)];
        break;
      case 'blurIn':
        alpha = u;
        blur = (1 - u) * p.fontSize * 0.15;
        break;
      default:
        alpha = u;
    }
    if (p.random && p.random.amount > 0 && hash1(g.char * 7.31 + Math.floor(p.time * p.random.speed) * 0.37) < p.random.amount) {
      ch = SCRAMBLE[Math.floor(hash1(g.char * 3.7 + Math.floor(p.time * p.random.speed)) * SCRAMBLE.length)];
    }
    let dx = 0;
    let rot = 0;
    if (p.glyph) {
      const gt = p.glyph(g.char, layout.counts.char);
      dx += gt.dx;
      dy += gt.dy;
      rot = gt.rot;
      scale *= gt.scale;
      alpha *= gt.alpha;
    }
    if (alpha <= 0.001 || Math.abs(scale) <= 0.001) continue;
    if (p.waveAmp) dy += Math.sin(p.time * p.waveFreq + g.char * 0.55) * p.waveAmp;
    ctx.save();
    ctx.translate(g.x + g.w / 2 + dx, g.y + dy);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.globalAlpha = baseAlpha * alpha;
    if (blur > 0.3 && !supportsFilter) {
      // Safari has no canvas filters: approximate the blur with a ring of faint copies.
      ctx.globalAlpha = (baseAlpha * alpha) / 3;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const dx = Math.cos(a) * blur * 0.6;
        const dy = Math.sin(a) * blur * 0.6;
        if (hasStroke) ctx.strokeText(ch, -g.w / 2 + dx, dy);
        if (p.fill) ctx.fillText(ch, -g.w / 2 + dx, dy);
      }
      ctx.restore();
      continue;
    }
    if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
    if (hasStroke) ctx.strokeText(ch, -g.w / 2, 0);
    if (p.fill) ctx.fillText(ch, -g.w / 2, 0);
    ctx.restore();
  }
}
