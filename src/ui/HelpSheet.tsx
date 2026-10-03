import './sheets.css';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  [', / .', 'Previous / next frame (Shift = 1 s)'],
  ['Home / End', 'Go to start / end'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste selected layers'],
  ['Ctrl+D', 'Duplicate selected layers'],
  ['Ctrl+A', 'Select all layers in the group (or comp)'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
  ['Delete', 'Delete selected layers or keyframe'],
  ['S', 'Split layer at playhead'],
  ['Ctrl+] / Ctrl+[', 'Bring forward / send backward'],
  ['Arrows', 'Nudge selected layers (Shift = 10 px)'],
  ['P / V / Y', 'Draw tool / select tool / anchor point tool'],
  ['Esc', 'Close the sheet, or deselect'],
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
  ['Long-press a timeline layer', 'Add it to the selection (or Ctrl-click)'],
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

/** The recommended order to learn motion design, with how to do each step in Xmotion. */
const LEARN: [string, string][] = [
  ['Keyframes', 'Select a layer › Edit, move the playhead and tap ◆ next to a property. Move the playhead again and change the value: the next keyframe is added for you.'],
  ['Easing', 'Tap a keyframe in the timeline and pick an easing under Keyframe. Ease in-out feels natural; Back and Elastic overshoot.'],
  ['Graphs', 'Tap a property name › Show in graph editor (or the curve icon on a timeline property row) and drag the handles to shape the speed.'],
  ['Parenting', 'Edit › Timing & compositing › Parent: pick a layer of the same group. The child follows its position, scale and rotation.'],
  ['Nulls', 'Add › Objects › Null object, parent several layers to it and animate only the null to move them all.'],
  ['Masks', "Set a layer's Mask to Alpha: it hides the layers below it in the same group, so group them to limit the mask. Luma masks by brightness; the inverted modes cut holes."],
  ['Blending', 'Edit › Blend: Screen or Add for light and glows, Multiply for shadows, Overlay for textures.'],
  ['Camera', 'Add › Objects › Camera, turn on 3D layer (Edit › Timing & compositing) for the layers it should see and give them different Z. Animate the camera’s Position, Z position, Pan and Tilt.'],
  ['Motion Blur', 'Tap the project name › Motion blur. A 180° shutter looks like a real camera; it renders while paused and in exports.'],
  ['Effects', 'Edit › Effects › Add effect. Effects run top to bottom and their values can be keyframed; on an adjustment layer they apply to everything below.'],
];

const TOPICS: [string, string][] = [
  ['Groups', 'Select several layers (long-press or Ctrl-click in the timeline) › More › Group (Ctrl+G). A group moves, fades, masks and retimes its layers as one; with the group selected, tap a layer inside it on the canvas to edit that layer.'],
  ['Elements', 'Select layers › More › Save as element. Add › Elements inserts them into any project at the playhead, with their media and fonts.'],
  ['Time remapping', 'Edit › Timing & compositing › Time remap, then keyframe the Time remap value: flat holds a frame, going down plays in reverse, steeper is faster. Works on groups too.'],
  ['Grid & guides', 'Tap the grid button on the canvas for the grid, rule of thirds, safe areas and snapping. Add guides there and drag them into place; drop one outside the canvas to remove it.'],
  ['Anchor point', 'Press Y (or Edit › Transform › Anchor tool) and drag the pivot on the canvas; the layer stays where it is.'],
  ['Copy & paste', 'Layers: More › Copy / Paste (Ctrl+C / Ctrl+V), also between projects. Effects: More › Copy effects / Paste effects. Properties: tap a property name › Copy, then Paste on another layer (keyframes start at the playhead).'],
];

export function HelpSheet() {
  return (
    <div className="help">
      <h4>Learn</h4>
      <p className="learn-path" aria-label="Recommended order">
        {LEARN.map(([k]) => (
          <span key={k}>{k}</span>
        ))}
      </p>
      <ol className="learn">
        {LEARN.map(([k, v]) => (
          <li key={k}>
            <b>{k}</b>
            <p>{v}</p>
          </li>
        ))}
      </ol>
      <h4>More features</h4>
      <ul className="learn topics">
        {TOPICS.map(([k, v]) => (
          <li key={k}>
            <b>{k}</b>
            <p>{v}</p>
          </li>
        ))}
      </ul>
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
