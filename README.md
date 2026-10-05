# Xmotion

A keyframe motion-graphics and video editor for **iPhone and iPad** (also runs in any modern browser). It's built to compete with Alight Motion: layers, keyframes, curves, GPU effects and real video export, with no watermark and no subscription.

## Features

- **Layers:** text, rectangles, ellipses, polygons, stars, freehand drawings, photos, videos, audio, nulls, adjustment layers, groups and cameras.
- **Groups:** select several layers (long-press or Ctrl-click in the timeline) and tap **Group**. Groups nest, collapse in the timeline, move their contents with them, and take their own opacity, blend mode, effects, mask and time remapping. Double-tap a group on the canvas to pick a layer inside it; **Ungroup** keeps everything where it was.
- **Masks:** any layer can be an alpha, inverted alpha, luma or inverted luma mask. A mask hides everything below it in the same group, so grouping a mask with a few layers limits it to them. Its opacity sets the mask strength, and its effects (blur, for example) feather it.
- **3D layers and cameras:** turn on **3D** for a layer to get Z position and X/Y rotation, seen in perspective. Add a **Camera** (pan, tilt, roll, zoom, position and Z, all keyframeable, and it can be parented to a null) or use the default camera. 3D layers sort by depth, and effects run on the layer before it's projected.
- **Keyframes on every property:** tap ◆ to animate a property. After that, dragging on the canvas or changing a value adds keyframes automatically.
- **Easing and graphs:** 10 easing presets (back, elastic, bounce, hold and more), a bézier curve editor, and a **graph editor** with value and speed curves where you drag keyframes and bézier handles directly.
- **Time remapping:** keyframe a layer's (or a group's) own clock to freeze, slow down, speed up or reverse it.
- **Transform:** position, scale, rotation, opacity, skew with a skew axis, and an anchor point (pivot) you can drag with the **Anchor tool** or snap to 9 presets without the layer moving.
- **Parenting:** parent a layer to another layer or a null in the same group; it follows the parent's position, rotation and scale.
- **Copy and paste:** layers (between projects too, media included), effects, and single property values or keyframes (tap a property's name for **Copy / Paste / Reset / Show in graph editor**).
- **Elements:** save layers or groups to a library on the device and drop them into any project from **Add › Elements**.
- **Grid, guides and snapping:** grid, rule of thirds, title/action safe areas, draggable guides, and snapping to the comp, guides, grid and other layers.
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
- **Compositing:** 17 blend modes and clipping masks ("clip to layer below"), on top of the masks above.
- **Motion blur:** real sub-frame motion blur with an adjustable shutter angle.
- **One-tap animation presets:** In, Out, Loop and Text.
- **Timeline:**
  - Swipe to scrub with a fixed center playhead, and pinch to zoom.
  - Drag clips to move them; trim handles keep the content in place.
  - Drag layers by their icon to reorder them or move them into and out of groups.
  - Split, duplicate, and copy/paste layers.
- **Export:**
  - MP4 (H.264), WebM, GIF, PNG, and PNG or JPEG image sequences (zipped), up to 4K.
  - Rendered frame by frame, so frames are exact and every effect is included.
  - Audio from videos and music is mixed in, with volume and fades.
  - On iPhone, the finished file opens the share sheet, so you can save it to Photos or post it to TikTok/Instagram. It's also saved in Files › Xmotion › Exports.
- **Projects:** autosaved on the device, with templates included. You can share a project as an `.xmotion` file (media embedded) and import it on another device.
- **Other:** undo/redo, keyboard shortcuts for iPad keyboards and desktop (Ctrl+G group, Ctrl+Shift+G ungroup, Y anchor tool and more), drag-and-drop import on desktop, and a **Learn** path in Help (Keyframes → Easing → Graphs → Parenting → Nulls → Masks → Blending → Camera → Motion Blur → Effects).

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

## Use it in Safari (no install)

No computer, Apple ID or re-signing is needed. The web version is the same app running in Safari.

1. Open **https://bgam93756-byte.github.io/Xmotion/** in Safari on your iPhone or iPad (iOS 16.4 or later).
2. Tap **Share › Add to Home Screen**. Xmotion then opens full screen from its icon and works offline after the first load.
3. Open it from that icon from now on. The Home Screen app keeps its own projects, separate from Safari tabs and from the .ipa app. To move a project between them, use **Share project file** (in a project's menu on the Home screen, it makes an `.xmotion` file) and **Import project**.

Exports work the same way: when one finishes, tap **Share / Save to Photos**, then **Save Video**.

**One-time setup (repository owner):** in the repository on GitHub, open **Settings › Pages**. Under *Build and deployment* choose **Deploy from a branch**, pick **gh-pages** and **/ (root)**, and tap **Save**. After about a minute the site is live. The **Publish web app (GitHub Pages)** workflow rebuilds the `gh-pages` branch on every push that changes the app, so the site always shows the latest push.

You can also host the `dist/` folder from `npm run build` on any other static host.

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (use your phone on the same Wi-Fi with --host)
npm test           # unit tests (expressions, easing, keyframes)
npm run build      # typecheck + production build into dist/
```

### How it's built

- `src/model`: plain data and math with no DOM.
  - Project/layer types, the layer tree (`tree.ts`: groups hold children), property schema, keyframe evaluation, easing and bezier curves.
  - The sandboxed expression language (`expr.ts`, which is a parser plus an interpreter rather than `eval`).
  - Animation presets and templates.
- `src/engine`: rendering and media.
  - `renderer.ts`: Canvas 2D compositor with groups (rendered in isolation), masks, blend modes, clipping, adjustment layers, motion blur, and 3D layers drawn flat and then warped into perspective on the GPU.
  - `transform.ts`/`camera.ts`: layer matrices (2D and 3D), group and time-remap clocks, hit testing, and the camera projection.
  - `gl.ts`/`effects.ts`: WebGL shader effects.
  - `exporter.ts`: frame-accurate export using WebCodecs through [mediabunny](https://mediabunny.dev); GIF uses gifenc; image sequences are zipped by `zip.ts`.
  - `media.ts`: media decoding. `audio.ts`: Web Audio playback and offline mixdown. `storage.ts`: IndexedDB projects and assets.
- `src/state/store.ts`: zustand store with undo/redo history (immer), keyframe-aware editing, grouping, clipboards and the playback clock. `elements.ts` is the Elements library.
- `src/ui`: React UI.
  - Layout is phone-first: preview on top, timeline below, and bottom sheets for properties, adding layers and export.
  - On iPad landscape and desktop it switches to three panes.
- `ios/`: the Capacitor iOS shell. Native plugins handle sharing exports, writing files and haptics.

## Known limitations

- The iOS app requires **iOS 16.4 or later** (the first iOS with WebCodecs video encoding). On older Safari versions without a native AAC encoder, a bundled WASM AAC encoder is loaded automatically so exports still have sound.
- Google Fonts download on first use; offline, text falls back to the system font until the font has been cached.
- 3D layers are flat cards: they sort by depth but don't cut through each other, and there are no lights or extruded 3D text. A 2D layer parented to a 3D layer is drawn flat. Groups themselves are 2D (put 3D layers inside them, or parent 3D layers to a 3D null).
- Audio of time-remapped clips (or clips inside a time-remapped group) is left out of playback and export.
- Image sequences are zipped in memory, so very long full-resolution PNG sequences can run out of memory on a phone; shorten the range or use JPEG.
- Effects run on the GPU at preview resolution. Stacking many heavy effects (3D objects, lens blur) on 4K comps will lower the preview frame rate on older phones, but exports are always rendered at full quality.
