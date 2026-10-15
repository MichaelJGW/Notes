import { createContext, useContext } from 'react';

// [[Target]] or [[Target|label]]
export const WIKI_LINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
export const WIKI_HREF_PREFIX = '#wiki:';

export const WikiContext = createContext(null);
export const useWiki = () => useContext(WikiContext);

// Case-insensitive title lookup, preferring a note in the current notebook.
export function resolveTitle(notes, title, notebookId) {
  const key = title.trim().toLowerCase();
  const matches = notes.filter((n) => n.title.trim().toLowerCase() === key);
  return matches.find((n) => n.notebook_id === notebookId) ?? matches[0] ?? null;
}

// remark plugin: turn [[wiki links]] in text into links with a #wiki: href.
export function remarkWikiLinks() {
  return (tree) => walk(tree);
}

function walk(node) {
  if (!node.children || node.type === 'link') return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitText(child);
    walk(child);
    return [child];
  });
}

function splitText(node) {
  const { value } = node;
  const parts = [];
  let last = 0;
  for (const m of value.matchAll(WIKI_LINK_RE)) {
    if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) });
    parts.push({
      type: 'link',
      url: WIKI_HREF_PREFIX + encodeURIComponent(m[1].trim()),
      children: [{ type: 'text', value: (m[2] ?? m[1]).trim() }],
    });
    last = m.index + m[0].length;
  }
  if (!parts.length) return [node];
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
  return parts;
}
