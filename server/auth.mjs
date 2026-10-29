// server/auth.mjs — password hashing + in-memory session tokens.
// Uses only Node's built-in crypto (no new dependencies).
// Password format stored in DB: "<salt hex>:<scrypt hash hex>"

import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const sessions = new Map(); // token -> { username, role }

export function createSession(account) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username: account.username, role: account.role });
  return token;
}

export function getSessionUser(token) {
  return token ? sessions.get(token) || null : null;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

// -------------------------------------------------------------- authz helpers

export const ROLES = {
  ADMIN: 'admin',
  DISPATCHER: 'dispatcher',
  RESPONDER: 'responder',
  CITIZEN: 'citizen',
};

/** Role-based access control for the Response Center roles. */
export const RC_ROLES = [ROLES.ADMIN, ROLES.DISPATCHER, ROLES.RESPONDER];

/** Extract the Bearer/query token from an Express request. */
export function readToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const t = req.query && req.query.token;
  return t ? String(t) : null;
}

/** Resolve the session behind a request (or null when anonymous/invalid). */
export function resolveSession(req) {
  return getSessionUser(readToken(req));
}

/**
 * Express middleware: reject when no valid session is attached.
 * Attaches `req.user = { username, role }` on success.
 */
export function requireAuth(req, res, next) {
  const user = resolveSession(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  req.user = user;
  next();
}

/** Express middleware: requireAuth + role allow-list (at least one must match). */
export function requireRole(...allowed) {
  const set = new Set(allowed);
  return (req, res, next) => {
    const user = resolveSession(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated' });
    if (!set.has(user.role)) {
      return res.status(403).json({ ok: false, error: 'Forbidden — insufficient privileges' });
    }
    req.user = user;
    next();
  };
}