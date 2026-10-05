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
  canEncodeAudio,
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
import { allLayers } from '../model/tree';
import { activeAt, mediaClock } from './transform';
import { Renderer, free } from './renderer';
import { ZIP_MAX_FILES, ZipLimitError, ZipWriter } from './zip';

/** 'png-seq' / 'jpg-seq': every frame as an image file, in a .zip. */
export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png' | 'png-seq' | 'jpg-seq';
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

const QUALITY_LEVEL: Record<ExportQuality, number> = { low: 0.25, medium: 0.5, high: 0.75, max: 1 };
const CODEC_EFFICIENCY: Record<string, number> = { avc: 1, hevc: 0.6, vp9: 0.6, av1: 0.4, vp8: 1.2 };

/** Bitrate for high frame rates: mediabunny's per-quality rate, grown with the frame rate. */
function highFpsBitrate(codec: string, w: number, h: number, fps: number, q: ExportQuality): number {
  const base = 3_000_000 * Math.pow((w * h) / (1920 * 1080), 0.95) * (CODEC_EFFICIENCY[codec] ?? 1);
  const factor = 0.3 * Math.exp(2.5538 * QUALITY_LEVEL[q]);
  return Math.ceil((base * factor * Math.sqrt(fps / 30)) / 1000) * 1000;
}

/**
 * H.264 codec string with a level that allows the frame size *and* rate
 * (macroblocks per second); 1080p at 120 fps needs level 5.1.
 */
function avcCodecString(w: number, h: number, fps: number): string {
  const frame = Math.ceil(w / 16) * Math.ceil(h / 16);
  const perSecond = frame * fps;
  // [level_idc, max macroblocks per frame, max macroblocks per second]
  const levels: [number, number, number][] = [
    [0x1f, 3600, 108000],
    [0x20, 5120, 216000],
    [0x28, 8192, 245760],
    [0x2a, 8704, 522240],
    [0x32, 22080, 589824],
    [0x33, 36864, 983040],
    [0x34, 36864, 2073600],
    [0x3c, 139264, 4177920],
    [0x3d, 139264, 8355840],
    [0x3e, 139264, 16711680],
  ];
  const level = levels.find(([, f, m]) => frame <= f && perSecond <= m) ?? levels[levels.length - 1];
  return `avc1.6400${level[0].toString(16).padStart(2, '0')}`;
}

export function supportsVideoExport() {
  return typeof VideoEncoder !== 'undefined';
}

export const isSequence = (format: ExportFormat) => format === 'png-seq' || format === 'jpg-seq';

/** Number of frames rendered for a range at a frame rate. */
export function frameCount({ from, to, fps }: Pick<ExportOptions, 'from' | 'to' | 'fps'>) {
  return Math.max(1, Math.round((to - from) * fps));
}

/** One image file per frame, so a sequence can't have more frames than a ZIP holds files. */
export const MAX_SEQUENCE_FRAMES = ZIP_MAX_FILES;

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
    for (const layer of allLayers(this.project)) {
      if (layer.type !== 'video' || !layer.visible) continue;
      const blob = media.blobOf(layer.asset ?? '');
      if (!blob) continue;
      const stamps = this.times.filter((t) => activeAt(this.project, layer, t)).map((t) => sourceTime(layer, mediaClock(this.project, layer, t)));
      // The decoder walks forward only; retimed clips that run backwards use seeking.
      const forward = stamps.every((s, i) => i === 0 || s >= stamps[i - 1]);
      if (!stamps.length) continue;
      try {
        if (!forward) throw new Error('non-monotonic');
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
    for (const layer of allLayers(this.project)) {
      if (layer.type !== 'video' || !activeAt(this.project, layer, t)) continue;
      const it = this.iters.get(layer.id);
      if (it) {
        const r = await it.next();
        const wrapped = r.done ? null : r.value;
        if (wrapped) map.set(layer.id, wrapped.canvas as CanvasImageSource);
        continue;
      }
      const v = this.fallback.get(layer.id);
      if (v) {
        await seek(v, sourceTime(layer, mediaClock(this.project, layer, t)));
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

function encode(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error(`${type === 'image/png' ? 'PNG' : 'JPEG'} failed`))), type, quality));
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
  return allLayers(project)
    .filter((l: Layer) => l.type === 'text')
    .map((l) => ({ family: l.font ?? 'Inter', weight: l.weight ?? 400, italic: !!l.italic }));
}

export async function exportProject(project: Project, opts: ExportOptions, onProgress: Progress, signal: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  if (isSequence(opts.format) && frameCount(opts) > MAX_SEQUENCE_FRAMES) {
    throw new Error(`An image sequence can have at most ${MAX_SEQUENCE_FRAMES.toLocaleString()} frames. Lower the frame rate or shorten the project.`);
  }
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
    const blob = await encode(canvas, 'image/png');
    renderer.dispose();
    free(canvas);
    return { blob, filename: `${name}.png` };
  }

  const fps = opts.fps;
  const count = frameCount(opts);
  const times = Array.from({ length: count }, (_, i) => opts.from + i / fps);
  const frames = new VideoFrames(project, times);
  onProgress(0, 'Preparing media…');
  await frames.init();

  if (isSequence(opts.format)) {
    // Frames keep the exact output size (no even rounding); JPEG has no alpha, so only PNG can be transparent.
    const png = opts.format === 'png-seq';
    const zip = new ZipWriter();
    try {
      for (let i = 0; i < count; i++) {
        if (signal.aborted) throw abortError();
        await frames.prepare(times[i]);
        renderer.render(project, times[i], canvas, { scale: opts.scale, transparent: png && opts.transparent, motionBlur: true });
        const image = await encode(canvas, png ? 'image/png' : 'image/jpeg', png ? undefined : 0.92);
        await zip.add(`${name}/${name}_${String(i + 1).padStart(5, '0')}.${png ? 'png' : 'jpg'}`, image);
        onProgress((i + 1) / count, `Frame ${i + 1} / ${count}`);
      }
      return { blob: zip.finish(), filename: `${name}.zip` };
    } catch (e) {
      if (e instanceof ZipLimitError) throw new Error(`${e.message}. Try a smaller size, a lower frame rate${png ? ' or a JPEG sequence' : ''}.`);
      throw e;
    } finally {
      await frames.dispose();
      renderer.dispose();
      free(canvas);
    }
  }

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
    // Above 60 fps the default level and bitrate (sized for ~30 fps) are too low.
    const fast = fps > 60;
    const videoSource = new CanvasSource(out, {
      codec: vcodec,
      bitrate: fast ? highFpsBitrate(vcodec, W, H, fps, opts.quality) : quality,
      keyFrameInterval: 2,
      ...(fast && vcodec === 'avc' ? { fullCodecString: avcCodecString(W, H, fps) } : {}),
    });
    output.addVideoTrack(videoSource, { frameRate: fps });

    onProgress(0, 'Mixing audio…');
    const audio = await mixdown(project, opts.from, opts.to);
    let audioSource: AudioBufferSource | null = null;
    if (audio) {
      // Older Safari has no WebCodecs audio encoder: load a WASM AAC encoder on demand.
      if (isMp4 && !(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: audio.sampleRate }).catch(() => false))) {
        onProgress(0, 'Loading audio encoder…');
        const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
        registerAacEncoder();
      }
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
