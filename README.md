# Notes

Markdown note-taking app: **React + Vite** client, **Express** API, **PostgreSQL** storage.

- **Notebooks** contain **groups** and **notes**; switch, create, share, rename or delete them from the dropdown next to **Notes** in the top bar
- Groups nest to any depth (group → group → group …)
- A note's **title is the first line** of its Markdown (a leading `#` is ignored); new notes start blank with a
  "Title" placeholder, and search, tabs, the sidebar and `[[links]]` all use that first line
- **File tree navigation**: `SPC e` / `SPC w h` focuses the tree, then `j`/`k` move, `l` opens or expands, `h` collapses
  or goes to the parent, `a`/`A` add a note/group, `r` renames, `d` deletes, `Esc` (or `SPC w l`) returns to the note
- Notes are Markdown, edited in four modes:
  - **Live** — Apple Notes–style: Markdown renders as you type; raw syntax shows only on the line you're editing
  - **Source**, **Split** (side-by-side preview) and **Preview**
- **Wiki links**: `[[Note title]]` or `[[Note title|label]]`, with autocomplete, hover previews, click-to-follow
  (or create, if the note doesn't exist yet) and a "Linked from" backlinks list
- **LazyVim-style leader key**: `Space` in Vim normal mode opens a which-key menu
  (`SPC SPC` find note, `SPC :` commands, `SPC /` grep, `SPC b b/j/n/p/d/o` tabs, `SPC v …` views, `SPC n …` notes)
- **Picker** (`Ctrl+Space`, the search bar, `SPC SPC` or `Ctrl/Cmd+K`): fuzzy note titles plus full-text matches; start with `:` for commands, `/` to grep
- **Tabs**: every opened note becomes a buffer-style tab (`H`/`L`, `[b`/`]b`, `:bn`, `:bp`, `:bd`, `:e title` in Vim)
- **Status line**: lualine-style mode badge (NORMAL / INSERT / VISUAL / VIEW) with word, character and read-time counts
- In Vim mode, putting the cursor on a link shows a **docked preview below the note** (no floating popups); `gd`/`gf` follow it
- **Vim mode** (`Alt+V`, with `:w`, `:q`, `:wq`) and keyboard shortcuts for everything — `Ctrl/Cmd+/` lists them
- Browser back/forward moves between notes (`#/note/:id` URLs)
- Autosave (600 ms debounce, `Ctrl/Cmd+S` to save now)
- Drag notes and groups to move them; drag `.md` files from your desktop onto the tree to import
- Download any note as a `.md` file

## Getting started

```bash
npm install
npm run db:up                      # Postgres 17 in Docker on localhost:5433
cp server/.env.example server/.env # if not already present
npm run dev                        # API on :3001, client on http://localhost:5173
```

The schema (`server/src/schema.sql`) is applied automatically when the server starts.

### Google sign-in

Every `/api` route requires signing in with Google. Each account owns its own notebooks and sees nothing else
unless it's shared:

- The owner can share a notebook (notebook menu next to **Notes** in the top bar → share icon) with any email as **Can read** or **Can edit**
- Readers can browse, search and download it, but the editor is read-only and the server refuses changes (403)
- Editors can change notes and groups; only the owner can rename, delete or re-share the notebook

`ALLOWED_EMAILS` in `server/.env` limits who can sign in and create notebooks (empty = any Google account).
Anyone a notebook is shared with can always sign in. Both are checked on every request, so changes apply at once.

To set up the OAuth client:

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type **Web application**
   (set up the consent screen first if asked; "External" + test users is fine for personal use)
2. Add the authorized redirect URI `{APP_URL}/api/auth/google/callback`, e.g. `http://localhost:5173/api/auth/google/callback`
   for `npm run dev`, or `http://localhost:3001/api/auth/google/callback` for `npm start`
3. Put the client ID and secret in `server/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and set `APP_URL` to match

Production: `npm run build && npm start` serves the built client from the API at http://localhost:3001.

## API

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/auth/google` | → redirects to Google sign-in |
| GET | `/api/auth/me` | → `{ email, name, picture }` |
| POST | `/api/auth/logout` | |
| GET / POST | `/api/notebooks` | `{ name }` — each notebook includes your `role`: `owner`, `write` or `read` |
| PATCH / DELETE | `/api/notebooks/:id` | `{ name }` |
| GET / PUT | `/api/notebooks/:id/shares` | `{ email, role }` with `role` `read` or `write` (owner only) |
| DELETE | `/api/notebooks/:id/shares/:email` | (owner only) |
| GET | `/api/notebooks/:id/tree` | → `{ notebook, groups, notes }` (flat, no note content) |
| POST | `/api/groups` | `{ notebook_id, parent_id?, name }` |
| PATCH / DELETE | `/api/groups/:id` | `{ name?, parent_id? }` |
| POST | `/api/notes` | `{ notebook_id, group_id?, content? }` — or `title` to seed the first line |
| GET / PATCH / DELETE | `/api/notes/:id` | `{ content?, group_id? }` (title is derived from the first line) |
| GET | `/api/notes` | → every note's id, title, notebook and group (no content) |
| GET | `/api/notes/:id/backlinks` | → notes containing `[[this title]]` |
| GET | `/api/notes/:id/download` | → `.md` file |
| GET | `/api/search?q=` | → ranked matches with `«highlighted»` snippets |

Deleting a notebook or group cascades to everything inside it.
