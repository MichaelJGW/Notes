import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { deriveTitle } from './title.js';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const query = (text, params) => pool.query(text, params);

export async function migrate() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  await moveTitlesIntoBody();
}

// One-time: titles used to be a separate field; now the first line of the Markdown is the title.
// Prepend "# Title" to any note whose first line doesn't already match its title.
async function moveTitlesIntoBody() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const done = await client.query("SELECT 1 FROM app_meta WHERE key = 'title_in_body' FOR UPDATE");
    if (!done.rowCount) {
      const { rows } = await client.query('SELECT id, title, content FROM notes');
      for (const note of rows) {
        if (deriveTitle(note.content) === note.title) continue;
        if (note.title === 'Untitled') {
          await client.query('UPDATE notes SET title = $1 WHERE id = $2', [deriveTitle(note.content), note.id]);
        } else {
          const content = note.content ? `# ${note.title}\n\n${note.content}` : `# ${note.title}`;
          await client.query('UPDATE notes SET content = $1 WHERE id = $2', [content, note.id]);
        }
      }
      await client.query("INSERT INTO app_meta (key, value) VALUES ('title_in_body', 'done')");
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Throws 400 unless the group exists and belongs to the given notebook.
export async function assertGroupInNotebook(groupId, notebookId) {
  const { rows } = await query('SELECT notebook_id FROM note_groups WHERE id = $1', [groupId]);
  if (!rows.length || rows[0].notebook_id !== notebookId) {
    throw new HttpError(400, 'Group does not belong to this notebook');
  }
}

// SQL condition: notebook alias `nb` is owned by, or shared with, the email in parameter $n.
export const canSee = (n) =>
  `(nb.owner_email = $${n} OR EXISTS (SELECT 1 FROM notebook_shares s WHERE s.notebook_id = nb.id AND s.email = $${n}))`;

const RANK = { read: 1, write: 2, owner: 3 };

// Throws unless `email` has at least `need` ('read' | 'write' | 'owner') on the notebook.
// Notebooks you can't see at all are reported as missing rather than forbidden.
export async function assertNotebookAccess(notebookId, email, need) {
  const { rows } = await query(
    `SELECT CASE WHEN nb.owner_email = $2 THEN 'owner' ELSE s.role END AS role
     FROM notebooks nb
     LEFT JOIN notebook_shares s ON s.notebook_id = nb.id AND s.email = $2
     WHERE nb.id = $1`,
    [notebookId, email]
  );
  const role = rows[0]?.role;
  if (!role) throw new HttpError(404, 'Notebook not found');
  if (RANK[role] < RANK[need]) {
    throw new HttpError(403, need === 'owner' ? 'Only the owner can do that' : 'You have read-only access to this notebook');
  }
  return role;
}
