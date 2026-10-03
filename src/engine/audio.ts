import type { Layer, Project } from '../model/types';
import { allLayers, effectiveWindow } from '../model/tree';
import { media } from './media';
import { isRetimed } from './transform';

const hasAudio = (l: Layer) =>
  (l.type === 'audio' || l.type === 'video') && !!l.asset && l.visible && !l.muted && (l.volume ?? 1) > 0;

/**
 * Audible clips anywhere in the tree, with their window clipped to the
 * enclosing groups. Time-remapped clips are skipped (their audio would need resampling).
 */
function audible(project: Project): Layer[] {
  const out: Layer[] = [];
  for (const l of allLayers(project)) {
    if (!hasAudio(l) || isRetimed(project, l)) continue;
    const w = effectiveWindow(project, l);
    if (!w.visible || w.end <= w.start) continue;
    out.push(w.start === l.start && w.end === l.end ? l : { ...l, start: w.start, end: w.end, trimIn: (l.trimIn ?? 0) + (w.start - l.start) * (l.speed ?? 1) });
  }
  return out;
}

/** Clip gain at comp time t, including fade in/out. */
function gainAt(l: Layer, t: number): number {
  const v = l.volume ?? 1;
  let g = v;
  if (l.fadeIn && t < l.start + l.fadeIn) g *= Math.max(0, (t - l.start) / l.fadeIn);
  if (l.fadeOut && t > l.end - l.fadeOut) g *= Math.max(0, (l.end - t) / l.fadeOut);
  return g;
}

/**
 * Schedules every audible clip from comp time `from` onwards.
 * `when` is the context time that corresponds to `from`; `until` bounds rendering.
 */
async function schedule(ctx: BaseAudioContext, project: Project, from: number, when: number, until: number): Promise<AudioScheduledSourceNode[]> {
  const nodes: AudioScheduledSourceNode[] = [];
  for (const l of audible(project)) {
    if (l.end <= from || l.start >= until) continue;
    const buf = await media.audioBuffer(l.asset!);
    if (!buf) continue;
    const speed = l.speed ?? 1;
    const startAt = Math.max(l.start, from);
    const endAt = Math.min(l.end, until);
    const offset = (l.trimIn ?? 0) + (startAt - l.start) * speed;
    if (offset >= buf.duration || endAt <= startAt) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = speed;
    const gain = ctx.createGain();
    const ctxAt = (t: number) => when + (t - from);
    gain.gain.setValueAtTime(gainAt(l, startAt), ctxAt(startAt));
    if (l.fadeIn && startAt < l.start + l.fadeIn) gain.gain.linearRampToValueAtTime(l.volume ?? 1, ctxAt(l.start + l.fadeIn));
    if (l.fadeOut) {
      const fs = Math.max(startAt, l.end - l.fadeOut);
      gain.gain.setValueAtTime(gainAt(l, fs), ctxAt(fs));
      gain.gain.linearRampToValueAtTime(0, ctxAt(l.end));
    }
    src.connect(gain).connect(ctx.destination);
    src.start(ctxAt(startAt), offset, (endAt - startAt) * speed);
    nodes.push(src);
  }
  return nodes;
}

/** Real-time audio for preview playback. */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private token = 0;

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  async start(project: Project, from: number) {
    this.stop();
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const token = ++this.token;
    const when = ctx.currentTime + 0.05;
    const nodes = await schedule(ctx, project, from, when, project.duration);
    if (token !== this.token) {
      nodes.forEach((n) => n.stop());
      return;
    }
    this.nodes = nodes;
  }

  stop() {
    this.token++;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
  }
}

export const audioPlayer = new AudioPlayer();

export function projectHasAudio(project: Project) {
  return audible(project).length > 0;
}

/** Offline mixdown of a comp range (for export). */
export async function mixdown(project: Project, from: number, to: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  if (!projectHasAudio(project)) return null;
  const length = Math.max(1, Math.ceil((to - from) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const nodes = await schedule(ctx, project, from, 0, to);
  if (!nodes.length) return null;
  return ctx.startRendering();
}
