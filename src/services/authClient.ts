/**
 * Authentication client — Bayani App (citizen) side.
 * Talks to the shared backend (Bayani Express Sync Server, port 8000).
 * Session token is kept in localStorage under bayani_citizen_session.
 */

export interface AuthUser {
  username: string;
  email: string;
  role: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

const API_URL =
  import.meta.env.VITE_BRIDGE_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;
const STORAGE_KEY = 'bayani_citizen_session';
const KNOWN_STORAGE_KEY = 'bayani_known_accounts';

export interface KnownAccount {
  username: string;
  email?: string;
}

/** Usernames na na-login na sa device na ito (para sa quick login chips). */
export function getKnownAccounts(): KnownAccount[] {
  try {
    const raw = localStorage.getItem(KNOWN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.username === 'string') : [];
  } catch {
    return [];
  }
}

export function saveKnownAccount(username: string, email?: string): void {
  const clean = username.trim().toLowerCase();
  if (!clean) return;
  const known = getKnownAccounts();
  if (known.some((a) => a.username.toLowerCase() === clean)) return;
  known.push({ username: clean, email: email?.trim() || undefined });
  localStorage.setItem(KNOWN_STORAGE_KEY, JSON.stringify(known));
}

export async function register(username: string, password: string, email?: string): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });
  } catch {
    throw new Error(`Cannot reach the server at ${API_URL}. Start the backend (run start-bayani.bat).`);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Registration failed');
}

export async function login(username: string, password: string): Promise<AuthSession> {
  let r: Response;
  try {
    r = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error(`Cannot reach the server at ${API_URL}. Start the backend (run start-bayani.bat).`);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Login failed');
  const session: AuthSession = { token: data.token, user: data.user };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.token && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

export function logout() {
  const session = getSession();
  if (session?.token) {
    try {
      void fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {});
    } catch {
      // ignore — session is cleared locally regardless
    }
  }
  localStorage.removeItem(STORAGE_KEY);
}