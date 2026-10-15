CREATE TABLE IF NOT EXISTS notebooks (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups nest arbitrarily via parent_id (NULL = top level of the notebook).
CREATE TABLE IF NOT EXISTS note_groups (
  id          SERIAL PRIMARY KEY,
  notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES note_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS note_groups_notebook_idx ON note_groups(notebook_id);
CREATE INDEX IF NOT EXISTS note_groups_parent_idx ON note_groups(parent_id);

-- Notes hold raw Markdown. group_id NULL = top level of the notebook.
CREATE TABLE IF NOT EXISTS notes (
  id          SERIAL PRIMARY KEY,
  notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  group_id    INTEGER REFERENCES note_groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_notebook_idx ON notes(notebook_id);
CREATE INDEX IF NOT EXISTS notes_group_idx ON notes(group_id);

-- Full-text search over title + body; queries must use this exact expression to hit the index.
CREATE INDEX IF NOT EXISTS notes_search_idx ON notes USING GIN (to_tsvector('english', title || ' ' || content));

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Login sessions (Google OAuth). The cookie holds the random id; the role is
-- re-checked against the allowlists on every request, so editing .env revokes access.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  picture    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- Each notebook belongs to one Google account (lower-cased email) and can be shared with others.
-- Notebooks from before sign-in existed have no owner and stay hidden until one is assigned.
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS owner_email TEXT;
CREATE INDEX IF NOT EXISTS notebooks_owner_idx ON notebooks(owner_email);

CREATE TABLE IF NOT EXISTS notebook_shares (
  notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('read', 'write')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notebook_id, email)
);
CREATE INDEX IF NOT EXISTS notebook_shares_email_idx ON notebook_shares(email);

-- Email + password accounts for sign-in without Google (e.g. on a home network).
-- Created with `npm run user`; the email is the identity, same as with Google.
CREATE TABLE IF NOT EXISTS local_users (
  email         TEXT PRIMARY KEY,
  name          TEXT,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
