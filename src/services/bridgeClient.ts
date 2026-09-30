/**
 * Bayani Bridge client — citizen (Bayani App) side.
 *
 * - Pushes SOS incidents + manual resolve events to the Bridge (POST /event)
 * - Subscribes to the Response Center's live status updates (SSE /stream)
 * - Reports bridge online/offline so the UI can show a connection pill
 */

import { Incident } from '../types';
import { getSession } from './authClient';

// Bridge base URL — overridable via VITE_BRIDGE_URL (e.g. the laptop's LAN IP
// when Bayani App runs on a phone and the Bridge runs on another machine).
const BRIDGE_URL = (import.meta as any)?.env?.VITE_BRIDGE_URL || 'http://localhost:8000';

export interface CitizenBridgeHandlers {
  onStatusUpdate?: (inc: Partial<Incident>) => void;
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

  const es = new EventSource(`${BRIDGE_URL}/stream`);
  es.onopen = () => setOnline(true);
  es.onerror = () => setOnline(false); // EventSource auto-reconnects

  es.onmessage = (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      if (msg.source === 'response' && msg.type === 'status_update' && handlers.onStatusUpdate) {
        handlers.onStatusUpdate(msg.payload);
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