// Manage local (email + password) accounts:
//   npm run user -- add <email> [name]   create an account, or reset its password (there's no reset by email yet)
//   npm run user -- remove <email>       delete the account and sign it out everywhere
//   npm run user -- list
import { createInterface } from 'node:readline';
import { migrate, pool, query } from './db.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from './passwords.js';

// Read lines from the terminal without echoing them. One reader serves every prompt, so
// input that arrives all at once (pasted or piped) isn't lost between prompts.
let reader;
const lines = [];
const waiting = [];
function askHidden(prompt) {
  if (!reader) {
    reader = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    reader._writeToOutput = () => {};
    reader.on('line', (line) => (waiting.length ? waiting.shift().resolve(line) : lines.push(line)));
    reader.on('close', () => waiting.splice(0).forEach((w) => w.reject(new Error('Cancelled'))));
  }
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    const done = (line) => {
      process.stdout.write('\n');
      resolve(line);
    };
    if (lines.length) done(lines.shift());
    else waiting.push({ resolve: done, reject });
  });
}

async function add(email, name) {
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Give an email address, e.g. npm run user -- add me@home.arpa');
  const password = await askHidden('Password: ');
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  if ((await askHidden('Repeat password: ')) !== password) throw new Error("Passwords don't match");

  const { rows } = await query(
    `INSERT INTO local_users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = COALESCE(EXCLUDED.name, local_users.name)
     RETURNING (xmax = 0) AS created`,
    [email, name ?? null, await hashPassword(password)]
  );
  if (!rows[0].created) await query('DELETE FROM sessions WHERE lower(email) = $1', [email]);
  console.log(rows[0].created ? `Created ${email}` : `Password changed for ${email} (signed out everywhere)`);
}

async function remove(email) {
  const { rowCount } = await query('DELETE FROM local_users WHERE email = $1', [email]);
  if (!rowCount) throw new Error(`No local account for ${email}`);
  await query('DELETE FROM sessions WHERE lower(email) = $1', [email]);
  console.log(`Removed ${email}. Their notebooks are kept; they can still sign in with Google if allowed.`);
}

async function list() {
  const { rows } = await query('SELECT email, name, created_at FROM local_users ORDER BY email');
  if (!rows.length) console.log('No local accounts.');
  for (const u of rows) console.log(`${u.email}${u.name ? ` (${u.name})` : ''}  created ${u.created_at.toISOString().slice(0, 10)}`);
}

const [command, rawEmail, ...nameParts] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
try {
  await migrate();
  if (command === 'add') await add(email, nameParts.join(' ') || undefined);
  else if (command === 'remove' && email) await remove(email);
  else if (command === 'list') await list();
  else console.log('Usage: npm run user -- add <email> [name] | remove <email> | list');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  reader?.close();
  await pool.end();
}
