/**
 * Bayani SMS notification service (backend only).
 *
 * Sends emergency SMS to a citizen's active contacts when an SOS incident
 * arrives. Semaphore (semaphore.co) is the default provider, but the network
 * transport is isolated in `PROVIDERS` so another gateway can be added later
 * without touching any caller.
 *
 * Configure in .env (backend):
 *   SMS_MODE=simulation | live          (default: simulation — never texts)
 *   SEMAPHORE_API_KEY=your-key
 *   SEMAPHORE_SENDER_NAME=BAYANI        (optional — approved sender name)
 *   SMS_PROVIDER=semaphore              (default; future providers plug in here)
 *   SMS_PUBLIC_URL=http://localhost:4001 (optional live-track link)
 *
 * Safety guarantees:
 *   - `simulation` (default) NEVER hits the network — it records what *would*
 *     be sent. Real SMS only goes out when SMS_MODE=live AND a key is present.
 *   - The API key is never logged. Phone numbers are masked in every log line.
 *   - Per-recipient failures are captured and returned, never thrown, so a bad
 *     number or provider outage can never abort the SOS incident flow.
 *
 * Backward compatibility: the legacy SMS_ENABLED / SMS_API_KEY / SMS_SENDER_NAME
 * variables are still read as a fallback so existing .env files keep working.
 */

export const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'semaphore').toLowerCase();

export const SEMAPHORE_API_KEY =
  process.env.SEMAPHORE_API_KEY || process.env.SMS_API_KEY || '';
export const SEMAPHORE_SENDER_NAME =
  process.env.SEMAPHORE_SENDER_NAME || process.env.SMS_SENDER_NAME || '';

/** SMS_MODE wins; otherwise derive from the legacy SMS_ENABLED flag. */
export const SMS_MODE =
  (process.env.SMS_MODE || '').toLowerCase() ||
  ((process.env.SMS_ENABLED || 'false') === 'true' ? 'live' : 'simulation');
export const SMS_LIVE = SMS_MODE === 'live';

export const SMS_PUBLIC_URL = process.env.SMS_PUBLIC_URL || '';

const SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages';

/**
 * Normalize a PH mobile number to the 63XXXXXXXXXX form Semaphore expects.
 * Accepts 0917 123 4567, +63 917 123 4567, 639171234567, 9171234567.
 * Returns '' when the input cannot be a valid PH mobile number.
 */
export function normalizePhone(raw) {
  let digits = String(raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('63')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  // PH mobile numbers are the 10 digits 9XXXXXXXXX after the country code.
  if (!/^9\d{9}$/.test(digits)) return '';
  return `63${digits}`;
}

/** Mask a phone number for logs/UI: 639171234567 -> 6391••••4567 */
export function maskPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7) return '••••';
  return `${digits.slice(0, 4)}••••${digits.slice(-4)}`;
}

/** Human-friendly PH display form: 639171234567 -> 0917 123 4567 */
export function displayPhone(raw) {
  const n = normalizePhone(raw);
  if (!n) return String(raw || '');
  const local = `0${n.slice(2)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/**
 * Build the emergency SMS body. Kept short so it stays a single GSM segment
 * where possible.
 */
export function buildEmergencyMessage({ citizenName, incidentId, latitude, longitude, timestamp }) {
  const name = citizenName || 'A BAYANI user';
  const hasCoords =
    Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude || longitude);

  const lines = [
    'BAYANI EMERGENCY ALERT',
    `${name} triggered an SOS.`,
    `Ref: ${incidentId || 'UNKNOWN'}`,
  ];
  if (hasCoords) lines.push(`Map: https://maps.google.com/?q=${latitude},${longitude}`);
  if (SMS_PUBLIC_URL) lines.push(`Live: ${SMS_PUBLIC_URL}`);
  if (timestamp) lines.push(`Time: ${timestamp}`);
  return lines.join('\n');
}

// ------------------------------------------------------------- providers

async function sendViaSemaphore({ recipient, message }) {
  const form = new URLSearchParams();
  form.set('apikey', SEMAPHORE_API_KEY);
  form.set('number', recipient);
  form.set('message', message);
  if (SEMAPHORE_SENDER_NAME) form.set('sendername', SEMAPHORE_SENDER_NAME);

  const res = await fetch(SEMAPHORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semaphore ${res.status}: ${text.slice(0, 200)}`);

  let messageId;
  let providerStatus = '';
  try {
    const parsed = JSON.parse(text);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    messageId = first?.message_id;
    providerStatus = String(first?.status || '');
  } catch {
    // Non-JSON provider response — acceptance itself is enough.
  }
  return { messageId, providerStatus };
}

const PROVIDERS = {
  semaphore: sendViaSemaphore,
};

/**
 * Send ONE emergency SMS. Never throws.
 * @returns {Promise<object>} structured result the caller can persist/broadcast.
 */
export async function sendEmergencySMS({
  recipient,
  citizenName,
  incidentId,
  latitude,
  longitude,
  timestamp,
}) {
  const normalized = normalizePhone(recipient);
  const base = {
    recipient: normalized || String(recipient || ''),
    phoneMasked: maskPhone(recipient),
    provider: SMS_PROVIDER,
    status: 'PENDING',
  };

  if (!normalized) {
    return { ...base, success: false, status: 'FAILED', error: 'Invalid PH mobile number' };
  }

  const message = buildEmergencyMessage({
    citizenName,
    incidentId,
    latitude,
    longitude,
    timestamp,
  });

  // Simulation: record the intent without contacting the provider.
  if (!SMS_LIVE) {
    console.log(`[bayani-sms] SIMULATED -> ${base.phoneMasked}`);
    return { ...base, success: true, status: 'SIMULATED', simulated: true };
  }

  const provider = PROVIDERS[SMS_PROVIDER];
  if (!provider) {
    return { ...base, success: false, status: 'FAILED', error: `Unknown provider "${SMS_PROVIDER}"` };
  }
  if (SMS_PROVIDER === 'semaphore' && !SEMAPHORE_API_KEY) {
    return { ...base, success: false, status: 'FAILED', error: 'Missing SEMAPHORE_API_KEY' };
  }

  try {
    const { messageId, providerStatus } = await provider({ recipient: normalized, message });
    const status = /sent|delivered/i.test(providerStatus) ? 'SENT' : 'QUEUED';
    console.log(
      `[bayani-sms] ${status} -> ${base.phoneMasked}${messageId ? ` (id=${messageId})` : ''}`
    );
    return { ...base, success: true, status, messageId };
  } catch (err) {
    console.warn(`[bayani-sms] FAILED -> ${base.phoneMasked}: ${err.message}`);
    return { ...base, success: false, status: 'FAILED', error: err.message };
  }
}

/**
 * Fan an incident's emergency SMS out to every active contact.
 * Contacts with `isActive === false` are skipped. Never throws.
 */
export async function sendIncidentSMS(incident, contacts) {
  const list = (contacts || []).filter((c) => c && c.isActive !== false && c.phone);

  const dispatch = {
    incidentId: incident?.id || null,
    incidentCode: incident?.incidentCode || null,
    mode: SMS_MODE,
    provider: SMS_PROVIDER,
    sentAt: new Date().toISOString(),
    results: [],
    summary: { total: list.length, sent: 0, queued: 0, simulated: 0, failed: 0 },
  };

  if (!list.length) {
    console.log('[bayani-sms] no active contacts to notify');
    return dispatch;
  }

  const loc = incident?.location || {};
  for (const contact of list) {
    const res = await sendEmergencySMS({
      recipient: contact.phone,
      citizenName: incident?.userName,
      incidentId: incident?.incidentCode || incident?.id,
      latitude: loc.lat,
      longitude: loc.lng,
      timestamp: [incident?.date, incident?.timeActivated].filter(Boolean).join(' '),
    });

    dispatch.results.push({
      id: `sms-${contact.id || 'c'}-${dispatch.results.length}`,
      contactId: contact.id || null,
      contactName: contact.name || 'Unknown contact',
      ...res,
    });

    if (res.status === 'SENT') dispatch.summary.sent += 1;
    else if (res.status === 'QUEUED') dispatch.summary.queued += 1;
    else if (res.status === 'SIMULATED') dispatch.summary.simulated += 1;
    else dispatch.summary.failed += 1;
  }

  console.log(
    `[bayani-sms] dispatch complete (${SMS_MODE}): ` +
      `${dispatch.summary.sent} sent, ${dispatch.summary.queued} queued, ` +
      `${dispatch.summary.simulated} simulated, ${dispatch.summary.failed} failed`
  );
  return dispatch;
}
