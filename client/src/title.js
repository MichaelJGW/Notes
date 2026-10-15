// A note's title is the first line of its Markdown, minus any leading "#" (mirrors server/src/title.js).
export const deriveTitle = (content) =>
  String(content ?? '')
    .split('\n', 1)[0]
    .replace(/^\s*#{1,6}\s*/, '')
    .trim() || 'Untitled';

// For rendering: show a plain first line as the document's H1 title.
export const asDocument = (content) => content.replace(/^(?![ \t]*#)([^\n]*\S[^\n]*)/, '# $1');
