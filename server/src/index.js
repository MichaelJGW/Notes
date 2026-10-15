import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import notebooks from './routes/notebooks.js';
import groups from './routes/groups.js';
import notes from './routes/notes.js';
import search from './routes/search.js';
import auth, { loadUser, requireUser } from './auth.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.use('/api', loadUser);
app.use('/api/auth', auth);
app.use('/api', requireUser);
app.use('/api/notebooks', notebooks);
app.use('/api/groups', groups);
app.use('/api/notes', notes);
app.use('/api/search', search);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built client.
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*any}', (req, res) => res.sendFile('index.html', { root: dist }));
}

app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const port = process.env.PORT ?? 3001;
await migrate();
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
