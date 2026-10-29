/**
 * server/devices.mjs — hardware device registry + device authentication.
 *
 * The wearable (future ESP32-S3 + SIMCom A7670E) never talks to a browser. It
 * POSTs HTTPS to this backend and authenticates with a per-device shared secret
 * in the `X-Device-Key` header. Secrets live ONLY here, server-side.
 *
 * Configure devices in the backend .env using the `DEVICE_<ID>_*` pattern
 * (the id is uppercased and non-alphanumerics become `_`, so `BA-001` is
 * `BA_001`):
 *
 *   DEVICE_BA_001_KEY=<long random secret>   # required — the shared secret
 *   DEVICE_BA_001_OWNER=dela                 # linked citizen account username
 *   DEVICE_BA_001_LABEL=Maia's band          # optional human label
 *   DEVICE_BA_001_TYPE=BAYANI-WEARABLE      # optional device type
 *
 * Alternatively (or additionally) provide the whole registry inline as JSON in
 * `DEVICE_REGISTRY_JSON`:
 *
 *   DEVICE_REGISTRY_JSON=[{"deviceId":"BA-001","key":"...","ownerUsername":"dela"}]
 *
 * The registry is resolved once and cached, and is exposed to the rest of the
 * backend only through `resolveDevice()`, `listDevices()` and `requireDevice()`
 * so the storage source can later be swapped for an admin-managed table without
 * touching the routes.
 *
 * Safety guarantees:
 *   - An unknown device id or a wrong key is rejected with 401 and NO incident
 *     is ever created.
 *   - Key comparison is constant-time (`crypto.timingSafeEqual`).
 *   - `listDevices()` and `deviceStatus()` never include a key.
 *   - Keys are never logged.
 */

import crypto from 'node:crypto';

const DEFAULT_DEVICE_TYPE = 'BAYANI-WEARABLE';
const MAX_DEVICE_ID_LENGTH = 64;

/** `BA-001` -> `DEVICE_BA_001_KEY` (the .env variable holding its secret). */
export function envKeyForDevice(deviceId) {
  return `${envPrefixForDevice(deviceId)}_KEY`;
}

/** `BA-001` -> `BA_001` (the shared env-var prefix for that device). */
export function envPrefixForDevice(deviceId) {
  return `DEVICE_${String(deviceId)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')}`;
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeDeviceId(raw) {
  return String(raw ?? '').trim();
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Parse the optional inline-JSON registry. Invalid entries are skipped. */
function devicesFromJsonEnv() {
  const raw = process.env.DEVICE_REGISTRY_JSON;
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[bayani-devices] DEVICE_REGISTRY_JSON is not valid JSON — ignored.');
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn('[bayani-devices] DEVICE_REGISTRY_JSON must be a JSON array — ignored.');
    return [];
  }
  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const deviceId = normalizeDeviceId(entry.deviceId);
      const key = cleanText(entry.key, 512);
      if (!deviceId || !key) return null;
      return {
        deviceId,
        key,
        ownerUsername: cleanText(entry.ownerUsername ?? entry.owner, 64),
        label: cleanText(entry.label, 120),
        deviceType: cleanText(entry.deviceType ?? entry.type, 60) || DEFAULT_DEVICE_TYPE,
      };
    })
    .filter(Boolean);
}

/** Read `DEVICE_BA_001_KEY` (+ `_OWNER` / `_LABEL` / `_TYPE`) out of process.env. */
function devicesFromEnv() {
  const byId = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('DEVICE_') || !name.endsWith('_KEY')) continue;
    const key = cleanText(value, 512);
    if (!key) continue;

    const idPart = name.slice('DEVICE_'.length, -'_KEY'.length);
    const deviceId = idPart.replace(/_/g, '-');
    if (!deviceId) continue;

    byId.set(deviceId, {
      deviceId,
      key,
      ownerUsername: cleanText(process.env[`DEVICE_${idPart}_OWNER`], 64),
      label: cleanText(process.env[`DEVICE_${idPart}_LABEL`], 120),
      deviceType: cleanText(process.env[`DEVICE_${idPart}_TYPE`], 60) || DEFAULT_DEVICE_TYPE,
    });
  }
  return [...byId.values()];
}

let cachedRegistry = null;

/**
 * The resolved device registry. Cached after the first read because .env does
 * not change while the server runs.
 */
export function resolveRegistry({ refresh = false } = {}) {
  if (cachedRegistry && !refresh) return cachedRegistry;
  const byId = new Map();
  // Env-pattern entries first, then inline JSON wins on conflict.
  for (const device of [...devicesFromEnv(), ...devicesFromJsonEnv()]) {
    byId.set(device.deviceId.toUpperCase(), device);
  }
  cachedRegistry = { devices: [...byId.values()] };
  if (cachedRegistry.devices.length) {
    console.log(
      `[bayani-devices] ${cachedRegistry.devices.length} device(s) registered: ` +
        cachedRegistry.devices.map((d) => `${d.deviceId}${d.ownerUsername ? ` -> ${d.ownerUsername}` : ''}`).join(', ')
    );
  } else {
    console.log('[bayani-devices] No hardware devices registered yet (set DEVICE_<ID>_KEY to enable /device/sos).');
  }
  return cachedRegistry;
}

/** Test seam: force the next `resolveRegistry()` to re-read process.env. */
export function resetRegistryCache() {
  cachedRegistry = null;
}

/** Look up one device by id (case-insensitive). Returns null when unknown. */
export function resolveDevice(deviceId) {
  const id = normalizeDeviceId(deviceId);
  if (!id) return null;
  return resolveRegistry().devices.find((d) => d.deviceId.toUpperCase() === id.toUpperCase()) || null;
}

/** Device metadata for admin/diagnostic use — never includes the key. */
export function listDevices() {
  return resolveRegistry().devices.map(({ key, ...meta }) => ({ ...meta, configured: Boolean(key) }));
}

/**
 * Express middleware: authenticate a hardware request via `X-Device-Key`.
 * Attaches `req.device = { deviceId, ownerUsername, label, deviceType }`
 * (deliberately WITHOUT the key). Rejects unknown devices and bad keys with 401
 * before any incident is created.
 */
export function requireDevice(req, res, next) {
  const presentedKey = cleanText(req.get('x-device-key'), 512);
  const deviceId = normalizeDeviceId(req.get('x-device-id') || req.body?.deviceId);

  if (!presentedKey) {
    return res.status(401).json({ ok: false, error: 'Missing X-Device-Key header' });
  }
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId is required (send it in the body or the X-Device-Id header)' });
  }
  if (deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return res.status(400).json({ ok: false, error: 'deviceId is too long' });
  }

  const device = resolveDevice(deviceId);
  // An unknown id and a wrong key return the same generic message so the
  // endpoint cannot be used to enumerate registered device ids.
  if (!device || !safeEqual(presentedKey, device.key)) {
    console.warn(`[bayani-devices] Rejected unauthenticated hardware request from deviceId "${deviceId}"`);
    return res.status(401).json({ ok: false, error: 'Unauthorized device' });
  }

  req.device = {
    deviceId: device.deviceId,
    ownerUsername: device.ownerUsername,
    label: device.label,
    deviceType: device.deviceType,
  };
  next();
}

// ------------------------------------------------- last-known device status

/**
 * In-memory last-known status per device (heartbeat / telemetry). Deliberately
 * NOT persisted and NOT broadcast — it only exists so a future admin screen or
 * alert can read device health without adding storage or UI now.
 */
const deviceStatus = new Map(); // deviceId -> { lastSeen, battery, gsmSignal, gpsFix, ... }

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export function recordDeviceStatus(device, status) {
  const deviceId = device?.deviceId;
  if (!deviceId) return null;
  const entry = {
    deviceId,
    label: device.label || '',
    ownerUsername: device.ownerUsername || '',
    deviceType: device.deviceType || DEFAULT_DEVICE_TYPE,
    lastSeen: new Date().toISOString(),
    battery: typeof status?.battery === 'number' ? status.battery : null,
    gsmSignal: status?.gsmSignal ?? null,
    gpsFix: status?.gpsFix ?? null,
  };
  deviceStatus.set(deviceId, entry);
  return entry;
}

/** Last-known status per device (pruned to `STATUS_TTL_MS`), keys excluded. */
export function getDeviceStatus() {
  const cutoff = Date.now() - STATUS_TTL_MS;
  const now = Date.now();
  for (const [deviceId, entry] of deviceStatus) {
    const age = now - Date.parse(entry.lastSeen);
    if (Number.isFinite(age) && age > cutoff) deviceStatus.delete(deviceId);
  }
  return [...deviceStatus.values()];
}

/** Test seam: drop all cached device state. */
export function resetDeviceState() {
  deviceStatus.clear();
  cachedRegistry = null;
}