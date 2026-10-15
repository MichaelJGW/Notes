import { LEADER_GROUPS, keyLabel } from '../commands.js';

const keyOrder = (k) => (k === ' ' ? '0' : /[a-z]/.test(k) ? `2${k}` : /[A-Z]/.test(k) ? `3${k}` : `1${k}`);

// LazyVim-style which-key panel: what each next key does after the current leader prefix.
export default function WhichKey({ seq, commands }) {
  const prefix = seq.join('');
  const entries = new Map();
  for (const c of commands) {
    for (const k of c.keys) {
      if (k.length <= prefix.length || !k.startsWith(prefix)) continue;
      const next = k[prefix.length];
      if (k.length === prefix.length + 1) entries.set(next, { key: next, label: c.title, group: false });
      else if (!entries.has(next)) entries.set(next, { key: next, label: LEADER_GROUPS[next] ?? '…', group: true });
    }
  }
  const sorted = [...entries.values()].sort((a, b) => keyOrder(a.key).localeCompare(keyOrder(b.key)));

  return (
    <div className="whichkey" role="dialog" aria-label="Leader key menu">
      <header className="wk-header">
        <span className="wk-path" key={prefix}>
          <kbd>SPC</kbd>
          {seq.map((k, i) => (
            <kbd key={i}>{keyLabel(k)}</kbd>
          ))}
          {prefix && LEADER_GROUPS[prefix] && <span className="wk-group-name">{LEADER_GROUPS[prefix]}</span>}
        </span>
      </header>
      <div className="wk-grid" key={prefix}>
        {sorted.map((e, i) => (
          <div key={e.key} className={`wk-item${e.group ? ' group' : ''}`} style={{ '--i': i }}>
            <kbd>{keyLabel(e.key)}</kbd>
            <span className="wk-arrow">→</span>
            <span className="wk-label">{e.group ? `+${e.label}` : e.label}</span>
          </div>
        ))}
      </div>
      <footer className="wk-footer">
        <span><kbd>Esc</kbd> close</span>
        <span><kbd>⌫</kbd> back</span>
      </footer>
    </div>
  );
}
