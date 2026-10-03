const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  [', / .', 'Previous / next frame (Shift = 1 s)'],
  ['Home / End', 'Go to start / end'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+D', 'Duplicate layer'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste layer'],
  ['Delete', 'Delete layer or selected keyframe'],
  ['S', 'Split layer at playhead'],
  ['Ctrl+] / Ctrl+[', 'Bring forward / send backward'],
  ['Arrows', 'Nudge layer (Shift = 10 px)'],
  ['P / V', 'Draw tool / select tool'],
  ['Ctrl+E', 'Export'],
  ['Shift-drag handle', 'Free scale / rotate in 15° steps'],
  ['Alt-drag', 'Move without snapping'],
];

const GESTURES: [string, string][] = [
  ['Swipe timeline', 'Scrub (playhead stays centered)'],
  ['Pinch timeline', 'Zoom the timeline'],
  ['Pinch canvas', 'Zoom & pan the preview'],
  ['Double-tap layer', 'Open its properties'],
  ['Double-tap empty canvas', 'Fit preview to screen'],
  ['Tap ◆ next to a property', 'Animate it (adds a keyframe at the playhead)'],
];

const EXPR: [string, string][] = [
  ['wiggle(2, 30)', 'Organic shake: 2 times/sec, 30 px'],
  ['value + time * 90', 'Spin 90°/sec on top of keyframes'],
  ['value + [0, sin(time*3)*40]', 'Bob up and down'],
  ['loop() / pingpong()', 'Repeat the keyframed animation'],
  ['random(0, 100)', 'New random value each frame'],
  ['linear(time, 0, 2, 0, 100)', 'Map 0–2 s to 0–100'],
  ['time > 2 ? 100 : 0', 'Conditions'],
];

export function HelpSheet() {
  return (
    <div className="help">
      <h4>Touch</h4>
      <dl>
        {GESTURES.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h4>Expressions</h4>
      <p className="hint">Tap ƒx on any property. Variables: time, value, frame, fps, width, height, index.</p>
      <dl>
        {EXPR.map(([k, v]) => (
          <div key={k}>
            <dt>
              <code>{k}</code>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h4>Keyboard</h4>
      <dl>
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
