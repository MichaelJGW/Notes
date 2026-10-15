import { Router } from 'express';
import { query, HttpError, assertGroupInNotebook, assertNotebookAccess } from '../db.js';

const router = Router();

router.post('/', async (req, res) => {
  const notebookId = Number(req.body?.notebook_id);
  const parentId = req.body?.parent_id ?? null;
  const name = String(req.body?.name ?? '').trim() || 'New group';
  if (!notebookId) throw new HttpError(400, 'notebook_id is required');
  await assertNotebookAccess(notebookId, req.user.email, 'write');
  if (parentId !== null) await assertGroupInNotebook(parentId, notebookId);

  const { rows } = await query(
    'INSERT INTO note_groups (notebook_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id, parent_id, name',
    [notebookId, parentId, name]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: found } = await query('SELECT * FROM note_groups WHERE id = $1', [id]);
  if (!found.length) throw new HttpError(404, 'Group not found');
  const group = found[0];
  await assertNotebookAccess(group.notebook_id, req.user.email, 'write');

  let { name, parent_id: parentId } = group;
  if (req.body?.name !== undefined) {
    name = String(req.body.name).trim();
    if (!name) throw new HttpError(400, 'Name is required');
  }
  if (req.body?.parent_id !== undefined) {
    parentId = req.body.parent_id;
    if (parentId !== null) {
      await assertGroupInNotebook(parentId, group.notebook_id);
      // Refuse to move a group into itself or one of its descendants.
      const { rows: cycle } = await query(
        `WITH RECURSIVE sub AS (
           SELECT id FROM note_groups WHERE id = $1
           UNION ALL
           SELECT g.id FROM note_groups g JOIN sub ON g.parent_id = sub.id
         )
         SELECT 1 FROM sub WHERE id = $2`,
        [id, parentId]
      );
      if (cycle.length) throw new HttpError(400, 'Cannot move a group into itself or its subgroups');
    }
  }

  const { rows } = await query(
    'UPDATE note_groups SET name = $1, parent_id = $2 WHERE id = $3 RETURNING id, parent_id, name',
    [name, parentId, id]
  );
  res.json(rows[0]);
});

// Cascades to subgroups and their notes.
router.delete('/:id', async (req, res) => {
  const { rows } = await query('SELECT notebook_id FROM note_groups WHERE id = $1', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Group not found');
  await assertNotebookAccess(rows[0].notebook_id, req.user.email, 'write');
  await query('DELETE FROM note_groups WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
