import type { Layer } from '../model/types';
import {
  copyEffects,
  copyLayers,
  duplicateLayers,
  groupLayers,
  layerById,
  openSheet,
  pasteEffects,
  pasteLayer,
  splitLayer,
  ungroup,
  useEditor,
} from '../state/store';
import { deleteSelection, saveSelectionAsElement, selectAll } from './actions';
import { Icon, type IconName } from './icons';
import './sheets.css';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl+';

interface Action {
  icon: IconName;
  label: string;
  keys?: string;
  run: () => void;
  disabled?: boolean;
  /** Keep the sheet open afterwards (e.g. Select all, to group next). */
  stay?: boolean;
  danger?: boolean;
}

/** Layer actions for the current selection (sheet === 'more'). */
export function MoreSheet() {
  const project = useEditor((s) => s.project)!;
  const selectedId = useEditor((s) => s.selectedId);
  const selection = useEditor((s) => s.selection);
  const hasClip = useEditor((s) => !!s.clipboard?.layers.length);
  const hasFx = useEditor((s) => !!s.fxClipboard?.length);
  const ids = selection.length ? selection : selectedId ? [selectedId] : [];
  const layers = ids.map((id) => layerById(project, id)).filter((l): l is Layer => !!l);
  const single = layers.length === 1 ? layers[0] : undefined;
  const none = !layers.length;

  const actions: (Action | null)[] = [
    { icon: 'copy', label: 'Copy', keys: `${MOD}C`, disabled: none, run: () => copyLayers(ids) },
    { icon: 'paste', label: 'Paste', keys: `${MOD}V`, disabled: !hasClip, run: pasteLayer },
    { icon: 'layers', label: 'Duplicate', keys: `${MOD}D`, disabled: none, run: () => duplicateLayers(ids) },
    single ? { icon: 'scissors', label: 'Split at playhead', keys: 'S', run: () => splitLayer(single.id) } : null,
    { icon: 'group', label: 'Group', keys: `${MOD}G`, disabled: none, run: () => groupLayers(ids) },
    single?.type === 'group' ? { icon: 'ungroup', label: 'Ungroup', keys: `${MOD}Shift+G`, run: () => ungroup(single.id) } : null,
    single ? { icon: 'fx', label: 'Copy effects', disabled: !single.effects.length, run: () => copyEffects(single.id) } : null,
    single ? { icon: 'fx', label: 'Paste effects', disabled: !hasFx, run: () => pasteEffects(single.id) } : null,
    { icon: 'bookmark', label: 'Save as element', disabled: none, run: () => void saveSelectionAsElement() },
    { icon: 'cursor', label: 'Select all', keys: `${MOD}A`, stay: true, run: selectAll },
    { icon: 'trash', label: 'Delete', keys: 'Del', disabled: none, danger: true, run: deleteSelection },
  ];

  return (
    <div className="more-sheet">
      <p className="more-sel ellipsis">{single ? single.name : none ? 'Nothing selected' : `${layers.length} layers selected`}</p>
      <div className="more-list">
        {actions.map(
          (a) =>
            a && (
              <button
                key={a.label}
                type="button"
                className={`more-item ${a.danger ? 'danger' : ''}`}
                disabled={a.disabled}
                onClick={() => {
                  if (!a.stay) openSheet(null);
                  a.run();
                }}
              >
                <Icon name={a.icon} size={20} />
                <span className="more-label">{a.label}</span>
                {a.keys && <kbd className="more-kbd">{a.keys}</kbd>}
              </button>
            ),
        )}
      </div>
    </div>
  );
}
