import { addShape, addSpecial, addText, importMedia } from './actions';
import { useEditor } from '../state/store';
import { Icon, type IconName } from './icons';

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
        run: () => useEditor.setState({ tool: 'pen', sheet: null, selectedId: null }),
      },
    ],
  },
  {
    title: 'Advanced',
    items: [
      { icon: 'adjust', label: 'Adjustment', hint: 'Effects on layers below', run: () => addSpecial('adjustment') },
      { icon: 'null', label: 'Null / Group', hint: 'Parent to move together', run: () => addSpecial('null') },
      { icon: 'text', label: 'Import font', hint: '.ttf .otf .woff', run: () => void importMedia('.ttf,.otf,.woff,.woff2,font/*') },
    ],
  },
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
    </div>
  );
}
