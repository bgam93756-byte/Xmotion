import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type Quality,
  type WrappedCanvas,
} from 'mediabunny';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { Layer, Project } from '../model/types';
import { mixdown } from './audio';
import { waitForFonts } from './fonts';
import { media, sourceTime } from './media';
import { Renderer, free } from './renderer';

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png';
export type ExportQuality = 'low' | 'medium' | 'high' | 'max';

export interface ExportOptions {
  format: ExportFormat;
  /** Output size relative to the comp size. */
  scale: number;
  fps: number;
  quality: ExportQuality;
  from: number;
  to: number;
  transparent?: boolean;
}

export type Progress = (fraction: number, label: string) => void;

const QUALITY: Record<ExportQuality, Quality> = {
  low: QUALITY_LOW,
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
  max: QUALITY_VERY_HIGH,
};

export function supportsVideoExport() {
  return typeof VideoEncoder !== 'undefined';
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function safeName(name: string) {
  return name.replace(/[^\w\- ]+/g, '').trim() || 'xmotion';
}

function abortError() {
  return new DOMException('Export canceled', 'AbortError');
}

/** Frame-accurate decoders for video layers (WebCodecs), with <video> seeking as a fallback. */
class VideoFrames {
  private iters = new Map<string, AsyncGenerator<WrappedCanvas | null>>();
  private fallback = new Map<string, HTMLVideoElement>();
  private inputs: Input[] = [];

  constructor(
    private project: Project,
    private times: number[],
  ) {}

  async init() {
    for (const layer of this.project.layers) {
      if (layer.type !== 'video' || !layer.visible) continue;
      const blob = media.blobOf(layer.asset ?? '');
      if (!blob) continue;
      const stamps = this.times.filter((t) => t >= layer.start && t < layer.end).map((t) => sourceTime(layer, t));
      if (!stamps.length) continue;
      try {
        const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
        this.inputs.push(input);
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) throw new Error('cannot decode');
        const sink = new CanvasSink(track, { poolSize: 3 });
        this.iters.set(layer.id, sink.canvasesAtTimestamps(stamps));
      } catch {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.src = URL.createObjectURL(blob);
        await new Promise((r) => {
          v.onloadeddata = r;
          v.onerror = r;
        });
        this.fallback.set(layer.id, v);
      }
    }
  }

  /** Sets media.frameOverrides for every active video layer at comp time t. */
  async prepare(t: number) {
    const map = new Map<string, CanvasImageSource>();
    for (const layer of this.project.layers) {
      if (layer.type !== 'video' || t < layer.start || t >= layer.end) continue;
      const it = this.iters.get(layer.id);
      if (it) {
        const r = await it.next();
        const wrapped = r.done ? null : r.value;
        if (wrapped) map.set(layer.id, wrapped.canvas as CanvasImageSource);
        continue;
      }
      const v = this.fallback.get(layer.id);
      if (v) {
        await seek(v, sourceTime(layer, t));
        map.set(layer.id, v);
      }
    }
    media.frameOverrides = map;
  }

  async dispose() {
    media.frameOverrides = null;
    for (const it of this.iters.values()) await it.return(undefined).catch(() => undefined);
    for (const input of this.inputs) (input as unknown as { dispose?: () => void }).dispose?.();
    for (const v of this.fallback.values()) URL.revokeObjectURL(v.src);
  }
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return res();
    const done = () => {
      v.removeEventListener('seeked', done);
      res();
    };
    v.addEventListener('seeked', done);
    v.currentTime = t;
    setTimeout(done, 2000);
  });
}

function fontsOf(project: Project) {
  return project.layers
    .filter((l: Layer) => l.type === 'text')
    .map((l) => ({ family: l.font ?? 'Inter', weight: l.weight ?? 400, italic: !!l.italic }));
}

export async function exportProject(project: Project, opts: ExportOptions, onProgress: Progress, signal: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  await waitForFonts(fontsOf(project));
  const renderer = new Renderer();
  const canvas = document.createElement('canvas');
  const name = safeName(project.name);

  if (opts.format === 'png') {
    const frames = new VideoFrames(project, [opts.from]);
    await frames.init();
    await frames.prepare(opts.from);
    renderer.render(project, opts.from, canvas, { scale: opts.scale, transparent: opts.transparent, motionBlur: true });
    await frames.dispose();
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
    renderer.dispose();
    free(canvas);
    return { blob, filename: `${name}.png` };
  }

  const fps = opts.fps;
  const count = Math.max(1, Math.round((opts.to - opts.from) * fps));
  const times = Array.from({ length: count }, (_, i) => opts.from + i / fps);
  const frames = new VideoFrames(project, times);
  onProgress(0, 'Preparing media…');
  await frames.init();

  // Render at an even size: H.264 requires it.
  const scale = opts.scale;
  const W = even(project.width * scale);
  const H = even(project.height * scale);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d', { willReadFrequently: opts.format === 'gif' })!;
  const renderFrame = async (t: number) => {
    await frames.prepare(t);
    renderer.render(project, t, canvas, { scale, transparent: opts.transparent, motionBlur: true });
    octx.clearRect(0, 0, W, H);
    octx.drawImage(canvas, 0, 0, W, H);
  };

  try {
    if (opts.format === 'gif') {
      const gif = GIFEncoder();
      const delay = Math.round(1000 / fps);
      for (let i = 0; i < count; i++) {
        if (signal.aborted) throw abortError();
        await renderFrame(times[i]);
        const { data } = octx.getImageData(0, 0, W, H);
        const palette = quantize(data, 256, { format: opts.transparent ? 'rgba4444' : 'rgb565' });
        const index = applyPalette(data, palette, opts.transparent ? 'rgba4444' : 'rgb565');
        gif.writeFrame(index, W, H, { palette, delay, transparent: !!opts.transparent });
        onProgress((i + 1) / count, `Frame ${i + 1} / ${count}`);
        if (i % 4 === 0) await new Promise((r) => setTimeout(r));
      }
      gif.finish();
      return { blob: new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' }), filename: `${name}.gif` };
    }

    if (!supportsVideoExport()) throw new Error('Video export needs WebCodecs (Chrome, Edge, Safari 17+ or Firefox 130+).');
    const isMp4 = opts.format === 'mp4';
    const format = isMp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
    const quality = QUALITY[opts.quality];
    const vcodec = await getFirstEncodableVideoCodec(isMp4 ? ['avc', 'hevc', 'av1', 'vp9'] : ['vp9', 'vp8', 'av1'], { width: W, height: H, bitrate: quality });
    if (!vcodec) throw new Error(`Your browser can't encode ${opts.format.toUpperCase()} video at ${W}×${H}. Try a smaller size or the other format.`);
    const output = new Output({ format, target: new BufferTarget() });
    const videoSource = new CanvasSource(out, { codec: vcodec, bitrate: quality, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });

    onProgress(0, 'Mixing audio…');
    const audio = await mixdown(project, opts.from, opts.to);
    let audioSource: AudioBufferSource | null = null;
    if (audio) {
      const acodec = await getFirstEncodableAudioCodec(isMp4 ? ['aac', 'opus'] : ['opus', 'vorbis'], {
        numberOfChannels: 2,
        sampleRate: audio.sampleRate,
      });
      if (acodec) {
        audioSource = new AudioBufferSource({ codec: acodec, bitrate: QUALITY_HIGH });
        output.addAudioTrack(audioSource);
      }
    }
    await output.start();
    try {
      for (let i = 0; i < count; i++) {
        if (signal.aborted) throw abortError();
        await renderFrame(times[i]);
        await videoSource.add(i / fps, 1 / fps);
        onProgress(((i + 1) / count) * 0.97, `Frame ${i + 1} / ${count}`);
        if (i % 8 === 0) await new Promise((r) => setTimeout(r));
      }
      videoSource.close();
      if (audioSource && audio) {
        await audioSource.add(audio);
        audioSource.close();
      }
      onProgress(0.98, 'Finalizing…');
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => undefined);
      throw e;
    }
    const buffer = (output.target as BufferTarget).buffer!;
    return { blob: new Blob([buffer], { type: format.mimeType }), filename: `${name}.${format.fileExtension.replace('.', '')}` };
  } finally {
    await frames.dispose();
    renderer.dispose();
    free(canvas);
    free(out);
  }
}
