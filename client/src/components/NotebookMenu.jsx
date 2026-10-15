import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { softTone, tone } from '../tones.js';

const stop = (fn) => (e) => {
  e.stopPropagation();
  fn();
};

// Top-bar notebook switcher: the current notebook, and a menu to switch, create, share, rename or delete.
export default function NotebookMenu({ notebooks, loaded, notebookId, onSelect, actions }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const current = notebooks.find((n) => n.id === notebookId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !root.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    root.current.querySelector('.nb-item.active, .nb-item, .nb-menu-new')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Run a menu action and close the menu.
  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };

  // Up/Down move between entries, Escape closes and returns focus to the button.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      root.current.querySelector('.nb-trigger').focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...root.current.querySelectorAll('.nb-item, .nb-menu-new')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <div className="nb-menu" ref={root} onKeyDown={open ? onKeyDown : undefined}>
      <button
        className={`nb-trigger${open ? ' open' : ''}`}
        style={current ? { '--tone': tone(current.id), '--tone-soft': softTone(current.id) } : undefined}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch notebook"
      >
        {current && <span className="nb-badge">{current.name.trim()[0]?.toUpperCase()}</span>}
        <span className="nb-name">{current ? current.name : loaded ? 'No notebook' : 'Loading…'}</span>
        <ChevronDown size={15} className="nb-caret" />
      </button>

      {open && (
        <div className="nb-popover" role="menu">
          <ul className="nb-list">
            {notebooks.map((nb, i) => {
              const active = nb.id === notebookId;
              return (
                <li
                  key={nb.id}
                  role="menuitemradio"
                  aria-checked={active}
                  tabIndex={0}
                  className={`nb-item${active ? ' active' : ''}`}
                  style={{ '--i': i, '--tone': tone(nb.id), '--tone-soft': softTone(nb.id) }}
                  onClick={pick(() => onSelect(nb.id))}
                  onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && pick(() => onSelect(nb.id))()}
                >
                  <span className="nb-badge">{nb.name.trim()[0]?.toUpperCase()}</span>
                  <span className="nb-name">{nb.name}</span>
                  {nb.role !== 'owner' && (
                    <span className="nb-shared" title={`Shared with you by ${nb.owner_email}${nb.role === 'read' ? ' (read only)' : ''}`}>
                      <Users size={13} />
                    </span>
                  )}
                  {active && nb.role === 'owner' && (
                    <span className="row-actions">
                      <button className="icon-btn" title="Share notebook" onClick={stop(pick(actions.share))}>
                        <UserPlus size={13} />
                      </button>
                      <button className="icon-btn" title="Rename notebook" onClick={stop(pick(actions.rename))}>
                        <Pencil size={13} />
                      </button>
                      <button className="icon-btn danger" title="Delete notebook" onClick={stop(pick(actions.remove))}>
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <button className="nb-menu-new" role="menuitem" onClick={pick(actions.create)}>
            <Plus size={16} /> New notebook
          </button>
        </div>
      )}
    </div>
  );
}
