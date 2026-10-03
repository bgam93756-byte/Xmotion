import { useEffect, useState } from 'react';
import { addShape, addSpecial, addText, importMedia } from './actions';
import { openSheet, useEditor } from '../state/store';
import { insertElement, listElements, onElementsChange, removeElement, type ElementRecord } from '../state/elements';
import { haptic } from '../platform';
import { Icon, type IconName } from './icons';
import './sheets.css';

interface Item {
  icon: IconName;
  label: string;
  hint: string;
  run: () => void;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Media',
    items: [
      { icon: 'image', label: 'Photo / Video', hint: 'From your library', run: () => void importMedia('image/*,video/*') },
      { icon: 'music', label: 'Audio', hint: 'Music, voice, SFX', run: () => void importMedia('audio/*,.mp3,.m4a,.wav,.aac') },
      { icon: 'text', label: 'Import font', hint: '.ttf .otf .woff', run: () => void importMedia('.ttf,.otf,.woff,.woff2,font/*') },
    ],
  },
  {
    title: 'Create',
    items: [
      { icon: 'text', label: 'Text', hint: '20 fonts + animators', run: addText },
      { icon: 'rect', label: 'Rectangle', hint: 'Rounded corners', run: () => addShape('rect') },
      { icon: 'ellipse', label: 'Ellipse', hint: 'Circles & rings', run: () => addShape('ellipse') },
      { icon: 'polygon', label: 'Polygon', hint: '3–40 sides', run: () => addShape('polygon') },
      { icon: 'star', label: 'Star', hint: 'Bursts & badges', run: () => addShape('star') },
      {
        icon: 'pen',
        label: 'Draw',
        hint: 'Freehand vector',
        run: () => useEditor.setState({ tool: 'pen', sheet: null, selectedId: null, selection: [] }),
      },
    ],
  },
];

const OBJECTS: Item[] = [
  { icon: 'null', label: 'Null object', hint: 'Invisible handle to move many layers via parenting', run: () => addSpecial('null') },
  { icon: 'camera', label: 'Camera', hint: 'Pan, tilt, zoom and fly through 3D layers', run: () => addSpecial('camera') },
  { icon: 'adjust', label: 'Adjustment layer', hint: 'Its effects apply to every layer below it', run: () => addSpecial('adjustment') },
  { icon: 'group', label: 'Group (empty)', hint: 'Folder to move, mask and time layers together', run: () => addSpecial('group') },
];

export function AddSheet() {
  return (
    <div className="add-sheet">
      {GROUPS.map((g) => (
        <div key={g.title} className="add-group">
          <h4>{g.title}</h4>
          <div className="add-grid">
            {g.items.map((it) => (
              <button key={it.label} type="button" className="add-item" onClick={it.run}>
                <span className="add-icon">
                  <Icon name={it.icon} size={22} />
                </span>
                <span className="add-label">{it.label}</span>
                <span className="add-hint">{it.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="add-group">
        <h4>Objects</h4>
        <div className="add-list">
          {OBJECTS.map((it) => (
            <button key={it.label} type="button" className="add-row" onClick={it.run}>
              <span className="add-icon">
                <Icon name={it.icon} size={22} />
              </span>
              <span className="add-row-text">
                <span className="add-label">{it.label}</span>
                <span className="add-hint">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <Elements />
    </div>
  );
}

/** Saved elements (layers reusable in any project). */
function Elements() {
  const [items, setItems] = useState<ElementRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void listElements()
        .then((list) => alive && setItems(list))
        .catch(() => alive && setItems([]));
    load();
    const off = onElementsChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const insert = (rec: ElementRecord) => {
    void insertElement(rec);
    openSheet(null);
    haptic();
  };
  const remove = (rec: ElementRecord) => {
    if (window.confirm(`Delete “${rec.name}” from Elements? Projects that use it keep their copy.`)) void removeElement(rec.id);
  };

  return (
    <div className="add-group">
      <h4>Elements</h4>
      {items && !items.length && <p className="hint el-empty">Select layers, then More › Save as element to reuse them in any project.</p>}
      {!!items?.length && (
        <div className="el-grid">
          {items.map((rec) => (
            <div key={rec.id} className="el-item">
              <button type="button" className="el-insert" onClick={() => insert(rec)} title={`Insert ${rec.name}`}>
                <span className="el-thumb">{rec.thumb ? <img src={rec.thumb} alt="" draggable={false} /> : <Icon name="bookmark" size={24} />}</span>
                <span className="el-name ellipsis">{rec.name}</span>
              </button>
              <button type="button" className="el-del" onClick={() => remove(rec)} aria-label={`Delete ${rec.name}`} title="Delete element">
                <span>
                  <Icon name="trash" size={14} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
