import { useState } from 'react';
import type { BlendMode, EaseName, Layer, Project, PropValue, ShapeKind, TextAnimator, TextAnimUnit, Vec2 } from '../model/types';
import { evalPropAt, keyAt } from '../model/animate';
import { EASE_LABELS, applyEase, bezierFor } from '../model/easing';
import { EFFECT_DEFS, EFFECT_LIST } from '../model/effectDefs';
import { validateExpr } from '../model/expr';
import { ANIM_PRESETS } from '../model/presets';
import { PROJECT_PRESETS, getProp, propSections, type PropDef } from '../model/schema';
import { FONT_LIST, ensureFont } from '../engine/fonts';
import { media } from '../engine/media';
import { ctxFor } from '../engine/transform';
import {
  addEffect,
  deleteKey,
  deleteLayer,
  duplicateLayer,
  layerById,
  moveLayer,
  openSheet,
  patchLayer,
  select,
  setExpr,
  setKeyEase,
  setParent,
  setPropValue,
  setTime,
  splitLayer,
  toggleAnimated,
  toggleKeyAtPlayhead,
  update,
  useEditor,
} from '../state/store';
import { BezierEditor, easePreview } from './controls/BezierEditor';
import { ColorField, IconButton, NumberField, Section, Select, Slider, Toggle } from './controls/fields';
import { Icon } from './icons';

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'add', label: 'Add (glow)' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color dodge' },
  { value: 'color-burn', label: 'Color burn' },
  { value: 'hard-light', label: 'Hard light' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

export function Inspector() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  if (!project) return null;
  const layer = layerById(project, selectedId);
  return <div className="inspector">{layer ? <LayerPanel key={layer.id} project={project} layer={layer} /> : <ProjectPanel project={project} />}</div>;
}

/* ---------------- project ---------------- */

function ProjectPanel({ project }: { project: Project }) {
  const set = (patch: Partial<Project>, merge?: string) => update((p) => void Object.assign(p, patch), merge);
  const presetValue = PROJECT_PRESETS.find((p) => p.w === project.width && p.h === project.height)?.label ?? 'custom';
  return (
    <>
      <div className="panel-head">
        <Icon name="settings" />
        <span>Project</span>
      </div>
      <Section title="Composition">
        <div className="row">
          <span className="row-label">Name</span>
          <input className="text-input" value={project.name} onChange={(e) => set({ name: e.target.value }, 'name')} />
        </div>
        <div className="row">
          <span className="row-label">Format</span>
          <Select
            value={presetValue}
            options={[...PROJECT_PRESETS.map((p) => ({ value: p.label, label: `${p.label} (${p.w}×${p.h})` })), { value: 'custom', label: 'Custom' }]}
            onChange={(v) => {
              const p = PROJECT_PRESETS.find((x) => x.label === v);
              if (p) set({ width: p.w, height: p.h });
            }}
          />
        </div>
        <div className="row">
          <span className="row-label">Size</span>
          <NumberField label="W" value={project.width} min={16} max={7680} precision={0} onChange={(v) => set({ width: Math.round(v) }, 'w')} />
          <NumberField label="H" value={project.height} min={16} max={7680} precision={0} onChange={(v) => set({ height: Math.round(v) }, 'h')} />
        </div>
        <div className="row">
          <span className="row-label">Frame rate</span>
          <Select value={String(project.fps)} options={['12', '15', '24', '25', '30', '50', '60']} onChange={(v) => set({ fps: Number(v) })} />
        </div>
        <div className="row">
          <span className="row-label">Duration</span>
          <NumberField value={project.duration} min={0.1} max={3600} step={0.1} unit="s" onChange={(v) => set({ duration: v }, 'dur')} />
        </div>
        <div className="row">
          <span className="row-label">Background</span>
          <ColorField value={project.background} onChange={(v) => set({ background: v }, 'bg')} />
        </div>
      </Section>
      <Section title="Motion blur">
        <div className="row">
          <span className="row-label">Enabled</span>
          <Toggle on={project.motionBlur.on} onChange={(on) => update((p) => void (p.motionBlur.on = on))} />
        </div>
        <div className="row">
          <span className="row-label">Samples</span>
          <NumberField value={project.motionBlur.samples} min={2} max={64} precision={0} onChange={(v) => update((p) => void (p.motionBlur.samples = Math.round(v)), 'mbs')} />
        </div>
        <div className="row">
          <span className="row-label">Shutter</span>
          <NumberField value={Math.round(project.motionBlur.shutter * 360)} min={0} max={720} unit="°" precision={0} onChange={(v) => update((p) => void (p.motionBlur.shutter = v / 360), 'mbsh')} />
        </div>
        <p className="hint">Rendered while paused and in exports. 180° looks like real cameras.</p>
      </Section>
      <div className="empty-hint">
        <Icon name="cursor" size={28} />
        <p>Select a layer to edit its properties, or pick a tool to draw.</p>
      </div>
    </>
  );
}

/* ---------------- layer ---------------- */

function LayerPanel({ project, layer }: { project: Project; layer: Layer }) {
  const keySel = useEditor((s) => s.keySel);
  const sections = propSections(layer);
  const idx = project.layers.indexOf(layer);
  return (
    <>
      <div className="panel-head">
        <span className="layer-dot" style={{ background: layer.label }} />
        <input className="name-input" value={layer.name} onChange={(e) => patchLayer(layer.id, { name: e.target.value }, `name:${layer.id}`)} />
        <IconButton icon="up" title="Bring forward (Ctrl+])" onClick={() => moveLayer(layer.id, idx - 1)} disabled={idx === 0} />
        <IconButton icon="down" title="Send backward (Ctrl+[)" onClick={() => moveLayer(layer.id, idx + 1)} disabled={idx === project.layers.length - 1} />
        <IconButton icon="scissors" title="Split at playhead (S)" onClick={() => splitLayer(layer.id)} />
        <IconButton icon="copy" title="Duplicate (Ctrl+D)" onClick={() => duplicateLayer(layer.id)} />
        <IconButton icon="trash" title="Delete (Del)" onClick={() => deleteLayer(layer.id)} />
        <IconButton icon="close" title="Close" onClick={() => (useEditor.getState().sheet === 'props' ? openSheet(null) : select(null))} />
      </div>
      {keySel?.layerId === layer.id && <KeyframeSection project={project} layer={layer} />}
      <TypeSettings project={project} layer={layer} />
      {sections.map((s) => (
        <Section key={s.title} title={s.title} id={`${layer.type}.${s.title}`}>
          {s.defs.map((d) => (
            <PropRow key={d.key} project={project} layer={layer} path={d.key} def={d} />
          ))}
        </Section>
      ))}
      {layer.type !== 'audio' && <EffectsSection project={project} layer={layer} />}
      {layer.type !== 'audio' && layer.type !== 'adjustment' && <PresetsSection layer={layer} />}
      <TimingSection project={project} layer={layer} />
    </>
  );
}

function TimingSection({ project, layer }: { project: Project; layer: Layer }) {
  const others = project.layers.filter((l) => l.id !== layer.id && l.type !== 'audio');
  return (
    <Section title="Timing & compositing" id="timing">
      <div className="row">
        <span className="row-label">In / Out</span>
        <NumberField value={layer.start} min={0} max={layer.end - 1 / project.fps} step={1 / project.fps} unit="s" onChange={(v) => patchLayer(layer.id, { start: v }, `start:${layer.id}`)} />
        <NumberField value={layer.end} min={layer.start + 1 / project.fps} step={1 / project.fps} unit="s" onChange={(v) => patchLayer(layer.id, { end: v }, `end:${layer.id}`)} />
      </div>
      {layer.type !== 'audio' && (
        <>
          <div className="row">
            <span className="row-label">Blend</span>
            <Select value={layer.blend} options={BLEND_MODES} onChange={(v) => patchLayer(layer.id, { blend: v })} />
          </div>
          <div className="row">
            <span className="row-label" title="Only visible where the layer below is opaque">
              Clip to below
            </span>
            <Toggle on={layer.clip} onChange={(v) => patchLayer(layer.id, { clip: v })} />
          </div>
          <div className="row">
            <span className="row-label">Parent</span>
            <Select
              value={layer.parent ?? ''}
              options={[{ value: '', label: 'None' }, ...others.map((l) => ({ value: l.id, label: l.name }))]}
              onChange={(v) => setParent(layer.id, v || null)}
            />
          </div>
        </>
      )}
    </Section>
  );
}

function TypeSettings({ project, layer }: { project: Project; layer: Layer }) {
  const id = layer.id;
  switch (layer.type) {
    case 'shape':
      return (
        <Section title="Shape" id="shape-settings">
          {layer.shape !== 'path' ? (
            <div className="seg">
              {(['rect', 'ellipse', 'polygon', 'star'] as ShapeKind[]).map((k) => (
                <button key={k} type="button" className={layer.shape === k ? 'on' : ''} onClick={() => patchLayer(id, { shape: k })} title={k}>
                  <Icon name={k} />
                </button>
              ))}
            </div>
          ) : (
            <div className="row">
              <span className="row-label">Closed path</span>
              <Toggle on={!!layer.closed} onChange={(v) => patchLayer(id, { closed: v })} />
            </div>
          )}
          <div className="row">
            <span className="row-label">Fill</span>
            <Toggle on={!!layer.fillOn} onChange={(v) => patchLayer(id, { fillOn: v })} />
            <Select
              value={layer.fillType ?? 'solid'}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'linear', label: 'Linear gradient' },
                { value: 'radial', label: 'Radial gradient' },
              ]}
              onChange={(v) => patchLayer(id, { fillType: v })}
            />
          </div>
          <div className="row">
            <span className="row-label">Stroke</span>
            <Toggle on={!!layer.strokeOn} onChange={(v) => patchLayer(id, { strokeOn: v })} />
          </div>
        </Section>
      );
    case 'text': {
      const fonts = [...FONT_LIST.map((f) => f.family), ...project.assets.filter((a) => a.kind === 'font' && a.fontFamily).map((a) => a.fontFamily!)];
      return (
        <Section title="Text content" id="text-settings">
          <textarea
            className="text-area"
            value={layer.text}
            rows={Math.min(6, Math.max(2, (layer.text ?? '').split('\n').length))}
            onChange={(e) => patchLayer(id, { text: e.target.value }, `text:${id}`)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="row">
            <span className="row-label">Font</span>
            <select
              className="select"
              value={layer.font}
              onChange={(e) => {
                ensureFont(e.target.value, layer.weight ?? 400);
                patchLayer(id, { font: e.target.value });
              }}
            >
              {fonts.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <span className="row-label">Weight</span>
            <Select
              value={String(layer.weight ?? 400)}
              options={['100', '200', '300', '400', '500', '600', '700', '800', '900']}
              onChange={(v) => patchLayer(id, { weight: Number(v) })}
            />
            <button type="button" className={`chip ${layer.italic ? 'on' : ''}`} onClick={() => patchLayer(id, { italic: !layer.italic })}>
              <i>I</i>
            </button>
          </div>
          <div className="row">
            <span className="row-label">Align</span>
            <div className="seg small">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} type="button" className={layer.align === a ? 'on' : ''} onClick={() => patchLayer(id, { align: a })}>
                  {a[0].toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="row-label">Fill / Stroke</span>
            <Toggle on={!!layer.fillOn} onChange={(v) => patchLayer(id, { fillOn: v })} />
            <Select
              value={layer.fillType ?? 'solid'}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'linear', label: 'Gradient' },
                { value: 'radial', label: 'Radial' },
              ]}
              onChange={(v) => patchLayer(id, { fillType: v })}
            />
            <Toggle on={!!layer.strokeOn} onChange={(v) => patchLayer(id, { strokeOn: v })} />
          </div>
          <div className="row">
            <span className="row-label">Animator</span>
            <Select<TextAnimator>
              value={layer.animator ?? 'none'}
              options={[
                { value: 'none', label: 'None' },
                { value: 'typewriter', label: 'Typewriter' },
                { value: 'fade', label: 'Fade' },
                { value: 'pop', label: 'Pop' },
                { value: 'slideUp', label: 'Slide up' },
                { value: 'drop', label: 'Drop & bounce' },
                { value: 'scramble', label: 'Decode / scramble' },
                { value: 'blurIn', label: 'Blur in' },
              ]}
              onChange={(v) => patchLayer(id, { animator: v })}
            />
            <Select<TextAnimUnit>
              value={layer.animUnit ?? 'char'}
              options={[
                { value: 'char', label: 'by letter' },
                { value: 'word', label: 'by word' },
                { value: 'line', label: 'by line' },
              ]}
              onChange={(v) => patchLayer(id, { animUnit: v })}
            />
          </div>
          <p className="hint">Keyframe “Reveal” below (or use a Text preset) to drive the animator.</p>
        </Section>
      );
    }
    case 'image':
    case 'video':
    case 'audio': {
      const a = media.get(layer.asset);
      const fit = (mode: 'contain' | 'cover') => {
        const w = a?.meta.width ?? 1;
        const h = a?.meta.height ?? 1;
        const k = mode === 'contain' ? Math.min(project.width / w, project.height / h) : Math.max(project.width / w, project.height / h);
        update((p) => {
          const l = layerById(p, id)!;
          l.props.scale = { value: [k * 100, k * 100] };
          l.props.position = { value: [p.width / 2, p.height / 2] };
        });
      };
      return (
        <Section title="Media" id="media-settings">
          <div className="row">
            <span className="row-label">Source</span>
            <span className="row-value ellipsis">{a?.meta.name ?? 'Missing media'}</span>
          </div>
          {layer.type !== 'audio' && (
            <div className="row">
              <span className="row-label">Fit</span>
              <button type="button" className="chip" onClick={() => fit('contain')}>
                Fit
              </button>
              <button type="button" className="chip" onClick={() => fit('cover')}>
                Fill
              </button>
            </div>
          )}
          {layer.type !== 'image' && (
            <>
              <div className="row">
                <span className="row-label">Source in</span>
                <NumberField value={layer.trimIn ?? 0} min={0} step={0.04} unit="s" onChange={(v) => patchLayer(id, { trimIn: v }, `trim:${id}`)} />
              </div>
              <div className="row">
                <span className="row-label">Speed</span>
                <NumberField value={(layer.speed ?? 1) * 100} min={10} max={1000} unit="%" precision={0} onChange={(v) => patchLayer(id, { speed: v / 100 }, `speed:${id}`)} />
                {a?.meta.duration !== undefined && (
                  <button
                    type="button"
                    className="chip"
                    title="Set the clip length to the media length"
                    onClick={() => patchLayer(id, { end: layer.start + (a.meta.duration! - (layer.trimIn ?? 0)) / (layer.speed ?? 1) })}
                  >
                    Full length
                  </button>
                )}
              </div>
              <div className="row">
                <span className="row-label">Volume</span>
                <Slider value={(layer.volume ?? 1) * 100} min={0} max={200} onChange={(v) => patchLayer(id, { volume: v / 100 }, `vol:${id}`)} />
                <span className="row-value">{Math.round((layer.volume ?? 1) * 100)}%</span>
              </div>
              <div className="row">
                <span className="row-label">Mute</span>
                <Toggle on={!!layer.muted} onChange={(v) => patchLayer(id, { muted: v })} />
              </div>
              <div className="row">
                <span className="row-label">Fade in/out</span>
                <NumberField value={layer.fadeIn ?? 0} min={0} step={0.1} unit="s" onChange={(v) => patchLayer(id, { fadeIn: v }, `fi:${id}`)} />
                <NumberField value={layer.fadeOut ?? 0} min={0} step={0.1} unit="s" onChange={(v) => patchLayer(id, { fadeOut: v }, `fo:${id}`)} />
              </div>
            </>
          )}
        </Section>
      );
    }
    case 'adjustment':
      return <p className="hint pad">Effects on an adjustment layer apply to every layer below it. Lower its opacity to blend the result.</p>;
    case 'null':
      return <p className="hint pad">Nulls are invisible. Parent layers to this null to move, scale and rotate them together.</p>;
  }
}

/* ---------------- properties ---------------- */

export function PropRow({ project, layer, path, def }: { project: Project; layer: Layer; path: string; def: PropDef }) {
  const time = useEditor((s) => s.time);
  const prop = getProp(layer, path);
  const animated = !!prop.keys?.length;
  const value = evalPropAt(layer, path, time, ctxFor(project, layer));
  const local = time - layer.start;
  const keyHere = animated ? keyAt(prop, local, project.fps) : undefined;
  const [showExpr, setShowExpr] = useState(!!prop.expr);
  const change = (v: PropValue) => setPropValue(layer.id, path, v);

  const jump = (dir: -1 | 1) => {
    const keys = prop.keys ?? [];
    const eps = 0.5 / project.fps;
    const k = dir < 0 ? [...keys].reverse().find((k) => k.t < local - eps) : keys.find((k) => k.t > local + eps);
    if (k) setTime(layer.start + k.t);
  };

  return (
    <div className="prop">
      <div className="prop-row">
        <button
          type="button"
          className={`kf-btn ${animated ? 'animated' : ''} ${keyHere ? 'on' : ''}`}
          title={animated ? (keyHere ? 'Remove keyframe here' : 'Add keyframe here') : 'Animate this property (add first keyframe)'}
          onClick={() => (animated ? toggleKeyAtPlayhead(layer.id, path) : toggleAnimated(layer.id, path))}
        >
          <Icon name="keyframe" size={12} />
        </button>
        <span className="prop-label" title={def.label}>
          {def.label}
        </span>
        <div className="prop-editor">
          <ValueEditor def={def} value={value} onChange={change} />
        </div>
        <div className="prop-tools">
          {animated && (
            <>
              <IconButton icon="prev" size={14} title="Previous keyframe" onClick={() => jump(-1)} />
              <IconButton icon="next" size={14} title="Next keyframe" onClick={() => jump(1)} />
              <IconButton icon="close" size={12} title="Remove all keyframes" onClick={() => toggleAnimated(layer.id, path)} />
            </>
          )}
          {def.kind !== 'color' && <IconButton icon="fx" size={14} title="Expression" active={!!prop.expr || showExpr} onClick={() => setShowExpr(!showExpr)} />}
        </div>
      </div>
      {showExpr && <ExprInput value={prop.expr ?? ''} onChange={(e) => setExpr(layer.id, path, e)} />}
    </div>
  );
}

function ValueEditor({ def, value, onChange }: { def: PropDef; value: PropValue; onChange: (v: PropValue) => void }) {
  const [linked, setLinked] = useState(def.key === 'scale');
  if (def.kind === 'color') return <ColorField value={value as string} onChange={onChange} />;
  if (def.kind === 'vec2') {
    const v = value as Vec2;
    const setI = (i: 0 | 1, n: number) => {
      if (linked && v[i] !== 0) {
        const k = n / v[i];
        onChange([v[0] * k, v[1] * k]);
      } else onChange(i === 0 ? [n, v[1]] : [v[0], n]);
    };
    return (
      <div className="vec2">
        <NumberField label="X" value={v[0]} step={def.step ?? 1} min={def.min} unit={def.unit} onChange={(n) => setI(0, n)} />
        <NumberField label="Y" value={v[1]} step={def.step ?? 1} min={def.min} unit={def.unit} onChange={(n) => setI(1, n)} />
        {def.key === 'scale' && <IconButton icon={linked ? 'link' : 'unlink'} size={14} title="Constrain proportions" active={linked} onClick={() => setLinked(!linked)} />}
      </div>
    );
  }
  const n = value as number;
  return (
    <div className="num-wrap">
      {def.slider && def.min !== undefined && def.max !== undefined && <Slider value={n} min={def.min} max={def.max} step={def.step ?? 1} onChange={onChange} />}
      <NumberField value={n} step={def.step ?? 1} min={def.min} max={def.slider ? def.max : undefined} unit={def.unit} onChange={onChange} />
    </div>
  );
}

const EXPR_EXAMPLES = ['wiggle(2, 30)', 'value + time * 90', 'value + [0, sin(time * 3) * 40]', 'loop()', 'random(0, 100)'];

function ExprInput({ value, onChange }: { value: string; onChange: (expr: string | undefined) => void }) {
  const [text, setText] = useState(value);
  const err = text.trim() ? validateExpr(text) : null;
  const apply = () => {
    if (!text.trim()) onChange(undefined);
    else if (!err) onChange(text.trim());
  };
  return (
    <div className="expr">
      <input
        className={`expr-input ${err ? 'bad' : ''}`}
        placeholder="e.g. wiggle(2, 30)"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') apply();
        }}
      />
      {err ? (
        <span className="expr-err">{err}</span>
      ) : (
        <div className="expr-examples">
          {EXPR_EXAMPLES.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => {
                setText(x);
                onChange(x);
              }}
            >
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- effects ---------------- */

const CATEGORIES = [...new Set(EFFECT_LIST.map((e) => e.category))];

function EffectsSection({ project, layer }: { project: Project; layer: Layer }) {
  const adder = (
    <select className="select add-fx" value="" onChange={(e) => e.target.value && addEffect(layer.id, e.target.value)} title="Add effect">
      <option value="">+ Add effect</option>
      {CATEGORIES.map((c) => (
        <optgroup key={c} label={c}>
          {EFFECT_LIST.filter((e) => e.category === c).map((e) => (
            <option key={e.type} value={e.type}>
              {e.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
  return (
    <Section title={`Effects${layer.effects.length ? ` (${layer.effects.length})` : ''}`} id="effects" right={adder}>
      {!layer.effects.length && <p className="hint">30 GPU effects: glow, blur, chroma key, glitch, wave, kaleidoscope… Stack as many as you like.</p>}
      {layer.effects.map((e, i) => {
        const def = EFFECT_DEFS[e.type];
        if (!def) return null;
        const patchFx = (fn: (l: Layer) => void) =>
          update((p) => {
            const l = layerById(p, layer.id);
            if (l) fn(l);
          });
        return (
          <div key={e.id} className={`fx-card ${e.enabled ? '' : 'off'}`}>
            <div className="fx-head">
              <Toggle on={e.enabled} onChange={(v) => patchFx((l) => void (l.effects[i].enabled = v))} />
              <span className="fx-name">{def.label}</span>
              <IconButton icon="up" size={14} title="Move up" disabled={i === 0} onClick={() => patchFx((l) => void l.effects.splice(i - 1, 0, l.effects.splice(i, 1)[0]))} />
              <IconButton icon="down" size={14} title="Move down" disabled={i === layer.effects.length - 1} onClick={() => patchFx((l) => void l.effects.splice(i + 1, 0, l.effects.splice(i, 1)[0]))} />
              <IconButton icon="trash" size={14} title="Remove effect" onClick={() => patchFx((l) => void l.effects.splice(i, 1))} />
            </div>
            {def.props.map((d) => (
              <PropRow key={d.key} project={project} layer={layer} path={`fx.${e.id}.${d.key}`} def={d} />
            ))}
          </div>
        );
      })}
    </Section>
  );
}

function PresetsSection({ layer }: { layer: Layer }) {
  const groups = ['In', 'Out', 'Loop', 'Text'] as const;
  const apply = (id: string) =>
    update((p) => {
      const l = layerById(p, layer.id);
      const preset = ANIM_PRESETS.find((x) => x.id === id);
      if (l && preset) preset.apply(l, p);
    });
  return (
    <Section title="Animate" id="presets">
      {groups.map((g) => {
        const list = ANIM_PRESETS.filter((p) => p.group === g && (!p.textOnly || layer.type === 'text'));
        if (!list.length) return null;
        return (
          <div key={g} className="preset-group">
            <span className="preset-title">{g}</span>
            <div className="chips">
              {list.map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => apply(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/* ---------------- keyframe easing ---------------- */

function KeyframeSection({ project, layer }: { project: Project; layer: Layer }) {
  const keySel = useEditor((s) => s.keySel)!;
  const prop = getProp(layer, keySel.path);
  const key = prop.keys?.find((k) => k.id === keySel.keyId);
  if (!key) return null;
  const isLast = prop.keys![prop.keys!.length - 1].id === key.id;
  const fps = project.fps;
  const bez = bezierFor(key.ease, key.bez);
  const nonBezier = ['backIn', 'backOut', 'elastic', 'bounce', 'hold'].includes(key.ease);
  const label = keySel.path.startsWith('fx.') ? keySel.path.split('.').pop() : keySel.path;
  return (
    <Section title="Keyframe" id="keyframe">
      <div className="row">
        <span className="row-label">Property</span>
        <span className="row-value">{label}</span>
        <span className="row-value muted">@ {(layer.start + key.t).toFixed(2)}s · f{Math.round((layer.start + key.t) * fps)}</span>
      </div>
      {isLast ? (
        <p className="hint">This is the last keyframe. Easing applies from a keyframe to the next one.</p>
      ) : (
        <>
          <div className="row">
            <span className="row-label">Easing</span>
            <Select<EaseName> value={key.ease} options={(Object.keys(EASE_LABELS) as EaseName[]).map((e) => ({ value: e, label: EASE_LABELS[e] }))} onChange={(v) => setKeyEase(keySel, v)} />
          </div>
          <div className="ease-quick">
            {(['linear', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'elastic', 'bounce', 'hold'] as EaseName[]).map((e) => (
              <button key={e} type="button" className={`ease-btn ${key.ease === e ? 'on' : ''}`} title={EASE_LABELS[e]} onClick={() => setKeyEase(keySel, e)}>
                <svg viewBox="0 0 24 24">
                  <path d={easePath(e)} />
                </svg>
              </button>
            ))}
          </div>
          <BezierEditor value={bez} preview={nonBezier ? easePreview(key.ease) : undefined} onChange={(b, final) => setKeyEase(keySel, 'custom', b, final ? undefined : `ease:${key.id}`)} />
          <p className="hint">Drag the handles for a custom curve.</p>
        </>
      )}
      <button type="button" className="btn ghost danger" onClick={() => deleteKey(keySel)}>
        <Icon name="trash" size={14} /> Delete keyframe
      </button>
    </Section>
  );
}

function easePath(e: EaseName) {
  let d = '';
  for (let i = 0; i <= 16; i++) {
    const x = i / 16;
    const y = applyEase(e, x);
    d += `${i ? 'L' : 'M'}${(3 + x * 18).toFixed(1)},${(20 - y * 16).toFixed(1)}`;
  }
  return d;
}
