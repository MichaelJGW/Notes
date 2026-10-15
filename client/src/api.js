async function request(method, url, body, options = {}) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });
  // Session expired or access revoked: reload so the sign-in screen shows.
  if (res.status === 401 && !url.startsWith('/auth/')) window.location.reload();
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => request('GET', '/auth/me'),
  logout: () => request('POST', '/auth/logout'),
  loginUrl: '/api/auth/google',

  listNotebooks: () => request('GET', '/notebooks'),
  createNotebook: (name) => request('POST', '/notebooks', { name }),
  renameNotebook: (id, name) => request('PATCH', `/notebooks/${id}`, { name }),
  deleteNotebook: (id) => request('DELETE', `/notebooks/${id}`),
  getTree: (id) => request('GET', `/notebooks/${id}/tree`),
  listShares: (id) => request('GET', `/notebooks/${id}/shares`),
  share: (id, email, role) => request('PUT', `/notebooks/${id}/shares`, { email, role }),
  unshare: (id, email) => request('DELETE', `/notebooks/${id}/shares/${encodeURIComponent(email)}`),

  createGroup: (data) => request('POST', '/groups', data),
  updateGroup: (id, changes) => request('PATCH', `/groups/${id}`, changes),
  deleteGroup: (id) => request('DELETE', `/groups/${id}`),

  listNotes: () => request('GET', '/notes'),
  getNote: (id) => request('GET', `/notes/${id}`),
  backlinks: (id) => request('GET', `/notes/${id}/backlinks`),
  search: (q, signal) => request('GET', `/search?q=${encodeURIComponent(q)}`, undefined, { signal }),
  createNote: (data) => request('POST', '/notes', data),
  // keepalive lets a save started during page unload still complete.
  updateNote: (id, changes, keepalive = false) => request('PATCH', `/notes/${id}`, changes, { keepalive }),
  deleteNote: (id, keepalive = false) => request('DELETE', `/notes/${id}`, undefined, { keepalive }),
  downloadUrl: (id) => `/api/notes/${id}/download`,
};
