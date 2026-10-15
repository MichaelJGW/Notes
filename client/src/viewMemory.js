// Per-note cursor and scroll positions. Kept in memory while you work and
// saved to localStorage when the page is hidden, so they survive reloads.
const KEY = 'viewMemory';
const LIMIT = 300;

let entries;
try {
  entries = new Map(JSON.parse(localStorage.getItem(KEY)) ?? []);
} catch {
  entries = new Map();
}

function createStore(prefix) {
  return {
    get: (id) => entries.get(`${prefix}:${id}`),
    set: (id, value) => {
      const key = `${prefix}:${id}`;
      entries.delete(key); // re-insert so the most recently used entries survive trimming
      entries.set(key, value);
    },
  };
}

export const cursorMemory = createStore('cursor');
export const scrollMemory = createStore('scroll');

window.addEventListener('pagehide', () => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...entries].slice(-LIMIT)));
  } catch {
    /* storage unavailable */
  }
});
