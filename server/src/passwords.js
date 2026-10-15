import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;
const KEY_LENGTH = 64;

// Cost for new hashes (OWASP: N=2^17, r=8, p=1). Each hash needs 128·N·r bytes = 128 MiB of memory,
// above Node's 32 MiB default, hence maxmem.
const COST = { N: 2 ** 17, r: 8, p: 1 };
const LEGACY_COST = { N: 2 ** 14, r: 8, p: 1 }; // Node's default, used by "scrypt$<salt>$<key>" hashes
const options = ({ N, r, p }) => ({ N, r, p, maxmem: 256 * N * r });

// Stored as "scrypt$<N>$<r>$<p>$<salt hex>$<key hex>", so the cost can be raised later
// without breaking existing passwords.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, options(COST));
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('hex'), key.toString('hex')].join('$');
}

function parse(stored) {
  const parts = String(stored).split('$');
  if (parts[0] !== 'scrypt') return null;
  if (parts.length === 3) return { cost: LEGACY_COST, salt: parts[1], key: parts[2] };
  if (parts.length !== 6) return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  return { cost: { N, r, p }, salt: parts[4], key: parts[5] };
}

export async function verifyPassword(password, stored) {
  const hash = parse(stored);
  if (!hash) return false;
  const expected = Buffer.from(hash.key, 'hex');
  const actual = await scryptAsync(password, Buffer.from(hash.salt, 'hex'), expected.length, options(hash.cost));
  return timingSafeEqual(actual, expected);
}

// True when a hash was made with a different cost than new ones get, so it should be re-hashed.
export function needsRehash(stored) {
  const cost = parse(stored)?.cost;
  return !cost || cost.N !== COST.N || cost.r !== COST.r || cost.p !== COST.p;
}

// Checked against when the account doesn't exist, so a wrong email takes as long as a wrong password.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
