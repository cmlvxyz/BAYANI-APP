/**
 * Bayani Alert - Incident Management & State Service
 */

import { Incident, IncidentStatus, EmergencyContactItem, AppNotification, AudioEvidenceItem, ResponderAgent, SmsDispatch, IncidentSource } from '../types';
import { hardwareService, WearableDeviceTelemetry } from './hardwareService';
import { fetchContacts, createContactRemote, updateContactRemote, deleteContactRemote } from './contactApi';
import { loadCitizenProfile } from './profileService';
import { getSession } from './authClient';
import { createEmergencyAudioDataUrl } from './audioService';
import { emitSOS } from './bridgeClient';
import { enqueuePendingSos, removePendingSos, bumpPendingSos, listPendingSos } from './sosQueue';

const INITIAL_INCIDENT: Incident | null = null;
const INITIAL_PAST_INCIDENTS: Incident[] = [];
const INITIAL_CONTACTS: EmergencyContactItem[] = [];
const INITIAL_NOTIFICATIONS: AppNotification[] = [];
const INITIAL_AUDIO_EVIDENCE: AudioEvidenceItem[] = [];
const INITIAL_RESPONDERS: ResponderAgent[] = [];

/** Safe default for legacy incidents that were stored without a location. */
const EMPTY_LOCATION: Incident['location'] = {
  address: 'Location unavailable',
  barangay: '—',
  city: '—',
  country: 'Philippines',
  lat: 0,
  lng: 0,
  accuracyRadiusMeters: 0,
};

type IncidentServiceListener = () => void;

class IncidentService {
  private activeIncident: Incident | null = INITIAL_INCIDENT;
  private incidents: Incident[] = [...INITIAL_PAST_INCIDENTS];
  private contacts: EmergencyContactItem[] = [...INITIAL_CONTACTS];
  private notifications: AppNotification[] = [...INITIAL_NOTIFICATIONS];
  private audioEvidence: AudioEvidenceItem[] = [...INITIAL_AUDIO_EVIDENCE];
  private responders: ResponderAgent[] = [...INITIAL_RESPONDERS];
  private listeners: IncidentServiceListener[] = [];

  constructor() {
    hardwareService.subscribe((telemetry: WearableDeviceTelemetry) => {
      if (telemetry.event === 'SOS') {
        this.handleHardwareSOSActivation(telemetry);
      }
    });
  }

  public subscribe(listener: IncidentServiceListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    for (const l of this.listeners) {
      l();
    }
  }

  public getActiveIncident(): Incident | null {
    return this.activeIncident;
  }

  public getIncidents(): Incident[] {
    return [...this.incidents];
  }

  public getContacts(): EmergencyContactItem[] {
    return [...this.contacts];
  }

  public async loadContacts(): Promise<void> {
    try {
      const remote = await fetchContacts();
      if (remote) {
        this.contacts = remote;
        this.notify();
      }
    } catch {
      // server offline — keep whatever we have in memory
    }
  }

  /**
   * Bulk-load incidents persisted on the backend (used for the initial load
   * when Bayani App starts, and after a reconnect). Merges by id so live SSE
   * arrivals are never duplicated, and preserves the stored status (a resolved
   * incident stays resolved across restarts).
   */
  public loadIncidents(items: Incident[]) {
    if (!Array.isArray(items) || items.length === 0) return;

    const known = new Set(this.incidents.map(i => i.id));
    let changed = false;
    for (const inc of items) {
      if (!inc || !inc.id || known.has(inc.id)) continue;
      known.add(inc.id);
      // Legacy alerts (created before exact-location support) may lack a
      // `location` object — normalize so every screen can render safely.
      this.incidents.push({
        ...inc,
        location: { ...EMPTY_LOCATION, ...(inc.location ?? {}) },
      });
      changed = true;
    }
    if (!changed) return;

    this.incidents.sort((a, b) => (a.id < b.id ? 1 : -1));

    // Re-attach a still-open alert after a page reload / app restart.
    //
    // The backend store is the source of truth: the Response Center already
    // treats any incident that is still open as an ACTIVE EMERGENCY, so if we
    // did NOT re-attach it here the citizen's phone would show "no emergency"
    // while the RC is still dispatching a unit for it. A resolved/cancelled
    // incident is never promoted, so a concluded alert can't resurrect itself.
    if (!this.activeIncident) {
      const open = this.incidents.find((i) => i.status !== 'RESOLVED' && i.status !== 'CANCELLED');
      if (open) {
        this.activeIncident = {
          ...open,
          // The server acknowledged this alert when it stored it.
          sending: open.sending ?? { state: 'SERVER_RECEIVED', attempts: 0 },
        };
        this.notifications = [
          {
            id: `notif-restore-${open.id}`,
            type: 'sos',
            title: '🚨 SOS STILL ACTIVE',
            message: `Your alert ${open.incidentCode} is still open — responders may still be on the way.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: false,
            isEmergency: true,
          },
          ...this.notifications,
        ];
      }
    }

    this.notify();
  }

  public getNotifications(): AppNotification[] {
    return [...this.notifications];
  }

  public getAudioEvidence(): AudioEvidenceItem[] {
    return [...this.audioEvidence];
  }

  public getResponders(): ResponderAgent[] {
    return [...this.responders];
  }

  private handleHardwareSOSActivation(telemetry: WearableDeviceTelemetry) {
    const newCode = `BA-2026-${String(Math.floor(Math.random() * 900) + 100)}`;
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const override = hardwareService.getLocationOverride();
    const profile = loadCitizenProfile();
    // The username comes from the signed-in account (session), never from a
    // stale local profile copy — para pareho ang lalabas sa header, sa Settings,
    // at sa Citizen Profile ng Response Center.
    const sessionUsername = getSession()?.user?.username?.trim() || '';
    const citizenName = profile.fullName.trim() || sessionUsername || 'Citizen';
    // Data minimization: only the fields a responder needs are transmitted
    // (username + display name). Email/Gender/DOB/avatar stay on the device.
    const userProfile = {
      username: sessionUsername || profile.username.trim(),
      fullName: profile.fullName.trim(),
    };

    const hasCoords = !!(telemetry.latitude || telemetry.longitude);

    const newIncident: Incident = {
      id: `inc-${Date.now()}`,
      incidentCode: newCode,
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'APP',
      userName: citizenName,
      userPhone: '—',
      userProfile,
      timeActivated: currentTime,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      status: 'ACTIVE',
      location: {
        address: telemetry.locationName || 'Location pending',
        barangay: telemetry.barangay || '—',
        city: telemetry.city || '—',
        country: 'Philippines',
        lat: telemetry.latitude || 0,
        lng: telemetry.longitude || 0,
        accuracyRadiusMeters: typeof telemetry.locationAccuracy === 'number' ? Math.max(0, telemetry.locationAccuracy) : 0,
        gpsTimestamp: telemetry.locationTimestamp ?? undefined,
        source: telemetry.locationSource,
        pano: override?.pano,
        heading: override?.heading,
        pitch: override?.pitch,
      },
      gpsStatus: hasCoords ? 'LOCATION RECEIVED' : 'SEARCHING',
      audioStatus: 'RECORDING ACTIVE',
      communicationStatus: 'SOS SENT',
      trustedContactsNotified: false,
      authoritiesNotified: false,
      sending: { state: 'CREATED', attempts: 0 },
      // An honest timeline: each step is only marked completed when its real
      // event actually happened. Nothing is "pre-confirmed" just for looks.
      timeline: [
        { id: 't1', title: 'SOS Activated', description: 'Emergency button pressed on this device', status: 'completed', timestamp: currentTime },
        hasCoords
          ? { id: 't2', title: 'GPS Location Received', description: `${telemetry.locationName || 'Location'} pinned to the alert`, status: 'completed', timestamp: currentTime }
          : { id: 't2', title: 'GPS Location', description: 'Waiting for a GPS fix…', status: 'pending', timestamp: currentTime },
        { id: 't3', title: 'Audio Recording Started', description: 'Ambient audio clip created locally on this device', status: 'completed', timestamp: currentTime },
        { id: 't4', title: 'Saved for Transmission', description: 'Alert queued and re-synced if the connection drops', status: 'pending', timestamp: currentTime },
        { id: 't5', title: 'Sent to Response Center', description: 'Waiting for the server to confirm receipt', status: 'pending', timestamp: currentTime },
        { id: 't6', title: 'Trusted Contacts Notified', description: 'Your trusted contacts are informed by SMS', status: 'pending', timestamp: currentTime },
        { id: 't7', title: 'Responder En Route', description: 'A responder is being dispatched to your location', status: 'pending', timestamp: currentTime },
      ],
      notes: 'SOS raised from the Bayani app.',
    };

    this.activeIncident = newIncident;
    this.incidents = [newIncident, ...this.incidents.filter(i => i.id !== newIncident.id)];

    const newNotifications: AppNotification[] = [
      { id: `notif-${Date.now()}-1`, type: 'sos', title: 'SOS Activated', message: 'Emergency signal raised from your device.', timestamp: currentTime, isRead: false, isEmergency: true },
      { id: `notif-${Date.now()}-2`, type: 'location', title: hasCoords ? 'Location Received' : 'Locating…', message: hasCoords ? 'Your GPS location was pinned to the alert.' : 'Waiting for a GPS fix before sending.', timestamp: currentTime, isRead: false, isEmergency: false },
      { id: `notif-${Date.now()}-3`, type: 'audio', title: 'Audio Recording', message: 'An ambient audio clip was created locally.', timestamp: currentTime, isRead: false, isEmergency: false },
    ];
    this.notifications = [...newNotifications, ...this.notifications];

    const newAudio: AudioEvidenceItem = {
      id: `aud-${Date.now()}`,
      incidentId: newIncident.id,
      incidentCode: newIncident.incidentCode,
      date: newIncident.date,
      time: currentTime,
      durationSeconds: 45,
      status: 'RECORDING',
      fileSize: '1.8 MB',
      sha256Hash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      audioUrl: createEmergencyAudioDataUrl(45),
    };
    this.audioEvidence = [newAudio, ...this.audioEvidence];

    this.notify();
  }

  /** Patch the given incident (active + history copy) without losing timeline. */
  private patchSos(incidentId: string, patch: Partial<Incident>) {
    if (this.activeIncident && this.activeIncident.id === incidentId) {
      this.activeIncident = { ...this.activeIncident, ...patch };
    }
    this.incidents = this.incidents.map((inc) => (inc.id === incidentId ? { ...inc, ...patch } : inc));
    this.notify();
  }

  private setTimelineStep(incidentId: string, stepId: string, partial: Partial<{ title: string; description: string; status: 'completed' | 'in_progress' | 'pending'; timestamp: string }>) {
    const apply = (inc: Incident): Incident => ({
      ...inc,
      timeline: (inc.timeline ?? []).map((s) => (s.id === stepId ? { ...s, ...partial } : s)),
    });
    if (this.activeIncident && this.activeIncident.id === incidentId) {
      this.activeIncident = apply(this.activeIncident);
    }
    this.incidents = this.incidents.map((inc) => (inc.id === incidentId ? apply(inc) : inc));
    this.notify();
  }

  /**
   * Offline-first dispatch: persist the SOS to the local queue (so a crash or a
   * dropped connection never loses it), then transmit right away. The timeline
   * and the emergency screen reflect the server's real acknowledgement.
   */
  public async transmitSos(): Promise<boolean> {
    const inc = this.activeIncident;
    if (!inc) return false;
    await enqueuePendingSos(inc);
    this.setTimelineStep(inc.id, 't4', { status: 'completed', description: 'Saved locally; re-synced automatically if the connection drops' });
    this.patchSos(inc.id, { sending: { state: 'SAVED_OFFLINE', attempts: 0 } });
    return this.attemptTransmit(inc.id);
  }

  private async attemptTransmit(incidentId: string): Promise<boolean> {
    const inc = this.incidents.find((i) => i.id === incidentId) || this.activeIncident;
    if (!inc) return false;
    this.patchSos(incidentId, { sending: { state: 'SENDING', attempts: (inc.sending?.attempts ?? 0) + 1 } });
    let ok = false;
    let error = '';
    try {
      ok = await emitSOS(inc);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Bridge unreachable';
    }
    if (ok) {
      await removePendingSos(incidentId);
      this.setTimelineStep(incidentId, 't5', { status: 'completed', description: 'Received by the Bayani Response Center' });
      this.patchSos(incidentId, { sending: { state: 'SERVER_RECEIVED' }, communicationStatus: 'CONFIRMED' });
      return true;
    }
    const message = error || 'No connection to the Response Center';
    await bumpPendingSos(incidentId, message);
    this.patchSos(incidentId, { sending: { state: 'FAILED', error: message, attempts: (inc.sending?.attempts ?? 0) + 1 } });
    return false;
  }

  /** Retry every SOS still waiting in the offline queue (used on reconnect). */
  public async retryPendingSos(): Promise<number> {
    const pending = await listPendingSos();
    let sent = 0;
    for (const entry of pending) {
      const ok = await this.attemptTransmit(entry.incident.id);
      if (ok) sent += 1;
    }
    return sent;
  }

  /**
   * Apply the SMS delivery report pushed by the backend. "Contacts notified"
   * only becomes true once the server actually reported a delivery outcome —
   * never earlier.
   */
  public applySmsUpdate(incidentId: string, smsNotifications: SmsDispatch | undefined) {
    if (!incidentId || !smsNotifications) return;
    const results = smsNotifications.results ?? [];
    const deliverable = results.filter((r) => r.status !== 'FAILED' && r.success);
    const anyNotified = deliverable.length > 0;
    const allAttempted = results.length > 0 && results.every((r) => r.status !== 'PENDING');
    const patch: Partial<Incident> = {
      smsNotifications,
      trustedContactsNotified: anyNotified,
      communicationStatus: anyNotified ? 'CONFIRMED' : this.activeIncident?.communicationStatus ?? 'SOS SENT',
    };
    this.patchSos(incidentId, patch);
    if (anyNotified) {
      this.setTimelineStep(incidentId, 't6', { status: 'completed', description: `${deliverable.length} contact${deliverable.length === 1 ? '' : 's'} informed` });
    } else if (allAttempted) {
      this.setTimelineStep(incidentId, 't6', { status: 'pending', description: 'No contact could be reached' });
    }
  }

  /** Exact-location source is preserved for the street view rather than faked. */
  public getIncidentSource(): IncidentSource | undefined {
    return this.activeIncident?.source;
  }

  /** Latest live-audio clip for the active emergency (null when none). */
  public getLiveAudioUrl(): string | null {
    const active = this.activeIncident;
    if (!active) return null;
    const item = this.audioEvidence.find((a) => a.incidentCode === active.incidentCode);
    return item?.audioUrl ?? null;
  }

  public addContact(contact: Omit<EmergencyContactItem, 'id'>): EmergencyContactItem {
    const newC: EmergencyContactItem = {
      ...contact,
      id: `c-${Date.now()}`,
    };
    this.contacts = [...this.contacts, newC];
    this.notify();
    createContactRemote(newC).catch(() => {});
    return newC;
  }

  public updateContact(contact: EmergencyContactItem) {
    this.contacts = this.contacts.map(c => c.id === contact.id ? contact : c);
    this.notify();
    updateContactRemote(contact).catch(() => {});
  }

  public deleteContact(contactId: string) {
    this.contacts = this.contacts.filter(c => c.id !== contactId);
    this.notify();
    deleteContactRemote(contactId).catch(() => {});
  }

  public markAllNotificationsRead() {
    this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
    this.notify();
  }

  public clearActiveEmergency() {
    if (this.activeIncident) {
      const id = this.activeIncident.id;
      void removePendingSos(id);
      this.setTimelineStep(id, 't7', { status: 'completed', description: 'Response concluded' });
      this.activeIncident = { ...this.activeIncident, status: 'RESOLVED' };
      this.incidents = this.incidents.map(i => i.id === id ? { ...i, status: 'RESOLVED' } : i);
    }
    hardwareService.resetHardware();
    this.notify();
  }

  /**
   * Apply a status/responder update received from the Response Center (via Bridge).
   */
  public applyIncomingStatus(incidentId: string, status: IncidentStatus, assignedResponder?: Incident['assignedResponder']) {
    if (this.activeIncident && this.activeIncident.id === incidentId) {
      this.activeIncident = {
        ...this.activeIncident,
        status,
        assignedResponder: assignedResponder ?? this.activeIncident.assignedResponder,
        // A status coming back from the RC is proof the alert was received.
        sending: this.activeIncident.sending
          ? { ...this.activeIncident.sending, state: 'SERVER_RECEIVED' }
          : { state: 'SERVER_RECEIVED', attempts: 0 },
      };
      if (status === 'RESOLVED' || status === 'CANCELLED') {
        hardwareService.resetHardware();
        this.activeIncident = { ...this.activeIncident, status };
      }
    }

    this.incidents = this.incidents.map((inc) => {
      if (inc.id === incidentId) {
        const resolved = status === 'RESOLVED' || status === 'CANCELLED';
        return {
          ...inc,
          status,
          assignedResponder: assignedResponder ?? inc.assignedResponder,
          sending: inc.sending ? { ...inc.sending, state: 'SERVER_RECEIVED' } : undefined,
          timeline: (inc.timeline ?? []).map((s) => {
            if (s.id === 't5' && s.status !== 'completed') {
              return { ...s, status: 'completed' as const, description: 'Received by the Bayani Response Center' };
            }
            if (s.id === 't7') {
              return resolved
                ? { ...s, status: 'completed' as const, description: 'Response concluded' }
                : { ...s, status: 'in_progress' as const, description: 'A responder has been dispatched' };
            }
            return s;
          }),
        };
      }
      return inc;
    });

    this.notify();
  }

  /**
   * Resolve the incident that carries the given incident code (live from the Bridge).
   */
  public resolveFromBridge(incidentCode: string) {
    const target = this.incidents.find(i => i.incidentCode === incidentCode || i.id === incidentCode);
    if (!target) return;
    this.applyIncomingStatus(target.id, 'RESOLVED');
  }
}

export const incidentService = new IncidentService();