import { useEffect, useRef } from 'react';
import { FileText, X } from 'lucide-react';
import { tone } from '../tones.js';

export const PICK_KEYS = 'asdfghjklqwertyuiopzxcvbnm';

// Open notes as buffer-style tabs. In pick mode (SPC b j) each tab shows a jump letter.
export default function TabBar({ tabs, activeId, notes, picking, onSelect, onClose }) {
  const bar = useRef(null);

  useEffect(() => {
    bar.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId, tabs.length]);

  const items = tabs.map((id) => notes.find((n) => n.id === id)).filter(Boolean);
  if (!items.length) return null;

  return (
    <div className={`tabbar${picking ? ' picking' : ''}`} role="tablist" ref={bar}>
      {items.map((note, i) => (
        <div
          key={note.id}
          role="tab"
          aria-selected={note.id === activeId}
          className={`tab${note.id === activeId ? ' active' : ''}`}
          style={{ '--tone': tone(note.notebook_id), '--i': i }}
          title={note.title}
          onClick={() => onSelect(note.id)}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onClose(note.id);
            }
          }}
        >
          {picking && i < PICK_KEYS.length ? (
            <span className="tab-pick">{PICK_KEYS[i]}</span>
          ) : (
            <FileText size={14} className="tab-icon" />
          )}
          <span className="tab-title">{note.title || 'Untitled'}</span>
          <button
            className="tab-close"
            aria-label={`Close ${note.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose(note.id);
            }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
