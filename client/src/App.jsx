import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FilePlus,
  FolderPlus,
  Keyboard,
  LogOut,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { api } from './api.js';
import { WikiContext, resolveTitle } from './wiki.js';
import Sidebar from './components/Sidebar.jsx';
import NoteEditor, { MODES } from './components/NoteEditor.jsx';
import EmptyIllustration from './components/EmptyIllustration.jsx';
import Picker from './components/Picker.jsx';
import WhichKey from './components/WhichKey.jsx';
import TabBar, { PICK_KEYS } from './components/TabBar.jsx';
import { CommandContext, buildCommands } from './commands.js';
import ShortcutsDialog from './components/ShortcutsDialog.jsx';
import ShareDialog from './components/ShareDialog.jsx';
import NotebookMenu from './components/NotebookMenu.jsx';
import LinkPreview from './components/LinkPreview.jsx';
import { flattenNotes } from './components/Tree.jsx';

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
};

const EMPTY_TREE = { groups: [], notes: [] };
const treeEntry = (note) => ({ id: note.id, group_id: note.group_id, title: note.title, updated_at: note.updated_at });
const indexEntry = (note) => ({ ...treeEntry(note), notebook_id: note.notebook_id });
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

// The URL hash mirrors the open note (#/note/42) so browser back/forward walks note history.
const noteIdFromHash = () => Number(window.location.hash.match(/^#\/note\/(\d+)$/)?.[1]) || null;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export default function App({ user, onLogout }) {
  const [notebooks, setNotebooks] = useState(null); // null until loaded
  const [notebookId, setNotebookId] = useState(() => Number(storage.get('notebookId')) || null);
  const [tree, setTree] = useState(EMPTY_TREE);
  const [allNotes, setAllNotes] = useState([]); // every note, no content: link resolution + search
  const [noteId, setNoteId] = useState(() => noteIdFromHash() ?? (Number(storage.get('noteId')) || null));
  const [expanded, setExpanded] = useState(() => new Set(JSON.parse(storage.get('expanded') || '[]')));
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => storage.get('theme')); // 'light' | 'dark' | null (system)
  const [mode, setMode] = useState(() => (MODES.some((m) => m.id === storage.get('viewMode')) ? storage.get('viewMode') : 'live'));
  const [vimMode, setVimMode] = useState(() => storage.get('vim') === '1');
  const [sidebarOpen, setSidebarOpen] = useState(() => storage.get('sidebar') !== '0');
  const [picker, setPicker] = useState(null); // null, or the picker's initial text ('', ':' or '/')
  const [tabs, setTabs] = useState(() => JSON.parse(storage.get('tabs') || '[]'));
  const [leader, setLeader] = useState(null); // null, or keys typed after the leader so far
  const [picking, setPicking] = useState(false); // SPC b j: tabs show jump letters
  const lastActive = useRef(noteId);
  const altTab = useRef(null); // previously active tab, for SPC b b
  const freshNotes = useRef(new Set()); // created but never edited: discarded when you leave them
  const [helpOpen, setHelpOpen] = useState(false);
  const [sharing, setSharing] = useState(null); // notebook whose share dialog is open
  const revealId = useRef(null); // note whose ancestor groups should be expanded once its tree loads

  const fail = (e) => setError(e.message);
  // Wrap an async handler so failures surface as a toast.
  const safe =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        fail(e);
      }
    };

  // Initial load: notebooks + note index, then pick the notebook that holds the requested note.
  useEffect(() => {
    Promise.all([api.listNotebooks(), api.listNotes()])
      .then(([list, notes]) => {
        setAllNotes(notes);
        setNotebooks(list);
        const wanted = notes.find((n) => n.id === noteIdFromHash()) ?? notes.find((n) => n.id === noteId);
        if (wanted) {
          revealId.current = wanted.id;
          setNotebookId(wanted.notebook_id);
        } else {
          setNotebookId((id) => (list.some((n) => n.id === id) ? id : (list[0]?.id ?? null)));
        }
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTree = useCallback(async (id) => {
    const t = await api.getTree(id);
    setTree({ groups: t.groups, notes: t.notes });
  }, []);

  const refreshIndex = () => api.listNotes().then(setAllNotes).catch(fail);
  const indexUpsert = (note) =>
    setAllNotes((list) =>
      list.some((n) => n.id === note.id)
        ? list.map((n) => (n.id === note.id ? indexEntry(note) : n))
        : [indexEntry(note), ...list]
    );

  const loaded = notebooks !== null;
  useEffect(() => {
    if (!loaded) return;
    storage.set('notebookId', notebookId);
    if (notebookId) loadTree(notebookId).catch(fail);
    else {
      setTree(EMPTY_TREE);
      setNoteId(null);
    }
  }, [loaded, notebookId, loadTree]);

  // Expand the groups above a note opened from search, a link or history.
  useEffect(() => {
    const id = revealId.current;
    const note = id != null && tree.notes.find((n) => n.id === id);
    if (!note) return;
    revealId.current = null;
    const ancestors = [];
    for (let g = note.group_id; g != null; g = tree.groups.find((x) => x.id === g)?.parent_id ?? null) ancestors.push(g);
    if (ancestors.length) setExpanded((s) => new Set([...s, ...ancestors]));
  }, [tree, noteId]);

  useEffect(() => {
    storage.set('noteId', noteId);
    if (!loaded || noteIdFromHash() === noteId) return;
    if (!noteId) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    else if (noteIdFromHash()) window.history.pushState(null, '', `#/note/${noteId}`);
    else window.history.replaceState(null, '', `#/note/${noteId}`); // first note: don't add an empty entry
  }, [noteId, loaded]);

  // A note that was created and left untouched isn't kept.
  const discardIfFresh = (id) => {
    if (!freshNotes.current.delete(id)) return false;
    api.deleteNote(id).catch(() => {});
    setTree((t) => ({ ...t, notes: t.notes.filter((n) => n.id !== id) }));
    setAllNotes((list) => list.filter((n) => n.id !== id));
    setTabs((t) => t.filter((x) => x !== id));
    return true;
  };
  const markEdited = useCallback((id) => freshNotes.current.delete(id), []);

  useEffect(() => {
    const onUnload = () => freshNotes.current.forEach((id) => api.deleteNote(id, true));
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // Every opened note becomes a tab, inserted after the tab it was opened from.
  useEffect(() => {
    const prev = lastActive.current;
    if (prev !== noteId) {
      lastActive.current = noteId;
      if (prev != null && !discardIfFresh(prev)) altTab.current = prev;
    }
    if (noteId == null) return;
    setTabs((t) => {
      if (t.includes(noteId)) return t;
      const at = t.indexOf(altTab.current);
      const next = [...t];
      next.splice(at === -1 ? next.length : at + 1, 0, noteId);
      return next;
    });
  }, [noteId]);

  // Drop tabs (and the open note) whose notes were deleted.
  useEffect(() => {
    if (!loaded) return;
    const exists = (id) => allNotes.some((n) => n.id === id);
    setTabs((t) => (t.every(exists) ? t : t.filter(exists)));
    if (noteId && !exists(noteId)) setNoteId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNotes, loaded]);

  useEffect(() => storage.set('tabs', JSON.stringify(tabs)), [tabs]);
  useEffect(() => storage.set('expanded', JSON.stringify([...expanded])), [expanded]);
  useEffect(() => storage.set('viewMode', mode), [mode]);
  useEffect(() => storage.set('vim', vimMode ? '1' : '0'), [vimMode]);
  useEffect(() => storage.set('sidebar', sidebarOpen ? '1' : '0'), [sidebarOpen]);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    storage.set('theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const isDark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const expand = (groupId) => groupId != null && setExpanded((s) => new Set(s).add(groupId));
  const toggle = (groupId) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });

  const openNote = useCallback((note) => {
    revealId.current = note.id;
    setNotebookId(note.notebook_id);
    setNoteId(note.id);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const id = noteIdFromHash();
      const note = id && allNotes.find((n) => n.id === id);
      if (note) openNote(note);
      else setNoteId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [allNotes, openNote]);

  const selectedNote = allNotes.find((n) => n.id === noteId);
  const notebook = notebooks?.find((n) => n.id === notebookId);
  const noteNotebook = notebooks?.find((n) => n.id === (selectedNote?.notebook_id ?? notebookId));

  // Your role on a notebook is 'owner', 'write' or 'read'. `readOnly` covers the notebook shown in the
  // sidebar; `noteReadOnly` the open note's (usually the same one).
  const canWrite = (nb) => nb?.role === 'owner' || nb?.role === 'write';
  const readOnly = !!notebook && !canWrite(notebook);
  const noteReadOnly = !!noteNotebook && !canWrite(noteNotebook);

  // Without permission you get a toast instead of a request the server would refuse anyway.
  const guarded = (allowed, message, actions) =>
    allowed ? actions : Object.fromEntries(Object.keys(actions).map((k) => [k, () => fail(new Error(message))]));

  const notebookActions = {
    create: safe(async () => {
      const name = window.prompt('Notebook name');
      if (!name?.trim()) return;
      const nb = await api.createNotebook(name);
      setNotebooks((list) => [...list, nb].sort(byName));
      setNotebookId(nb.id);
    }),
    share: () => setSharing(notebook),
    ...guarded(notebook?.role === 'owner', 'Only the owner can rename or delete this notebook', {
      rename: safe(async () => {
        const name = window.prompt('Rename notebook', notebook?.name);
        if (!name?.trim() || name === notebook?.name) return;
        const nb = await api.renameNotebook(notebookId, name);
        setNotebooks((list) => list.map((n) => (n.id === nb.id ? nb : n)).sort(byName));
      }),
      remove: safe(async () => {
        if (!window.confirm(`Delete notebook "${notebook?.name}" and everything in it?`)) return;
        await api.deleteNotebook(notebookId);
        const rest = notebooks.filter((n) => n.id !== notebookId);
        setNotebooks(rest);
        setNotebookId(rest[0]?.id ?? null);
        refreshIndex();
      }),
    }),
  };

  const treeActions = guarded(!readOnly, 'You have read-only access to this notebook', {
    createGroup: safe(async (parentId) => {
      const group = await api.createGroup({ notebook_id: notebookId, parent_id: parentId, name: 'New group' });
      setTree((t) => ({ ...t, groups: [...t.groups, group] }));
      expand(parentId);
      setEditingGroupId(group.id);
    }),
    renameGroup: safe(async (id, name) => {
      const group = await api.updateGroup(id, { name });
      setTree((t) => ({ ...t, groups: t.groups.map((g) => (g.id === id ? group : g)) }));
    }),
    deleteGroup: safe(async (group) => {
      if (!window.confirm(`Delete group "${group.name}" with all its subgroups and notes?`)) return;
      await api.deleteGroup(group.id);
      await loadTree(notebookId);
      refreshIndex();
    }),
    createNote: safe(async (groupId, title) => {
      const note = await api.createNote({ notebook_id: notebookId, group_id: groupId, title });
      freshNotes.current.add(note.id);
      setTree((t) => ({ ...t, notes: [...t.notes, treeEntry(note)] }));
      indexUpsert(note);
      expand(groupId);
      setNoteId(note.id);
      return note;
    }),
    deleteNote: safe(async (note) => {
      if (!freshNotes.current.delete(note.id) && !window.confirm(`Delete note "${note.title}"?`)) return;
      await api.deleteNote(note.id);
      if (note.id === noteId) closeTab(note.id);
      setTree((t) => ({ ...t, notes: t.notes.filter((n) => n.id !== note.id) }));
      setAllNotes((list) => list.filter((n) => n.id !== note.id));
    }),
    move: safe(async (item, groupId) => {
      if (item.type === 'group') {
        if (item.id === groupId) return;
        const group = await api.updateGroup(item.id, { parent_id: groupId });
        setTree((t) => ({ ...t, groups: t.groups.map((g) => (g.id === group.id ? group : g)) }));
      } else {
        const note = await api.updateNote(item.id, { group_id: groupId });
        setTree((t) => ({ ...t, notes: t.notes.map((n) => (n.id === note.id ? treeEntry(note) : n)) }));
        indexUpsert(note);
      }
      expand(groupId);
    }),
    importFiles: safe(async (files, groupId) => {
      const mdFiles = files.filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
      if (!mdFiles.length) throw new Error('Only .md, .markdown and .txt files can be imported');
      const created = [];
      for (const file of mdFiles) {
        // The first line is the title: use the file name unless the file starts with a heading.
        const name = file.name.replace(/\.(md|markdown|txt)$/i, '');
        const text = await file.text();
        const content = /^[ \t]*#/.test(text) ? text : `# ${name}\n\n${text}`;
        created.push(await api.createNote({ notebook_id: notebookId, group_id: groupId, content }));
      }
      setTree((t) => ({ ...t, notes: [...t.notes, ...created.map(treeEntry)] }));
      created.forEach(indexUpsert);
      expand(groupId);
      setNoteId(created.at(-1).id);
    }),
  });

  const onNoteSaved = useCallback((note) => {
    setTree((t) => ({ ...t, notes: t.notes.map((n) => (n.id === note.id ? treeEntry(note) : n)) }));
    indexUpsert(note);
  }, []);

  // New notes (from hotkeys, palette or unresolved links) land next to the open note.
  const currentGroupId = selectedNote?.group_id ?? null;
  const createNoteHere = (title) => {
    if (!notebookId) return fail(new Error('Create a notebook first'));
    return treeActions.createNote(currentGroupId, title);
  };

  const wiki = useMemo(
    () => ({
      notes: allNotes,
      notebookName: (id) => notebooks?.find((n) => n.id === id)?.name ?? '',
      resolve: (title) => resolveTitle(allNotes, title, notebookId),
      openNote,
      // Follow a [[link]]: open the note, or create it if it doesn't exist yet.
      open: (title) => {
        const target = resolveTitle(allNotes, title, notebookId);
        if (target) openNote(target);
        else createNoteHere(title.trim());
      },
    }),
    // createNoteHere only depends on notebookId/currentGroupId, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allNotes, notebooks, notebookId, currentGroupId, openNote]
  );

  // ---- Tabs ----
  const activateTab = (id) => {
    const note = allNotes.find((n) => n.id === id);
    if (note) openNote(note);
  };
  const closeTab = (id = noteId) => {
    const i = tabs.indexOf(id);
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (id !== noteId) return;
    const fallback = next.includes(altTab.current) ? altTab.current : next[Math.min(Math.max(i, 0), next.length - 1)];
    if (fallback) activateTab(fallback);
    else setNoteId(null);
  };
  const cycleTab = (delta) => {
    if (!tabs.length) return;
    const i = tabs.indexOf(noteId);
    activateTab(tabs[i === -1 ? 0 : (i + delta + tabs.length) % tabs.length]);
  };

  // ---- Commands (leader key, ":" palette, Vim ex) ----
  const emit = (name) => window.dispatchEvent(new Event(name)); // handled by NoteEditor / Tree
  const focusTree = () => {
    const wasHidden = !sidebarOpen;
    setSidebarOpen(true);
    setTimeout(() => emit('tree:focus'), wasHidden ? 60 : 0);
  };
  const switchWindow = () => (document.activeElement?.closest('.tree') ? emit('note:focus') : focusTree());
  const commands = buildCommands({
    openPicker: setPicker,
    toggleSidebar: () => setSidebarOpen((o) => !o),
    focusTree,
    focusEditor: () => emit('note:focus'),
    switchWindow,
    showHelp: () => setHelpOpen(true),
    save: () => emit('note:save'),
    newNote: () => createNoteHere(),
    newGroup: () => (notebookId ? treeActions.createGroup(currentGroupId) : fail(new Error('Create a notebook first'))),
    newNotebook: notebookActions.create,
    renameNote: () => emit('note:rename'),
    deleteNote: () => selectedNote && treeActions.deleteNote(selectedNote),
    download: () => emit('note:download'),
    alternateTab: () => altTab.current && tabs.includes(altTab.current) && activateTab(altTab.current),
    pickTab: () => tabs.length && setPicking(true),
    cycleTab,
    closeTab,
    closeOtherTabs: () => setTabs(noteId ? [noteId] : []),
    closeAllTabs: () => {
      setTabs([]);
      setNoteId(null);
    },
    setMode,
    toggleTheme,
    toggleVim: () => setVimMode((v) => !v),
  });

  const startLeader = () => setLeader([]);
  const commandApi = useRef(null);
  commandApi.current = {
    run: (id, arg) => {
      if (id === 'leader') return startLeader();
      if (id === 'open') return arg ? wiki.open(arg) : setPicker('');
      const cmd = commands.find((c) => c.id === id);
      if (cmd && (selectedNote || !cmd.needsNote)) cmd.run();
    },
  };
  const commandContext = useMemo(() => ({ run: (id, arg) => commandApi.current.run(id, arg) }), []);

  // Global keys, in the capture phase so the leader/pick modes see keys before CodeMirror does.
  // Alt combos use e.code so they work with macOS Option-key characters.
  const onKey = useRef(null);
  onKey.current = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
    const swallow = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const isModifier = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key);

    if (picking) {
      if (isModifier) return;
      swallow();
      setPicking(false);
      const i = PICK_KEYS.indexOf(e.key);
      if (i !== -1 && tabs[i]) activateTab(tabs[i]);
      return;
    }

    if (leader) {
      if (isModifier) return;
      if (e.key === 'Escape' || e.key === 'Backspace') {
        swallow();
        return setLeader(e.key === 'Backspace' && leader.length ? leader.slice(0, -1) : null);
      }
      const plain = e.key.length === 1 && !mod && !e.altKey;
      const seq = leader.join('') + e.key;
      const cmd = plain && commands.find((c) => c.keys.includes(seq));
      if (cmd) {
        swallow();
        setLeader(null);
        if (selectedNote || !cmd.needsNote) cmd.run();
        return;
      }
      if (plain && commands.some((c) => c.keys.some((k) => k.startsWith(seq)))) {
        swallow();
        return setLeader([...leader, e.key]);
      }
      // Not a leader key: close the menu. Right after SPC the key keeps its normal meaning
      // (e.g. `i` enters insert mode, Ctrl+Space opens search); mid-sequence it's just dropped.
      setLeader(null);
      if (leader.length) return swallow();
    }

    const overlayOpen = picker !== null || helpOpen;
    if (e.ctrlKey && e.code === 'Space') {
      // Same as clicking the search bar (toggles).
      swallow();
      setHelpOpen(false);
      setPicker((p) => (p === null ? '' : null));
    } else if (vimMode && e.key === ' ' && !mod && !e.altKey && !typing && !overlayOpen) {
      // Vim users get a bare-space leader anywhere outside text fields (the editor maps it itself).
      swallow();
      startLeader();
    } else if (mod && !e.altKey && e.key.toLowerCase() === 'k') {
      swallow();
      setPicker((p) => (p === null ? '' : null));
    } else if (mod && e.key === '/') {
      swallow();
      setHelpOpen((o) => !o);
    } else if (mod && e.key === '\\') {
      swallow();
      setSidebarOpen((o) => !o);
    } else if (e.altKey && !mod) {
      const digit = e.code.match(/^Digit([1-4])$/);
      const go = (delta) => {
        const order = flattenNotes(tree);
        if (!order.length) return;
        const i = order.findIndex((n) => n.id === noteId);
        const next = order[i === -1 ? 0 : (i + delta + order.length) % order.length];
        revealId.current = next.id;
        setNoteId(next.id);
      };
      const actions = {
        KeyN: () => (e.shiftKey ? commandApi.current.run('group.new') : createNoteHere()),
        KeyV: () => setVimMode((v) => !v),
        KeyT: toggleTheme,
        KeyJ: () => go(1),
        KeyK: () => go(-1),
        KeyH: () => cycleTab(-1),
        KeyL: () => cycleTab(1),
        KeyW: () => noteId && closeTab(),
        KeyE: switchWindow,
      };
      const action = digit ? () => setMode(MODES[digit[1] - 1].id) : actions[e.code];
      if (action) {
        swallow();
        action();
      }
    } else if (!typing && !overlayOpen && e.key === '?') {
      setHelpOpen(true);
    }
  };
  useEffect(() => {
    const handler = (e) => onKey.current(e);
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // Only one bottom panel at a time: opening search or the shortcut list, toggling Vim,
  // changing view mode or switching notes closes the leader menu (and tab picking).
  const pickerOpen = picker !== null;
  useEffect(() => {
    setLeader(null);
    setPicking(false);
  }, [pickerOpen, helpOpen, vimMode, mode, noteId]);

  // ...and so does clicking anywhere outside it.
  const leaderOpen = leader !== null;
  useEffect(() => {
    if (!leaderOpen) return;
    const onDown = (e) => !e.target.closest('.whichkey') && setLeader(null);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [leaderOpen]);

  // Breadcrumb: notebook › group › subgroup › note
  const groupPath = [];
  for (let gid = selectedNote?.notebook_id === notebookId ? selectedNote.group_id : null; gid != null; ) {
    const g = tree.groups.find((x) => x.id === gid);
    if (!g) break;
    groupPath.unshift(g);
    gid = g.parent_id;
  }

  return (
    <WikiContext.Provider value={wiki}>
      <CommandContext.Provider value={commandContext}>
      <div className={`app${sidebarOpen ? '' : ' sidebar-hidden'}`}>
        <header className="topbar">
          <div className="brand">
            <button
              className="icon-btn"
              title={`${sidebarOpen ? 'Hide' : 'Show'} sidebar (${isMac ? '⌘' : 'Ctrl'}+\\)`}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </button>
            <span className="brand-mark">
              <NotebookPen size={20} />
            </span>
            <span className="brand-name">
              Notes<span className="brand-dot">.</span>
            </span>
            <NotebookMenu
              notebooks={notebooks ?? []}
              loaded={loaded}
              notebookId={notebookId}
              onSelect={setNotebookId}
              actions={notebookActions}
            />
          </div>
          <nav className="breadcrumb" aria-label="Location">
            {groupPath.map((g, i) => (
              <span key={g.id} className="crumb-wrap">
                {i > 0 && <ChevronRight size={14} className="crumb-sep" />}
                <span className="crumb">{g.name}</span>
              </span>
            ))}
            {selectedNote && (
              <span className="crumb-wrap" key={`n${selectedNote.id}`}>
                {groupPath.length > 0 && <ChevronRight size={14} className="crumb-sep" />}
                <span className="crumb crumb-current">{selectedNote.title}</span>
              </span>
            )}
          </nav>
          <button className="search-pill" onClick={() => setPicker('')}>
            <Search size={16} />
            <span>Search or run a command</span>
            <kbd>Ctrl SPC</kbd>
          </button>
          <button className="icon-btn" title={`Keyboard shortcuts (${isMac ? '⌘' : 'Ctrl'}+/)`} onClick={() => setHelpOpen(true)}>
            <Keyboard size={18} />
          </button>
          <button className="icon-btn theme-toggle" title={`${isDark ? 'Light' : 'Dark'} theme (Alt+T)`} onClick={toggleTheme}>
            {isDark ? <Sun size={18} key="sun" /> : <Moon size={18} key="moon" />}
          </button>
          <span className="user-chip" title={user.email}>
            {noteReadOnly && <span className="read-only-badge">Read only</span>}
            {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" />}
          </span>
          <button className="icon-btn" title={`Sign out ${user.email}`} onClick={onLogout}>
            <LogOut size={18} />
          </button>
        </header>

        <Sidebar
          notebook={notebook}
          readOnly={readOnly}
          tree={tree}
          selectedNoteId={noteId}
          onSelectNote={setNoteId}
          expanded={expanded}
          onToggle={toggle}
          editingGroupId={editingGroupId}
          setEditingGroupId={setEditingGroupId}
          actions={treeActions}
        />

        <main className="main">
          <TabBar
            tabs={tabs}
            activeId={noteId}
            notes={allNotes}
            picking={picking}
            onSelect={activateTab}
            onClose={closeTab}
          />
          {selectedNote ? (
            <NoteEditor
              noteId={selectedNote.id}
              mode={mode}
              onModeChange={setMode}
              vimMode={vimMode}
              onVimToggle={() => setVimMode((v) => !v)}
              onSaved={onNoteSaved}
              onEdit={markEdited}
              onDelete={() => treeActions.deleteNote(selectedNote)}
              readOnly={noteReadOnly}
            />
          ) : (
            <div className="empty-state">
              <EmptyIllustration />
              {notebookId ? (
                <>
                  <h1>{readOnly ? 'Pick a note to read' : 'Pick a note, or start a fresh one'}</h1>
                  <p>
                    Write in Markdown that renders as you type. Link notes with <code>[[Note title]]</code> to build
                    your own wiki.
                  </p>
                  {!readOnly && <div className="empty-actions">
                    <button className="btn primary" onClick={() => treeActions.createNote(null)}>
                      <FilePlus size={16} /> New note
                    </button>
                    <button className="btn outline" onClick={() => treeActions.createGroup(null)}>
                      <FolderPlus size={16} /> New group
                    </button>
                  </div>}
                  <p className="empty-hint">
                    {vimMode && <><kbd>SPC</kbd> leader menu · </>}<kbd>Ctrl</kbd> <kbd>SPC</kbd> search · <kbd>{isMac ? '⌥' : 'Alt'}</kbd>{' '}
                    <kbd>N</kbd> new note · <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>/</kbd> all shortcuts
                  </p>
                </>
              ) : (
                <>
                  <h1>Welcome to Notes</h1>
                  <p>Start by creating a notebook. Everything else lives inside one.</p>
                  {loaded && (
                    <div className="empty-actions">
                      <button className="btn primary" onClick={notebookActions.create}>
                        Create a notebook
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>

        {picker !== null && (
          <Picker
            initial={picker}
            commands={commands}
            tabs={tabs}
            hasNote={!!selectedNote}
            onClose={() => setPicker(null)}
            onCreate={(title) => createNoteHere(title)}
          />
        )}
        {helpOpen && <ShortcutsDialog commands={commands} onClose={() => setHelpOpen(false)} />}
        {sharing && <ShareDialog notebook={sharing} onClose={() => setSharing(null)} />}
        {leader && <WhichKey seq={leader} commands={commands} />}
        {picking && <div className="pick-hint">Press a tab’s letter to jump · <kbd>Esc</kbd> cancel</div>}
        <LinkPreview skipEditor={vimMode} />

        {error && (
          <div className="toast" role="alert" key={error}>
            <span>{error}</span>
            <button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      </CommandContext.Provider>
    </WikiContext.Provider>
  );
}
