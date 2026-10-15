import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { query, HttpError } from './db.js';
import {
  DUMMY_HASH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './passwords.js';

const SESSION_COOKIE = 'notes_session';
const STATE_COOKIE = 'notes_oauth_state';
const SESSION_DAYS = 30;

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const redirectUri = () => `${appUrl()}/api/auth/google/callback`;
const secure = () => appUrl().startsWith('https:');

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Who may sign up / sign in with Google: anyone in ALLOWED_EMAILS (everyone, if it's empty),
// plus anyone a notebook has been shared with.
async function mayJoin(email) {
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length || allowed.includes(email)) return true;
  const { rowCount } = await query('SELECT 1 FROM notebook_shares WHERE email = $1 LIMIT 1', [email]);
  return rowCount > 0;
}

// ...and anyone who already has a local account. Checked on every request, so edits to .env apply at once.
async function canSignIn(email) {
  if (await mayJoin(email)) return true;
  const { rowCount } = await query('SELECT 1 FROM local_users WHERE email = $1', [email]);
  return rowCount > 0;
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

function setCookie(res, name, value, maxAgeSeconds) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure()) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

// Attaches req.user = { email, name, picture } when the session is valid and still allowed.
export async function loadUser(req, res, next) {
  const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (id) {
    const { rows } = await query('SELECT lower(email) AS email, name, picture FROM sessions WHERE id = $1 AND expires_at > now()', [id]);
    if (rows.length && (await canSignIn(rows[0].email))) req.user = rows[0];
  }
  next();
}

// Per-notebook permissions are checked in the routes.
export function requireUser(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Sign in required');
  next();
}

async function startSession(res, { email, name = null, picture = null }) {
  const id = randomBytes(32).toString('base64url');
  await query('DELETE FROM sessions WHERE expires_at < now()');
  await query(
    `INSERT INTO sessions (id, email, name, picture, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [id, email, name, picture, SESSION_DAYS]
  );
  setCookie(res, SESSION_COOKIE, id, SESSION_DAYS * 24 * 3600);
}

const router = Router();

// Which sign-in options the login screen should offer.
router.get('/providers', (req, res) => {
  res.json({ google: !!process.env.GOOGLE_CLIENT_ID });
});

router.get('/me', (req, res) => {
  if (!req.user) throw new HttpError(401, 'Sign in required');
  res.json(req.user);
});

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) throw new HttpError(500, 'GOOGLE_CLIENT_ID is not set');
  const state = randomBytes(24).toString('base64url');
  setCookie(res, STATE_COOKIE, state, 600);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const fail = (reason) => res.redirect(`${appUrl()}/?auth_error=${encodeURIComponent(reason)}`);
  const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
  setCookie(res, STATE_COOKIE, '', 0);
  if (req.query.error) return fail(String(req.query.error));
  if (!expected || req.query.state !== expected) return fail('Login expired, please try again');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code ?? ''),
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.id_token) return fail('Google sign-in failed');

  // The ID token came straight from Google's token endpoint over TLS, so its signature
  // doesn't need re-verifying (OIDC Core 3.1.3.7); still check who it was issued for.
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
  const issuerOk = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
  if (!issuerOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email_verified) {
    return fail('Google sign-in failed');
  }
  const email = claims.email.toLowerCase();
  if (!(await canSignIn(email))) return fail(`${email} doesn't have access`);

  await startSession(res, { email, name: claims.name, picture: claims.picture });
  res.redirect(`${appUrl()}/`);
});

// Failed password attempts per email; too many in a row locks that email out for a while.
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map(); // email -> { count, until }

router.post('/local', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) throw new HttpError(400, 'Enter your email and password');
  if (password.length > MAX_PASSWORD_LENGTH) throw new HttpError(401, 'Wrong email or password');

  const record = failures.get(email);
  if (record?.until > Date.now()) throw new HttpError(429, 'Too many attempts, try again in a few minutes');

  const { rows } = await query('SELECT email, name, password_hash FROM local_users WHERE email = $1', [email]);
  const ok = await verifyPassword(password, rows[0]?.password_hash ?? DUMMY_HASH);
  if (!ok || !rows.length) {
    const count = (record?.count ?? 0) + 1;
    failures.set(email, { count, until: count >= MAX_FAILURES ? Date.now() + LOCKOUT_MS : 0 });
    throw new HttpError(401, 'Wrong email or password');
  }
  failures.delete(email);
  // Upgrade hashes made with an older cost while we have the password.
  if (needsRehash(rows[0].password_hash)) {
    await query('UPDATE local_users SET password_hash = $1 WHERE email = $2', [await hashPassword(password), email]);
  }
  await startSession(res, rows[0]);
  res.status(204).end();
});

// Sign-ups per IP address, so nobody can mass-create accounts (each hash also costs ~128 MiB briefly).
const SIGNUPS_PER_HOUR = 10;
const signups = new Map(); // ip -> timestamps of recent sign-ups

// Emails aren't verified yet, so whoever signs up first holds that address here. To stop that
// being used to take over someone's notebooks, an email that already owns notebooks or has
// signed in before (e.g. with Google) can't be claimed by a new password account.
router.post('/signup', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim().slice(0, 100) || null;
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
  if (password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters for your password`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'That password is too long');

  const now = Date.now();
  const recent = (signups.get(req.ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= SIGNUPS_PER_HOUR) throw new HttpError(429, 'Too many sign-ups from this network, try again later');

  if (!(await mayJoin(email))) throw new HttpError(403, `${email} isn't allowed to sign up here`);
  const { rowCount: taken } = await query(
    `SELECT 1 FROM local_users WHERE email = $1
     UNION ALL SELECT 1 FROM notebooks WHERE owner_email = $1
     UNION ALL SELECT 1 FROM sessions WHERE lower(email) = $1
     LIMIT 1`,
    [email]
  );
  if (taken) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');

  const { rows } = await query(
    `INSERT INTO local_users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING email, name`,
    [email, name, await hashPassword(password)]
  );
  if (!rows.length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  signups.set(req.ip, [...recent, now]);
  await startSession(res, rows[0]);
  res.status(201).end();
});

router.post('/logout', async (req, res) => {
  const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (id) await query('DELETE FROM sessions WHERE id = $1', [id]);
  setCookie(res, SESSION_COOKIE, '', 0);
  res.status(204).end();
});

export default router;
