import { useEffect, useState } from 'react';
import { addShape, addSpecial, addText, importMedia } from './actions';
import { openSheet, pasteLayer, useEditor } from '../state/store';
import { insertElement, listElements, onElementsChange, removeElement, type ElementRecord } from '../state/elements';
import { haptic } from '../platform';
import { Icon, type IconName } from './icons';
import { useBackHandler } from './back';
import './sheets.css';

interface Tile {
  icon: IconName;
  label: string;
  /** Shown as a tooltip and to screen readers. */
  hint: string;
  run: () => void;
}

type Page = 'main' | 'shapes' | 'elements';

const startDrawing = () => useEditor.setState({ tool: 'pen', sheet: null, selectedId: null, selection: [] });

const SHAPES: Tile[] = [
  { icon: 'rect', label: 'Rectangle', hint: 'Square corners', run: () => addShape('rect') },
  { icon: 'roundRect', label: 'Rounded', hint: 'Rounded rectangle', run: () => addShape('rect', {}, true, 'Rounded') },
  { icon: 'ellipse', label: 'Circle', hint: 'Circles, ovals & rings', run: () => addShape('ellipse') },
  { icon: 'triangle', label: 'Triangle', hint: 'Three-sided polygon', run: () => addShape('polygon', { sides: { value: 3 } }, false, 'Triangle') },
  { icon: 'polygon', label: 'Polygon', hint: '3 to 40 sides', run: () => addShape('polygon') },
  { icon: 'star', label: 'Star', hint: 'Bursts & badges', run: () => addShape('star') },
];

/** The "+" menu: layer types as big round buttons, like Alight Motion's. */
export function AddSheet() {
  const [page, setPage] = useState<Page>('main');
  const hasClip = useEditor((s) => !!s.clipboard?.layers.length);
  useBackHandler(page !== 'main', () => setPage('main'));

  const main: Tile[] = [
    { icon: 'shapes', label: 'Shapes', hint: 'Rectangles, circles, stars…', run: () => setPage('shapes') },
    { icon: 'image', label: 'Image & Video', hint: 'From your photo library or files', run: () => void importMedia('image/*,video/*') },
    { icon: 'music', label: 'Audio', hint: 'Music, voice, sound effects', run: () => void importMedia('audio/*,.mp3,.m4a,.wav,.aac') },
    { icon: 'text', label: 'Text', hint: '20 fonts and text animators', run: addText },
    { icon: 'pen', label: 'Drawing', hint: 'Draw a vector line with your finger', run: startDrawing },
    { icon: 'bookmark', label: 'Elements', hint: 'Layers you saved to reuse', run: () => setPage('elements') },
    { icon: 'camera', label: 'Camera', hint: 'Pan, tilt, zoom and fly through 3D layers', run: () => addSpecial('camera') },
    { icon: 'group', label: 'Group', hint: 'An empty group to put layers in', run: () => addSpecial('group') },
    { icon: 'null', label: 'Null', hint: 'Invisible handle: parent layers to it to move them together', run: () => addSpecial('null') },
    { icon: 'adjust', label: 'Adjustment', hint: 'Its effects apply to every layer below it', run: () => addSpecial('adjustment') },
    { icon: 'font', label: 'Font', hint: 'Import a .ttf, .otf or .woff font', run: () => void importMedia('.ttf,.otf,.woff,.woff2,font/*') },
    ...(hasClip
      ? [
          {
            icon: 'paste' as const,
            label: 'Paste',
            hint: 'Paste the copied layers',
            run: () => {
              openSheet(null);
              pasteLayer();
            },
          },
        ]
      : []),
  ];

  if (page === 'elements')
    return (
      <div className="add-sheet">
        <SubHead title="Elements" onBack={() => setPage('main')} />
        <Elements />
      </div>
    );
  return (
    <div className="add-sheet">
      {page === 'shapes' && <SubHead title="Shapes" onBack={() => setPage('main')} />}
      <div className="add-tiles">
        {(page === 'shapes' ? SHAPES : main).map((t) => (
          <button key={t.label} type="button" className="add-tile" title={t.hint} aria-label={`${t.label}: ${t.hint}`} onClick={t.run}>
            <span className="add-round">
              <Icon name={t.icon} size={24} />
            </span>
            <span className="add-tile-label">{t.label}</span>
          </button>
        ))}
      </div>
      {page === 'main' && <p className="hint add-foot">Tip: tap a layer on the canvas or in the timeline to edit it.</p>}
    </div>
  );
}

function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="add-sub">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="Back" title="Back">
        <Icon name="back" />
      </button>
      <b>{title}</b>
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
