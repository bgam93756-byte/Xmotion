import { describe, expect, it } from 'vitest';
import { CATEGORIES, EFFECT_SPECS, SPEC } from '../src/effects';

/** Every effect from Alight Motion's A–Z list, by display name. */
const ALIGHT = `360º Reorient Sphere|360º Viewer|Auto-Shake|Bend|Blink|Block Dissolve|Block Noise|Box|Box Blur|Brightness / Contrast|Bump Map|CMYK Halftone Dots|Channel Remap (HSV)|Channel Remap (RGB)|Checker|Chroma Key|Circular Ripple|Clouds|Color Temperature|Color Tune|Colorize|Contour Gradient|Contour Lines|Contour Strips|Copy Background|Count Up/Down|Cube|Curl|Cylinder|Dark Glow|Directional Blur|Displacement Map|Dissolve|Dots|Drawing Progress|Echo Keyframes|Edge Glow|Electric Edges|Ellipsoid|Exposure / Gamma|Fade In/Out|Feather|Fill Behind|Find Edges|Flicker|Flip Layer|Four-color Gradient|Fractal Ridges|Fractal Warp|Gaussian Blur|Glass|Glow|Glow Scan|Gradient Map|Gradient Overlay|Grid|Grid Repeat|Halftone Dots|Halftone Lines|Heart|Hexagon Array|Hexagon Tile Rotate|Hexagon Tile Shift|Hexagon Tiling|Hexagonal Prism|Highlights and Shadows|Hollow Box|Hot Color|Hue Shift|Inner Blur|Inner Glow|Inner Pinch/Bulge|Invert|Iridescence|Kaleidoscope|Lens Blur|Lens Flare|Light Glow|Lightning|Linear Repeat|Linear Streaks|Long Shadow|Luma Key|Magnify Background|Mask Blur|Matte Choker|Mirror|Mosaic|Motion Blur|Move Along Path|Noise|Octahedron|Offset|Omino Diffusion+|Omino Glass|Oscillate|Palette Map|Pinch/Bulge|Pixelate|Polar Coordinates|Polar Displacement Map|Posterize|Precise Box Blur|Pulse Opacity|Pulse Size|Pyramid|RGB Split|Radial Rays|Radial Repeat|Radial Shadow|Radial Wipe|Random Displacement|Random Jitter|Raster Extrude|Rays|Repeat|Repeat Along Path|Replace Color|Ribbon|Roughen Edges|Saturation / Vibrance|Scatter Repeat|Sharpen|Simple Starfield|Smooth Bevel|Smooth Edges|Soft Glow|Solid Color|Solid Matte|Spectral Map|Spherize|Spin|Spin Blur|Spin Streaks|Spot Color|Squeeze|Star|Star Polyhedron|Star Prism|Starfield|Stretch Axis|Stretch Segment|Stripes|Stroke Color|Stroke Taper|Swing|Swirl|Text Progress|Text Randomizer|Text Spacing|Text Transform|Three-axis Cross|Threshold|Tile Rotate|Tile Shift|Tiles|Time Quantization|Timecode|Torus|Tunnel|Turbulence|Turbulent Displace|Unsharp Mask|Vignette|Voronoi Cells|Wave Warp|Wipe|Zoom Blur|Zoom Streaks`.split('|');

describe('effect catalog', () => {
  it('covers every Alight Motion effect by name', () => {
    const labels = new Set(EFFECT_SPECS.map((s) => s.label));
    const missing = ALIGHT.filter((name) => !labels.has(name));
    expect(missing).toEqual([]);
    expect(ALIGHT.length).toBe(169);
  });

  it('has unique types and labels', () => {
    expect(new Set(EFFECT_SPECS.map((s) => s.type)).size).toBe(EFFECT_SPECS.length);
    expect(new Set(EFFECT_SPECS.map((s) => s.label)).size).toBe(EFFECT_SPECS.length);
  });

  it('gives every effect an implementation, a known category and valid params', () => {
    for (const s of EFFECT_SPECS) {
      const impl = [s.passes, s.apply, s.transform, s.opacity, s.time, s.render, s.shape, s.text].filter(Boolean).length;
      expect(impl, s.type).toBeGreaterThan(0);
      expect(CATEGORIES, s.type).toContain(s.category);
      expect(s.description.length, s.type).toBeGreaterThan(5);
      const keys = s.props.map((p) => p.key);
      expect(new Set(keys).size, s.type).toBe(keys.length);
      for (const p of s.props) {
        if (p.options) expect(typeof p.def, `${s.type}.${p.key}`).toBe('number');
        if (p.kind === 'color') expect(p.def, `${s.type}.${p.key}`).toMatch(/^#[0-9a-f]{6,8}$/i);
      }
    }
    expect(SPEC.glow.label).toBe('Glow');
  });
});
