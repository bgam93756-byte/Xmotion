import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  start: 'M6 5v14M19 5L9 12l10 7z',
  end: 'M18 5v14M5 5l10 7-10 7z',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.1 4M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 017.5-2',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01',
  cursor: 'M5 3l6 17 2.5-7.5L21 10z',
  rect: 'M4 5h16v14H4z',
  ellipse: 'M12 20a8 8 0 100-16 8 8 0 000 16z',
  polygon: 'M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  pen: 'M3 21c3-1 5-4 7-8s4-7 7-8 4 1 3 3-4 4-7 6-5 4-5 7',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  null: 'M12 4v16M4 12h16M7 7h10v10H7z',
  adjust: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18M12 3a9 9 0 010 18',
  back: 'M15 18l-6-6 6-6',
  diamond: 'M12 3l9 9-9 9-9-9z',
  scissors: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  fx: 'M5 20c2 0 3-1 3.5-4l2-9C11 4 12 3 14 3M6 10h7M14 13l6 6M20 13l-6 6',
  link: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  unlink: 'M18.8 13.3l1.4-1.4a5 5 0 00-7-7l-1.4 1.4M5.2 10.7l-1.4 1.4a5 5 0 007 7l1.4-1.4M8 2v3M2 8h3M16 22v-3M22 16h-3',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5',
  share: 'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13',
  zoomIn: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3M8 11h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  clip: 'M8 3v4M4 7h12v12M20 17h-4',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  graph: 'M3 21c6 0 6-18 18-18',
  keyframe: 'M12 5l7 7-7 7-7-7z',
  magnet: 'M6 3v8a6 6 0 0012 0V3M6 7h4M14 7h4',
  group: 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M8 8h8v8H8z',
  ungroup: 'M4 4h7v7H4zM13 13h7v7h-7z',
  camera: 'M3 8h3l2-3h8l2 3h3v11H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
  cube: 'M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5',
  mask: 'M4 4h16v16H4zM12 8a4 4 0 100 8 4 4 0 000-8z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  anchor: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v5M12 17v5M2 12h5M17 12h5',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16',
  guides: 'M8 3v18M3 15h18',
  paste: 'M9 3h6v3H9zM8 4.5H5V21h14V4.5h-3',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  reset: 'M3 12a9 9 0 103-6.7L3 8M3 3v5h5',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === 'play' || name === 'pause' || name === 'keyframe';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
