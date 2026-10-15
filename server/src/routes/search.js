import { Router } from 'express';
import { query, canSee } from '../db.js';

const router = Router();

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

// Full-text search with prefix matching on every word (so results appear while typing),
// plus a substring match on titles. Snippets mark hits with «…».
router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const words = q.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (!words.length) return res.json([]);
  const tsquery = words.map((w) => `${w}:*`).join(' & ');

  const { rows } = await query(
    `SELECT n.id, n.title, n.notebook_id, n.group_id, n.updated_at, nb.name AS notebook_name,
            ts_headline('english', n.content, q,
              'StartSel=«, StopSel=», MaxWords=22, MinWords=8, MaxFragments=1') AS snippet
     FROM notes n
     JOIN notebooks nb ON nb.id = n.notebook_id
     CROSS JOIN to_tsquery('english', $1) q
     WHERE (to_tsvector('english', n.title || ' ' || n.content) @@ q OR n.title ILIKE $2) AND ${canSee(3)}
     ORDER BY (n.title ILIKE $2)::int DESC,
              ts_rank(to_tsvector('english', n.title || ' ' || n.content), q) DESC,
              n.updated_at DESC
     LIMIT 30`,
    [tsquery, `%${escapeLike(q)}%`, req.user.email]
  );
  res.json(rows);
});

export default router;
