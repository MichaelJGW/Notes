import { createContext, useContext } from 'react';

// Leader-key groups shown in the which-key panel (LazyVim naming where it maps).
export const LEADER_GROUPS = {
  b: 'tabs',
  f: 'file / find',
  n: 'note',
  s: 'search',
  u: 'ui toggles',
  v: 'view mode',
  w: 'window',
};

export const CommandContext = createContext(null);
export const useCommands = () => useContext(CommandContext);

export const keyLabel = (k) => (k === ' ' ? 'SPC' : k);
export const formatKeys = (seq) => ['SPC', ...[...seq].map(keyLabel)].join(' ');

/**
 * Every action reachable from the leader key, the ":" command palette and Vim ex commands.
 * `keys` are leader sequences (after SPC); the first one is shown as the hint.
 * `needsNote` commands are hidden/ignored when no note is open.
 */
export function buildCommands(app) {
  return [
    { id: 'find.notes', title: 'Find note', keys: [' ', 'ff'], run: () => app.openPicker('') },
    { id: 'palette', title: 'Command palette', keys: [':', 'sc'], run: () => app.openPicker(':') },
    { id: 'search.content', title: 'Search in notes (grep)', keys: ['/', 'sg'], run: () => app.openPicker('/') },
    { id: 'window.tree', title: 'Focus file tree', keys: ['e', 'wh'], run: app.focusTree },
    { id: 'window.editor', title: 'Focus note', keys: ['wl'], run: app.focusEditor },
    { id: 'window.switch', title: 'Switch tree ↔ note', keys: ['ww'], run: app.switchWindow },
    { id: 'explorer', title: 'Toggle sidebar', keys: ['ue'], run: app.toggleSidebar },
    { id: 'keymaps', title: 'Show keymaps', keys: ['?', 'sk'], run: app.showHelp },

    { id: 'note.save', title: 'Save note', keys: ['fs'], run: app.save, needsNote: true },
    { id: 'note.new', title: 'New note', keys: ['nn', 'fn'], run: app.newNote },
    { id: 'group.new', title: 'New group', keys: ['ng', 'fg'], run: app.newGroup },
    { id: 'notebook.new', title: 'New notebook', keys: ['nb'], run: app.newNotebook },
    { id: 'note.rename', title: 'Rename note', keys: ['nr'], run: app.renameNote, needsNote: true },
    { id: 'note.delete', title: 'Delete note', keys: ['nd'], run: app.deleteNote, needsNote: true },
    { id: 'note.download', title: 'Download as .md', keys: ['fd'], run: app.download, needsNote: true },

    { id: 'tab.alternate', title: 'Switch to previous tab', keys: ['bb', '`'], run: app.alternateTab },
    { id: 'tab.pick', title: 'Jump to tab', keys: ['bj'], run: app.pickTab },
    { id: 'tab.next', title: 'Next tab', keys: ['bn'], run: () => app.cycleTab(1) },
    { id: 'tab.prev', title: 'Previous tab', keys: ['bp'], run: () => app.cycleTab(-1) },
    { id: 'tab.close', title: 'Close tab', keys: ['bd'], run: () => app.closeTab(), needsNote: true },
    { id: 'tab.closeOthers', title: 'Close other tabs', keys: ['bo'], run: app.closeOtherTabs },
    { id: 'tab.closeAll', title: 'Close all tabs', keys: ['ba'], run: app.closeAllTabs },

    { id: 'view.live', title: 'Live view', keys: ['vl'], run: () => app.setMode('live') },
    { id: 'view.source', title: 'Source view', keys: ['vs'], run: () => app.setMode('source') },
    { id: 'view.split', title: 'Split view', keys: ['vv'], run: () => app.setMode('split') },
    { id: 'view.preview', title: 'Preview', keys: ['vp'], run: () => app.setMode('preview') },

    { id: 'ui.theme', title: 'Toggle dark theme', keys: ['ub'], run: app.toggleTheme },
    { id: 'ui.vim', title: 'Toggle Vim mode', keys: ['uv'], run: app.toggleVim },
  ];
}
