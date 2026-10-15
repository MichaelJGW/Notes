// A note's title is the first line of its Markdown, minus any leading "#".
export const deriveTitle = (content) =>
  String(content ?? '')
    .split('\n', 1)[0]
    .replace(/^\s*#{1,6}\s*/, '')
    .trim() || 'Untitled';
