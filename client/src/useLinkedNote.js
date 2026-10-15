import { useEffect, useState } from 'react';
import { api } from './api.js';

// Linked-note bodies, keyed by id + updated_at so edits invalidate them.
const cache = new Map();

// Fetch (and cache) the full note behind a resolved link target.
export function useLinkedNote(target) {
  const key = target ? `${target.id}:${target.updated_at}` : null;
  const [note, setNote] = useState(() => (key ? cache.get(key) : null) ?? null);

  useEffect(() => {
    if (!key) return setNote(null);
    if (cache.has(key)) return setNote(cache.get(key));
    setNote(null);
    let cancelled = false;
    api
      .getNote(target.id)
      .then((n) => {
        cache.set(key, n);
        if (!cancelled) setNote(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `key` captures target.id and target.updated_at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return note;
}
