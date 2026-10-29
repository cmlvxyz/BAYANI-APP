/**
 * server/hardware.mjs — hardware SOS intake: payload validation + Incident build.
 *
 * The wearable device knows only its own id, a GNSS fix, a battery reading and
 * the moment the squeeze trigger fired. The backend therefore BUILDS the full
 * Incident itself (server-side is the single source of truth) using the exact
 * same shape the citizen app already produces, so neither app needs a new UI
 * path to display a hardware alert.
 *
 * Pure functions only — no database, no Express. `validateDeviceSosPayload()`
 * and `buildHardwareIncident()` are unit-tested in `hardware.test.mjs`.
 */

const SOS_EVENT = 'SOS';
const MAX_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 160;

const GSM_SIGNAL_STRINGS = new Set(['Strong', 'Moderate', 'Weak', 'Offline', 'NONE', 'UNKNOWN']);

/** `{ ok: true, value }` or `{ ok: false, error }` — never throws. */
function fail(error) {
  return { ok: false, error };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function cleanText(value, maxLength = MAX_LABEL_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * Validate a `POST /device/sos` body. Returns a SANITIZED copy containing only
 * the recognised keys, so nothing unexpected from the device can ever leak into
 * the stored incident.
 *
 * Required: deviceId, event === "SOS", latitude, longitude, timestamp.
 * Optional: accuracy, battery, gsmSignal, gpsFix, eventId.
 */
export function validateDeviceSosPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('Request body must be a JSON object');
  }

  const deviceId = cleanText(body.deviceId, MAX_ID_LENGTH);
  if (!deviceId) return fail('deviceId is required');
  if (!/^[A-Za-z0-9._-]+$/.test(deviceId)) {
    return fail('deviceId may only contain letters, digits, dot, dash or underscore');
  }

  const event = cleanText(body.event, 16).toUpperCase();
  if (!event) return fail('event is required');
  if (event !== SOS_EVENT) return fail(`event must be "${SOS_EVENT}"`);

  const latitude = body.latitude;
  if (!isFiniteNumber(latitude)) return fail('latitude must be a number');
  if (latitude < -90 || latitude > 90) return fail('latitude must be between -90 and 90');

  const longitude = body.longitude;
  if (!isFiniteNumber(longitude)) return fail('longitude must be a number');
  if (longitude < -180 || longitude > 180) return fail('longitude must be between -180 and 180');

  // A device clock can be off or absent entirely — we accept any parseable date
  // and normalize to ISO. The server's own receipt time stays authoritative.
  const rawTimestamp = body.timestamp;
  if (typeof rawTimestamp !== 'string' && typeof rawTimestamp !== 'number') {
    return fail('timestamp is required (ISO-8601 string)');
  }
  const parsedTimestamp = Date.parse(rawTimestamp);
  if (Number.isNaN(parsedTimestamp)) return fail('timestamp must be a valid date string');
  const timestamp = new Date(parsedTimestamp).toISOString();

  const value = { deviceId, event: SOS_EVENT, latitude, longitude, timestamp };

  if (body.accuracy !== undefined && body.accuracy !== null) {
    if (!isFiniteNumber(body.accuracy) || body.accuracy < 0) {
      return fail('accuracy must be a non-negative number');
    }
    value.accuracy = body.accuracy;
  }

  if (body.battery !== undefined && body.battery !== null) {
    if (!isFiniteNumber(body.battery) || body.battery < 0 || body.battery > 100) {
      return fail('battery must be a number between 0 and 100');
    }
    value.battery = body.battery;
  }

  if (body.gsmSignal !== undefined && body.gsmSignal !== null) {
    // Accept a human label ("Strong") or a raw 0-31 cellular signal value.
    if (isFiniteNumber(body.gsmSignal)) {
      if (body.gsmSignal < 0 || body.gsmSignal > 31) return fail('gsmSignal (numeric) must be between 0 and 31');
      value.gsmSignal = body.gsmSignal;
    } else {
      const label = cleanText(body.gsmSignal, 16);
      if (!label) return fail('gsmSignal must be a string or a number between 0 and 31');
      if (!GSM_SIGNAL_STRINGS.has(label)) return fail('gsmSignal must be Strong, Moderate, Weak or Offline');
      value.gsmSignal = label;
    }
  }

  if (body.gpsFix !== undefined && body.gpsFix !== null) {
    const fix = cleanText(body.gpsFix, 24);
    value.gpsFix = fix || (body.gpsFix === true ? 'LOCKED' : '');
  }

  // eventId lets the firmware retry the same press after a network timeout; the
  // route uses it (with the derived requestId) to never double-create.
  const eventId = cleanText(body.eventId, MAX_ID_LENGTH);
  if (eventId) value.eventId = eventId;

  return { ok: true, value };
}

/**
 * Derive the idempotency key for a payload. The same press (same eventId, or
 * same deviceId + same timestamp) always yields the same key, so a retried
 * upload resolves to the incident that already exists. A genuinely new press
 * carries a new timestamp and therefore gets its own key.
 */
export function deriveRequestId(deviceId, payload) {
  const stableId = payload.eventId || `${payload.deviceId}-${payload.timestamp}`;
  return `hw-${payload.deviceId}-${stableId}`.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

/** `12:12 AM` / `October 2, 2026` — the display strings the UIs already use. */
function displayTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function displayDate(date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Pick a `BA-YYYY-NNN` incident code that is not already taken.
 * `takenCodes` is an iterable of existing codes (case-insensitive).
 */
export function nextIncidentCode(date, takenCodes = [], random = Math.random) {
  const year = date.getFullYear();
  const used = new Set([...takenCodes].map((c) => String(c).toUpperCase()));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `BA-${year}-${String(Math.floor(random() * 900) + 100)}`;
    if (!used.has(code.toUpperCase())) return code;
  }
  // Fallback: derive a code no collision check can miss.
  return `BA-${year}-${String(Date.now()).slice(-6)}`;
}

/**
 * Build the full Incident for a validated hardware payload.
 *
 * @param {object} options
 * @param {object} options.device    registry entry ({ deviceId, ownerUsername, label, deviceType })
 * @param {object} options.payload   sanitized payload from validateDeviceSosPayload()
 * @param {object} options.account   linked citizen account row ({ username, email }) — optional
 * @param {string[]} options.takenCodes existing incident codes to avoid colliding with
 * @param {Date}   [options.now]     injectable clock (tests)
 * @param {() => number} [options.random] injectable RNG (tests)
 */
export function buildHardwareIncident({ device, payload, account = null, takenCodes = [], now = new Date(), random = Math.random }) {
  const deviceId = device.deviceId;
  const ownerUsername = (account?.username || device.ownerUsername || '').trim();
  const displayName = cleanText(account?.fullName, 120) || ownerUsername || 'Bayani device user';

  const timestamp = now.toISOString();
  const requestId = deriveRequestId(deviceId, payload);
  const id = `inc-${now.getTime()}-${Math.floor(random() * 46656).toString(36).padStart(3, '0')}`;
  const incidentCode = nextIncidentCode(now, takenCodes, random);

  const accuracy = payload.accuracy ?? 0;
  const hasFix = isFiniteNumber(payload.latitude) && isFiniteNumber(payload.longitude);

  // Timeline step ids (t1…t7) intentionally match the ids the citizen app
  // already uses, so the app's existing status/SMS repairs keep working when a
  // hardware alert arrives on a phone that is also running the app.
  const timeline = [
    { id: 't1', title: 'SOS Trigger Activated', description: `Wearable squeeze trigger on device ${deviceId}`, status: 'completed', timestamp: displayTime(now) },
    {
      id: 't2',
      title: 'GPS Location Received',
      description: hasFix ? `${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)} transmitted by the device` : 'Waiting for a GPS fix…',
      status: 'completed',
      timestamp: displayTime(now),
    },
    { id: 't3', title: 'Device Signal Uploaded', description: `Submitted over cellular data from device ${deviceId}`, status: 'completed', timestamp: displayTime(now) },
    { id: 't4', title: 'Saved to Bayani Records', description: 'Incident stored on the Bayani server', status: 'completed', timestamp: displayTime(now) },
    { id: 't5', title: 'Received by Bayani Response Center', description: 'Live alert delivered to the Response Center', status: 'completed', timestamp: displayTime(now) },
    { id: 't6', title: 'Trusted Contacts Notified', description: 'Emergency contacts are being informed by SMS', status: 'pending', timestamp: displayTime(now) },
    { id: 't7', title: 'Responder En Route', description: 'A responder is being dispatched to your location', status: 'pending', timestamp: displayTime(now) },
  ];

  return {
    id,
    incidentCode,
    requestId,
    source: 'HARDWARE',
    userName: displayName,
    // The device reports no phone number and the backend never guesses one.
    userPhone: '—',
    ...(ownerUsername
      ? {
          userProfile: {
            username: ownerUsername,
            ...(account?.email ? { email: account.email } : {}),
          },
        }
      : {}),
    timeActivated: displayTime(now),
    date: displayDate(now),
    /** Server receipt time — the only trustworthy clock on the row. */
    receivedAt: timestamp,
    status: 'ACTIVE',
    location: {
      address: hasFix ? `Device GPS · ${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}` : 'Location unavailable',
      barangay: '—',
      city: '—',
      country: 'Philippines',
      lat: hasFix ? payload.latitude : 0,
      lng: hasFix ? payload.longitude : 0,
      accuracyRadiusMeters: accuracy,
      /** When the DEVICE captured the fix (may differ from server receipt). */
      gpsTimestamp: payload.timestamp,
      source: 'gps',
    },
    gpsStatus: 'LOCATION RECEIVED',
    /** This endpoint does not carry audio — never claim recording is active. */
    audioStatus: 'READY',
    communicationStatus: 'SOS SENT',
    trustedContactsNotified: false,
    authoritiesNotified: false,
    timeline,
    notes: `Emergency activated from the Bayani wearable device (${deviceId}).`,
    device: {
      deviceId,
      label: device.label || '',
      deviceType: device.deviceType || 'BAYANI-WEARABLE',
      ...(payload.battery !== undefined ? { battery: payload.battery } : {}),
      ...(payload.gsmSignal !== undefined ? { gsmSignal: payload.gsmSignal } : {}),
      ...(payload.gpsFix ? { gpsFix: payload.gpsFix } : {}),
      ...(payload.accuracy !== undefined ? { accuracy: payload.accuracy } : {}),
    },
  };
}

export const HARDWARE_SOS_EVENT = SOS_EVENT;

/**
 * Serialise the "has this press already been stored?" critical section per
 * request id. The incidents table is a JSON document store keyed by incident
 * id, so the duplicate check and the insert cannot be one atomic statement;
 * this keeps two near-simultaneous retries of the SAME press (firmware
 * reconnect loop, double-fired button) from creating two emergencies, while
 * different presses still proceed fully in parallel.
 */
const requestLocks = new Map();

export async function withRequestLock(requestId, fn) {
  const previous = requestLocks.get(requestId) || Promise.resolve();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  requestLocks.set(requestId, held);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (requestLocks.get(requestId) === held) requestLocks.delete(requestId);
  }
}