/**
 * Bayani Bridge client — citizen (Bayani App) side.
 *
 * - Pushes SOS incidents + manual resolve events to the Bridge (POST /event)
 * - Subscribes to the Response Center's live status updates (SSE /stream)
 * - Subscribes to a SOS raised by this citizen's wearable device
 *   (SSE type: hardware_sos) and displays it WITHOUT re-transmitting anything
 * - Reports bridge online/offline so the UI can show a connection pill
 */

import { Incident } from '../types';
import { getSession } from './authClient';

// Bridge base URL — defaults to the same host as the page (port 8000), so it
// works from other PCs on the LAN. Override via VITE_BRIDGE_URL if needed.
const BRIDGE_URL =
  import.meta.env.VITE_BRIDGE_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

export interface CitizenBridgeHandlers {
  onStatusUpdate?: (inc: Partial<Incident>) => void;
  /** SOS raised by this citizen's registered wearable device. */
  onHardwareSOS?: (inc: Incident) => void;
  onResolve?: (incidentCode: string) => void;
  onOnlineChange?: (online: boolean) => void;
  onSmsUpdate?: (payload: { id: string; incidentCode?: string; smsNotifications: any }) => void;
}

export function connectBridge(handlers: CitizenBridgeHandlers): () => void {
  let online = false;

  const setOnline = (v: boolean) => {
    if (v !== online) {
      online = v;
      handlers.onOnlineChange?.(v);
    }
  };

  const token = getSession()?.token || '';
  // Pass the session token so the server can resolve this client as a citizen
  // and deliver a wearable SOS for THIS account only (exact coordinates are
  // never streamed to anyone else's browser).
  const es = new EventSource(`${BRIDGE_URL}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  es.onopen = () => setOnline(true);
  es.onerror = () => setOnline(false); // EventSource auto-reconnects

  es.onmessage = (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      if (msg.source === 'response' && msg.type === 'status_update' && handlers.onStatusUpdate) {
        handlers.onStatusUpdate(msg.payload);
      } else if (msg.source === 'hardware' && msg.type === 'hardware_sos' && handlers.onHardwareSOS) {
        // Already stored and dispatched by the backend — display only. The app
        // must never call emitSOS()/transmitSos() for this incident.
        handlers.onHardwareSOS(msg.payload);
      } else if (msg.source === 'response' && msg.type === 'resolve' && handlers.onResolve) {
        handlers.onResolve(msg.payload);
      } else if (msg.source === 'server' && msg.type === 'sms_update' && handlers.onSmsUpdate) {
        handlers.onSmsUpdate(msg.payload);
      }
    } catch {
      // ignore malformed frames
    }
  };

  const healthTimer = window.setInterval(async () => {
    try {
      const r = await fetch(`${BRIDGE_URL}/health`);
      setOnline(r.ok);
    } catch {
      setOnline(false);
    }
    // Presence: report the logged-in account so the Response Center can show
    // how many Bayani users are online. Signing out stops the presence.
    const session = getSession();
    if (session?.user?.username) {
      post({ source: 'citizen', type: 'heartbeat', payload: { username: session.user.username } });
    }
  }, 5000);

  return () => {
    window.clearInterval(healthTimer);
    es.close();
  };
}

/**
 * Broadcast an SOS incident to the Response Center.
 * Resolves `true` ONLY when the server acknowledged the alert (HTTP 200) —
 * drive the citizen's timeline/status UI from this real result.
 */
export async function emitSOS(incident: Incident): Promise<boolean> {
  const session = getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BRIDGE_URL}/event`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'citizen', type: 'sos', payload: incident }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Let the Response Center know the citizen resolved/cancelled the test. */
export function emitResolve(incidentCode: string) {
  post({
    source: 'citizen',
    type: 'resolve',
    payload: incidentCode,
  });
}

/** Sign the account out of the online count the moment the user logs out. */
export function emitLogout(username: string) {
  post({
    source: 'citizen',
    type: 'logout',
    payload: { username },
  });
}

/** Re-broadcast the live audio feed so the Response Center can hear it. */
export function emitAudioLive(incidentCode: string, audioUrl: string) {
  post({
    source: 'citizen',
    type: 'audio_live',
    payload: { incidentCode, audioUrl, ts: Date.now() },
  });
}

/**
 * Push a refreshed position for an SOS that was already sent. The SOS fires the
 * instant the button is pressed (sometimes before the GPS has a fix); when the
 * watcher then delivers real coordinates this is what finally puts the citizen
 * on the Response Center's map.
 */
export function emitLocationUpdate(incident: Incident) {
  if (!incident?.id || !incident.location) return;
  post({
    source: 'citizen',
    type: 'location_update',
    payload: {
      id: incident.id,
      incidentCode: incident.incidentCode,
      userName: incident.userName,
      location: incident.location,
      gpsStatus: incident.gpsStatus,
    },
  });
}

/**
 * Fetch THIS citizen's incidents persisted on the backend — used on startup so
 * a page refresh never drops the incident history. Prefers `/incidents/mine`
 * (filtered server-side to the signed-in username); falls back to the legacy
 * public list for pre-auth backends.
 */
export async function fetchIncidents(): Promise<Incident[]> {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;
  try {
    const res = await fetch(`${BRIDGE_URL}/incidents/mine`, { headers });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data?.incidents) ? data.incidents : [];
    }
  } catch {
    // offline — fall through to the legacy path below
  }
  try {
    const res = await fetch(`${BRIDGE_URL}/incidents`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.incidents) ? data.incidents : [];
  } catch {
    return [];
  }
}

function post(msg: unknown) {
  try {
    fetch(`${BRIDGE_URL}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {});
  } catch {
    // offline — ignore
  }
}