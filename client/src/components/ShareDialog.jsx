import { useEffect, useState } from 'react';
import { Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../api.js';

const ROLES = [
  { id: 'read', label: 'Can read' },
  { id: 'write', label: 'Can edit' },
];

// Owner-only: who else can see this notebook, and whether they can edit it.
export default function ShareDialog({ notebook, onClose }) {
  const [shares, setShares] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('read');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listShares(notebook.id).then(setShares, (e) => setError(e.message));
  }, [notebook.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const upsert = (share) =>
    setShares((list) => [...list.filter((s) => s.email !== share.email), share].sort((a, b) => a.email.localeCompare(b.email)));

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      upsert(await api.share(notebook.id, email, role));
      setEmail('');
    });
  };
  const changeRole = (share, newRole) => run(async () => upsert(await api.share(notebook.id, share.email, newRole)));
  const remove = (share) =>
    run(async () => {
      await api.unshare(notebook.id, share.email);
      setShares((list) => list.filter((s) => s.email !== share.email));
    });

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog share-dialog" role="dialog" aria-label={`Share ${notebook.name}`}>
        <header className="dialog-header">
          <h2>Share “{notebook.name}”</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <form className="share-form" onSubmit={add}>
          <input
            type="email"
            required
            autoFocus
            placeholder="Google account email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <RoleSelect value={role} onChange={setRole} />
          <button className="btn primary small" type="submit">
            <UserPlus size={15} /> Share
          </button>
        </form>
        {error && <p className="share-error">{error}</p>}
        <ul className="share-list">
          {shares?.length === 0 && <li className="share-empty">Only you can see this notebook.</li>}
          {shares?.map((s) => (
            <li key={s.email}>
              <span className="share-email">{s.email}</span>
              <RoleSelect value={s.role} onChange={(r) => changeRole(s, r)} />
              <button className="icon-btn danger" title="Stop sharing" onClick={() => remove(s)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <p className="share-hint">They sign in with that Google account to see it.</p>
      </div>
    </div>
  );
}

function RoleSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {ROLES.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
