import { useEffect } from 'react';
import { X } from 'lucide-react';
import { keyLabel } from '../commands.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const ALT = isMac ? '⌥' : 'Alt';

const SHORTCUTS = [
  {
    group: 'General',
    items: [
      [['Ctrl', 'Space'], 'Search notes / : commands / / grep'],
      [[MOD, 'K'], 'Find note / : commands / / grep'],
      [[MOD, '/'], 'Show shortcuts'],
      [[MOD, '\\'], 'Toggle sidebar'],
      [[MOD, 'S'], 'Save now'],
      [[ALT, 'N'], 'New note'],
      [[ALT, 'Shift', 'N'], 'New group'],
      [[ALT, 'J'], 'Next note'],
      [[ALT, 'K'], 'Previous note'],
      [[ALT, 'H'], 'Previous tab'],
      [[ALT, 'L'], 'Next tab'],
      [[ALT, 'W'], 'Close tab'],
      [[ALT, 'E'], 'Switch file tree ↔ note'],
      [[ALT, '←'], 'Back (browser history)'],
    ],
  },
  {
    group: 'View',
    items: [
      [[ALT, '1'], 'Live (Apple Notes style)'],
      [[ALT, '2'], 'Source'],
      [[ALT, '3'], 'Split'],
      [[ALT, '4'], 'Preview'],
      [[ALT, 'V'], 'Toggle Vim mode'],
      [[ALT, 'T'], 'Toggle dark theme'],
    ],
  },
  {
    group: 'Editing',
    items: [
      [[MOD, 'B'], 'Bold'],
      [[MOD, 'I'], 'Italic'],
      [[MOD, 'E'], 'Inline code'],
      [[MOD, 'Shift', 'X'], 'Strikethrough'],
      [[MOD, 'Shift', 'L'], 'Insert link'],
      [[MOD, 'Enter'], 'Toggle checkbox'],
      [['[['], 'Link to a note (autocomplete)'],
      [[MOD, 'Click'], 'Follow link while editing'],
      [[MOD, 'F'], 'Find in note'],
    ],
  },
  {
    group: 'File tree (when focused)',
    items: [
      [['j', 'k'], 'Move down / up'],
      [['l'], 'Open note / expand group'],
      [['h'], 'Collapse group / go to parent'],
      [['Enter'], 'Open note / toggle group'],
      [['g', 'G'], 'First / last row'],
      [['a'], 'New note here'],
      [['A'], 'New group here'],
      [['r'], 'Rename'],
      [['d'], 'Delete'],
      [['Esc'], 'Back to the note'],
    ],
  },
  {
    group: 'Vim',
    items: [
      [['Space'], 'Leader menu'],
      [['j', 'k'], 'Escape (insert mode)'],
      [['g', 'd'], 'Follow link under cursor (also gf)'],
      [['H'], 'Previous tab'],
      [['L'], 'Next tab'],
      [['[b', ']b'], 'Previous / next tab'],
      [[':w'], 'Save'],
      [[':q'], 'Close tab'],
      [[':wq'], 'Save and close tab'],
      [[':bn', ':bp'], 'Next / previous tab'],
      [[':bd'], 'Close tab'],
      [[':e title'], 'Open (or create) a note'],
      [[':enew'], 'New note'],
    ],
  },
];

export default function ShortcutsDialog({ commands, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog shortcuts" role="dialog" aria-label="Keyboard shortcuts">
        <header className="dialog-header">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="shortcut-grid">
          {[
            {
              group: 'Leader (SPC …)',
              items: commands.map((c) => [['SPC', ...[...c.keys[0]].map(keyLabel)], c.title]),
            },
            ...SHORTCUTS,
          ].map(({ group, items }, gi) => (
            <section key={group} className="shortcut-group" style={{ '--i': gi }}>
              <h3>{group}</h3>
              {items.map(([keys, label], i) => (
                <div key={i} className="shortcut-row">
                  <span>{label}</span>
                  <span className="keys">
                    {keys.map((k, i) => (
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
