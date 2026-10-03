/** Curated Google Fonts that cover most motion-design looks. */
export const FONT_LIST: { family: string; category: string }[] = [
  { family: 'Inter', category: 'Sans' },
  { family: 'Montserrat', category: 'Sans' },
  { family: 'Poppins', category: 'Sans' },
  { family: 'Roboto', category: 'Sans' },
  { family: 'Oswald', category: 'Condensed' },
  { family: 'Bebas Neue', category: 'Display' },
  { family: 'Anton', category: 'Display' },
  { family: 'Archivo Black', category: 'Display' },
  { family: 'Righteous', category: 'Display' },
  { family: 'Bungee', category: 'Display' },
  { family: 'Monoton', category: 'Display' },
  { family: 'Press Start 2P', category: 'Pixel' },
  { family: 'Playfair Display', category: 'Serif' },
  { family: 'DM Serif Display', category: 'Serif' },
  { family: 'Lobster', category: 'Script' },
  { family: 'Pacifico', category: 'Script' },
  { family: 'Dancing Script', category: 'Script' },
  { family: 'Permanent Marker', category: 'Hand' },
  { family: 'Caveat', category: 'Hand' },
  { family: 'JetBrains Mono', category: 'Mono' },
];

const GOOGLE = new Set(FONT_LIST.map((f) => f.family));
const requested = new Set<string>();
const ready = new Set<string>();
const listeners = new Set<() => void>();

export function onFontsChanged(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function fontCss(family: string, weight: number, size: number, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${size}px "${family}", system-ui, sans-serif`;
}

/** Makes sure a font family is loading; triggers a re-render once it's available. */
export function ensureFont(family: string, weight = 400, italic = false) {
  const key = `${family}|${weight}|${italic}`;
  if (ready.has(key) || requested.has(key)) return;
  requested.add(key);
  if (GOOGLE.has(family) && !document.querySelector(`link[data-font="${family}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.font = family;
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@0,100..900;1,100..900&display=block`;
    // Fonts without variable axes reject the range syntax; fall back to defaults.
    link.onerror = () => {
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=block`;
    };
    document.head.appendChild(link);
  }
  document.fonts
    .load(fontCss(family, weight, 64, italic))
    .then(() => {
      ready.add(key);
      notify();
    })
    .catch(() => undefined);
}

/** Registers a user-provided font file; returns the family name. */
export async function registerFontFile(family: string, data: ArrayBuffer): Promise<string> {
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
  for (const w of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
    ready.add(`${family}|${w}|false`);
    requested.add(`${family}|${w}|false`);
  }
  notify();
  return family;
}

/** Waits for every font used in a project (for exports). */
export async function waitForFonts(specs: { family: string; weight: number; italic: boolean }[]) {
  for (const s of specs) ensureFont(s.family, s.weight, s.italic);
  await Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(fontCss(s.family, s.weight, 64, s.italic)).catch(() => undefined))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
}
