import type { AssetKind, AssetMeta, Layer, Project } from '../model/types';
import { allLayers } from '../model/tree';
import { activeAt, isRetimed, mediaClock } from './transform';
import { uid } from '../model/ids';
import { registerFontFile } from './fonts';

interface Loaded {
  meta: AssetMeta;
  blob: Blob;
  url: string;
  image?: HTMLImageElement;
  audio?: Promise<AudioBuffer | null>;
  peaks?: Float32Array;
}

let decodeCtx: AudioContext | null = null;
function audioDecoder(): BaseAudioContext {
  // A tiny offline context decodes without needing a user gesture.
  if (!decodeCtx) {
    try {
      decodeCtx = new AudioContext({ sampleRate: 48000 });
      void decodeCtx.suspend();
    } catch {
      return new OfflineAudioContext(2, 1, 48000);
    }
  }
  return decodeCtx;
}

export function kindOf(file: { type: string; name: string }): AssetKind | null {
  const t = file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) return 'image';
  if (t.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext)) return 'video';
  if (t.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  if (t.startsWith('font/') || ['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not load image'));
    img.src = url;
  });
}

function probeVideo(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => res({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => rej(new Error('This video format is not supported by your browser'));
    v.src = url;
  });
}

/**
 * Registry of decoded media: images, per-layer <video> elements for preview,
 * decoded audio buffers, and (during export) frame overrides decoded by WebCodecs.
 */
export class MediaRegistry {
  private assets = new Map<string, Loaded>();
  private videos = new Map<string, HTMLVideoElement>();
  private listeners = new Set<() => void>();
  /** Set by the exporter: layerId -> exact decoded frame for the current export frame. */
  frameOverrides: Map<string, CanvasImageSource> | null = null;

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  has(id: string) {
    return this.assets.has(id);
  }

  get(id: string | undefined) {
    return id ? this.assets.get(id) : undefined;
  }

  blobOf(id: string) {
    return this.assets.get(id)?.blob;
  }

  /** Probes a file and returns its metadata (without registering it). */
  async probe(file: File): Promise<AssetMeta> {
    const kind = kindOf(file);
    if (!kind) throw new Error(`Unsupported file: ${file.name}`);
    const meta: AssetMeta = { id: uid('A'), name: file.name, kind, mime: file.type };
    const url = URL.createObjectURL(file);
    try {
      if (kind === 'image') {
        const img = await loadImage(url);
        meta.width = img.naturalWidth || 512;
        meta.height = img.naturalHeight || 512;
      } else if (kind === 'video') {
        Object.assign(meta, await probeVideo(url));
      } else if (kind === 'audio') {
        const buf = await audioDecoder().decodeAudioData(await file.arrayBuffer());
        meta.duration = buf.duration;
      } else if (kind === 'font') {
        meta.fontFamily = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      }
    } finally {
      URL.revokeObjectURL(url);
    }
    return meta;
  }

  async register(meta: AssetMeta, blob: Blob): Promise<void> {
    if (this.assets.has(meta.id)) return;
    const url = URL.createObjectURL(blob);
    const entry: Loaded = { meta, blob, url };
    this.assets.set(meta.id, entry);
    try {
      if (meta.kind === 'image') entry.image = await loadImage(url);
      if (meta.kind === 'font' && meta.fontFamily) await registerFontFile(meta.fontFamily, await blob.arrayBuffer());
      if (meta.kind === 'audio' || meta.kind === 'video') void this.audioBuffer(meta.id);
    } catch (e) {
      console.warn('Asset failed to load', meta.name, e);
    }
    this.notify();
  }

  image(id: string | undefined): HTMLImageElement | undefined {
    return this.get(id)?.image;
  }

  /** Decoded audio for an asset (null when the file has no decodable audio). */
  audioBuffer(id: string): Promise<AudioBuffer | null> {
    const a = this.assets.get(id);
    if (!a) return Promise.resolve(null);
    if (!a.audio) {
      a.audio = a.blob
        .arrayBuffer()
        .then((data) => audioDecoder().decodeAudioData(data))
        .then((buf) => {
          a.peaks = computePeaks(buf, 2000);
          this.notify();
          return buf;
        })
        .catch(() => null);
    }
    return a.audio;
  }

  /** Normalized waveform peaks (for timeline drawing), once decoded. */
  peaks(id: string | undefined): Float32Array | undefined {
    return this.get(id)?.peaks;
  }

  /** Preview <video> element for a layer (one per layer so clips can play independently). */
  video(layer: Layer): HTMLVideoElement | undefined {
    const a = this.get(layer.asset);
    if (!a || a.meta.kind !== 'video') return undefined;
    let v = this.videos.get(layer.id);
    if (!v || v.dataset.asset !== a.meta.id) {
      v?.pause();
      v = document.createElement('video');
      v.dataset.asset = a.meta.id;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.src = a.url;
      v.addEventListener('seeked', () => this.notify());
      v.addEventListener('loadeddata', () => this.notify());
      this.videos.set(layer.id, v);
    }
    return v;
  }

  /** The image source to draw for a media layer (preview element, or the exporter's exact frame). */
  frame(layer: Layer): { src: CanvasImageSource; w: number; h: number } | null {
    const a = this.get(layer.asset);
    if (!a) return null;
    if (a.meta.kind === 'image') {
      return a.image ? { src: a.image, w: a.meta.width ?? a.image.naturalWidth, h: a.meta.height ?? a.image.naturalHeight } : null;
    }
    if (a.meta.kind !== 'video') return null;
    const w = a.meta.width ?? 640;
    const h = a.meta.height ?? 360;
    const override = this.frameOverrides?.get(layer.id);
    if (override) return { src: override, w, h };
    const v = this.video(layer);
    if (!v || v.readyState < 2) return null;
    return { src: v, w, h };
  }

  /** Keeps preview video elements in sync with the playhead. */
  syncVideos(project: Project, t: number, playing: boolean) {
    const live = new Set<string>();
    for (const layer of allLayers(project)) {
      if (layer.type !== 'video') continue;
      live.add(layer.id);
      const v = this.video(layer);
      if (!v) continue;
      const active = activeAt(project, layer, t);
      const target = sourceTime(layer, mediaClock(project, layer, t));
      if (!active) {
        if (!v.paused) v.pause();
        continue;
      }
      const speed = layer.speed ?? 1;
      if (playing && !isRetimed(project, layer)) {
        if (v.playbackRate !== speed) v.playbackRate = Math.min(16, Math.max(0.0625, speed));
        if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
        if (v.paused) void v.play().catch(() => undefined);
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.5 / project.fps && !v.seeking) v.currentTime = target;
      }
    }
    // Drop elements of deleted layers.
    for (const [id, v] of this.videos) {
      if (!live.has(id)) {
        v.pause();
        v.removeAttribute('src');
        v.load();
        this.videos.delete(id);
      }
    }
  }

  pauseAll() {
    this.videos.forEach((v) => v.pause());
  }

  clear() {
    this.pauseAll();
    this.videos.clear();
    for (const a of this.assets.values()) URL.revokeObjectURL(a.url);
    this.assets.clear();
  }
}

/** Source-media time shown by a media layer at time t on its own clock. */
export function sourceTime(layer: Layer, t: number): number {
  return Math.max(0, (layer.trimIn ?? 0) + (t - layer.start) * (layer.speed ?? 1));
}

function computePeaks(buf: AudioBuffer, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / buckets));
  let max = 0;
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const s = b * step;
    for (let i = s; i < s + step && i < ch.length; i += 4) peak = Math.max(peak, Math.abs(ch[i]));
    out[b] = peak;
    max = Math.max(max, peak);
  }
  if (max > 0) for (let b = 0; b < buckets; b++) out[b] /= max;
  return out;
}

export const media = new MediaRegistry();
