/**
 * server/hardware.test.mjs — unit tests for the wearable intake path.
 *
 * Run with:  npm test        (node --test, no extra dependencies)
 *
 * Covers payload validation, device authentication, one-incident-per-press
 * idempotency and the server-built Incident shape. Nothing here touches the
 * database, the network or Express — the routes around them are verified
 * manually with curl (see docs/HARDWARE_INTEGRATION.md).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateDeviceSosPayload, deriveRequestId, buildHardwareIncident, nextIncidentCode, withRequestLock } from './hardware.mjs';
import { envKeyForDevice, resolveDevice, resolveRegistry, listDevices, resetRegistryCache, requireDevice } from './devices.mjs';

const VALID_SOS = {
  deviceId: 'BA-001',
  event: 'SOS',
  latitude: 14.6781,
  longitude: 120.5439,
  timestamp: '2026-10-02T09:15:30.000Z',
};

function setDeviceEnv(overrides = {}) {
  const base = {
    DEVICE_BA_001_KEY: 'test-secret-key-abc123',
    DEVICE_BA_001_OWNER: 'dela',
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetRegistryCache();
}

// ---------------------------------------------------------------- validation

test('accepts a valid SOS payload and normalizes the timestamp', () => {
  const result = validateDeviceSosPayload(VALID_SOS);
  assert.equal(result.ok, true);
  assert.equal(result.value.deviceId, 'BA-001');
  assert.equal(result.value.event, 'SOS');
  assert.equal(result.value.timestamp, '2026-10-02T09:15:30.000Z');
});

test('accepts optional accuracy, battery, gsmSignal and gpsFix', () => {
  const result = validateDeviceSosPayload({
    ...VALID_SOS,
    accuracy: 8.5,
    battery: 76,
    gsmSignal: 21,
    gpsFix: 'LOCKED',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.accuracy, 8.5);
  assert.equal(result.value.battery, 76);
  assert.equal(result.value.gsmSignal, 21);
  assert.equal(result.value.gpsFix, 'LOCKED');
});

test('strips unknown keys so a device cannot inject fields into the incident', () => {
  const result = validateDeviceSosPayload({
    ...VALID_SOS,
    status: 'RESOLVED',
    userProfile: { username: 'attacker' },
    source: 'APP',
    notes: 'injected',
  });
  assert.equal(result.ok, true);
  assert.equal('status' in result.value, false);
  assert.equal('userProfile' in result.value, false);
  assert.equal('notes' in result.value, false);
});

test('rejects a missing deviceId', () => {
  const { deviceId, ...withoutId } = VALID_SOS;
  const result = validateDeviceSosPayload(withoutId);
  assert.equal(result.ok, false);
  assert.match(result.error, /deviceId is required/);
});

test('rejects an event other than SOS', () => {
  const result = validateDeviceSosPayload({ ...VALID_SOS, event: 'CANCEL' });
  assert.equal(result.ok, false);
  assert.match(result.error, /event must be "SOS"/);
});

test('rejects a non-numeric latitude', () => {
  const result = validateDeviceSosPayload({ ...VALID_SOS, latitude: '14.6781' });
  assert.equal(result.ok, false);
  assert.match(result.error, /latitude must be a number/);
});

test('rejects a latitude outside -90..90', () => {
  const result = validateDeviceSosPayload({ ...VALID_SOS, latitude: 91 });
  assert.equal(result.ok, false);
  assert.match(result.error, /latitude must be between/);
});

test('rejects a longitude outside -180..180', () => {
  const result = validateDeviceSosPayload({ ...VALID_SOS, longitude: -181 });
  assert.equal(result.ok, false);
  assert.match(result.error, /longitude must be between/);
});

test('rejects a missing or unparseable timestamp', () => {
  assert.equal(validateDeviceSosPayload({ ...VALID_SOS, timestamp: undefined }).ok, false);
  const result = validateDeviceSosPayload({ ...VALID_SOS, timestamp: 'not-a-date' });
  assert.equal(result.ok, false);
  assert.match(result.error, /timestamp must be a valid date string/);
});

test('rejects an out-of-range battery', () => {
  const result = validateDeviceSosPayload({ ...VALID_SOS, battery: 140 });
  assert.equal(result.ok, false);
  assert.match(result.error, /battery/);
});

// ------------------------------------------------------- idempotency keys

test('the same press derives the same requestId', () => {
  const parsed = validateDeviceSosPayload({ ...VALID_SOS, eventId: 'press-1' }).value;
  assert.equal(deriveRequestId('BA-001', parsed), deriveRequestId('BA-001', parsed));
});

test('a retry with the same eventId derives the same requestId', () => {
  const a = validateDeviceSosPayload({ ...VALID_SOS, eventId: 'press-1' }).value;
  const b = validateDeviceSosPayload({ ...VALID_SOS, eventId: 'press-1' }).value;
  assert.equal(deriveRequestId('BA-001', a), deriveRequestId('BA-001', b));
});

test('a second press at a different time derives a different requestId', () => {
  const a = validateDeviceSosPayload(VALID_SOS).value;
  const b = validateDeviceSosPayload({ ...VALID_SOS, timestamp: '2026-10-02T09:16:00.000Z' }).value;
  assert.notEqual(deriveRequestId('BA-001', a), deriveRequestId('BA-001', b));
});

test('incident codes never collide with codes already in use', () => {
  const now = new Date('2026-10-02T09:15:30.000Z');
  const taken = ['BA-2026-101', 'BA-2026-102'];
  // RNG sequence: 101 first (already taken), then 103 (free).
  const sequence = [0.0015, 0.0035];
  let call = 0;
  const code = nextIncidentCode(now, taken, () => sequence[call++] ?? 0.5);
  assert.equal(code, 'BA-2026-103');
  assert.equal(call, 2, 'the taken code was retried, not returned');
});

test('falls back to a unique code when the RNG keeps colliding', () => {
  const now = new Date('2026-10-02T09:15:30.000Z');
  const code = nextIncidentCode(now, ['BA-2026-101'], () => 0.0015);
  assert.notEqual(code, 'BA-2026-101');
  assert.match(code, /^BA-2026-\d{3,6}$/);
});

// ---------------------------------------------------- incident construction

test('builds an Incident the existing UIs can render unchanged', () => {
  const payload = validateDeviceSosPayload({ ...VALID_SOS, battery: 76, accuracy: 8.5 }).value;
  const now = new Date('2026-10-02T09:15:30.000Z');
  const incident = buildHardwareIncident({
    device: { deviceId: 'BA-001', ownerUsername: 'dela', label: 'Band', deviceType: 'BAYANI-WEARABLE' },
    payload,
    account: { username: 'dela', email: 'dela@student.bayani.app' },
    takenCodes: [],
    now,
    random: () => 0.5,
  });

  assert.equal(incident.source, 'HARDWARE');
  assert.equal(incident.status, 'ACTIVE');
  assert.equal(incident.userProfile.username, 'dela');
  assert.equal(incident.location.lat, 14.6781);
  assert.equal(incident.location.lng, 120.5439);
  assert.equal(incident.location.accuracyRadiusMeters, 8.5);
  assert.equal(incident.location.gpsTimestamp, payload.timestamp);
  assert.equal(incident.gpsStatus, 'LOCATION RECEIVED');
  // Never claim audio is recording — this endpoint carries no audio.
  assert.equal(incident.audioStatus, 'READY');
  assert.equal(incident.trustedContactsNotified, false);
  assert.equal(incident.device.deviceId, 'BA-001');
  assert.equal(incident.device.battery, 76);
  // Timeline ids t1..t7 match what the citizen app already patches by id.
  assert.deepEqual(incident.timeline.map((s) => s.id), ['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
  assert.equal(incident.id.startsWith('inc-'), true);
  assert.match(incident.incidentCode, /^BA-2026-\d{3}$/);
  // The server receipt time is authoritative and ISO-formatted.
  assert.equal(incident.receivedAt, now.toISOString());
});

test('never claims contacts were notified before the backend tries', () => {
  const payload = validateDeviceSosPayload(VALID_SOS).value;
  const incident = buildHardwareIncident({
    device: { deviceId: 'BA-001', ownerUsername: 'dela' },
    payload,
    account: { username: 'dela' },
  });
  assert.equal(incident.trustedContactsNotified, false);
  assert.equal(incident.authoritiesNotified, false);
  assert.equal(incident.timeline.find((s) => s.id === 't6').status, 'pending');
  assert.equal(incident.timeline.find((s) => s.id === 't7').status, 'pending');
});

test('two separate presses never share an incident id', () => {
  const a = validateDeviceSosPayload(VALID_SOS).value;
  const b = validateDeviceSosPayload({ ...VALID_SOS, timestamp: '2026-10-02T09:20:00.000Z' }).value;
  const build = (payload) =>
    buildHardwareIncident({ device: { deviceId: 'BA-001', ownerUsername: 'dela' }, payload, account: { username: 'dela' } });
  assert.notEqual(build(a).id, build(b).id);
  assert.notEqual(build(a).requestId, build(b).requestId);
});

// ------------------------------------------------------ device authentication

test('maps a device id to an env variable name', () => {
  assert.equal(envKeyForDevice('BA-001'), 'DEVICE_BA_001_KEY');
});

test('reads a device (and its owner) from the environment', (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const device = resolveDevice('BA-001');
  assert.equal(device.deviceId, 'BA-001');
  assert.equal(device.ownerUsername, 'dela');
});

test('device lookup is case-insensitive and returns null when unknown', (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  assert.equal(resolveDevice('ba-001').deviceId, 'BA-001');
  assert.equal(resolveDevice('BA-999'), null);
});

test('never exposes a device key through listDevices()', (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const listed = listDevices();
  assert.equal(listed.length, 1);
  assert.equal('key' in listed[0], false);
  assert.equal(JSON.stringify(listed).includes('test-secret-key-abc123'), false);
});

test('reads a device from the inline JSON registry', (t) => {
  process.env.DEVICE_REGISTRY_JSON = JSON.stringify([
    { deviceId: 'BA-777', key: 'json-secret', ownerUsername: 'juan' },
  ]);
  resetRegistryCache();
  t.after(() => {
    delete process.env.DEVICE_REGISTRY_JSON;
    resetRegistryCache();
  });
  assert.equal(resolveDevice('BA-777').ownerUsername, 'juan');
});

/** Minimal Express-like request/response double for the auth middleware. */
function fakeReq({ key, deviceId, bodyDeviceId } = {}) {
  const headers = {};
  if (key !== undefined) headers['x-device-key'] = key;
  if (deviceId !== undefined) headers['x-device-id'] = deviceId;
  return {
    get: (name) => headers[String(name).toLowerCase()],
    body: bodyDeviceId ? { deviceId: bodyDeviceId } : {},
    device: undefined,
  };
}

function runMiddleware(req) {
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body, next: false });
        return this;
      },
    };
    const next = () => resolve({ status: null, body: null, next: true });
    requireDevice(req, res, next);
  });
}

test('auth middleware rejects a missing X-Device-Key', async (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const result = await runMiddleware(fakeReq({ deviceId: 'BA-001' }));
  assert.equal(result.status, 401);
  assert.match(result.body.error, /Missing X-Device-Key/);
});

test('auth middleware rejects a wrong key', async (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const result = await runMiddleware(fakeReq({ deviceId: 'BA-001', key: 'wrong-key' }));
  assert.equal(result.status, 401);
  assert.match(result.body.error, /Unauthorized device/);
});

test('auth middleware rejects an unknown device id', async (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const result = await runMiddleware(fakeReq({ deviceId: 'BA-999', key: 'test-secret-key-abc123' }));
  assert.equal(result.status, 401);
});

test('auth middleware accepts a registered device and never attaches the key', async (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const req = fakeReq({ deviceId: 'BA-001', key: 'test-secret-key-abc123' });
  const result = await runMiddleware(req);
  assert.equal(result.next, true);
  assert.equal(req.device.deviceId, 'BA-001');
  assert.equal(req.device.ownerUsername, 'dela');
  assert.equal('key' in req.device, false);
});

test('auth middleware reads the device id from the request body too', async (t) => {
  setDeviceEnv();
  t.after(() => setDeviceEnv({ DEVICE_BA_001_KEY: undefined, DEVICE_BA_001_OWNER: undefined }));
  const req = fakeReq({ key: 'test-secret-key-abc123', bodyDeviceId: 'BA-001' });
  const result = await runMiddleware(req);
  assert.equal(result.next, true);
});

test('no devices registered means the endpoint is inert, not open', () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('DEVICE_') && key.endsWith('_KEY')) delete process.env[key];
  }
  delete process.env.DEVICE_REGISTRY_JSON;
  resetRegistryCache();
  assert.equal(resolveRegistry().devices.length, 0);
  assert.equal(resolveDevice('BA-001'), null);
});
// ------------------------------------------------- one incident per press
// The duplicate check and the insert cannot be a single statement (the
// incidents table stores JSON documents), so the server serialises them per
// request id. These tests exercise that guard directly.

test('simultaneous retries of one press run the critical section once', async () => {
  const requestId = deriveRequestId('BA-001', VALID_SOS);
  let inside = 0;
  let maxConcurrent = 0;
  const stored = [];

  const attempt = () => withRequestLock(requestId, async () => {
    inside += 1;
    maxConcurrent = Math.max(maxConcurrent, inside);
    // Pretend to check the store, then insert.
    if (!stored.includes(requestId)) stored.push(requestId);
    await new Promise((r) => setTimeout(r, 10));
    inside -= 1;
  });

  await Promise.all([attempt(), attempt(), attempt(), attempt(), attempt()]);

  assert.equal(maxConcurrent, 1, 'only one retry may be inside the critical section at a time');
  assert.equal(stored.length, 1);
});

test('different presses are not serialised against each other', async () => {
  const a = deriveRequestId('BA-001', VALID_SOS);
  const b = deriveRequestId('BA-001', { ...VALID_SOS, timestamp: '2026-10-02T09:16:30.000Z' });
  let concurrent = 0;
  let maxConcurrent = 0;

  const work = (id) => withRequestLock(id, async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 20));
    concurrent -= 1;
  });

  await Promise.all([work(a), work(b)]);
  assert.notEqual(a, b);
  assert.equal(maxConcurrent, 2, 'independent presses must still run in parallel');
});

test('a rejected request releases the lock for the next attempt', async () => {
  const requestId = deriveRequestId('BA-001', VALID_SOS);
  await assert.rejects(withRequestLock(requestId, async () => {
    throw new Error('boom');
  }), /boom/);
  // Would hang if the lock leaked.
  await withRequestLock(requestId, async () => 'recovered');
});
