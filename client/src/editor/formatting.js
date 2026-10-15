import { EditorSelection } from '@codemirror/state';

// Wrap each selection in `marker`, or unwrap it if it is already wrapped.
const wrap = (marker) => (view) => {
  const { state } = view;
  const n = marker.length;
  view.dispatch(
    state.changeByRange(({ from, to }) => {
      if (state.sliceDoc(from - n, from) === marker && state.sliceDoc(to, to + n) === marker) {
        return {
          changes: [
            { from: from - n, to: from },
            { from: to, to: to + n },
          ],
          range: EditorSelection.range(from - n, to - n),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + n, to + n),
      };
    }),
    { userEvent: 'input' }
  );
  return true;
};

// [selection](url) with "url" selected, ready to type over.
const insertLink = (view) => {
  const { state } = view;
  view.dispatch(
    state.changeByRange(({ from, to }) => {
      const text = state.sliceDoc(from, to) || 'link';
      const insert = `[${text}](url)`;
      const urlStart = from + text.length + 3;
      return { changes: { from, to, insert }, range: EditorSelection.range(urlStart, urlStart + 3) };
    }),
    { userEvent: 'input' }
  );
  return true;
};

const TASK_RE = /^(\s*)([-*+]) \[([ xX])\] /;
const LIST_RE = /^(\s*)([-*+]) /;

// Cycle a line: text → "- [ ] text" → "- [x] text" → "- [ ] text" …
const toggleTask = (view) => {
  const { state } = view;
  const changes = [];
  const seen = new Set();
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (seen.has(line.number)) continue;
      seen.add(line.number);
      const task = line.text.match(TASK_RE);
      const list = line.text.match(LIST_RE);
      if (task) {
        const at = line.from + task[1].length + 3;
        changes.push({ from: at, to: at + 1, insert: task[3] === ' ' ? 'x' : ' ' });
      } else if (list) {
        changes.push({ from: line.from + list[0].length, insert: '[ ] ' });
      } else {
        const indent = line.text.match(/^\s*/)[0].length;
        changes.push({ from: line.from + indent, insert: '- [ ] ' });
      }
    }
  }
  view.dispatch({ changes, userEvent: 'input' });
  return true;
};

export const formattingKeymap = [
  { key: 'Mod-b', run: wrap('**') },
  { key: 'Mod-i', run: wrap('*') },
  { key: 'Mod-Shift-x', run: wrap('~~') },
  { key: 'Mod-e', run: wrap('`') },
  { key: 'Mod-Shift-l', run: insertLink },
  { key: 'Mod-Enter', run: toggleTask },
];
