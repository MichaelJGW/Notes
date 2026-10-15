// Autocomplete note titles after typing "[[".
export function wikiCompletion(callbacks) {
  return (context) => {
    const match = context.matchBefore(/\[\[[^[\]|\n]*/);
    if (!match) return null;
    const closed = context.state.sliceDoc(context.pos, context.pos + 2) === ']]';
    const seen = new Set();
    const options = [];
    for (const note of callbacks.current.notes()) {
      const key = note.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        label: note.title,
        detail: callbacks.current.notebookName(note.notebook_id),
        apply: closed ? note.title : `${note.title}]]`,
      });
    }
    return { from: match.from + 2, options, validFor: /^[^[\]|\n]*$/ };
  };
}
