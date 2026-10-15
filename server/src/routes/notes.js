import { Router } from 'express';
import { query, HttpError, assertGroupInNotebook, assertNotebookAccess, canSee } from '../db.js';
import { deriveTitle } from '../title.js';

const router = Router();

// The note, if `email` has at least `need` access to its notebook.
async function findNote(id, email, need) {
  const { rows } = await query('SELECT * FROM notes WHERE id = $1', [id]);
  if (!rows.length) throw new HttpError(404, 'Note not found');
  await assertNotebookAccess(rows[0].notebook_id, email, need).catch((e) => {
    throw e.status === 404 ? new HttpError(404, 'Note not found') : e;
  });
  return rows[0];
}

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

// Lightweight index of every note (no content) for wiki-link resolution and autocomplete.
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.notebook_id, n.group_id, n.title, n.updated_at
     FROM notes n JOIN notebooks nb ON nb.id = n.notebook_id
     WHERE ${canSee(1)}
     ORDER BY n.updated_at DESC`,
    [req.user.email]
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  res.json(await findNote(req.params.id, req.user.email, 'read'));
});

router.post('/', async (req, res) => {
  const notebookId = Number(req.body?.notebook_id);
  const groupId = req.body?.group_id ?? null;
  // The title is the first line of the content; a bare `title` (e.g. from a [[link]]) seeds that line.
  const content = req.body?.content !== undefined ? String(req.body.content) : String(req.body?.title ?? '').trim();
  const title = deriveTitle(content);
  if (!notebookId) throw new HttpError(400, 'notebook_id is required');
  await assertNotebookAccess(notebookId, req.user.email, 'write');
  if (groupId !== null) await assertGroupInNotebook(groupId, notebookId);

  const { rows } = await query(
    'INSERT INTO notes (notebook_id, group_id, title, content) VALUES ($1, $2, $3, $4) RETURNING *',
    [notebookId, groupId, title, content]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const note = await findNote(req.params.id, req.user.email, 'write');
  const body = req.body ?? {};
  const content = body.content !== undefined ? String(body.content) : note.content;
  const title = deriveTitle(content);
  const groupId = body.group_id !== undefined ? body.group_id : note.group_id;
  if (groupId !== null && groupId !== note.group_id) await assertGroupInNotebook(groupId, note.notebook_id);

  const { rows } = await query(
    `UPDATE notes SET title = $1, content = $2, group_id = $3, updated_at = now()
     WHERE id = $4 RETURNING *`,
    [title, content, groupId, note.id]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const note = await findNote(req.params.id, req.user.email, 'write');
  await query('DELETE FROM notes WHERE id = $1', [note.id]);
  res.status(204).end();
});

// Notes that link here via [[Title]] or [[Title|alias]].
router.get('/:id/backlinks', async (req, res) => {
  const note = await findNote(req.params.id, req.user.email, 'read');
  const t = escapeLike(note.title);
  const { rows } = await query(
    `SELECT n.id, n.notebook_id, n.group_id, n.title, n.updated_at
     FROM notes n JOIN notebooks nb ON nb.id = n.notebook_id
     WHERE n.id <> $1 AND (n.content ILIKE $2 OR n.content ILIKE $3) AND ${canSee(4)}
     ORDER BY n.updated_at DESC`,
    [note.id, `%[[${t}]]%`, `%[[${t}|%`, req.user.email]
  );
  res.json(rows);
});

// Download the note as a .md file.
router.get('/:id/download', async (req, res) => {
  const note = await findNote(req.params.id, req.user.email, 'read');
  const filename = (note.title.replace(/[^\w\- ]+/g, '').trim() || 'note') + '.md';
  res.attachment(filename).type('text/markdown; charset=utf-8').send(note.content);
});

export default router;
