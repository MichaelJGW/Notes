import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock, CornerDownLeft, FilePlus, FileSearch, FileText, Layers, Search, Terminal } from 'lucide-react';
import { api } from '../api.js';
import { formatKeys } from '../commands.js';
import { fuzzyFilter } from '../fuzzy.js';
import { useWiki } from '../wiki.js';

const MODES = {
  notes: { label: 'Notes', Icon: Search, placeholder: 'Find a note…  (":" commands, "/" search text)' },
  commands: { label: 'Commands', Icon: Terminal, placeholder: 'Run a command…' },
  grep: { label: 'Grep', Icon: FileSearch, placeholder: 'Search inside every note…' },
};
const modeOf = (input) => (input.startsWith(':') ? 'commands' : input.startsWith('/') ? 'grep' : 'notes');

// Strip Markdown syntax from a server snippet but keep the «hit» markers.
const cleanSnippet = (s) =>
  s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[|\]\]/g, '')
    .replace(/\[[ xX]\]/g, '')
    .replace(/[`*_~#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function Snippet({ text }) {
  return text.split(/(«[^»]*»)/).map((part, i) =>
    part.startsWith('«') ? <mark key={i}>{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>
  );
}

function Fuzzy({ text, indices }) {
  if (!indices?.length) return text;
  const set = new Set(indices);
  return [...text].map((ch, i) => (set.has(i) ? <b key={i}>{ch}</b> : ch));
}

/**
 * One picker for everything (LazyVim/Telescope style):
 *   text  → fuzzy note titles, then full-text matches
 *   :text → commands
 *   /text → full-text search only
 */
export default function Picker({ initial = '', commands, tabs, hasNote, onClose, onCreate }) {
  const wiki = useWiki();
  const [input, setInput] = useState(initial);
  const [remote, setRemote] = useState({ q: '', rows: [] });
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const returnFocus = useRef(document.activeElement);

  const mode = modeOf(input);
  const query = mode === 'notes' ? input.trim() : input.slice(1).trim();

  // Hand focus back (e.g. to the editor) when the picker closes.
  useEffect(() => () => returnFocus.current?.isConnected && returnFocus.current.focus?.(), []);
  useLayoutEffect(() => {
    const el = inputRef.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    if (mode === 'commands' || query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .search(query, ctrl.signal)
        .then((rows) => setRemote({ q: query, rows }))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mode, query]);

  const items = useMemo(() => {
    const list = [];
    if (mode === 'commands') {
      const available = commands.filter((c) => hasNote || !c.needsNote);
      const matches = query ? fuzzyFilter(query, available, (c) => c.title) : available.map((item) => ({ item }));
      for (const { item, match } of matches) list.push({ kind: 'command', command: item, indices: match?.indices, section: 'Commands' });
      return list;
    }
    const contentRows = remote.q === query ? remote.rows : [];
    if (mode === 'grep') {
      for (const note of contentRows) list.push({ kind: 'note', note, snippet: note.snippet, section: 'Content matches' });
      return list;
    }
    if (!query) {
      const tabNotes = tabs.map((id) => wiki.notes.find((n) => n.id === id)).filter(Boolean);
      for (const note of tabNotes) list.push({ kind: 'note', note, section: 'Open tabs', icon: Layers });
      for (const note of wiki.notes.filter((n) => !tabs.includes(n.id)).slice(0, 10)) {
        list.push({ kind: 'note', note, section: 'Recently edited', icon: Clock });
      }
      return list;
    }
    const titled = fuzzyFilter(query, wiki.notes, (n) => n.title).slice(0, 30);
    const shown = new Set();
    for (const { item, match } of titled) {
      shown.add(item.id);
      list.push({ kind: 'note', note: item, indices: match.indices, section: 'Notes' });
    }
    for (const note of contentRows) {
      if (!shown.has(note.id)) list.push({ kind: 'note', note, snippet: note.snippet, section: 'Content matches' });
    }
    if (!wiki.notes.some((n) => n.title.toLowerCase() === query.toLowerCase())) {
      list.push({ kind: 'create', title: query, section: 'Create' });
    }
    return list;
  }, [mode, query, remote, commands, hasNote, tabs, wiki.notes]);

  useEffect(() => setActive(0), [mode, query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item) => {
    if (!item) return;
    onClose();
    if (item.kind === 'command') item.command.run();
    else if (item.kind === 'note') wiki.openNote(item.note);
    else onCreate(item.title);
  };

  const move = (delta) => setActive((i) => Math.max(0, Math.min(items.length - 1, i + delta)));
  const onKeyDown = (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowDown' || (ctrl && (e.key === 'n' || e.key === 'j'))) {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp' || (ctrl && (e.key === 'p' || e.key === 'k'))) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Backspace' && input.length === 1 && mode !== 'notes') {
      // Deleting the ":" or "/" prefix drops back to note search.
      e.preventDefault();
      setInput('');
    }
  };

  const { label, Icon, placeholder } = MODES[mode];

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`palette mode-${mode}`} role="dialog" aria-label="Picker">
        <div className="palette-input">
          <span className="palette-mode" key={mode}>
            <Icon size={15} /> {label}
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" ref={listRef} role="listbox">
          {items.map((item, i) => {
            const header = item.section !== items[i - 1]?.section;
            const isActive = i === active;
            const ItemIcon = item.kind === 'command' ? Terminal : item.kind === 'create' ? FilePlus : (item.icon ?? FileText);
            return (
              <li key={`${item.kind}-${item.note?.id ?? item.command?.id ?? 'create'}-${i}`} className="palette-li">
                {header && <div className="palette-section">{item.section}</div>}
                <div
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  className={`palette-item${isActive ? ' active' : ''}`}
                  style={{ '--i': i }}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <ItemIcon size={18} className={`pi-icon ${item.kind}`} />
                  <div className="pi-body">
                    {item.kind === 'command' && (
                      <div className="pi-title">
                        <span>
                          <Fuzzy text={item.command.title} indices={item.indices} />
                        </span>
                        <span className="pi-keys">{formatKeys(item.command.keys[0])}</span>
                      </div>
                    )}
                    {item.kind === 'note' && (
                      <>
                        <div className="pi-title">
                          <span>
                            <Fuzzy text={item.note.title} indices={item.indices} />
                          </span>
                          <span className="pi-notebook">{wiki.notebookName(item.note.notebook_id)}</span>
                        </div>
                        {item.snippet && (
                          <div className="pi-snippet">
                            <Snippet text={cleanSnippet(item.snippet)} />
                          </div>
                        )}
                      </>
                    )}
                    {item.kind === 'create' && <div className="pi-title">Create “{item.title}”</div>}
                  </div>
                  {isActive && <CornerDownLeft size={15} className="pi-enter" />}
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="palette-empty">{mode === 'grep' && query.length < 2 ? 'Type at least 2 characters' : 'No matches'}</li>
          )}
        </ul>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> or <kbd>Ctrl</kbd><kbd>j</kbd><kbd>k</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>:</kbd> commands</span>
          <span><kbd>/</kbd> grep</span>
        </div>
      </div>
    </div>
  );
}
