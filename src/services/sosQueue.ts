/**
 * sosQueue — offline-first SOS transmission queue (IndexedDB).
 *
 * When a citizen raises an SOS without connectivity, the alert is NOT lost:
 * it is persisted here and retried automatically every time the connection
 * comes back (or on a short backoff interval). Idempotency is handled by the
 * incident's `requestId`/`id`, so a retried alert is never double-posted.
 */

import { Incident } from '../types';

const DB_NAME = 'bayani_sos_queue';
const STORE = 'pending';
const VERSION = 1;

export interface PendingSosEntry {
  id: string;
  incident: Incident;
  attempts: number;
  createdAt: string;
}

const inMemory = new Map<string, PendingSosEntry>();

function dbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!dbAvailable()) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const t = database.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
      })
  );
}

/** Persist a pending SOS so it survives app refreshes and retries. */
export async function enqueuePendingSos(incident: Incident): Promise<void> {
  const entry: PendingSosEntry = {
    id: incident.id,
    incident,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  if (dbAvailable()) {
    try {
      await tx('readwrite', (s) => s.put(entry));
      return;
    } catch {
      // fall through to the in-memory buffer
    }
  }
  inMemory.set(entry.id, entry);
}

/** Remove a SOS that was confirmed received by the server. */
export async function removePendingSos(incidentId: string): Promise<void> {
  if (dbAvailable()) {
    try {
      await tx('readwrite', (s) => s.delete(incidentId));
      return;
    } catch {
      // fall through
    }
  }
  inMemory.delete(incidentId);
}

/** Bump the attempt counter (persisted so reconnect crashes don't reset it). */
export async function bumpPendingSos(incidentId: string, error?: string): Promise<void> {
  const update = (entry: PendingSosEntry) => ({
    ...entry,
    attempts: entry.attempts + 1,
    incident: error
      ? { ...entry.incident, sending: { state: 'FAILED' as const, error, attempts: entry.attempts + 1 } }
      : entry.incident,
  });
  if (dbAvailable()) {
    try {
      const current = await tx<unknown>('readonly', (s) => s.get(incidentId)) as PendingSosEntry | undefined;
      if (!current) return;
      await tx('readwrite', (s) => s.put(update(current)));
      return;
    } catch {
      // fall through
    }
  }
  const cur = inMemory.get(incidentId);
  if (cur) inMemory.set(incidentId, update(cur));
}

/** Every pending SOS, oldest first. */
export async function listPendingSos(): Promise<PendingSosEntry[]> {
  if (dbAvailable()) {
    try {
      const all = await tx<unknown[]>('readonly', (s) => s.getAll());
      return (Array.isArray(all) ? all : []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      // fall through
    }
  }
  return [...inMemory.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** True when at least one SOS is waiting to be transmitted. */
export async function hasPendingSos(): Promise<boolean> {
  const list = await listPendingSos();
  return list.length > 0;
}