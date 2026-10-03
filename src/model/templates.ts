import type { EaseName, Effect, Keyframe, Layer, Project, PropValue } from './types';
import { createEffect, createLayer, createProject } from './schema';
import { uid } from './ids';

const k = (t: number, v: PropValue, ease: EaseName = 'easeInOut'): Keyframe => ({ id: uid('k'), t, v, ease });

function fx(type: string, values: Record<string, PropValue> = {}): Effect {
  const e = createEffect(type);
  for (const [key, v] of Object.entries(values)) e.props[key] = { value: v };
  return e;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  build: () => Project;
}

function add(p: Project, l: Layer) {
  p.layers.push(l);
  return l;
}

export const TEMPLATES: Template[] = [
  {
    id: 'neon',
    name: 'Neon Title',
    description: 'Glowing title with draw-on ring',
    build: () => {
      const p = createProject({ name: 'Neon Title', width: 1920, height: 1080, duration: 5, background: '#07060f' });
      add(p, createLayer(p, 'adjustment', { name: 'Grade', effects: [fx('vignette', { amount: 60 }), fx('grain', { amount: 12 })] }));
      add(
        p,
        createLayer(p, 'text', {
          name: 'Title',
          text: 'XMOTION',
          font: 'Monoton',
          weight: 400,
          animator: 'pop',
          animUnit: 'char',
          props: {
            position: { value: [960, 540] },
            fontSize: { value: 220 },
            tracking: { value: 12 },
            fill: { value: '#ff4fd8' },
            reveal: { value: 100, keys: [k(0.3, 0, 'linear'), k(1.4, 100)] },
          },
          effects: [fx('glow', { radius: 30, strength: 160, color: '#ff4fd8' })],
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Subtitle',
          text: 'motion design in your browser',
          font: 'Inter',
          weight: 500,
          props: {
            position: { value: [960, 720], keys: [k(1.2, [960, 760], 'easeOut'), k(1.9, [960, 720])] },
            fontSize: { value: 48 },
            tracking: { value: 6 },
            fill: { value: '#9ff6ff' },
            opacity: { value: 100, keys: [k(1.2, 0, 'easeOut'), k(1.9, 100)] },
          },
          effects: [fx('glow', { radius: 16, strength: 80, color: '#38e8ff' })],
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Ring',
          shape: 'ellipse',
          fillOn: false,
          strokeOn: true,
          props: {
            position: { value: [960, 540] },
            size: { value: [900, 900] },
            strokeColor: { value: '#38e8ff' },
            strokeWidth: { value: 6 },
            trimEnd: { value: 100, keys: [k(0, 0, 'easeInOut'), k(1.6, 100)] },
            rotation: { value: 0, expr: 'time * 20' },
          },
          effects: [fx('glow', { radius: 24, strength: 140, color: '#38e8ff' })],
        }),
      );
      return p;
    },
  },
  {
    id: 'story',
    name: 'Story Intro',
    description: 'Vertical 9:16 intro with kinetic text',
    build: () => {
      const p = createProject({ name: 'Story Intro', width: 1080, height: 1920, duration: 6, background: '#120b2e' });
      add(
        p,
        createLayer(p, 'text', {
          name: 'Headline',
          text: 'NEW\nDROP',
          font: 'Anton',
          weight: 400,
          animator: 'slideUp',
          animUnit: 'line',
          props: {
            position: { value: [540, 900] },
            fontSize: { value: 300 },
            lineHeight: { value: 95 },
            fill: { value: '#ffffff' },
            reveal: { value: 100, keys: [k(0.4, 0, 'easeOut'), k(1.4, 100)] },
            scale: { value: [100, 100], expr: 'value * (1 + sin(time * 3) * 0.02)' },
          },
          effects: [fx('shadow', { distance: 18, softness: 0, color: '#ff3d7fff', angle: 135 })],
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Tagline',
          text: 'swipe up ↑',
          font: 'Poppins',
          weight: 600,
          props: {
            position: { value: [540, 1600], expr: 'value + [0, sin(time * 4) * 14]' },
            fontSize: { value: 64 },
            fill: { value: '#ffc94d' },
            opacity: { value: 100, keys: [k(1.6, 0), k(2.2, 100)] },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Star',
          shape: 'star',
          props: {
            position: { value: [860, 420] },
            size: { value: [260, 260] },
            sides: { value: 5 },
            inner: { value: 48 },
            radius: { value: 12 },
            fill: { value: '#ffc94d' },
            rotation: { value: 0, expr: 'time * 60' },
            scale: { value: [100, 100], keys: [k(0.8, [0, 0], 'backOut'), k(1.3, [100, 100])] },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Background',
          shape: 'rect',
          fillType: 'linear',
          props: {
            position: { value: [540, 960] },
            size: { value: [1080, 1920] },
            fill: { value: '#5b2bff' },
            fill2: { value: '#ff3d7f' },
            gradAngle: { value: 160, expr: 'value + sin(time) * 25' },
          },
        }),
      );
      return p;
    },
  },
  {
    id: 'logo',
    name: 'Logo Reveal',
    description: 'Square logo sting with glitch hit',
    build: () => {
      const p = createProject({ name: 'Logo Reveal', width: 1080, height: 1080, duration: 4, background: '#0d0d12' });
      add(
        p,
        createLayer(p, 'adjustment', {
          name: 'Glitch hit',
          start: 1.0,
          end: 1.35,
          effects: [fx('glitch', { amount: 80, speed: 24 }), fx('rgbSplit', { amount: 14 })],
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Brand',
          text: 'studio',
          font: 'Montserrat',
          weight: 800,
          animator: 'typewriter',
          props: {
            position: { value: [540, 820] },
            fontSize: { value: 110 },
            tracking: { value: 4 },
            fill: { value: '#ffffff' },
            reveal: { value: 100, keys: [k(1.3, 0, 'linear'), k(2.0, 100)] },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Hexagon',
          shape: 'polygon',
          props: {
            position: { value: [540, 460] },
            size: { value: [380, 380] },
            sides: { value: 6 },
            radius: { value: 30 },
            fill: { value: '#00e0a4' },
            fill2: { value: '#00a3ff' },
            rotation: { value: 0, keys: [k(0.6, -90, 'backOut'), k(1.2, 0)] },
            scale: { value: [100, 100], keys: [k(0.6, [0, 0], 'backOut'), k(1.2, [100, 100])] },
          },
          fillType: 'linear',
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Draw-on ring',
          shape: 'ellipse',
          fillOn: false,
          strokeOn: true,
          props: {
            position: { value: [540, 460] },
            size: { value: [560, 560] },
            strokeColor: { value: '#ffffff' },
            strokeWidth: { value: 10 },
            trimStart: { value: 0, keys: [k(0.6, 0), k(1.6, 100)] },
            trimEnd: { value: 100, keys: [k(0, 0), k(1.0, 100)] },
          },
        }),
      );
      return p;
    },
  },
  {
    id: 'lower',
    name: 'Lower Third',
    description: 'Name tag for interviews and streams',
    build: () => {
      const p = createProject({ name: 'Lower Third', width: 1920, height: 1080, duration: 5, background: '#2a2f3a' });
      add(
        p,
        createLayer(p, 'text', {
          name: 'Role',
          text: 'Motion Designer',
          font: 'Inter',
          weight: 600,
          clip: true,
          props: {
            position: { value: [400, 905], keys: [k(0.6, [400, 960], 'easeOut'), k(1.1, [400, 905])] },
            fontSize: { value: 40 },
            fill: { value: '#1d1f27' },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Role bar',
          shape: 'rect',
          props: {
            position: { value: [140, 905] },
            anchor: { value: [-260, 0] },
            size: { value: [520, 64] },
            scale: { value: [100, 100], keys: [k(0.35, [0, 100], 'easeOut'), k(0.85, [100, 100])] },
            fill: { value: '#ffd24d' },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Name',
          text: 'ALEX RIVERA',
          font: 'Archivo Black',
          weight: 400,
          clip: true,
          props: {
            position: { value: [460, 820], keys: [k(0.25, [460, 900], 'easeOut'), k(0.75, [460, 820])] },
            fontSize: { value: 72 },
            fill: { value: '#ffffff' },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Name bar',
          shape: 'rect',
          props: {
            position: { value: [140, 820] },
            anchor: { value: [-320, 0] },
            size: { value: [640, 110] },
            scale: { value: [100, 100], keys: [k(0, [0, 100], 'easeOut'), k(0.5, [100, 100])] },
            fill: { value: '#1d1f27' },
          },
        }),
      );
      return p;
    },
  },
];
