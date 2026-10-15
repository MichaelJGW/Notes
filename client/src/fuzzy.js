// Subsequence fuzzy match (fzf-lite). Returns { score, indices } or null; higher is better.
export function fuzzyMatch(query, text) {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices = [];
  let score = 0;
  let prev = -2;
  for (let i = 0, qi = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    indices.push(i);
    score += prev === i - 1 ? 5 : 1; // consecutive run
    if (i === 0 || /[\s\-_/.]/.test(t[i - 1])) score += 3; // word start
    prev = i;
    qi++;
  }
  if (indices.length < q.length) return null;
  if (t.startsWith(q)) score += 10;
  return { score: score - t.length * 0.02, indices };
}

export function fuzzyFilter(query, items, getText) {
  return items
    .map((item) => ({ item, match: fuzzyMatch(query, getText(item)) }))
    .filter((r) => r.match)
    .sort((a, b) => b.match.score - a.match.score);
}
