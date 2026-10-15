import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Code2, Columns2, Download, Eye, LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import MarkdownEditor from './MarkdownEditor.jsx';
import MarkdownView from './MarkdownView.jsx';
import Backlinks from './Backlinks.jsx';
import LinkPeek from './LinkPeek.jsx';
import { scrollMemory } from '../viewMemory.js';
import { asDocument, deriveTitle } from '../title.js';
import { EditorView } from '@codemirror/view';

const SAVE_DELAY_MS = 600;
const PEEK_DELAY_MS = 1000; // how long the cursor rests on a link before the Vim peek opens
export const MODES = [
  { id: 'live', label: 'Live', Icon: Sparkles },
  { id: 'source', label: 'Source', Icon: Code2 },
  { id: 'split', label: 'Split', Icon: Columns2 },
  { id: 'preview', label: 'Preview', Icon: Eye },
];
const STATUS = {
  saved: { text: 'Saved', Icon: Check },
  unsaved: { text: 'Edited', Icon: null },
  saving: { text: 'Saving', Icon: LoaderCircle },
  error: { text: 'Save failed', Icon: AlertCircle },
};
const editedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' });

export default function NoteEditor({ noteId, mode, onModeChange, vimMode, onVimToggle, onSaved, onEdit, onDelete, readOnly }) {
  const [note, setNote] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState('saved');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [vimState, setVimState] = useState('NORMAL');
  const [cursorLink, setCursorLink] = useState(null); // link under the cursor
  const [peekLink, setPeekLink] = useState(null); // ...shown in the Vim peek panel once the cursor rests on it
  const modeChangeRef = useRef(onModeChange);
  modeChangeRef.current = onModeChange;
  const downloadRef = useRef(null);
  const panelSlot = useRef(null);
  const preview = useDeferredValue(note?.content ?? '');

  const scrollerRef = useRef(null);
  const previewRef = useRef(null);
  const currentId = useRef(noteId);
  const pending = useRef(null); // { id, changes } not yet sent
  const timer = useRef(null);
  const queue = useRef(Promise.resolve()); // serializes saves so they land in order
  const onSavedRef = useRef(onSaved);
  useLayoutEffect(() => {
    onSavedRef.current = onSaved;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return queue.current;
    pending.current = null;
    if (p.id === currentId.current) setStatus('saving');
    queue.current = queue.current.then(async () => {
      try {
        const saved = await api.updateNote(p.id, p.changes);
        onSavedRef.current(saved);
        if (p.id === currentId.current) {
          setUpdatedAt(saved.updated_at);
          if (!pending.current) setStatus('saved');
        }
      } catch {
        // Keep the failed changes so the next edit (or Ctrl+S) retries them.
        if (p.id === currentId.current) {
          pending.current = { id: p.id, changes: { ...p.changes, ...pending.current?.changes } };
          setStatus('error');
        }
      }
    });
    return queue.current;
  }, []);

  // Load the note (after any queued saves, so we never read stale content); save on switch-away.
  useEffect(() => {
    currentId.current = noteId;
    let cancelled = false;
    setNote(null);
    setCursorLink(null);
    setLoadError(null);
    setStatus('saved');
    queue.current
      .then(() => api.getNote(noteId))
      .then((n) => {
        if (cancelled) return;
        setNote(n);
        setUpdatedAt(n.updated_at);
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
      flush();
    };
  }, [noteId, flush]);

  // Best-effort save if the tab is closed with unsaved edits.
  useEffect(() => {
    const onUnload = () => {
      const p = pending.current;
      if (p) api.updateNote(p.id, p.changes, true);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  useEffect(() => {
    if (!cursorLink) return setPeekLink(null);
    setPeekLink(null);
    const t = setTimeout(() => setPeekLink(cursorLink), PEEK_DELAY_MS);
    return () => clearTimeout(t);
  }, [cursorLink]);

  // Commands from the leader key / palette (see App's `emit`).
  useEffect(() => {
    const save = () => flush();
    // Rename = select the title text on line 1 (switching out of Preview first if needed).
    const rename = () => {
      const el = scrollerRef.current?.querySelector('.cm-editor');
      const view = el && EditorView.findFromDOM(el);
      if (!view) {
        modeChangeRef.current('live');
        setTimeout(rename, 150);
        return;
      }
      const line = view.state.doc.line(1);
      const start = line.from + line.text.match(/^\s*(#{1,6}\s*)?/)[0].length;
      view.dispatch({ selection: { anchor: start, head: line.to }, scrollIntoView: true });
      view.focus();
    };
    const download = () => downloadRef.current?.();
    const focus = () => scrollerRef.current?.querySelector('.cm-content')?.focus();
    window.addEventListener('note:focus', focus);
    window.addEventListener('note:save', save);
    window.addEventListener('note:rename', rename);
    window.addEventListener('note:download', download);
    return () => {
      window.removeEventListener('note:save', save);
      window.removeEventListener('note:rename', rename);
      window.removeEventListener('note:download', download);
      window.removeEventListener('note:focus', focus);
    };
  }, [flush]);

  const change = (field, value) => {
    if (readOnly) return;
    onEdit?.(noteId);
    setNote((n) => ({ ...n, [field]: value }));
    pending.current = { id: noteId, changes: { ...pending.current?.changes, [field]: value } };
    setStatus('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  // Tick/untick a task from the rendered preview. In Split view the change goes through the
  // editor (so its document stays in sync); otherwise it edits the content directly.
  const toggleTask = (lineNo) => {
    if (readOnly) return;
    const el = scrollerRef.current?.querySelector('.cm-editor');
    const view = el && EditorView.findFromDOM(el);
    const text = view ? view.state.doc.toString() : note.content;
    const lines = text.split('\n');
    const m = lines[lineNo - 1]?.match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/);
    if (!m) return;
    if (view) {
      const at = view.state.doc.line(lineNo).from + m[1].length;
      view.dispatch({ changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' }, userEvent: 'input' });
    } else {
      lines[lineNo - 1] = lines[lineNo - 1].replace(/\[([ xX])\]/, m[2] === ' ' ? '[x]' : '[ ]');
      change('content', lines.join('\n'));
    }
  };

  // Restore this note's scroll position once its editor has mounted (child effects run first).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!note || !el) return;
    const top = scrollMemory.get(`${note.id}:${mode}`);
    if (top != null) requestAnimationFrame(() => (el.scrollTop = top));
    else requestAnimationFrame(() => el.querySelector('.cm-cursor, .cm-cursor-primary')?.scrollIntoView({ block: 'center' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, mode]);

  // Remember the scroll position; in split view also keep the preview at the same relative position.
  const syncScroll = () => {
    if (note && scrollerRef.current) scrollMemory.set(`${note.id}:${mode}`, scrollerRef.current.scrollTop);
    const a = scrollerRef.current;
    const b = previewRef.current;
    if (mode !== 'split' || !a || !b) return;
    const ratio = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight);
    b.scrollTop = ratio * (b.scrollHeight - b.clientHeight);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([note.content], { type: 'text/markdown;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${deriveTitle(note.content).replace(/[\\/:*?"<>|]+/g, '').trim() || 'note'}.md`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  downloadRef.current = download;

  if (loadError) return <div className="empty-state"><p>{loadError}</p></div>;
  if (!note) return <EditorSkeleton />;

  const words = note.content.trim() ? note.content.trim().split(/\s+/).length : 0;
  const lines = note.content.split('\n').length;
  const modeIndex = MODES.findIndex((m) => m.id === mode);
  const { text: statusText, Icon: StatusIcon } = STATUS[status];
  // Status-line mode badge (Vim only).
  const modeLabel = mode === 'preview' ? 'VIEW' : vimState;

  const title = deriveTitle(note.content);

  return (
    <section className={`editor editor-${mode}`}>
      <header className="editor-header">
        <span className="edited-at">{updatedAt && `Edited ${editedFormat.format(new Date(updatedAt))}`}</span>
        <div className="editor-tools">
          {readOnly ? (
            <span className="read-only-badge">Read only</span>
          ) : (
            <span className={`status status-${status}`} key={status} aria-live="polite">
              {StatusIcon ? <StatusIcon size={13} /> : <span className="status-dot" />}
              {statusText}
            </span>
          )}
          <div className="segmented" role="group" aria-label="View mode" style={{ '--idx': modeIndex }}>
            <span className="seg-indicator" />
            {MODES.map(({ id, label, Icon }, i) => (
              <button
                key={id}
                className={mode === id ? 'active' : ''}
                onClick={() => onModeChange(id)}
                title={`${label} (Alt+${i + 1})`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className={`vim-toggle${vimMode ? ' on' : ''}`}
            onClick={onVimToggle}
            title="Toggle Vim mode (Alt+V)"
            aria-pressed={vimMode}
            disabled={mode === 'preview'}
          >
            VIM
          </button>
          <button className="icon-btn" title="Download .md" onClick={download}>
            <Download size={17} />
          </button>
          {!readOnly && (
            <button className="icon-btn danger" title="Delete note" onClick={onDelete}>
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </header>

      <div className={`panes mode-${mode}`}>
        {mode !== 'preview' && (
          <div
            className="pane pane-source"
            key="source"
            ref={scrollerRef}
            onScroll={syncScroll}
          >
            {mode === 'live' ? null : (
              <div className="pane-header">
                <span className="pane-dot" />
                <h3>Markdown</h3>
                <span className="pane-meta">
                  {lines} {lines === 1 ? 'line' : 'lines'}
                </span>
              </div>
            )}
            <MarkdownEditor
              key={note.id}
              initialValue={note.content}
              onChange={(v) => change('content', v)}
              onSave={flush}
              onVimModeChange={setVimState}
              onCursorLink={setCursorLink}
              panelSlot={panelSlot}
              live={mode === 'live'}
              vimMode={vimMode}
              noteId={note.id}
              readOnly={readOnly}
              autoFocus
            />
            {mode === 'live' && <Backlinks noteId={note.id} title={title} />}
          </div>
        )}
        {mode !== 'live' && mode !== 'source' && (
          <div className="pane pane-preview" key="preview" ref={previewRef}>
            {mode === 'preview' ? null : (
              <div className="pane-header">
                <span className="pane-dot" />
                <h3>Preview</h3>
                <span className="pane-meta">
                  {words} {words === 1 ? 'word' : 'words'}
                </span>
              </div>
            )}
            <div className="preview">
              {preview.trim() ? (
                <MarkdownView content={asDocument(preview)} onToggleTask={toggleTask} />
              ) : (
                <p className="preview-empty">Your rendered note will appear here.</p>
              )}
              <Backlinks noteId={note.id} title={title} />
            </div>
          </div>
        )}
      </div>

      {vimMode && peekLink && mode !== 'preview' && <LinkPeek link={peekLink} />}

      <footer className="editor-footer">
        {vimMode && <ModeBadge mode={modeLabel} />}
        <div className="panel-slot" ref={panelSlot} />
        <span className="chip">{words} words</span>
        <span className="chip">{note.content.length} characters</span>
        <span className="chip">~{Math.max(1, Math.round(words / 220))} min read</span>
        <span className="footer-hint">
          <kbd>Ctrl</kbd> <kbd>/</kbd> shortcuts
        </span>
      </footer>
    </section>
  );
}

const MODE_CLASS = { NORMAL: 'normal', INSERT: 'insert', VISUAL: 'visual', 'V-LINE': 'visual', 'V-BLOCK': 'visual', REPLACE: 'replace', VIEW: 'view' };

// lualine-style mode block, first item on the status line.
function ModeBadge({ mode }) {
  return (
    <span className={`mode-badge mode-${MODE_CLASS[mode] ?? 'normal'}`} key={mode} aria-label={`Mode: ${mode}`}>
      {mode}
    </span>
  );
}

function EditorSkeleton() {
  return (
    <section className="editor skeleton" aria-busy="true" aria-label="Loading note">
      <div className="sk sk-title" />
      <div className="sk-body">
        {[90, 75, 82, 60, 70].map((w, i) => (
          <div key={i} className="sk sk-line" style={{ width: `${w}%`, '--i': i }} />
        ))}
      </div>
    </section>
  );
}
