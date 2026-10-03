# Xmotion

A keyframe motion-graphics and video editor for **iPhone and iPad** (also runs in any modern browser). It's built to compete with Alight Motion: layers, keyframes, curves, GPU effects and real video export, with no watermark and no subscription.

## Features

- **Layers:** text, rectangles, ellipses, polygons, stars, freehand drawings, photos, videos, audio, nulls (for grouping and parenting) and adjustment layers.
- **Keyframes on every property:** tap ◆ to animate a property. After that, dragging on the canvas or changing a value adds keyframes automatically.
- **Easing:** 10 easing presets (back, elastic, bounce, hold and more) plus a draggable bézier curve editor.
- **Motion paths:** shown on the canvas for animated positions.
- **Expressions (sandboxed):** `wiggle(2, 30)`, `value + time*90`, `loop()`, `pingpong()`, `random()`, `linear()`, vector math and conditions. Project files can't run arbitrary code.
- **175 effects, covering every effect in Alight Motion's A–Z list** (all 169 names), plus Drop Shadow, Outline, Duotone, Glitch, Scanlines and Color Adjust.
  - Every effect parameter can be keyframed or driven by an expression.
  - A searchable picker groups them into 13 categories:
    - Blur & Sharpen (Gaussian, lens, spin, unsharp mask, per-layer motion blur…)
    - Glow & Light (glow, lens flare, lightning, rays, bevel, long shadow, frosted glass…)
    - Color (gradient map, palette map, channel remap, spot color, iridescence…)
    - Keying & Matte (chroma key, luma key, matte choker…)
    - Distort (curl, displacement map, polar coordinates, tunnel, wave warp…)
    - Generate (checker, clouds, starfield, voronoi, contour lines, heart, star…)
    - Stylize (CMYK halftone, mosaic, block noise…)
    - Tiles & Repeat (hexagon tilings, linear/radial/grid/scatter repeat, repeat along a path)
    - Transition (dissolve, radial wipe…)
    - 3D & Perspective (box, cube, cylinder, torus, pyramid and more, raymarched on the GPU with the layer mapped onto them, plus 360° viewer/reorient)
    - Motion (oscillate, swing, jitter, echo keyframes, time quantization, move along a path…)
    - Text (progress, randomizer, transform, count up/down, timecode)
    - Shape (drawing progress, stroke color, stroke taper)
  - Effects such as Displacement Map, Move Along Path and Repeat Along Path take another layer as their map or path.
  - The implementations are Xmotion's own. They are named after the matching Alight Motion effects and do the same job, but their controls and exact looks differ.
- **Text animators:** typewriter, fade, pop, slide up, drop and bounce, decode/scramble, and blur-in. Each works per letter, word or line. Text also has a wave option, 20 Google Fonts, and custom font import (.ttf/.otf/.woff).
- **Shapes:** trim paths (draw-on strokes), rounded corners, and linear/radial gradients.
- **Compositing:** 17 blend modes, clipping masks ("clip to layer below"), and parenting.
- **Motion blur:** real sub-frame motion blur with an adjustable shutter angle.
- **One-tap animation presets:** In, Out, Loop and Text.
- **Timeline:**
  - Swipe to scrub with a fixed center playhead, and pinch to zoom.
  - Drag clips to move them; trim handles keep the content in place.
  - Split, duplicate, and copy/paste layers.
- **Export:**
  - MP4 (H.264), WebM, GIF and PNG, up to 4K.
  - Rendered frame by frame, so frames are exact and every effect is included.
  - Audio from videos and music is mixed in, with volume and fades.
  - On iPhone, the finished file opens the share sheet, so you can save it to Photos or post it to TikTok/Instagram. It's also saved in Files › Xmotion › Exports.
- **Projects:** autosaved on the device, with templates included. You can share a project as an `.xmotion` file (media embedded) and import it on another device.
- **Other:** undo/redo, keyboard shortcuts for iPad keyboards and desktop, and drag-and-drop import on desktop.

## Get the iPhone app (.ipa)

Building an `.ipa` needs Xcode on macOS. A GitHub Actions workflow does this for you.

1. Open the repo on GitHub, then **Actions › Build iOS app (.ipa)**. It runs automatically on every push that changes the app (any branch), and you can also start it with **Run workflow** on `main`. Builds from `v*` tags are attached to a GitHub Release.
2. When the run finishes, download the **Xmotion-ipa** artifact and unzip it to get `Xmotion.ipa`.

The CI build is **unsigned**. iOS only installs signed apps, so pick one of these options.

| Option | Cost | Notes |
| --- | --- | --- |
| [Sideloadly](https://sideloadly.io) (Windows/Mac) | Free Apple ID | Plug in your iPhone, drop in the `.ipa`, sign in. Free-account apps expire after 7 days; re-sign to renew. |
| [AltStore](https://altstore.io) | Free Apple ID | Same 7-day limit. AltStore can refresh the app automatically over Wi-Fi. |
| Xcode + Apple Developer Program | $99/year | Open the project (below), set your Team under *Signing & Capabilities*, then use **Product › Archive** and distribute via TestFlight, Ad Hoc or the App Store. |

On iOS 16 and later, the first install also needs **Settings › Privacy & Security › Developer Mode** turned on.

### Build on a Mac yourself

```bash
npm install
npm run ios        # builds the web app, syncs it into ios/, opens Xcode
```

In Xcode, select your Team under the **App** target's *Signing & Capabilities*, choose your iPhone and press **Run**.

### Without installing anything

Host the `dist/` folder on any static host (for example GitHub Pages), open it in Safari, then **Share › Add to Home Screen**. It runs as a full-screen web app and works offline after the first load.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (use your phone on the same Wi-Fi with --host)
npm test           # unit tests (expressions, easing, keyframes)
npm run build      # typecheck + production build into dist/
```

### How it's built

- `src/model`: plain data and math with no DOM.
  - Project/layer types, property schema, keyframe evaluation, easing and bezier curves.
  - The sandboxed expression language (`expr.ts`, which is a parser plus an interpreter rather than `eval`).
  - Animation presets and templates.
- `src/engine`: rendering and media.
  - `renderer.ts`: Canvas 2D compositor with blend modes, clipping, adjustment layers and motion blur.
  - `gl.ts`/`effects.ts`: WebGL shader effects.
  - `exporter.ts`: frame-accurate export using WebCodecs through [mediabunny](https://mediabunny.dev); GIF uses gifenc.
  - `media.ts`: media decoding. `audio.ts`: Web Audio playback and offline mixdown. `storage.ts`: IndexedDB projects and assets.
- `src/state/store.ts`: zustand store with undo/redo history (immer), keyframe-aware editing and the playback clock.
- `src/ui`: React UI.
  - Layout is phone-first: preview on top, timeline below, and bottom sheets for properties, adding layers and export.
  - On iPad landscape and desktop it switches to three panes.
- `ios/`: the Capacitor iOS shell. Native plugins handle sharing exports, writing files and haptics.

## Known limitations

- The iOS app requires **iOS 16.4 or later** (the first iOS with WebCodecs video encoding). On older Safari versions without a native AAC encoder, a bundled WASM AAC encoder is loaded automatically so exports still have sound.
- Google Fonts download on first use; offline, text falls back to the system font until the font has been cached.
- There are no true 3D layers or cameras yet; the 3D effects render the layer onto 3D objects. There are no shape masks either; clipping masks, mattes and keying cover most masking needs.
- Effects run on the GPU at preview resolution. Stacking many heavy effects (3D objects, lens blur) on 4K comps will lower the preview frame rate on older phones, but exports are always rendered at full quality.
