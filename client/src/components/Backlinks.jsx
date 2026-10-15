import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { api } from '../api.js';
import { useWiki } from '../wiki.js';

// "Linked from" list: notes that reference this one with [[Title]].
export default function Backlinks({ noteId, title }) {
  const wiki = useWiki();
  const [links, setLinks] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .backlinks(noteId)
        .then((rows) => !cancelled && setLinks(rows))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [noteId, title]);

  if (!links.length) return null;
  return (
    <section className="backlinks">
      <h4>
        <Link2 size={14} /> Linked from {links.length} {links.length === 1 ? 'note' : 'notes'}
      </h4>
      <div className="backlink-list">
        {links.map((n, i) => (
          <button key={n.id} className="backlink" style={{ '--i': i }} data-wiki={n.title} onClick={() => wiki.openNote(n)}>
            <span className="backlink-title">{n.title}</span>
            <span className="backlink-meta">{wiki.notebookName(n.notebook_id)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
