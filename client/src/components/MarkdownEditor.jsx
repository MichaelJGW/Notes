import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, keymap, panels, placeholder, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Vim, getCM, vim } from '@replit/codemirror-vim';
import { formattingKeymap } from '../editor/formatting.js';
import { markdownHighlight } from '../editor/highlight.js';
import { livePreview, refreshLinks, titleLine, wikiLinks } from '../editor/livePreview.js';
import { wikiCompletion } from '../editor/wikiCompletion.js';
import { WIKI_LINK_RE, useWiki } from '../wiki.js';
import { useCommands } from '../commands.js';
import { cursorMemory } from '../viewMemory.js';

// Vim ex commands are global; route them to whichever editor issued them.
const exHandlers = new WeakMap();
const ex = (cm) => exHandlers.get(cm.cm6);
Vim.defineEx('write', 'w', (cm) => ex(cm)?.save());
Vim.defineEx('quit', 'q', (cm) => ex(cm)?.run('tab.close'));
Vim.defineEx('wq', 'wq', (cm) => {
  ex(cm)?.save();
  ex(cm)?.run('tab.close');
});
// LazyVim-style buffer (tab) commands and the space leader.
Vim.defineEx('leader', 'leader', (cm) => ex(cm)?.run('leader'));
Vim.defineEx('bnext', 'bn', (cm) => ex(cm)?.run('tab.next'));
Vim.defineEx('bprevious', 'bp', (cm) => ex(cm)?.run('tab.prev'));
Vim.defineEx('bdelete', 'bd', (cm) => ex(cm)?.run('tab.close'));
Vim.defineEx('edit', 'e', (cm, params) => ex(cm)?.run('open', params.argString?.trim()));
Vim.defineEx('enew', 'ene', (cm) => ex(cm)?.run('note.new'));
Vim.map('<Space>', ':leader<CR>', 'normal');
Vim.map('H', ':bprevious<CR>', 'normal');
Vim.map('L', ':bnext<CR>', 'normal');
Vim.map('[b', ':bprevious<CR>', 'normal');
Vim.map(']b', ':bnext<CR>', 'normal');
Vim.map('jk', '<Esc>', 'insert'); // quick escape from insert mode
// gd / gf: follow the link under the cursor (open or create the note, or open the URL).
Vim.defineEx('followlink', 'followlink', (cm) => ex(cm)?.follow());
Vim.map('gd', ':followlink<CR>', 'normal');
Vim.map('gf', ':followlink<CR>', 'normal');

const MD_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;

// The [[wiki link]] or [text](url) containing the main cursor, if any.
function linkAt(state) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const hit = (re, toLink) => {
    for (const m of line.text.matchAll(re)) {
      const from = line.from + m.index;
      if (pos >= from && pos <= from + m[0].length) return toLink(m);
    }
    return null;
  };
  return (
    hit(WIKI_LINK_RE, (m) => ({ type: 'wiki', target: m[1].trim() })) ??
    hit(MD_LINK_RE, (m) => ({ type: 'url', target: m[2] }))
  );
}

function followLink(view, callbacks) {
  const link = linkAt(view.state);
  if (link?.type === 'wiki') callbacks.openWiki(link.target);
  else if (link?.type === 'url') window.open(link.target, '_blank', 'noopener');
}

// Mode name for the status line, from codemirror-vim's mode-change event.
const vimModeName = ({ mode, subMode }) =>
  mode === 'visual' ? (subMode === 'linewise' ? 'V-LINE' : subMode === 'blockwise' ? 'V-BLOCK' : 'VISUAL') : mode.toUpperCase();

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'visible' },
});

/**
 * CodeMirror Markdown editor. Uncontrolled: `initialValue` is read once on mount;
 * remount (via key) to load a different note.
 */
export default function MarkdownEditor({
  noteId,
  initialValue,
  onChange,
  onSave,
  onVimModeChange,
  onCursorLink,
  panelSlot,
  live,
  vimMode,
  readOnly,
  autoFocus,
}) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const wiki = useWiki();
  const commands = useCommands();
  const compartments = useRef({ vim: new Compartment(), live: new Compartment() });

  // Extensions read the latest props/context through this ref.
  const callbacks = useRef(null);
  callbacks.current = {
    onChange,
    save: onSave,
    run: (id, arg) => commands.run(id, arg),
    vimMode: onVimModeChange,
    cursorLink: onCursorLink,
    resolve: (title) => wiki.resolve(title),
    openWiki: (title) => wiki.open(title),
    notes: () => wiki.notes,
    notebookName: (id) => wiki.notebookName(id),
  };

  useEffect(() => {
    const { vim: vimC, live: liveC } = compartments.current;
    let lastLinkKey = null; // only report cursor-link changes
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          vimC.of(vimMode ? vim() : []),
          // Readers can move around, select and copy, but no change reaches the document.
          readOnly ? [EditorState.readOnly.of(true), EditorState.transactionFilter.of((tr) => (tr.docChanged ? [] : tr))] : [],
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(markdownHighlight),
          baseTheme,
          // Bottom panels (Vim's ":" command line, find/replace) render in the status line.
          panels(panelSlot?.current ? { bottomContainer: panelSlot.current } : {}),
          // Keep the cursor clear of the sticky pane header when scrolling it into view.
          EditorView.scrollMargins.of(() => ({ top: 56, bottom: 32 })),
          liveC.of(live ? livePreview(callbacks) : []),
          wikiLinks(callbacks),
          titleLine,
          autocompletion({ override: [wikiCompletion(callbacks)], icons: false }),
          keymap.of([
            { key: 'Mod-s', run: () => (callbacks.current.save(), true) },
            ...formattingKeymap,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
            ...defaultKeymap,
          ]),
          placeholder('Title'),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) {
              const { anchor, head } = u.state.selection.main;
              cursorMemory.set(noteId, { anchor, head });
              const link = linkAt(u.state);
              const key = link ? `${link.type}:${link.target}` : null;
              if (key !== lastLinkKey) {
                lastLinkKey = key;
                callbacks.current.cursorLink?.(link);
              }
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    exHandlers.set(view, {
      save: () => callbacks.current.save(),
      run: (id, arg) => callbacks.current.run(id, arg),
      follow: () => followLink(view, callbacks.current),
    });
    const saved = cursorMemory.get(noteId);
    if (saved) {
      const len = view.state.doc.length;
      view.dispatch({ selection: { anchor: Math.min(saved.anchor, len), head: Math.min(saved.head, len) } });
    }
    if (autoFocus) view.focus();
    return () => view.destroy();
    // noteId/initialValue/autoFocus are mount-only: the editor is keyed by note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    view.dispatch({ effects: compartments.current.vim.reconfigure(vimMode ? vim() : []) });
    if (!vimMode) return;
    const cm = getCM(view);
    if (!cm) return;
    const report = (e) => callbacks.current.vimMode?.(vimModeName(e));
    report({ mode: cm.state.vim?.insertMode ? 'insert' : 'normal' });
    cm.on('vim-mode-change', report);
    return () => cm.off('vim-mode-change', report);
  }, [vimMode]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.live.reconfigure(live ? livePreview(callbacks) : []) });
  }, [live]);

  // Re-resolve [[links]] when notes are added, removed or renamed.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshLinks.of(null) });
  }, [wiki.notes]);

  return <div ref={host} className={`md-editor ${live ? 'live' : 'source'}${vimMode ? ' vim' : ''}`} />;
}
