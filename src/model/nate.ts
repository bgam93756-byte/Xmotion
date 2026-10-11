import type { EaseName, Effect, Keyframe, Layer, Project, PropValue, Vec2 } from './types';
import { createEffect, createLayer } from './schema';
import { uid } from './ids';

/**
 * "Nate style": the TikTok edit look. A deep blue intro with a chrome name
 * and a glowing, colour-cycling quote; letterbox bars; and on every cut or
 * beat a camera hit (shake + zoom punch + zoom blur), a white flash, or a
 * spin transition (180° roll with spin blur), over a punchy grade.
 *
 * Everything it adds is named "Nate · …", and the clips go into the
 * "Nate · clips" group (the hits and spins move that group), so applying it
 * again replaces the old version.
 */
export const NATE = 'Nate · ';
const CLIPS = `${NATE}clips`;
const TITLE = `${NATE}name`;
const QUOTE = `${NATE}quote`;

export interface Beat {
  /** Comp time (s). */
  t: number;
  /** 0–1, relative to the strongest beat. */
  strength: number;
}

export interface Accent extends Beat {
  /** A cut between two clips (gets a flash or a spin). */
  cut: boolean;
}

export interface NateOptions {
  /** Beats of the music in comp time; without them the clips get a steady pulse. */
  beats?: Beat[];
  /** The big chrome name (default: NATE). */
  title?: string;
  /** The glowing quote (default: a placeholder to type over). */
  quote?: string;
}

export interface NateResult {
  hits: number;
  spins: number;
  flashes: number;
  beatSynced: boolean;
}

const QUOTE_COLORS = ['#ffb347', '#7dff8a', '#b47cff', '#ffe066', '#6be4ff'];

const key = (t: number, v: PropValue, ease: EaseName = 'linear'): Keyframe => ({ id: uid('k'), t, v, ease });

function fx(type: string, values: Record<string, PropValue> = {}): Effect {
  const e = createEffect(type);
  for (const [k, v] of Object.entries(values)) e.props[k] = { value: v };
  return e;
}

/** Whether the project already has Nate style. */
export function hasNateStyle(p: Project): boolean {
  return p.layers.some((l) => l.name === CLIPS && l.type === 'group');
}

/**
 * Takes Nate style out again: the clips leave their group, the added layers
 * go. Returns the name and quote typed into it, so a re-apply keeps them.
 */
export function removeNateStyle(p: Project): { title?: string; quote?: string } {
  const kept = { title: p.layers.find((l) => l.name === TITLE)?.text, quote: p.layers.find((l) => l.name === QUOTE)?.text };
  p.layers = p.layers.flatMap((l) => (l.name === CLIPS && l.type === 'group' ? (l.children ?? []) : l.name.startsWith(NATE) ? [] : [l]));
  return kept;
}

/** The layers that become the edit's clips: everything at the top level but audio and cameras. */
function clipLayers(p: Project): Layer[] {
  return p.layers.filter((l) => l.type !== 'audio' && l.type !== 'camera' && !l.name.startsWith(NATE));
}

/** Where one clip hands over to the next: the starts of clips after the first, on frames. */
export function cutTimes(clips: Layer[], fps: number, duration: number): number[] {
  if (!clips.length) return [];
  const first = Math.min(...clips.map((l) => l.start));
  const ts = clips.map((l) => Math.round(l.start * fps) / fps).filter((t) => t > first + 0.05 && t < duration - 0.1);
  return [...new Set(ts)].sort((a, b) => a - b);
}

/** End of the blue intro with the name and quote: the first cut when it comes early enough. */
export function introEnd(cuts: number[], duration: number): number {
  const c = cuts.find((t) => t >= 0.6);
  return c !== undefined && c <= 3 ? c : Math.min(1.6, duration * 0.3);
}

/**
 * Hits for the edit: every cut, plus the music's beats (or, without music, a
 * pulse every 0.6 s inside clips), at least 0.3 s apart. Cuts win over beats,
 * stronger beats over weaker ones.
 */
export function planAccents(cuts: number[], beats: Beat[] | undefined, spans: [number, number][], intro: number, duration: number): Accent[] {
  const out: Accent[] = cuts.map((t) => ({ t, strength: 1, cut: true }));
  const pulse: Beat[] = [];
  if (!beats?.length)
    for (const [s, e] of spans) for (let t = Math.max(s, intro) + 0.6; t <= e - 0.3; t += 0.6) pulse.push({ t, strength: 0.6 });
  const extra = beats?.length ? [...beats].filter((b) => b.strength >= 0.2).sort((a, b) => b.strength - a.strength) : pulse;
  for (const b of extra)
    if (b.t > intro + 0.1 && b.t < duration - 0.15 && out.every((a) => Math.abs(a.t - b.t) >= 0.3))
      out.push({ t: b.t, strength: Math.max(0.45, Math.min(1, b.strength)), cut: false });
  return out.sort((a, b) => a.t - b.t);
}

/** Keyframes of one property, in any order; same-time keys keep the last. */
class Track {
  private keys = new Map<number, Keyframe>();
  constructor(private fps: number) {}
  add(t: number, v: PropValue, ease: EaseName = 'linear') {
    const ft = Math.max(0, Math.round(t * this.fps) / this.fps);
    this.keys.set(ft, key(ft, v, ease));
  }
  get size() {
    return this.keys.size;
  }
  prop(value: PropValue) {
    const keys = [...this.keys.values()].sort((a, b) => a.t - b.t);
    return keys.length ? { value, keys } : { value };
  }
}

/** Applies Nate style to a project (or a draft of one) in place. */
export function applyNateStyle(p: Project, opts: NateOptions = {}): NateResult {
  const kept = hasNateStyle(p) ? removeNateStyle(p) : {};
  const W = p.width;
  const H = p.height;
  const u = Math.min(W, H) / 1080;
  const fps = p.fps;
  const f = 1 / fps;
  const D = p.duration;
  const clips = clipLayers(p);
  const cuts = cutTimes(clips, fps, D);
  const intro = introEnd(cuts, D);
  const beats = opts.beats?.filter((b) => b.t >= 0 && b.t < D);
  const accents = planAccents(
    cuts,
    beats,
    clips.filter((l) => l.type !== 'adjustment' && l.type !== 'null').map((l) => [l.start, l.end]),
    intro,
    D,
  );

  /* ----- the clips group: hits and spins move it ----- */
  const S = 108; // zoomed in a little so shakes never show the edges
  const scale = new Track(fps);
  const rotation = new Track(fps);
  const shake = new Track(fps);
  const shakeRot = new Track(fps);
  const zoom = new Track(fps);
  const spin = new Track(fps);
  scale.add(0, [S, S]);
  const flashes: number[] = [];
  let spins = 0;
  let hits = 0;
  let cutN = 0;
  let accN = 0;
  let turn = 0;
  accents.forEach((a, i) => {
    const prev = i ? accents[i - 1].t : -Infinity;
    const next = i < accents.length - 1 ? accents[i + 1].t : Infinity;
    // Every third cut spins (every fourth beat when there are no cuts).
    const isSpin = a.cut ? cutN++ % 3 === 2 : !cuts.length && accN++ % 4 === 3;
    const pre = Math.max(f, Math.min(0.22, (a.t - prev) / 2, a.t));
    const post = Math.max(2 * f, Math.min(isSpin ? 0.22 : 0.4, (next - a.t) / 2, D - a.t));
    if (isSpin) {
      spins++;
      rotation.add(a.t - pre, turn, 'easeIn');
      rotation.add(a.t, turn + 180, 'easeOut');
      rotation.add(a.t + post, turn + 360);
      turn += 360;
      spin.add(a.t - pre, 0, 'easeIn');
      spin.add(a.t, 45, 'easeOut');
      spin.add(a.t + post, 0);
      // The zoom leads the turn (ease out, then back in) so the turning frame always
      // covers the screen: a 9:16 frame needs about 2× around 60°.
      const big = Math.round(S * 2.1);
      scale.add(a.t - pre, [S, S], 'easeOut');
      scale.add(a.t, [big, big], 'easeIn');
      scale.add(a.t + post, [S, S]);
      flashes.push(a.t);
      return;
    }
    hits++;
    const s = a.strength;
    shake.add(a.t - f, 0);
    shake.add(a.t, Math.round(110 * u * s), 'easeOut');
    shake.add(a.t + post, 0);
    shakeRot.add(a.t - f, 0);
    shakeRot.add(a.t, Math.round(4 * s * 10) / 10, 'easeOut');
    shakeRot.add(a.t + post, 0);
    zoom.add(a.t - f, 0);
    zoom.add(a.t, Math.round(30 * s), 'easeOut');
    zoom.add(a.t + Math.min(post, 0.18), 0);
    const punch = Math.round(S * (1 + 0.1 * s) * 10) / 10;
    scale.add(a.t - f, [S, S]);
    scale.add(a.t, [punch, punch], 'easeOut');
    scale.add(a.t + Math.min(post, 0.25), [S, S]);
    if (a.cut) flashes.push(a.t);
  });

  const inClips = new Set(clips.map((l) => l.id));
  for (const l of clips) if (l.parent && !inClips.has(l.parent)) l.parent = null;
  const group = createLayer(p, 'group', {
    name: CLIPS,
    start: 0,
    end: D,
    props: {
      position: { value: [W / 2, H / 2] },
      anchor: { value: [W / 2, H / 2] },
      scale: scale.prop([S, S]),
      rotation: rotation.prop(0),
    },
  });
  group.children = clips;
  const shakeFx = fx('shake', { speed: 10 });
  shakeFx.props.amount = shake.prop(0);
  shakeFx.props.rotation = shakeRot.prop(0);
  // A constant handheld buzz under the hits.
  const jitterFx = fx('randomJitter', { amount: Math.round(5 * u * 10) / 10, rotation: 0.4, scale: 0.8, speed: 12 });
  const zoomFx = fx('zoomBlur');
  zoomFx.props.amount = zoom.prop(0);
  const spinFx = fx('spinBlur');
  spinFx.props.angle = spin.prop(0);
  group.effects = [shakeFx, jitterFx, ...(zoom.size ? [zoomFx] : []), ...(spin.size ? [spinFx] : [])];

  /* ----- grade ----- */
  const look = createLayer(p, 'adjustment', { name: `${NATE}look`, start: 0, end: D });
  look.effects = [
    fx('satVibrance', { saturation: 15, vibrance: 30 }),
    fx('brightnessContrast', { brightness: 2, contrast: 22 }),
    fx('sharpen', { amount: 60 }),
    fx('softGlow', { radius: 36, amount: 28 }),
    fx('vignette', { amount: 35, size: 75, softness: 60 }),
  ];
  const blue = createLayer(p, 'adjustment', { name: `${NATE}blue intro`, start: 0, end: intro });
  // Deep navy shadows to icy blue highlights, like the reference edits.
  blue.effects = [fx('duotone', { dark: '#030b2e', light: '#8fd0ff', amount: 100 }), fx('brightnessContrast', { brightness: 4, contrast: 22 }), fx('softGlow', { radius: 30, amount: 45 })];

  /* ----- name and quote over the intro ----- */
  const name = (opts.title ?? kept.title ?? 'NATE').toUpperCase();
  const nameSize = Math.round(Math.min(230 * u, (W * 0.84) / (Math.max(1, name.length) * 0.86)));
  const title = createLayer(p, 'text', {
    name: TITLE,
    text: name,
    font: 'Orbitron',
    weight: 900,
    start: 0,
    end: intro,
    props: {
      position: { value: [W / 2, Math.round(H * 0.24)] },
      fontSize: { value: nameSize },
      tracking: { value: 4 },
      fill: { value: '#ffffff' },
      scale: { value: [100, 100], keys: [key(0, [0, 0], 'backOut'), key(0.35, [100, 100]), key(Math.max(0.4, intro), [106, 106])] },
    },
  });
  // Chrome: a metal gradient, a little depth, a bevel and an icy glow.
  title.effects = [
    fx('gradientOverlay', { c1: '#ffffff', c2: '#6f7f9f', type: 0, angle: 90, mode: 1, opacity: 100 }),
    fx('rasterExtrude', { angle: 120, depth: Math.round(14 * u), shade: 70 }),
    fx('smoothBevel', { size: Math.round(7 * u), light: 120, depth: 14 }),
    fx('glow', { radius: Math.round(28 * u), strength: 80, threshold: 30, color: '#a8d4ff' }),
  ];
  const quoteText = opts.quote ?? kept.quote ?? '“TYPE YOUR QUOTE”';
  const longest = Math.max(...quoteText.split('\n').map((s) => s.length), 1);
  const colors = new Track(fps);
  for (let t = 0, i = 0; t < intro; t += 0.3, i++) colors.add(t, QUOTE_COLORS[i % QUOTE_COLORS.length], 'hold');
  const quote = createLayer(p, 'text', {
    name: QUOTE,
    text: quoteText,
    font: 'Michroma',
    weight: 400,
    align: 'center',
    animator: 'pop',
    animUnit: 'word',
    start: 0,
    end: intro,
    props: {
      position: { value: [W / 2, Math.round(H * 0.76)] },
      fontSize: { value: Math.round(Math.min(64 * u, (W * 0.86) / (longest * 0.95))) },
      tracking: { value: 3 },
      lineHeight: { value: 125 },
      fill: colors.prop(QUOTE_COLORS[0]),
      reveal: { value: 100, keys: [key(0.1, 0, 'easeOut'), key(0.6, 100)] },
    },
  });
  quote.effects = [fx('glow', { radius: Math.round(20 * u), strength: 170, threshold: 0 })];

  /* ----- flashes, a ring and the letterbox ----- */
  const flashLayers = flashes.map((t) => {
    const end = Math.min(D, t + 0.2);
    return createLayer(p, 'shape', {
      name: `${NATE}flash`,
      shape: 'rect',
      start: t,
      end: Math.max(end, t + f),
      props: {
        position: { value: [W / 2, H / 2] },
        size: { value: [W + 40, H + 40] },
        fill: { value: '#ffffff' },
        opacity: { value: 0, keys: [key(0, 85, 'easeOut'), key(0.15, 0)] },
      },
    });
  });
  const ringAt = accents.find((a) => a.t > intro + 0.05 && !a.cut) ?? accents.find((a) => a.t > intro + 0.05);
  const rings = ringAt
    ? [
        createLayer(p, 'shape', {
          name: `${NATE}ring`,
          shape: 'ellipse',
          fillOn: false,
          strokeOn: true,
          start: ringAt.t,
          end: Math.min(D, ringAt.t + 0.4),
          props: {
            position: { value: [W / 2, H / 2] },
            size: { value: [Math.round(320 * u), Math.round(320 * u)] },
            strokeColor: { value: '#ffffff' },
            strokeWidth: { value: Math.round(10 * u) },
            scale: { value: [40, 40], keys: [key(0, [40, 40], 'easeOut'), key(0.35, [230, 230])] },
            opacity: { value: 100, keys: [key(0, 100, 'easeIn'), key(0.35, 0)] },
          },
        }),
      ]
    : [];
  for (const r of rings) r.effects = [fx('glow', { radius: Math.round(24 * u), strength: 150 })];
  const bar = W < H ? Math.round(H * 0.1) : Math.round(Math.max(H * 0.06, (H - W / 2.39) / 2));
  const letterbox = [Math.round(bar / 2), H - Math.round(bar / 2)].map((y, i) =>
    createLayer(p, 'shape', {
      name: `${NATE}letterbox ${i ? 'bottom' : 'top'}`,
      shape: 'rect',
      start: 0,
      end: D,
      props: { position: { value: [W / 2, y] as Vec2 }, size: { value: [W + 40, bar] }, fill: { value: '#000000' } },
    }),
  );

  // Cameras stay on top; music and sound at the bottom.
  const cameras = p.layers.filter((l) => l.type === 'camera');
  const audio = p.layers.filter((l) => l.type === 'audio');
  p.layers = [...cameras, ...letterbox, title, quote, ...flashLayers, ...rings, blue, look, group, ...audio];
  return { hits, spins, flashes: flashLayers.length, beatSynced: !!beats?.length };
}
