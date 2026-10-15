import { Router } from 'express';
import { query, HttpError, canSee, assertNotebookAccess } from '../db.js';

const router = Router();

function requireName(body) {
  const name = String(body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Name is required');
  return name;
}

// Each notebook comes with the caller's role: 'owner', 'write' or 'read'.
const SELECT_WITH_ROLE = `
  SELECT nb.*, CASE WHEN nb.owner_email = $1 THEN 'owner' ELSE s.role END AS role
  FROM notebooks nb
  LEFT JOIN notebook_shares s ON s.notebook_id = nb.id AND s.email = $1`;

router.get('/', async (req, res) => {
  const { rows } = await query(`${SELECT_WITH_ROLE} WHERE ${canSee(1)} ORDER BY lower(nb.name)`, [req.user.email]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { rows } = await query(
    "INSERT INTO notebooks (name, owner_email) VALUES ($1, $2) RETURNING *, 'owner' AS role",
    [requireName(req.body), req.user.email]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const role = await assertNotebookAccess(req.params.id, req.user.email, 'owner');
  const { rows } = await query('UPDATE notebooks SET name = $1 WHERE id = $2 RETURNING *', [
    requireName(req.body),
    req.params.id,
  ]);
  res.json({ ...rows[0], role });
});

router.delete('/:id', async (req, res) => {
  await assertNotebookAccess(req.params.id, req.user.email, 'owner');
  await query('DELETE FROM notebooks WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// Flat list of every group and note (without content) in the notebook;
// the client assembles the tree from parent_id / group_id.
router.get('/:id/tree', async (req, res) => {
  const id = req.params.id;
  await assertNotebookAccess(id, req.user.email, 'read');
  const [nb, groups, notes] = await Promise.all([
    query(`${SELECT_WITH_ROLE} WHERE nb.id = $2`, [req.user.email, id]),
    query('SELECT id, parent_id, name FROM note_groups WHERE notebook_id = $1 ORDER BY lower(name)', [id]),
    query('SELECT id, group_id, title, updated_at FROM notes WHERE notebook_id = $1 ORDER BY lower(title)', [id]),
  ]);
  res.json({ notebook: nb.rows[0], groups: groups.rows, notes: notes.rows });
});

// ---- Sharing (owner only) ----

router.get('/:id/shares', async (req, res) => {
  await assertNotebookAccess(req.params.id, req.user.email, 'owner');
  const { rows } = await query('SELECT email, role FROM notebook_shares WHERE notebook_id = $1 ORDER BY email', [
    req.params.id,
  ]);
  res.json(rows);
});

// Add someone, or change their role: { email, role: 'read' | 'write' }.
router.put('/:id/shares', async (req, res) => {
  await assertNotebookAccess(req.params.id, req.user.email, 'owner');
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role = req.body?.role;
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (role !== 'read' && role !== 'write') throw new HttpError(400, "Role must be 'read' or 'write'");
  if (email === req.user.email) throw new HttpError(400, 'You already own this notebook');
  const { rows } = await query(
    `INSERT INTO notebook_shares (notebook_id, email, role) VALUES ($1, $2, $3)
     ON CONFLICT (notebook_id, email) DO UPDATE SET role = EXCLUDED.role
     RETURNING email, role`,
    [req.params.id, email, role]
  );
  res.json(rows[0]);
});

router.delete('/:id/shares/:email', async (req, res) => {
  await assertNotebookAccess(req.params.id, req.user.email, 'owner');
  await query('DELETE FROM notebook_shares WHERE notebook_id = $1 AND email = $2', [
    req.params.id,
    req.params.email.toLowerCase(),
  ]);
  res.status(204).end();
});

export default router;
