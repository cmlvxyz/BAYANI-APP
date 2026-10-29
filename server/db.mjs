// server/db.mjs — SQLite/libSQL connection + CRUD helpers.
// Uses Turso (hosted libSQL) when DATABASE_URL is set; otherwise falls back to a
// local `file:` database for development (`npm run server`). Same pattern as
// barangay-system. All helpers are async.

import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'incidents.db');
export const DATABASE_URL = process.env.DATABASE_URL || `file:${DB_PATH}`;
export const isRemoteDb = /^(https?|libsql):/i.test(String(DATABASE_URL));

if (!isRemoteDb && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = createClient({
  url: DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || undefined,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      received_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'citizen',
      created_at TEXT NOT NULL
    )
  `);
  // Audit trail for privacy/compliance (who did what, when). Never stores
  // passwords, tokens, or full SOS payloads — only metadata references.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL DEFAULT 'anonymous',
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);
  // Data-subject privacy requests (access / correction / deletion) under the
  // Data Privacy Act baseline — filed by citizens, acted on by the RC admin.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS privacy_requests (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      full_name TEXT NOT NULL,
      contact TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `);
  // `active` flag for accounts (deactivate instead of hard-deleting, so audit
  // references stay intact). SQLite has no IF NOT EXISTS for columns — ignore
  // the duplicate-column error on databases created before this migration.
  try {
    await db.execute('ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  } catch {
    // column already exists — fine
  }
}

export async function saveIncident(incident) {
  const id = String(incident.id || incident.incidentCode || `INC-${Date.now()}`);
  await db.execute(
    'INSERT OR REPLACE INTO incidents (id, data, received_at) VALUES (?, ?, ?)',
    [id, JSON.stringify(incident), new Date().toISOString()]
  );
  return id;
}

export async function listIncidents() {
  const { rows } = await db.execute('SELECT received_at, data FROM incidents ORDER BY received_at DESC');
  // `receivedAt` is the server's own receipt time — the only trustworthy clock
  // on the row, since the client-supplied payload carries a display string
  // ("12:12 AM") rather than a timestamp. Clients use it to tell a freshly
  // raised alert from a stale open one after a reload.
  return rows.map((r) => ({ ...JSON.parse(r.data), receivedAt: r.received_at }));
}

export async function getIncident(id) {
  const { rows } = await db.execute('SELECT data FROM incidents WHERE id = ?', [id]);
  return rows.length ? JSON.parse(rows[0].data) : null;
}

/**
 * Find an incident by its idempotency key (`requestId`). Used so a retried
 * hardware upload resolves to the incident that already exists instead of
 * creating a duplicate emergency. JSON1 is used when available and falls back
 * to an in-memory scan so it can never hard-fail on an older SQLite build.
 */
export async function findIncidentByRequestId(requestId) {
  const key = String(requestId ?? '').trim();
  if (!key) return null;
  try {
    const { rows } = await db.execute(
      "SELECT received_at, data FROM incidents WHERE json_extract(data, '$.requestId') = ? LIMIT 1",
      [key]
    );
    if (rows.length) return { ...JSON.parse(rows[0].data), receivedAt: rows[0].received_at };
  } catch {
    // JSON1 unavailable — fall through to the portable scan below.
  }
  const all = await listIncidents();
  return all.find((i) => i?.requestId === key) || null;
}

export async function mergeIncident(id, patch) {
  const current = await getIncident(id);
  if (!current) return null;
  const merged = { ...current, ...patch };
  await db.execute(
    'INSERT OR REPLACE INTO incidents (id, data, received_at) VALUES (?, ?, ?)',
    [id, JSON.stringify(merged), new Date().toISOString()]
  );
  return merged;
}

export async function deleteIncident(id) {
  await db.execute('DELETE FROM incidents WHERE id = ?', [id]);
}

export async function clearIncidents() {
  await db.execute('DELETE FROM incidents');
}

// -------------------------------------------------------------- contacts

export async function listContacts() {
  const { rows } = await db.execute('SELECT data FROM contacts ORDER BY created_at ASC');
  return rows.map((r) => JSON.parse(r.data));
}

export async function saveContact(contact) {
  const id = String(contact.id || `c-${Date.now()}`);
  await db.execute(
    'INSERT OR REPLACE INTO contacts (id, data, created_at) VALUES (?, ?, ?)',
    [id, JSON.stringify(contact), new Date().toISOString()]
  );
  return id;
}

export async function deleteContact(id) {
  await db.execute('DELETE FROM contacts WHERE id = ?', [id]);
}

export async function markContactsNotified() {
  const current = await listContacts();
  for (const c of current) {
    await db.execute(
      'UPDATE contacts SET data = ? WHERE id = ?',
      [JSON.stringify({ ...c, notificationStatus: 'NOTIFIED' }), c.id]
    );
  }
}

// -------------------------------------------------------------- accounts

export async function saveAccount(account) {
  const id = String(account.id || `acc-${Date.now()}`);
  const username = String(account.username || '').trim();
  const email = String(account.email || '').trim();
  const passwordHash = String(account.password_hash || '');
  const role = account.role || 'citizen';
  const createdAt = account.created_at || new Date().toISOString();
  const active = account.active === undefined ? null : (account.active ? 1 : 0);

  const existing = await getAccountByUsername(username);
  if (existing) {
    // Update in place — never REPLACE the row, which would wipe the `active`
    // flag and could cascade-delete sibling accounts on the unique email index.
    await db.execute(
      'UPDATE accounts SET email = ?, password_hash = ?, role = ?, created_at = ?, active = COALESCE(?, active) WHERE LOWER(username) = LOWER(?)',
      [email, passwordHash, role, createdAt, active, username]
    );
    return String(existing.id);
  }

  // Brand-new account: refuse to silently clobber another account that already
  // owns this email address instead of deleting it via INSERT OR REPLACE.
  if (email) {
    const emailOwner = await getAccountByEmail(email);
    if (emailOwner) {
      throw new Error('Email is already in use by another account');
    }
  }

  await db.execute(
    'INSERT INTO accounts (id, username, email, password_hash, role, created_at, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, username, email, passwordHash, role, createdAt, active === null ? 1 : active]
  );
  return id;
}

export async function getAccountByUsername(username) {
  const { rows } = await db.execute('SELECT * FROM accounts WHERE LOWER(username) = LOWER(?)', [username]);
  return rows.length ? rows[0] : null;
}

export async function getAccountByEmail(email) {
  const { rows } = await db.execute('SELECT * FROM accounts WHERE LOWER(email) = LOWER(?)', [email]);
  return rows.length ? rows[0] : null;
}

// -------------------------------------------------------------- audit logs

export async function saveAuditLog({ actorId = 'anonymous', actorRole = 'anonymous', action, entityType = null, entityId = null, metadata = null }) {
  try {
    await db.execute(
      'INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(actorId), String(actorRole), String(action), entityType, entityId, metadata ? JSON.stringify(metadata).slice(0, 2000) : null, new Date().toISOString()]
    );
  } catch (err) {
    console.warn('[bayani-db] audit log write failed:', err.message);
  }
}

export async function listAuditLogs(limit = 200) {
  const { rows } = await db.execute('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [limit]);
  return rows.map((r) => ({ ...r, metadata: r.metadata ? safeParse(r.metadata) : null }));
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ------------------------------------------------------- privacy requests

export async function savePrivacyRequest(req) {
  const id = String(req.id || `pr-${Date.now()}`);
  await db.execute(
    'INSERT OR REPLACE INTO privacy_requests (id, type, full_name, contact, details, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, String(req.type || 'ACCESS'), String(req.full_name || ''), String(req.contact || ''), String(req.details || ''), String(req.status || 'RECEIVED'), new Date().toISOString(), null]
  );
  return id;
}

export async function listPrivacyRequests() {
  const { rows } = await db.execute('SELECT * FROM privacy_requests ORDER BY created_at DESC');
  return rows;
}

export async function setPrivacyRequestStatus(id, status) {
  await db.execute(
    'UPDATE privacy_requests SET status = ?, resolved_at = ? WHERE id = ?',
    [String(status), status === 'RESOLVED' ? new Date().toISOString() : null, String(id)]
  );
}

// -------------------------------------------------------- account mgmt

export async function listAccounts() {
  const { rows } = await db.execute('SELECT id, username, email, role, active, created_at FROM accounts ORDER BY created_at DESC');
  return rows;
}

export async function getAccountById(accountId) {
  const { rows } = await db.execute('SELECT * FROM accounts WHERE id = ?', [String(accountId)]);
  return rows.length ? rows[0] : null;
}

/** Soft-deactivate (or reactivate) an account without destroying audit history. */
export async function setAccountActive(username, active) {
  await db.execute('UPDATE accounts SET active = ? WHERE LOWER(username) = LOWER(?)', [active ? 1 : 0, String(username)]);
}

// ------------------------------------------------------------- retention

/** Delete incidents older than the given number of days. Returns deleted rows. */
export async function deleteIncidentsOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await db.execute('SELECT id, data FROM incidents WHERE received_at < ?', [cutoff]);
  for (const r of rows) {
    await db.execute('DELETE FROM incidents WHERE id = ?', [r.id]);
  }
  return rows.map((r) => ({ id: r.id }));
}