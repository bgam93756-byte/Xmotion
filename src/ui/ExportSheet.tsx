import { useRef, useState } from 'react';
import { exportProject, supportsVideoExport, type ExportFormat, type ExportQuality } from '../engine/exporter';
import { stop, useEditor } from '../state/store';
import { saveFile, isNative } from '../platform';
import { Icon } from './icons';
import { Toggle } from './controls/fields';

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'mp4', label: 'MP4', hint: 'Best for Photos, TikTok, Reels' },
  { value: 'webm', label: 'WebM', hint: 'Smaller files, web' },
  { value: 'gif', label: 'GIF', hint: 'Loops, stickers' },
  { value: 'png', label: 'PNG', hint: 'Current frame' },
];

const QUALITIES: { value: ExportQuality; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

type Phase = { kind: 'idle' } | { kind: 'running'; progress: number; label: string } | { kind: 'done'; blob: Blob; filename: string; ms: number } | { kind: 'error'; msg: string };

export function ExportSheet() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [quality, setQuality] = useState<ExportQuality>('high');
  const [fps, setFps] = useState(project.fps);
  const [transparent, setTransparent] = useState(false);
  const shortSide = Math.min(project.width, project.height);
  const scales = [0.25, 0.5, 2 / 3, 1, 1.5, 2].filter((s) => Math.max(project.width, project.height) * s <= 4096 && shortSide * s >= 120);
  const [scale, setScale] = useState(format === 'gif' ? Math.min(1, 480 / shortSide) : 1);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const isVideo = format === 'mp4' || format === 'webm';
  const gifScales = [240, 320, 480, 720].map((h) => h / shortSide).filter((s) => s <= 1);
  const scaleOpts = format === 'gif' ? gifScales : scales;
  const activeScale = scaleOpts.reduce((a, b) => (Math.abs(b - scale) < Math.abs(a - scale) ? b : a), scaleOpts[0] ?? 1);

  const run = async () => {
    stop();
    abort.current = new AbortController();
    const started = performance.now();
    setPhase({ kind: 'running', progress: 0, label: 'Starting…' });
    try {
      const { blob, filename } = await exportProject(
        project,
        {
          format,
          scale: activeScale,
          fps: format === 'gif' ? Math.min(fps, 20) : fps,
          quality,
          from: format === 'png' ? time : 0,
          to: project.duration,
          transparent: (format === 'png' || format === 'gif') && transparent,
        },
        (progress, label) => setPhase({ kind: 'running', progress, label }),
        abort.current.signal,
      );
      setPhase({ kind: 'done', blob, filename, ms: performance.now() - started });
      await saveFile(blob, filename);
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') setPhase({ kind: 'idle' });
      else setPhase({ kind: 'error', msg: (e as Error).message || 'Export failed' });
    }
  };

  if (phase.kind === 'running') {
    return (
      <div className="export-progress">
        <div className="progress-ring">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" className="track" />
            <circle cx="50" cy="50" r="44" className="bar" style={{ strokeDashoffset: 276.5 * (1 - phase.progress) }} />
          </svg>
          <span>{Math.round(phase.progress * 100)}%</span>
        </div>
        <p>{phase.label}</p>
        <p className="hint">Keep Xmotion open while exporting.</p>
        <button type="button" className="btn ghost" onClick={() => abort.current?.abort()}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase.kind === 'done') {
    const mb = (phase.blob.size / 1024 / 1024).toFixed(1);
    return (
      <div className="export-progress">
        <div className="done-badge">
          <Icon name="check" size={34} />
        </div>
        <p>
          <b>{phase.filename}</b>
        </p>
        <p className="hint">
          {mb} MB · rendered in {(phase.ms / 1000).toFixed(1)} s · no watermark
        </p>
        {isNative && <p className="hint">Also saved in Files › On My iPhone › Xmotion › Exports.</p>}
        <div className="row-btns">
          <button type="button" className="btn primary" onClick={() => void saveFile(phase.blob, phase.filename)}>
            <Icon name="share" size={16} /> {isNative ? 'Share / Save to Photos' : 'Save again'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setPhase({ kind: 'idle' })}>
            Export another
          </button>
        </div>
      </div>
    );
  }

  const W = Math.round((project.width * activeScale) / 2) * 2;
  const H = Math.round((project.height * activeScale) / 2) * 2;

  return (
    <div className="export">
      <h4>Format</h4>
      <div className="choice-grid">
        {FORMATS.map((f) => (
          <button key={f.value} type="button" className={`choice ${format === f.value ? 'on' : ''}`} onClick={() => setFormat(f.value)}>
            <b>{f.label}</b>
            <span>{f.hint}</span>
          </button>
        ))}
      </div>
      <h4>Resolution</h4>
      <div className="chips">
        {scaleOpts.map((s) => (
          <button key={s} type="button" className={`chip ${s === activeScale ? 'on' : ''}`} onClick={() => setScale(s)}>
            {Math.round(project.width * s)}×{Math.round(project.height * s)}
          </button>
        ))}
      </div>
      {format !== 'png' && (
        <>
          <h4>Frame rate</h4>
          <div className="chips">
            {(format === 'gif' ? [10, 12, 15, 20] : [24, 25, 30, 50, 60]).map((f) => (
              <button key={f} type="button" className={`chip ${f === fps ? 'on' : ''}`} onClick={() => setFps(f)}>
                {f} fps
              </button>
            ))}
          </div>
        </>
      )}
      {isVideo && (
        <>
          <h4>Quality</h4>
          <div className="chips">
            {QUALITIES.map((q) => (
              <button key={q.value} type="button" className={`chip ${q.value === quality ? 'on' : ''}`} onClick={() => setQuality(q.value)}>
                {q.label}
              </button>
            ))}
          </div>
        </>
      )}
      {(format === 'png' || format === 'gif') && (
        <div className="row">
          <span className="row-label">Transparent background</span>
          <Toggle on={transparent} onChange={setTransparent} />
        </div>
      )}
      {isVideo && !supportsVideoExport() && <p className="warn">This device can’t encode video (needs iOS 16.4+ or a recent browser). GIF and PNG still work.</p>}
      {phase.kind === 'error' && <p className="warn">{phase.msg}</p>}
      <button type="button" className="btn primary big" onClick={() => void run()} disabled={isVideo && !supportsVideoExport()}>
        <Icon name="download" size={18} /> Export {format.toUpperCase()} · {W}×{H}
      </button>
      <p className="hint center">Rendered frame-by-frame on your device: every effect, full quality, no watermark.</p>
    </div>
  );
}
