/**
 * Bayani Express Sync Server
 *
 * Lives inside the project (like barangay-system's server/ folder). Connects
 * the Citizen App (port 4001) to the Response Center (port 4000) through a
 * real Express backend with an embedded SQLite store, so incidents survive
 * restarts and both apps share one source of truth.
 *
 *   GET  /health            { ok, clients, uptime }
 *   GET  /stream            SSE — live event feed
 *   POST /event             { source, type, payload } -> broadcast + persist
 *   GET  /incidents         REST — all incidents (newest first)
 *   GET  /incidents/:id     REST — single incident
 *   DELETE /incidents/:id   REST — delete one incident (broadcast to all clients)
 *   DELETE /incidents       REST — clear store
 *   SMS     sos events text every active contact (Semaphore; SMS_MODE gates live)
 *
 * Hardware (wearable) intake — server-side only, authenticated per device:
 *   POST /device/sos         { deviceId, event, latitude, longitude, timestamp, … }
 *   POST /device/heartbeat   { deviceId, … }   status ping, stored in memory
 *   POST /device/telemetry   { deviceId, … }   battery/GSM/GPS report
 *   Devices authenticate with `X-Device-Key`; keys live in .env (DEVICE_<ID>_KEY).
 *   A hardware SOS becomes a normal Incident with source "HARDWARE" and is
 *   broadcast on the SAME SSE stream (type "hardware_sos") — no second event
 *   system, and the apps never retransmit it.
 *
 * Auth  (accounts stored in the local/Turso DB, passwords hashed via scrypt):
 *   POST /auth/register     { username, password }  (citizen self-signup)
 *   POST /auth/login        { username, password } -> { token, user }
 *   GET  /auth/me           authorize via `Authorization: Bearer <token>` or `?token=`
 *   POST /auth/logout       destroy the session token
 *
 * Run:  npm install (first time) && npm run server
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, saveIncident, listIncidents, getIncident, findIncidentByRequestId, mergeIncident, deleteIncident, clearIncidents, listContacts, saveContact, deleteContact, saveAccount, getAccountByUsername, getAccountByEmail, saveAuditLog, listAuditLogs, savePrivacyRequest, listPrivacyRequests, setPrivacyRequestStatus, listAccounts, setAccountActive, deleteIncidentsOlderThan } from './db.mjs';
import { sendIncidentSMS } from './sms.mjs';
import { hashPassword, verifyPassword, createSession, getSessionUser, destroySession, readToken, requireAuth, requireRole, ROLES, RC_ROLES } from './auth.mjs';
import { requireDevice, listDevices, getDeviceStatus, recordDeviceStatus } from './devices.mjs';
import { validateDeviceSosPayload, deriveRequestId, buildHardwareIncident, withRequestLock } from './hardware.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;

await initDb();

// Seed the default Response Center admin account (admin / admin123).
async function seedAdmin() {
  const existing = await getAccountByUsername('admin');
  if (!existing) {
    await saveAccount({
      id: 'acc-admin',
      username: 'admin',
      email: 'admin@bayani.local',
      password_hash: hashPassword('admin123'),
      role: 'admin',
      created_at: new Date().toISOString(),
    });
    console.log('[bayani-server] Seeded default admin account (admin/admin123)');
  }
}
await seedAdmin();

const app = express();
// Restrict browser cross-origin access to the local apps (Citizen 4001,
// Response Center 4000) plus any machine on the private LAN — the citizen app
// is opened from other PCs via this machine's LAN IP. Anything outside the
// private network is rejected unless listed in CORS_ORIGINS.
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS || 'http://localhost:4000 http://localhost:4001 http://127.0.0.1:4000 http://127.0.0.1:4001')
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

/** True when the origin's hostname is a private/loopback address. */
function isPrivateOrigin(origin) {
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || isPrivateOrigin(origin)) return cb(null, true);
      cb(new Error('Origin not allowed by CORS'));
    },
  })
);
app.use(express.json({ limit: '10mb' }));

/** Connected SSE clients — each tracks its resolved role + account so the
 *  broadcast layer can keep sensitive frames (live SOS with exact location)
 *  inside the Response Center and deliver a hardware SOS to the Response Center
 *  AND its owning citizen's own session, never to other browsers. */
const clients = new Set(); // { res, role, username }

/** Last-seen timestamp per logged-in Bayani account (citizen heartbeats). */
const accounts = new Map(); // username -> lastSeen (ms)

/** Accounts seen within the last ACCOUNT_TTL_MS are considered online. */
const ACCOUNT_TTL_MS = 15000;

/**
 * Validate an incident's exact-location payload. Returns an error message when
 * invalid, or null when the payload is accepted. Accepts both the canonical
 * `{ latitude, longitude, accuracy, timestamp }` shape and the legacy
 * `{ lat, lng, accuracyRadiusMeters, gpsTimestamp }` shape used by the apps.
 * A missing location (legacy alerts) is valid.
 */
function locationValidationError(location) {
  if (location === undefined || location === null) return null;
  if (typeof location !== 'object' || Array.isArray(location)) return 'location must be an object';

  const latValue = location.latitude ?? location.lat;
  if (typeof latValue !== 'number' || !Number.isFinite(latValue) || latValue < -90 || latValue > 90) {
    return 'latitude must be a number between -90 and 90';
  }

  const lngValue = location.longitude ?? location.lng;
  if (typeof lngValue !== 'number' || !Number.isFinite(lngValue) || lngValue < -180 || lngValue > 180) {
    return 'longitude must be a number between -180 and 180';
  }

  const accuracyValue = location.accuracy ?? location.accuracyRadiusMeters;
  if (accuracyValue !== undefined && (typeof accuracyValue !== 'number' || !Number.isFinite(accuracyValue) || accuracyValue < 0)) {
    return 'accuracy must be a non-negative number';
  }

  const tsValue = location.timestamp ?? location.gpsTimestamp;
  if (tsValue !== undefined && (typeof tsValue !== 'string' || Number.isNaN(Date.parse(tsValue)))) {
    return 'timestamp is not a valid date string';
  }

  return null;
}

function broadcast(msg) {
  const frame = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(frame);
    } catch {
      clients.delete(client);
    }
  }
}

/** Broadcast only to clients the predicate accepts. */
function broadcastWhere(predicate, msg) {
  const frame = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of clients) {
    if (!predicate(client)) continue;
    try {
      client.res.write(frame);
    } catch {
      clients.delete(client);
    }
  }
}

/** Broadcast only to clients whose role matches the allow-list. */
function broadcastToRoles(allowedRoles, msg) {
  const allowed = new Set(allowedRoles);
  broadcastWhere((client) => allowed.has(client.role), msg);
}

/**
 * Deliver a frame to the Response Center roles AND the sessions of one specific
 * citizen — used for hardware SOS so the citizen's own phone sees the alert
 * without exposing exact coordinates to anyone else's stream.
 */
function broadcastToOwner(ownerUsername, msg) {
  const owner = String(ownerUsername || '').trim().toLowerCase();
  broadcastWhere(
    (client) => RC_ROLES.includes(client.role) || (owner && client.username && client.username.toLowerCase() === owner),
    msg
  );
}

/** Identity behind a stream connection: RC role, citizen role, or anonymous. */
function roleForToken(token) {
  const user = getSessionUser(token);
  if (user && RC_ROLES.includes(user.role)) return { role: user.role, username: user.username };
  return user ? { role: 'citizen', username: user.username } : { role: 'anonymous', username: '' };
}

// Liveness probe used by both apps' connection pills. Reports DB health and
// the SMS operating mode — never the API key itself.
app.get('/health', async (_req, res) => {
  let dbOk = true;
  let dbError = '';
  try {
    await listIncidents();
  } catch (err) {
    dbOk = false;
    dbError = err.message || 'unknown';
  }
  res.json({
    ok: true,
    server: 'Bayani Express Sync Server',
    clients: clients.size,
    uptime: Math.round(process.uptime()),
    database: dbOk ? 'ok' : `unavailable: ${dbError}`,
    smsMode: (process.env.SMS_MODE || 'simulation').toLowerCase(),
    devices: listDevices().length,
  });
});

// Online logged-in Bayani App accounts (citizen heartbeats)
app.get('/accounts', requireRole(ROLES.ADMIN, ROLES.DISPATCHER, ROLES.RESPONDER), (_req, res) => {
  const now = Date.now();
  const online = [];
  for (const [username, lastSeen] of accounts) {
    if (now - lastSeen > ACCOUNT_TTL_MS) {
      accounts.delete(username);
    } else {
      online.push(username);
    }
  }
  res.json({ ok: true, count: online.length, accounts: online });
});

// -------------------------------------------------------------- auth

const USERNAME_RE = /^[a-z]{1,6}$/; // lowercase letters, max 6

// Citizen self-signup. Username = lowercase letters (max 6), password = any.
// The optional email is the citizen's real signed-in email (from the Register
// form); a demo placeholder is only used when none is supplied.
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim().toLowerCase())) {
    return res.status(400).json({ ok: false, error: 'Username must be lowercase letters (max 6)' });
  }
  if (typeof password !== 'string' || password.trim() === '') {
    return res.status(400).json({ ok: false, error: 'Password is required' });
  }
  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail =
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? email.trim()
      : '';
  const existing = await getAccountByUsername(cleanUsername);
  if (existing && existing.role && existing.role !== 'citizen') {
    return res.status(409).json({ ok: false, error: 'Username is already taken' });
  }
  if (existing && existing.active === 0) {
    return res.status(403).json({ ok: false, error: 'This account is deactivated. Contact the response center.' });
  }
  if (existing) {
    // Demo recovery: re-registering the same username resets its password
    // instead of failing, so the citizen can regain access (role is kept).
    // Re-registering also refreshes the email so it matches the real one.
    await saveAccount({
      id: existing.id,
      username: existing.username,
      email: cleanEmail || existing.email,
      password_hash: hashPassword(password),
      role: existing.role || 'citizen',
      created_at: existing.created_at || new Date().toISOString(),
      active: existing.active,
    });
    return res.json({ ok: true, updated: true });
  }
  await saveAccount({
    id: `acc-${Date.now()}`,
    username: cleanUsername,
    email: cleanEmail || `${cleanUsername}@bayani.app`,
    password_hash: hashPassword(password),
    role: 'citizen',
    created_at: new Date().toISOString(),
  });
  res.json({ ok: true });
  } catch (err) {
    const message = err && err.message ? err.message : 'Registration failed';
    return res.status(400).json({ ok: false, error: message });
  }
});

// Login (citizens). Accepts either the derived username or the registered email.
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const id = typeof username === 'string' ? username.trim() : '';
  const account = id
    ? id.includes('@')
      ? await getAccountByEmail(id)
      : await getAccountByUsername(id)
    : null;
  if (!account || !verifyPassword(typeof password === 'string' ? password : '', account.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Invalid email/username or password' });
  }
  if (account.active === 0) {
    return res.status(403).json({ ok: false, error: 'This account is deactivated. Contact the response center.' });
  }
  const token = createSession(account);
  void saveAuditLog({ actorId: account.username, actorRole: account.role, action: 'auth.login', entityType: 'account', entityId: account.username });
  res.json({
    ok: true,
    token,
    user: { username: account.username, email: account.email, role: account.role },
  });
});

// Response Center authority login — ONLY the built-in admin account may use this.
app.post('/auth/admin-login', async (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim() : '';
  if (cleanUsername.toLowerCase() !== 'admin') {
    return res.status(401).json({ ok: false, error: 'Invalid username or password' });
  }
  const account = await getAccountByUsername('admin');
  if (
    !account ||
    account.role !== 'admin' ||
    account.active === 0 ||
    !verifyPassword(typeof password === 'string' ? password : '', account.password_hash)
  ) {
    return res.status(401).json({ ok: false, error: 'Invalid username or password' });
  }
  const token = createSession(account);
  void saveAuditLog({ actorId: account.username, actorRole: account.role, action: 'auth.admin_login', entityType: 'account', entityId: account.username });
  res.json({
    ok: true,
    token,
    user: { username: account.username, email: account.email, role: account.role },
  });
});

// Current session lookup. Used by the apps to restore a logged-in session.
app.get('/auth/me', (req, res) => {
  const user = getSessionUser(readToken(req));
  if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  res.json({ ok: true, user });
});

// End a session.
app.post('/auth/logout', (req, res) => {
  const user = getSessionUser(readToken(req));
  if (user) {
    void saveAuditLog({ actorId: user.username, actorRole: user.role, action: 'auth.logout', entityType: 'account', entityId: user.username });
  }
  destroySession(readToken(req));
  res.json({ ok: true });
});

// ------------------------------------------------- user management (admin)

// List every account (for the RC admin console). Passwords are never returned.
app.get('/auth/users', requireRole(ROLES.ADMIN), async (_req, res) => {
  try {
    const users = await listAccounts();
    void saveAuditLog({ actorId: 'admin', actorRole: 'admin', action: 'users.list', entityType: 'account' });
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a Response Center account (dispatcher / responder role).
app.post('/auth/users', requireRole(ROLES.ADMIN), async (req, res) => {
  const { username, password, email, role } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const cleanRole = typeof role === 'string' && RC_ROLES.includes(role) ? role : ROLES.ADMIN;
  if (!/^[a-z]{1,20}$/.test(cleanUsername)) {
    return res.status(400).json({ ok: false, error: 'Username must be lowercase letters or digits (max 20)' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
  }
  const existing = await getAccountByUsername(cleanUsername);
  if (existing) return res.status(409).json({ ok: false, error: 'Username already exists' });
  const cleanEmail =
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? email.trim()
      : `${cleanUsername}@bayani.local`;
  await saveAccount({
    id: `acc-${Date.now()}`,
    username: cleanUsername,
    email: cleanEmail,
    password_hash: hashPassword(password),
    role: cleanRole,
    created_at: new Date().toISOString(),
  });
  void saveAuditLog({ actorId: req.user.username, actorRole: 'admin', action: 'users.create', entityType: 'account', entityId: cleanUsername, metadata: { role: cleanRole } });
  res.json({ ok: true });
});

// Activate / deactivate an account (+ optional role change). No hard delete.
app.patch('/auth/users/:username', requireRole(ROLES.ADMIN), async (req, res) => {
  const target = await getAccountByUsername(req.params.username);
  if (!target) return res.status(404).json({ ok: false, error: 'Account not found' });
  const { active, role } = req.body || {};
  if (typeof active === 'boolean') {
    await setAccountActive(target.username, active);
  }
  if (typeof role === 'string' && RC_ROLES.includes(role) && role !== target.role) {
    await saveAccount({ ...target, role });
  }
  void saveAuditLog({ actorId: req.user.username, actorRole: 'admin', action: 'users.update', entityType: 'account', entityId: target.username, metadata: { active, role } });
  res.json({ ok: true });
});

// Real-time event stream (SSE). The connecting client may pass its session
// token (`?token=`) so the server can decide which frames it may receive.
app.get('/stream', (req, res) => {
  const { role, username } = roleForToken(readToken(req));
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');
  const client = { res, role, username };
  clients.add(client);
  req.on('close', () => clients.delete(client));
});

// Event broadcast endpoint — citizen -> RESPONSE CENTER and back
app.post('/event', async (req, res) => {
  const msg = req.body;
  if (!msg || typeof msg !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid event payload' });
    return;
  }
  try {
    // Citizen presence heartbeat — marks the logged-in account as online.
    if (msg.type === 'heartbeat' && msg.source === 'citizen' && msg.payload?.username) {
      const username = String(msg.payload.username);
      const wasOnline = accounts.has(username);
      accounts.set(username, Date.now());
      if (!wasOnline) broadcast({ source: 'server', type: 'accounts_update' });
      res.json({ ok: true });
      return;
    }
    // Citizen logout — remove the account from the online count immediately.
    // Broadcast so the Response Center refreshes its ONLINE USERS metric at once.
    if (msg.type === 'logout' && msg.source === 'citizen' && msg.payload?.username) {
      accounts.delete(String(msg.payload.username));
      broadcast({ source: 'server', type: 'accounts_update' });
      res.json({ ok: true });
      return;
    }
    if (msg.type === 'sos' && msg.payload) {
      // Validate the exact-location payload BEFORE trusting anything from the client.
      const locErr = locationValidationError(msg.payload?.location);
      if (locErr) {
        res.status(400).json({ ok: false, error: `Invalid SOS payload — ${locErr}` });
        return;
      }
      // Sensitive frame (exact GPS + profile) — deliver ONLY to the Response
      // Center's authorized roles, never to anonymous/citizen stream clients.
      broadcastToRoles(RC_ROLES, msg);
      res.json({ ok: true });
      const citizenName = String(msg.payload?.userProfile?.username || msg.payload?.userName || 'citizen');
      void saveAuditLog({ actorId: citizenName, actorRole: 'citizen', action: 'incident.received', entityType: 'incident', entityId: String(msg.payload?.id || '') });
      (async () => {
        try {
          const incidentId = await saveIncident(msg.payload);
          if (incidentId) {
            void dispatchEmergencySms(incidentId, msg.payload);
          }
        } catch (err) {
          console.warn('[bayani-server] DB write failed:', err.message);
        }
      })();
      return;
    }
    if (msg.type === 'location_update' && msg.payload?.id) {
      // A citizen's improved GPS fix for an SOS that already went out. Validate
      // the coordinates, then push them to the stored incident and to the
      // Response Center only (exact location stays off the public stream).
      const locErr = locationValidationError(msg.payload.location);
      if (locErr) {
        res.status(400).json({ ok: false, error: `Invalid location_update — ${locErr}` });
        return;
      }
      await mergeIncident(msg.payload.id, {
        location: msg.payload.location,
        gpsStatus: msg.payload.gpsStatus,
      });
      broadcastToRoles(RC_ROLES, msg);
      res.json({ ok: true });
      return;
    }
    if (msg.type === 'status_update' && msg.payload?.id) {
      const locErr = locationValidationError(msg.payload.location);
      if (locErr) {
        res.status(400).json({ ok: false, error: `Invalid status_update — ${locErr}` });
        return;
      }
      // Whitelist the statuses the RC may set. Anything else is ignored so a
      // hijacked/legacy client can never write an unknown status to the store.
      const ALLOWED_STATUS = new Set(['ACTIVE', 'WAIT FOR ME', 'ON THE WAY', 'RESPONDER EN ROUTE', 'RESOLVED', 'CANCELLED']);
      if (msg.payload.status && !ALLOWED_STATUS.has(msg.payload.status)) {
        res.status(400).json({ ok: false, error: `Invalid status "${msg.payload.status}"` });
        return;
      }
      await mergeIncident(msg.payload.id, msg.payload);
      void saveAuditLog({ actorId: String(msg.payload?.userName || 'response_center'), actorRole: 'response', action: 'incident.status_changed', entityType: 'incident', entityId: String(msg.payload.id), metadata: { status: msg.payload.status } });
    }
    if (msg.type === 'resolve' && msg.payload) {
      // Persist a resolution so a restart never reverts RESOLVED → ACTIVE.
      // Stamp resolvedAt server-side so the 24-hour auto-archive in the RC
      // works even when the resolve originated from the citizen app.
      const existing = await listIncidents();
      const target = existing.find(i => i.incidentCode === msg.payload || i.id === msg.payload);
      if (target) {
        await mergeIncident(target.id, { status: 'RESOLVED', resolvedAt: new Date().toISOString() });
        void saveAuditLog({ actorId: String(msg.payload?.userName || 'citizen'), actorRole: 'citizen', action: 'incident.resolved', entityType: 'incident', entityId: String(msg.payload) });
      }
    }
  } catch (err) {
    console.warn('[bayani-server] DB write failed:', err.message);
  }
  // Live ambient audio carries the same privacy weight as location — keep it
  // inside the Response Center roles only.
  if (msg.type === 'audio_live') {
    broadcastToRoles(RC_ROLES, msg);
  } else {
    broadcast(msg);
  }
  res.json({ ok: true });
});

// ------------------------------------------------------ hardware (wearable)

// Registered devices + their last known health (RC diagnostics only, never keys).
app.get('/devices', requireRole(...RC_ROLES), (_req, res) => {
  res.json({ ok: true, devices: listDevices(), status: getDeviceStatus() });
});

/**
 * Wearable SOS intake. The device authenticates with `X-Device-Key`; the
 * backend builds the Incident itself so it stays the single source of truth,
 * stores it exactly once (idempotent per press), then pushes it on the SAME SSE
 * stream the apps already use. The citizen app must never retransmit this.
 */
app.post('/device/sos', requireDevice, async (req, res) => {
  const parsed = validateDeviceSosPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }
  const payload = parsed.value;

  // The authenticated device is authoritative for the identity — a body that
  // claims a different deviceId is rejected rather than trusted.
  if (payload.deviceId.toUpperCase() !== req.device.deviceId.toUpperCase()) {
    return res.status(400).json({ ok: false, error: 'deviceId does not match the authenticated device' });
  }

  const ownerUsername = req.device.ownerUsername;
  if (!ownerUsername) {
    return res.status(403).json({
      ok: false,
      error: 'Device is not linked to a citizen account yet (set DEVICE_<ID>_OWNER on the server)',
    });
  }

  const account = await getAccountByUsername(ownerUsername);
  if (!account) {
    return res.status(403).json({ ok: false, error: 'Linked citizen account no longer exists' });
  }
  if (account.active === 0) {
    return res.status(403).json({ ok: false, error: 'Linked citizen account is deactivated' });
  }

  // One incident per physical press. A retried upload (firmware timeout) with
  // the same eventId / timestamp resolves to the incident that already exists
  // instead of raising a second emergency. The check and the insert run under a
  // per-request lock so simultaneous retries of one press cannot both win.
  const requestId = deriveRequestId(req.device.deviceId, payload);

  return withRequestLock(requestId, async () => {
    const existing = await findIncidentByRequestId(requestId);
    if (existing) {
      return res.json({ ok: true, incidentId: existing.id, incidentCode: existing.incidentCode, duplicate: true });
    }

    const stored = await listIncidents();
    const incident = buildHardwareIncident({
      device: req.device,
      payload,
      account: { username: account.username, email: account.email },
      takenCodes: stored.map((i) => i.incidentCode).filter(Boolean),
    });

    const incidentId = await saveIncident(incident);
    recordDeviceStatus(req.device, {
      battery: payload.battery,
      gsmSignal: payload.gsmSignal,
      gpsFix: payload.gpsFix,
    });
    void saveAuditLog({
      actorId: account.username,
      actorRole: 'device',
      action: 'incident.hardware_sos',
      entityType: 'incident',
      entityId: incidentId,
      metadata: { deviceId: req.device.deviceId },
    });

    // Same frame contract as every other live event, delivered to the Response
    // Center and to the owning citizen's own stream — nothing else.
    broadcastToOwner(ownerUsername, {
      source: 'hardware',
      type: 'hardware_sos',
      payload: incident,
    });

    void dispatchEmergencySms(incidentId, incident);

    return res.json({ ok: true, incidentId, incidentCode: incident.incidentCode, duplicate: false });
  });
});

/**
 * Device status ping. Accepted, validated and remembered in memory only — no
 * database writes, no SSE traffic and no UI yet (see HARDWARE_INTEGRATION.md
 * for the plan to surface battery/GSM health in a future release).
 */
app.post('/device/heartbeat', requireDevice, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const entry = recordDeviceStatus(req.device, {
    battery: typeof body.battery === 'number' ? body.battery : undefined,
    gsmSignal: typeof body.gsmSignal === 'number' || typeof body.gsmSignal === 'string' ? body.gsmSignal : undefined,
    gpsFix: typeof body.gpsFix === 'string' ? body.gpsFix : undefined,
  });
  res.json({ ok: true, deviceId: entry.deviceId, lastSeen: entry.lastSeen });
});

/** Device telemetry report — same storage/validation rules as the heartbeat. */
app.post('/device/telemetry', requireDevice, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const entry = recordDeviceStatus(req.device, {
    battery: typeof body.battery === 'number' ? body.battery : undefined,
    gsmSignal: typeof body.gsmSignal === 'number' || typeof body.gsmSignal === 'string' ? body.gsmSignal : undefined,
    gpsFix: typeof body.gpsFix === 'string' ? body.gpsFix : undefined,
  });
  res.json({ ok: true, deviceId: entry.deviceId, lastSeen: entry.lastSeen });
});

/**
 * Background SMS fan-out: notify the citizen's active emergency contacts,
 * persist each recipient's delivery result on the incident, then push a live
 * update to the Response Center. Kept isolated from the SOS request so a slow
 * or failing gateway can never block incident creation.
 */
async function dispatchEmergencySms(incidentId, incident) {
  try {
    const contacts = await listContacts();
    const smsNotifications = await sendIncidentSMS(incident, contacts);
    await mergeIncident(incidentId, { smsNotifications });
    broadcast({
      source: 'server',
      type: 'sms_update',
      payload: {
        id: incident.id,
        incidentCode: incident.incidentCode,
        smsNotifications,
      },
    });
  } catch (err) {
    console.warn('[bayani-server] SMS dispatch failed:', err.message);
  }
}

// REST view of the incident store (single source of truth) — Response Center
// roles only. Citizens read their own history via GET /incidents/mine so the
// full exposed list (with exact coordinates) is never handed to a citizen.
app.get('/incidents', requireRole(...RC_ROLES), async (_req, res) => {
  try {
    const list = await listIncidents();
    void saveAuditLog({ actorId: _req.user.username, actorRole: _req.user.role, action: 'incidents.list', entityType: 'incident' });
    res.json({ incidents: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Citizen's own incident history — filtered server-side to their username so
// one citizen can never read another user's alerts.
app.get('/incidents/mine', requireAuth, async (req, res) => {
  try {
    const all = await listIncidents();
    const mine = all.filter((i) => {
      const u = i.userProfile?.username;
      return u && String(u).toLowerCase() === req.user.username.toLowerCase();
    });
    res.json({ incidents: mine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/incidents/:id', requireRole(...RC_ROLES), async (req, res) => {
  const inc = await getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: 'Incident not found' });
  void saveAuditLog({ actorId: req.user.username, actorRole: req.user.role, action: 'incident.view', entityType: 'incident', entityId: req.params.id });
  res.json(inc);
});

app.delete('/incidents/:id', requireRole(ROLES.ADMIN, ROLES.DISPATCHER), async (req, res) => {
  try {
    await deleteIncident(req.params.id);
    void saveAuditLog({ actorId: req.user.username, actorRole: req.user.role, action: 'incident.deleted', entityType: 'incident', entityId: req.params.id });
    broadcast({ source: 'server', type: 'incident_deleted', payload: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/incidents', requireRole(ROLES.ADMIN), async (_req, res) => {
  await clearIncidents();
  void saveAuditLog({ actorId: _req.user.username, actorRole: _req.user.role, action: 'incidents.cleared', entityType: 'incident' });
  broadcast({ source: 'server', type: 'incident_cleared', payload: {} });
  res.json({ ok: true });
});

// -------------------------------------------------------- privacy requests

// Public intake form — the data-subject themselves files it (no login needed).
app.post('/privacy/requests', async (req, res) => {
  const { type, fullName, contact, details } = req.body || {};
  const cleanType = ['ACCESS', 'CORRECTION', 'DELETION', 'COMPLAINT'].includes(type) ? type : 'ACCESS';
  if (typeof fullName !== 'string' || !fullName.trim() || typeof contact !== 'string' || !contact.trim()) {
    return res.status(400).json({ ok: false, error: 'fullName and contact are required' });
  }
  const id = await savePrivacyRequest({
    type: cleanType,
    full_name: fullName.trim().slice(0, 160),
    contact: contact.trim().slice(0, 160),
    details: typeof details === 'string' ? details.trim().slice(0, 2000) : '',
  });
  void saveAuditLog({ actorId: fullName.trim(), actorRole: 'citizen', action: 'privacy.request_created', entityType: 'privacy_request', entityId: id, metadata: { type: cleanType } });
  res.json({ ok: true, id });
});

app.get('/privacy/requests', requireRole(ROLES.ADMIN, ROLES.DISPATCHER), async (_req, res) => {
  const list = await listPrivacyRequests();
  void saveAuditLog({ actorId: _req.user.username, actorRole: _req.user.role, action: 'privacy.requests_listed', entityType: 'privacy_request' });
  res.json({ ok: true, requests: list });
});

app.patch('/privacy/requests/:id', requireRole(ROLES.ADMIN), async (req, res) => {
  await setPrivacyRequestStatus(req.params.id, req.body?.status === 'RESOLVED' ? 'RESOLVED' : 'RECEIVED');
  void saveAuditLog({ actorId: req.user.username, actorRole: 'admin', action: 'privacy.request_updated', entityType: 'privacy_request', entityId: req.params.id, metadata: { status: req.body?.status } });
  res.json({ ok: true });
});

// ------------------------------------------------------------- retention

// Purge incidents older than RETENTION_DAYS (default 90) — data minimization
// so stale emergency records aren't kept forever. Admin-only, audit-logged.
app.post('/retention/run', requireRole(ROLES.ADMIN), async (_req, res) => {
  const days = Number(process.env.RETENTION_DAYS) > 0 ? Number(process.env.RETENTION_DAYS) : 90;
  const removed = await deleteIncidentsOlderThan(days);
  void saveAuditLog({ actorId: _req.user.username, actorRole: 'admin', action: 'retention.run', entityType: 'incident', metadata: { days, removed: removed.length } });
  res.json({ ok: true, removed: removed.length, days });
});

// ------------------------------------------------------- audit log (admin)

app.get('/audit-logs', requireRole(ROLES.ADMIN), async (_req, res) => {
  const logs = await listAuditLogs();
  res.json({ ok: true, logs });
});

// REST view of the contacts store (any authenticated account; a citizen only
// ever sees/manages their own list, which is shared per app instance)
app.get('/contacts', requireAuth, async (_req, res) => {
  try {
    res.json({ contacts: await listContacts() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/contacts', requireAuth, async (req, res) => {
  const contact = req.body;
  if (!contact || typeof contact !== 'object' || !contact.name || !contact.phone) {
    res.status(400).json({ ok: false, error: 'name and phone are required' });
    return;
  }
  try {
    await saveContact(contact);
    void saveAuditLog({ actorId: req.user.username, actorRole: req.user.role, action: 'contact.created', entityType: 'contact', entityId: String(contact.id || '') });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/contacts/:id', requireAuth, async (req, res) => {
  const contact = req.body;
  if (!contact || typeof contact !== 'object') {
    res.status(400).json({ ok: false, error: 'invalid contact' });
    return;
  }
  try {
    await saveContact({ ...contact, id: req.params.id });
    void saveAuditLog({ actorId: req.user.username, actorRole: req.user.role, action: 'contact.updated', entityType: 'contact', entityId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/contacts/:id', requireAuth, async (req, res) => {
  try {
    await deleteContact(req.params.id);
    void saveAuditLog({ actorId: req.user.username, actorRole: req.user.role, action: 'contact.deleted', entityType: 'contact', entityId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log('');
  console.log('============================================');
  console.log('  BAYANI EXPRESS SYNC SERVER');
  console.log(`  http://localhost:${PORT}  (API + SSE)`);
  console.log('  Connects Citizen App (4001) <-> RC (4000)');
  console.log('============================================');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[bayani-server] Port ${PORT} is already in use.`);
    console.log('  Close the old "Bayani Backend" window, then restart.');
    setInterval(() => {}, 1 << 30);
  } else {
    console.error('[bayani-server] Error:', err.message);
  }
});

// Keep-alive pings so idle SSE connections stay open
setInterval(() => {
  for (const client of clients) {
    try {
      client.res.write(': ping\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, 25000);

// Log client count changes so the window shows who is linked
let lastCount = -1;
setInterval(() => {
  if (clients.size !== lastCount) {
    lastCount = clients.size;
    console.log(`[bayani-server] linked clients: ${clients.size}`);
  }
}, 1000);