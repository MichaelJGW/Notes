import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FilePlus, FileText, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { tone } from '../tones.js';

const DRAG_TYPE = 'application/x-notes-item';
const label = (item) => item.name ?? item.title;
const byLabel = (a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base', numeric: true });
const rowStyle = (depth, index) => ({ paddingLeft: 6 + depth * 16, '--i': Math.min(index, 12), '--tone': tone(depth) });

const childrenOf = (tree, parentId) => ({
  groups: tree.groups.filter((g) => g.parent_id === parentId).sort(byLabel),
  notes: tree.notes.filter((n) => n.group_id === parentId).sort(byLabel),
});

// Notes in sidebar display order (depth-first, groups before notes) for next/previous navigation.
export function flattenNotes(tree, parentId = null) {
  const { groups, notes } = childrenOf(tree, parentId);
  return [...groups.flatMap((g) => flattenNotes(tree, g.id)), ...notes];
}

// Run a row action without also toggling/selecting the row.
const stop = (fn) => (e) => {
  e.stopPropagation();
  fn();
};

// Rows the user can currently see (children of collapsed groups stay mounted but hidden).
const visibleRows = (root) => [...root.querySelectorAll('.row')].filter((r) => !r.closest('.collapse:not(.open)'));
const parentRow = (row) => row.closest('.collapse')?.parentElement.querySelector(':scope > .row');
const focusEditor = () => window.dispatchEvent(new Event('note:focus'));

export default function Tree({ tree, actions, ...props }) {
  const [dropTarget, setDropTarget] = useState(undefined); // group id, null (root) or undefined
  const root = useRef(null);

  // SPC e / SPC w h: focus the open note's row (or the first row).
  useEffect(() => {
    const onFocus = () => {
      const rows = visibleRows(root.current);
      (rows.find((r) => r.classList.contains('selected')) ?? rows[0])?.focus();
    };
    window.addEventListener('tree:focus', onFocus);
    return () => window.removeEventListener('tree:focus', onFocus);
  }, []);

  // Vim-style navigation (neo-tree flavoured); arrow keys work too.
  const onKeyDown = (e) => {
    if (e.target.closest('input') || e.ctrlKey || e.metaKey || e.altKey) return;
    const row = e.target.closest('.row');
    if (!row) return;
    const rows = visibleRows(e.currentTarget);
    const i = rows.indexOf(row);
    const focusAt = (j) => rows[Math.max(0, Math.min(rows.length - 1, j))]?.focus();
    const id = Number(row.dataset.id);
    const isGroup = row.dataset.type === 'group';
    const isOpen = isGroup && props.expanded.has(id);
    const contextGroup = isGroup ? id : (tree.notes.find((n) => n.id === id)?.group_id ?? null);
    const openNote = () => {
      if (props.selectedNoteId === id) focusEditor();
      else props.onSelectNote(id); // the editor focuses itself when the note loads
    };

    const handlers = {
      j: () => focusAt(i + 1),
      ArrowDown: () => focusAt(i + 1),
      k: () => focusAt(i - 1),
      ArrowUp: () => focusAt(i - 1),
      g: () => focusAt(0),
      G: () => focusAt(rows.length - 1),
      l: () => (isGroup ? (isOpen ? focusAt(i + 1) : props.onToggle(id)) : openNote()),
      ArrowRight: () => (isGroup ? (isOpen ? focusAt(i + 1) : props.onToggle(id)) : openNote()),
      h: () => (isOpen ? props.onToggle(id) : parentRow(row)?.focus()),
      ArrowLeft: () => (isOpen ? props.onToggle(id) : parentRow(row)?.focus()),
      Enter: () => (isGroup ? props.onToggle(id) : openNote()),
      o: () => (isGroup ? props.onToggle(id) : openNote()),
      ' ': () => (isGroup ? props.onToggle(id) : openNote()),
      a: () => actions.createNote(contextGroup),
      A: () => actions.createGroup(contextGroup),
      r: () => {
        if (props.readOnly) actions.renameGroup();
        else if (isGroup) props.setEditingGroupId(id);
        else {
          openNote();
          window.dispatchEvent(new Event('note:rename'));
        }
      },
      d: () => (isGroup ? actions.deleteGroup(tree.groups.find((g) => g.id === id)) : actions.deleteNote(tree.notes.find((n) => n.id === id))),
      Escape: focusEditor,
    };
    const handler = handlers[e.key];
    if (!handler) return;
    e.preventDefault();
    handler();
  };

  // Drop either a dragged tree item (move) or .md files from the OS (import).
  const drop = (e, groupId) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(undefined);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw) actions.move(JSON.parse(raw), groupId);
    else if (e.dataTransfer.files.length) actions.importFiles([...e.dataTransfer.files], groupId);
  };
  const dragOver = (e, groupId) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(groupId);
  };

  const ctx = { ...props, groups: tree.groups, notes: tree.notes, actions, dropTarget, drop, dragOver };
  const empty = tree.groups.length === 0 && tree.notes.length === 0;

  return (
    <div
      ref={root}
      role="tree"
      className={`tree${dropTarget === null ? ' drop-target' : ''}`}
      onKeyDown={onKeyDown}
      onDragOver={(e) => dragOver(e, null)}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDropTarget(undefined)}
      onDrop={(e) => drop(e, null)}
      onDragEnd={() => setDropTarget(undefined)}
    >
      {empty ? <p className="tree-empty">Empty notebook. Add a note or group, or drop .md files here.</p> : <Level parentId={null} depth={0} ctx={ctx} />}
    </div>
  );
}

function Level({ parentId, depth, ctx }) {
  const { groups, notes } = childrenOf(ctx, parentId);
  return (
    <>
      {groups.map((g, i) => (
        <GroupNode key={`g${g.id}`} group={g} depth={depth} index={i} ctx={ctx} />
      ))}
      {notes.map((n, i) => (
        <NoteNode key={`n${n.id}`} note={n} depth={depth} index={groups.length + i} ctx={ctx} />
      ))}
    </>
  );
}

function GroupNode({ group, depth, index, ctx }) {
  const { actions } = ctx;
  const open = ctx.expanded.has(group.id);
  const editing = ctx.editingGroupId === group.id;
  const FolderIcon = open ? FolderOpen : Folder;

  const finishRename = (name) => {
    ctx.setEditingGroupId(null);
    if (name && name !== group.name) actions.renameGroup(group.id, name);
  };

  return (
    <div role="treeitem" aria-expanded={open}>
      <div
        tabIndex={-1}
        data-type="group"
        data-id={group.id}
        className={`row group${ctx.dropTarget === group.id ? ' drop-target' : ''}`}
        style={rowStyle(depth, index)}
        draggable={!editing && !ctx.readOnly}
        onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type: 'group', id: group.id }))}
        onDragOver={(e) => ctx.dragOver(e, group.id)}
        onDrop={(e) => ctx.drop(e, group.id)}
        onClick={() => !editing && ctx.onToggle(group.id)}
        onDoubleClick={() => !ctx.readOnly && ctx.setEditingGroupId(group.id)}
      >
        <ChevronRight size={14} className={`caret${open ? ' open' : ''}`} />
        <FolderIcon size={16} className="row-icon folder" />
        {editing ? <RenameInput value={group.name} onDone={finishRename} /> : <span className="row-label">{group.name}</span>}
        {!editing && !ctx.readOnly && (
          <span className="row-actions">
            <button className="icon-btn" title="New note in group" onClick={stop(() => actions.createNote(group.id))}>
              <FilePlus size={14} />
            </button>
            <button className="icon-btn" title="New subgroup" onClick={stop(() => actions.createGroup(group.id))}>
              <FolderPlus size={14} />
            </button>
            <button className="icon-btn" title="Rename" onClick={stop(() => ctx.setEditingGroupId(group.id))}>
              <Pencil size={13} />
            </button>
            <button className="icon-btn danger" title="Delete group" onClick={stop(() => actions.deleteGroup(group))}>
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
      {/* Children stay mounted so expand/collapse can animate their height. */}
      <div className={`collapse${open ? ' open' : ''}`} inert={!open}>
        <div className="collapse-inner">
          <Level parentId={group.id} depth={depth + 1} ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

function NoteNode({ note, depth, index, ctx }) {
  const selected = ctx.selectedNoteId === note.id;
  const ref = useRef(null);
  useEffect(() => {
    // Wait for any expand animation before scrolling the row into view.
    if (selected) setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
  }, [selected]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-type="note"
      data-id={note.id}
      role="treeitem"
      aria-selected={selected}
      className={`row note${selected ? ' selected' : ''}`}
      style={rowStyle(depth, index)}
      draggable={!ctx.readOnly}
      onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type: 'note', id: note.id }))}
      onClick={() => ctx.onSelectNote(note.id)}
    >
      <span className="caret-spacer" />
      <FileText size={15} className="row-icon note-icon" />
      <span className="row-label">{note.title}</span>
      {!ctx.readOnly && (
        <span className="row-actions">
          <button className="icon-btn danger" title="Delete note" onClick={stop(() => ctx.actions.deleteNote(note))}>
            <Trash2 size={13} />
          </button>
        </span>
      )}
    </div>
  );
}

function RenameInput({ value, onDone }) {
  const [text, setText] = useState(value);
  const [done, setDone] = useState(false);
  const input = useRef(null);
  const finish = (commit) => {
    if (done) return;
    setDone(true);
    // Keep keyboard focus on the row once the input goes away.
    const row = input.current?.closest('.row');
    onDone(commit ? text.trim() : null);
    setTimeout(() => row?.isConnected && row.focus());
  };
  return (
    <input
      ref={input}
      className="rename-input"
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
