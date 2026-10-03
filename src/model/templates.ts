import type { EaseName, Effect, Keyframe, Layer, Project, Prop, PropValue, Vec2 } from './types';
import { createEffect, createLayer, createProject, defaultZoom } from './schema';
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
  // A new array rather than push(): the layer tree index (findLayer, parents) is cached per array.
  p.layers = [...p.layers, l];
  return l;
}

/**
 * Transform for a 3D layer at depth `z` (behind the comp plane when positive)
 * that a camera at the comp center sees at comp point `at`, at its design
 * size: the scale makes up for the distance.
 */
function atDepth(p: Project, z: number, at: Vec2): Record<string, Prop> {
  const [x, y] = at;
  const zoom = defaultZoom(p);
  const f = (z + zoom) / zoom;
  const s = Math.round(f * 1000) / 10;
  return {
    position: { value: [Math.round(p.width / 2 + (x - p.width / 2) * f), Math.round(p.height / 2 + (y - p.height / 2) * f)] },
    z: { value: z },
    scale: { value: [s, s] },
  };
}

/**
 * A 3D hill silhouette `w` wide whose ridge follows `tops` (y offsets, evenly
 * spaced) and reaches below the frame. Sharp ridges repeat every point, which
 * turns the smoothed path into straight segments (mountains).
 */
function hills(p: Project, name: string, z: number, y: number, w: number, tops: number[], fill: string, sharp = false): Layer {
  const step = w / (tops.length - 1);
  const base = p.height + 120 - y;
  const ridge = tops.flatMap((top, i): Vec2[] => {
    const pt: Vec2 = [Math.round(-w / 2 + i * step), top];
    return sharp ? [pt, [...pt]] : [pt];
  });
  return createLayer(p, 'shape', {
    name,
    shape: 'path',
    points: [[-w / 2, base], ...ridge, [w / 2, base]],
    closed: true,
    fillOn: true,
    strokeOn: false,
    threeD: true,
    props: { ...atDepth(p, z, [p.width / 2, y]), fill: { value: fill } },
  });
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
  {
    id: 'cardflip',
    name: '3D Card Flip',
    description: 'Two-sided card flips in 3D, camera dolly',
    build: () => {
      const p = createProject({ name: '3D Card Flip', width: 1080, height: 1080, duration: 5, background: '#0b0a14' });
      const zoom = defaultZoom(p);
      add(
        p,
        createLayer(p, 'camera', {
          name: 'Camera',
          props: { z: { value: -zoom, keys: [k(0, -Math.round(zoom * 1.5)), k(4.6, -zoom)] } },
        }),
      );
      // Groups are flat, so the card is 3D layers parented to a 3D null that does the flipping.
      const card = add(
        p,
        createLayer(p, 'null', {
          name: 'Card',
          threeD: true,
          props: {
            rotY: { value: 0, keys: [k(1, 0), k(2.4, 180), k(3.2, 180), k(4.6, 360)] },
            rotX: { value: 0, keys: [k(0, -18), k(4.6, 0)] },
          },
        }),
      );
      // Each side's layers are centered on the card a few px apart, so drawing them by depth works at any
      // angle; the back side is turned around so it reads after the flip.
      const side = (z: number, back = false): Record<string, Prop> => ({
        position: { value: [0, 0] },
        z: { value: z },
        ...(back ? { rotY: { value: 180 } } : {}),
      });
      add(
        p,
        createLayer(p, 'text', {
          name: 'Front title',
          text: 'XMOTION',
          font: 'Montserrat',
          weight: 800,
          threeD: true,
          parent: card.id,
          props: { ...side(-24), fontSize: { value: 84 }, tracking: { value: 4 }, fill: { value: '#ffffff' } },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Front',
          shape: 'rect',
          fillType: 'linear',
          threeD: true,
          parent: card.id,
          props: { ...side(-2), size: { value: [520, 720] }, radius: { value: 44 }, fill: { value: '#7c5cff' }, fill2: { value: '#ff5c8a' }, gradAngle: { value: 150 } },
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Back title',
          text: 'MADE\nIN 3D',
          font: 'Montserrat',
          weight: 800,
          threeD: true,
          parent: card.id,
          props: { ...side(24, true), fontSize: { value: 104 }, lineHeight: { value: 100 }, fill: { value: '#1d1230' } },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Back',
          shape: 'rect',
          fillType: 'linear',
          threeD: true,
          parent: card.id,
          props: { ...side(2, true), size: { value: [520, 720] }, radius: { value: 44 }, fill: { value: '#ffc94d' }, fill2: { value: '#ff7a3d' }, gradAngle: { value: 150 } },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Spotlight',
          shape: 'ellipse',
          fillType: 'radial',
          props: { size: { value: [1400, 1400] }, fill: { value: '#3a2a7a' }, fill2: { value: '#0b0a14' } },
        }),
      );
      return p;
    },
  },
  {
    id: 'maskreveal',
    name: 'Mask Reveal',
    description: 'Title wiped on and off by a mask',
    build: () => {
      const p = createProject({ name: 'Mask Reveal', width: 1920, height: 1080, duration: 5, background: '#0b0b14' });
      add(
        p,
        createLayer(p, 'group', {
          name: 'Title reveal',
          // Pivot at the center like groups made in the editor; the children use comp coordinates.
          props: { position: { value: [960, 540] }, anchor: { value: [960, 540] } },
          children: [
            // A mask hides everything below it in its group (it isn't drawn itself).
            createLayer(p, 'shape', {
              name: 'Reveal mask',
              shape: 'rect',
              maskMode: 'alpha',
              props: {
                position: { value: [960, 540], keys: [k(3.7, [960, 540], 'easeIn'), k(4.5, [960, 220])] },
                size: { value: [1500, 320], keys: [k(0.2, [0, 320]), k(1.3, [1500, 320])] },
                fill: { value: '#ffffff' },
              },
            }),
            createLayer(p, 'text', {
              name: 'Title',
              text: 'REVEAL',
              font: 'Anton',
              weight: 400,
              props: {
                position: { value: [960, 520] },
                fontSize: { value: 220 },
                tracking: { value: 16 },
                fill: { value: '#ffffff' },
                scale: { value: [100, 100], keys: [k(0.2, [118, 118], 'easeOut'), k(1.8, [100, 100])] },
              },
            }),
            createLayer(p, 'shape', {
              name: 'Underline',
              shape: 'rect',
              props: {
                position: { value: [960, 680] },
                size: { value: [620, 10] },
                fill: { value: '#ff5c8a' },
                scale: { value: [100, 100], keys: [k(0.5, [0, 100], 'easeOut'), k(1.3, [100, 100])] },
              },
            }),
          ],
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Tagline',
          text: 'masks · groups · motion',
          font: 'Inter',
          weight: 500,
          props: {
            position: { value: [960, 790], keys: [k(1, [960, 820], 'easeOut'), k(1.6, [960, 790])] },
            fontSize: { value: 44 },
            tracking: { value: 10 },
            fill: { value: '#c9c3ff' },
            opacity: { value: 100, keys: [k(1, 0, 'easeOut'), k(1.6, 100), k(3.6, 100), k(4.2, 0)] },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Background',
          shape: 'rect',
          fillType: 'radial',
          props: { size: { value: [1920, 1080] }, fill: { value: '#2b1f66' }, fill2: { value: '#0b0b14' } },
        }),
      );
      return p;
    },
  },
  {
    id: 'parallax',
    name: 'Parallax Depth',
    description: '3D layers at different depths, camera move',
    build: () => {
      const p = createProject({
        name: 'Parallax Depth',
        width: 1920,
        height: 1080,
        duration: 6,
        background: '#4a2c6d',
        motionBlur: { on: true, samples: 8, shutter: 0.5 },
      });
      add(p, createLayer(p, 'adjustment', { name: 'Vignette', effects: [fx('vignette', { amount: 40 })] }));
      // The camera slides sideways: near layers sweep past, far ones barely move.
      add(
        p,
        createLayer(p, 'camera', {
          name: 'Camera',
          props: { position: { value: [960, 540], keys: [k(0, [660, 540]), k(6, [1260, 540])] } },
        }),
      );
      add(
        p,
        hills(p, 'Foreground', -1500, 1010, 3800, [-40, -110, -50, -130, -60, -100, -30, -120, -50, -140, -40, -100, -60, -130, -30, -110, -50, -120, -40, -100, -60], '#2a1236'),
      );
      add(p, hills(p, 'Near hills', 0, 900, 3000, [-30, -80, -10, -100, -40, -70, 0, -90, -20, -60, -10, -80], '#6b2f6f'));
      add(p, hills(p, 'Mid hills', 1200, 790, 2700, [-60, -120, -40, -150, -70, -110, -30, -140, -60, -100, -50], '#a35b8f'));
      add(
        p,
        createLayer(p, 'text', {
          name: 'Title',
          text: 'PARALLAX',
          font: 'Bebas Neue',
          weight: 400,
          threeD: true,
          props: {
            ...atDepth(p, 2000, [960, 300]),
            fontSize: { value: 180 },
            tracking: { value: 30 },
            fill: { value: '#ffffff' },
            opacity: { value: 100, keys: [k(0.3, 0, 'easeOut'), k(1.3, 100)] },
          },
        }),
      );
      add(
        p,
        createLayer(p, 'text', {
          name: 'Subtitle',
          text: 'A 3D CAMERA MOVE',
          font: 'Inter',
          weight: 600,
          threeD: true,
          props: {
            ...atDepth(p, 2000, [960, 420]),
            fontSize: { value: 40 },
            tracking: { value: 14 },
            fill: { value: '#ffe9d6' },
            opacity: { value: 100, keys: [k(0.8, 0, 'easeOut'), k(1.8, 100)] },
          },
        }),
      );
      add(p, hills(p, 'Far mountains', 3000, 680, 2600, [-80, -240, -120, -330, -160, -270, -120, -150, -280, -170, -90], '#d98ca6', true));
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Sun',
          shape: 'ellipse',
          threeD: true,
          props: { ...atDepth(p, 6000, [1460, 470]), size: { value: [210, 210] }, fill: { value: '#fff4d6' } },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Sun glow',
          shape: 'ellipse',
          fillType: 'radial',
          threeD: true,
          props: { ...atDepth(p, 6000, [1460, 470]), size: { value: [640, 640] }, fill: { value: '#ffe0a399' }, fill2: { value: '#ffe0a300' } },
        }),
      );
      add(
        p,
        createLayer(p, 'shape', {
          name: 'Sky',
          shape: 'rect',
          fillType: 'linear',
          props: { size: { value: [1920, 1080] }, fill: { value: '#ffb88c' }, fill2: { value: '#4a2c6d' }, gradAngle: { value: 0 } },
        }),
      );
      return p;
    },
  },
];
