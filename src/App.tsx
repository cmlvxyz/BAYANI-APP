/**
 * Bayani App - Citizen Safety Mobile Application
 * “Safety in Every Step”
 *
 * Dedicated companion app for the protected citizen (wearer):
 * - Home / SOS
 * - Live Map
 * - Contacts
 * - Settings
 *
 * This project is SEPARATE from the Bayani Alert Response Center
 * (bayani-alert project on port 4000).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Bell,
  Home,
  MapPin,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react';

// Design system
import { GlassHeader, IconButton, BottomNavigation, BrandLogo, type NavTab } from './components/ui';

// Services
import { hardwareService, WearableDeviceTelemetry } from './services/hardwareService';
import { incidentService } from './services/incidentService';
import { connectBridge, emitResolve, emitLogout, emitAudioLive, fetchIncidents } from './services/bridgeClient';
import { loadCitizenProfile, saveCitizenProfile, adoptPendingProfile, subscribeProfile, CitizenProfile } from './services/profileService';
import {
  login as citizenLogin,
  register as citizenRegister,
  logout as citizenLogout,
  getSession as getCitizenSession,
  getKnownAccounts,
  saveKnownAccount,
  AuthSession as CitizenAuthSession,
} from './services/authClient';
import { Incident, UserNavTab } from './types';

// Citizen App Components
import CitizenAuthScreen, { AuthMode, CitizenProfileData } from './components/auth/CitizenAuthScreen';
import SplashScreen from './components/auth/SplashScreen';
import { UserHomeScreen } from './components/user/UserHomeScreen';
import { UserLiveLocationScreen } from './components/user/UserLiveLocationScreen';
import { useLiveLocation } from './hooks/useLiveLocation';
import { UserContactsScreen } from './components/user/UserContactsScreen';
import { UserSettingsScreen } from './components/user/UserSettingsScreen';
import { UserNotificationsModal } from './components/user/UserNotificationsModal';
import { UserProfileModal } from './components/user/UserProfileModal';
import { AudioEvidenceModal } from './components/user/AudioEvidenceModal';
import { IncidentDetailsModal } from './components/user/IncidentDetailsModal';

const BOTTOM_NAV: NavTab<UserNavTab>[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'map', label: 'Map', icon: MapPin },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [navTab, setNavTab] = useState<UserNavTab>('home');

  // Telemetry & Incident State
  const [telemetry, setTelemetry] = useState<WearableDeviceTelemetry>(hardwareService.getTelemetry());
  const [activeIncident, setActiveIncident] = useState<Incident | null>(incidentService.getActiveIncident());
  const [incidents, setIncidents] = useState<Incident[]>(incidentService.getIncidents());
  const [contacts, setContacts] = useState(incidentService.getContacts());
  const [notifications, setNotifications] = useState(incidentService.getNotifications());
  const [audioEvidence, setAudioEvidence] = useState(incidentService.getAudioEvidence());

  // UI Modals
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAudioEvidenceOpen, setIsAudioEvidenceOpen] = useState(false);
  const [inspectingIncident, setInspectingIncident] = useState<Incident | null>(null);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [session, setSessionState] = useState<CitizenAuthSession | null>(getCitizenSession());
  const [knownAccounts, setKnownAccounts] = useState(getKnownAccounts);
  const [splashDone, setSplashDone] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  // Current account's profile — drives the header avatar so a photo set in
  // Settings/Profile shows up in the header immediately.
  const [citizenProfile, setCitizenProfile] = useState<CitizenProfile>(() => loadCitizenProfile());
  // Exact-location acquisition state for the SOS flow.
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Single device GPS watcher for the whole app. It runs once the citizen is
  // signed in and is on a screen that needs a position, so the Home card, the
  // Live Location map and the emergency sharing all read the same real fix.
  const liveLocation = useLiveLocation({ enabled: !!session && navTab !== 'contacts' });

  // The SOS handler must read the latest fix without being re-created on every
  // GPS tick, so mirror it into a ref.
  const liveLocationRef = useRef(liveLocation);
  useEffect(() => {
    liveLocationRef.current = liveLocation;
  }, [liveLocation]);

  const handleLogin = async (username: string, password: string) => {
    const s = await citizenLogin(username, password);
    saveKnownAccount(s.user.username, s.user.email);
    setKnownAccounts(getKnownAccounts());
    setSessionState(s);
  };

  const handleSaveProfile = (data: CitizenProfileData) => {
    const existing = loadCitizenProfile();
    saveCitizenProfile({
      ...existing,
      email: data.email,
      fullName: data.fullName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth,
    });
  };

  const handleCreateAccount = async (username: string, password: string) => {
    // Ang email na naka-register (Real Gmail sa Register form) ang isinesave bilang
    // account email — hindi ang placeholder na "username@bayani.app".
    // Walang session pa dito, kaya ang pending registration draft ang binabasa.
    const profile = loadCitizenProfile();
    const email = profile.email?.trim() || undefined;
    await citizenRegister(username, password, email);
    // I-tali ang na-register na profile sa bagong account na ito para hindi ito
    // mag-share ng details sa ibang account na mag-sign in sa device.
    try {
      adoptPendingProfile(username);
    } catch {
      // Profile adoption is best-effort; it must never fail a successful registration.
    }
  };

  const handleLogout = () => {
    const liveSession = getCitizenSession();
    if (liveSession?.user?.username) emitLogout(liveSession.user.username);
    citizenLogout();
    setSplashDone(false); // ipakita ulit ang splash pagkatapos mag-logout
    setAuthMode('register'); // pagkatapos ng splash, register form ang unang lalabas
    setSessionState(null);
  };

  // I-sync ang login username + email papunta sa Profile Details (Settings).
  useEffect(() => {
    if (!session) return;
    const existing = loadCitizenProfile();
    const username = session.user.username;
    const email = existing.email || session.user.email || '';
    if (existing.username !== username || existing.email !== email) {
      saveCitizenProfile({ ...existing, username, email });
    }
  }, [session]);

  // Load the signed-in account's profile and follow any edits made in Settings
  // or the Profile modal so the header avatar always matches.
  useEffect(() => {
    const sync = () => setCitizenProfile(loadCitizenProfile());
    sync();
    return subscribeProfile(sync);
  }, [session?.token]);

  // Close the header menu on outside click / Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // The dropdown panel is rendered by GlassHeader, outside menuRef, so it
      // must be excluded too — otherwise mousedown on a menu item (e.g. Log out)
      // closes the menu before its click handler can fire.
      const panel = document.getElementById('bayani-app-header-menu-panel');
      if (menuRef.current?.contains(target) || panel?.contains(target)) return;
      setIsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  // Browser tab title — shows the current section at the top when navigating
  useEffect(() => {
    const active = BOTTOM_NAV.find((i) => i.key === navTab);
    document.title = active ? `${active.label} | SINAG` : 'SINAG';
  }, [navTab]);

  // Subscribe to hardware & incident state changes
  useEffect(() => {
    const unsubHw = hardwareService.subscribe((tel) => {
      setTelemetry(tel);
    });

    const unsubInc = incidentService.subscribe(() => {
      setActiveIncident(incidentService.getActiveIncident());
      setIncidents(incidentService.getIncidents());
      setContacts(incidentService.getContacts());
      setNotifications(incidentService.getNotifications());
      setAudioEvidence(incidentService.getAudioEvidence());
    });

    return () => {
      unsubHw();
      unsubInc();
    };
  }, []);

  // The live stream identifies this citizen with their session token, so it must
  // (re)connect whenever the session changes — otherwise a stream opened before
  // login stays anonymous and misses their own wearable SOS / status updates.
  useEffect(() => {
    const unsubBridge = connectBridge({
      onStatusUpdate: (inc) => {
        if (inc.status === 'WAIT FOR ME') {
          const uname = (getCitizenSession()?.user?.username || 'SINAG').toUpperCase();
          setStatusToast(`${uname} ${inc.status}!`);
        } else if (inc.status === 'ON THE WAY') {
          setStatusToast('SINAG IS ON THE WAY!');
        }
        if (inc.id) incidentService.applyIncomingStatus(inc.id, inc.status!, inc.assignedResponder);
      },
      // A SOS raised by this citizen's wearable device. It is already stored on
      // the server, so it is displayed only — never re-transmitted from here.
      onHardwareSOS: (inc) => {
        incidentService.receiveHardwareIncident(inc);
      },
      onResolve: (code) => {
        incidentService.resolveFromBridge(code);
      },
      onSmsUpdate: (payload) => {
        incidentService.applySmsUpdate(String(payload.id ?? ''), payload.smsNotifications);
      },
      onOnlineChange: setBridgeOnline,
    });

    return () => {
      unsubBridge();
    };
  }, [session?.token]);

  // Reload contacts from the backend database whenever the server connection is
  // restored, and auto-retry any SOS still waiting in the offline queue.
  useEffect(() => {
    if (bridgeOnline) {
      incidentService.loadContacts();
      void incidentService.retryPendingSos();
      fetchIncidents()
        .then((items) => incidentService.loadIncidents(items))
        .catch(() => {});
    }
  }, [bridgeOnline]);

// Pull the incident history from the backend (history only — never auto-
// reopens an old SOS). A fresh alarm always starts by pressing the button.
  useEffect(() => {
    let cancelled = false;
    fetchIncidents()
      .then((items) => {
        if (!cancelled) incidentService.loadIncidents(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-dismiss the responder status toast ("SINAG IS ON THE WAY!") after a few seconds.
  useEffect(() => {
    if (!statusToast) return;
    const t = window.setTimeout(() => setStatusToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [statusToast]);

  // Stream the live audio feed to the Response Center while an emergency is
  // open. Re-sent every 3s so the alert dashboard hears the ambient feed.
  useEffect(() => {
    const inc = activeIncident;
    if (!inc || inc.status === 'RESOLVED' || inc.status === 'CANCELLED') return;
    const audioUrl = incidentService.getLiveAudioUrl();
    if (!audioUrl) return;
    emitAudioLive(inc.incidentCode, audioUrl);
    const id = window.setInterval(() => emitAudioLive(inc.incidentCode, audioUrl), 3000);
    return () => window.clearInterval(id);
  }, [activeIncident?.id, activeIncident?.status]);

  // Keep an open emergency pinned to the citizen's real device position. The
  // watcher only reports once the citizen has moved ~25m, so this stays cheap
  // and does not hammer the sharing backend.
  useEffect(() => {
    const fix = liveLocation.fix;
    const inc = activeIncident;
    if (!fix || !inc) return;
    if (inc.status === 'RESOLVED' || inc.status === 'CANCELLED') return;
    // A wearable SOS keeps the coordinates its device transmitted: that device
    // is the authority on where the emergency is, and this phone's position
    // could belong to someone else entirely.
    if (inc.source === 'HARDWARE') return;

    // The citizen's verified address is the human-readable label responders
    // act on; the coordinates always remain the live device fix.
    const verified = loadCitizenProfile().address.trim();

    incidentService.updateActiveEmergencyLocation({
      lat: fix.lat,
      lng: fix.lng,
      address: verified || liveLocation.place?.address,
      barangay: liveLocation.place?.region,
      city: liveLocation.place?.city,
      accuracy: fix.accuracy,
      gpsTimestamp: new Date(fix.timestamp).toISOString(),
      source: 'gps',
    });
  }, [liveLocation.fix, liveLocation.place, activeIncident?.id]);

  // Emergency Alarm Handler — fires the alert INSTANTLY. No "getting location"
// loading state: the incident goes out right away with the best known position.
  const handleSimulateHardwareSOS = () => {
    setNavTab('home');

    const publishWith = (pos: {
      lat: number;
      lng: number;
      label?: string;
      address?: string;
      city?: string;
      region?: string;
      accuracy: number;
      gpsTimestamp: string;
      source: 'gps' | 'ip' | 'override';
    }) => {
      hardwareService.simulateHardwareSOS({
        lat: pos.lat,
        lng: pos.lng,
        label: pos.label,
        address: pos.address,
        city: pos.city,
        region: pos.region,
        accuracy: pos.accuracy,
        gpsTimestamp: pos.gpsTimestamp,
        source: pos.source,
      });
      // Offline-first: persist to the local queue, then transmit. The emergency
      // screen reflects whether the Response Center actually acknowledged it.
      const created = incidentService.getActiveIncident();
      if (created) {
        void incidentService.transmitSos().then((ok) => {
          if (!ok) setStatusToast('OFFLINE — SOS SAVED. WILL AUTO-RETRY.');
        });
      }
    };

    // 1) Explicitly pinned location (testing tool) — used directly.
    const override = hardwareService.getLocationOverride();
    if (override) {
      publishWith({
        lat: override.lat,
        lng: override.lng,
        label: override.label,
        address: override.address,
        city: override.city,
        region: override.barangay,
        accuracy: 0,
        gpsTimestamp: new Date().toISOString(),
        source: 'override',
      });
      return;
    }

    // 2) The live device fix from the shared GPS watcher — fire immediately.
    const fix = liveLocationRef.current.fix;
    if (fix) {
      const place = liveLocationRef.current.place;
      const verified = loadCitizenProfile().address.trim();
      const label = verified || place?.address;
      publishWith({
        lat: fix.lat,
        lng: fix.lng,
        label,
        address: label,
        city: place?.city,
        region: place?.region,
        accuracy: fix.accuracy,
        gpsTimestamp: new Date(fix.timestamp).toISOString(),
        source: 'gps',
      });
      return;
    }

    // 3) The wearable's last known coordinates.
    const tel = hardwareService.getTelemetry();
    if (tel && (tel.latitude !== 0 || tel.longitude !== 0)) {
      publishWith({
        lat: tel.latitude,
        lng: tel.longitude,
        label: tel.locationName || tel.city || 'Live location',
        address: tel.locationName,
        city: tel.city,
        region: tel.barangay,
        accuracy: tel.locationAccuracy || 0,
        gpsTimestamp: tel.locationTimestamp || new Date().toISOString(),
        source: tel.locationSource,
      });
      return;
    }

    // 4) No position yet — still send the alarm instantly (the alert must never
    // be blocked on a slow GPS fix) but attach no invented coordinates. The
    // watcher effect below attaches the real fix as soon as it arrives.
    hardwareService.simulateHardwareSOS();
    const created = incidentService.getActiveIncident();
    if (created) {
      void incidentService.transmitSos().then((ok) => {
        if (!ok) setStatusToast('OFFLINE — SOS SAVED. WILL AUTO-RETRY.');
      });
    }
    setStatusToast('SENT — ACQUIRING YOUR GPS POSITION…');
  };

  const handleResetToSafe = () => {
    const code = incidentService.getActiveIncident()?.incidentCode;
    incidentService.clearActiveEmergency();
    if (code) {
      emitResolve(code);
      setStatusToast('EMERGENCY RESOLVED — STAY SAFE!');
    }
  };

  const isEmergencyActive = telemetry.event === 'SOS' || (activeIncident !== null && activeIncident.status !== 'RESOLVED' && activeIncident.status !== 'CANCELLED');
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const goCitizen = (tab: UserNavTab) => {
    setNavTab(tab);
  };

  const renderCitizenScreen = () => {
    switch (navTab) {
      case 'home':
        return (
          <UserHomeScreen
            telemetry={telemetry}
            activeIncident={activeIncident}
            onSimulateHardwareSOS={handleSimulateHardwareSOS}
            onConfirmHelped={handleResetToSafe}
            onNavigateTab={goCitizen}
            onOpenIncident={setInspectingIncident}
            stealthMode={telemetry.stealthMode}
            locating={locating}
            locationError={locationError}
            liveLocation={liveLocation}
            bridgeOnline={bridgeOnline}
            contacts={contacts}
            incidents={incidents}
          />
        );
      case 'map':
        return (
          <UserLiveLocationScreen
            telemetry={telemetry}
            activeIncident={activeIncident}
            isEmergencyActive={isEmergencyActive}
            liveLocation={liveLocation}
          />
        );
      case 'contacts':
        return (
          <UserContactsScreen
            contacts={contacts}
            onAddContact={(c) => incidentService.addContact(c)}
            onUpdateContact={(c) => incidentService.updateContact(c)}
            onDeleteContact={(id) => incidentService.deleteContact(id)}
          />
        );
      case 'settings':
        return (
          <UserSettingsScreen
            stealthMode={telemetry.stealthMode}
            username={session.user.username}
            onToggleStealthMode={(val) => hardwareService.setStealthMode(val)}
            onNavigateTab={goCitizen}
            onOpenAudioEvidence={() => setIsAudioEvidenceOpen(true)}
          />
        );
    }
  };

  // Authentication gate — splash animation, then sign-up / sign-in.
  if (!session) {
    if (!splashDone) {
      return (
        <SplashScreen
          onSelect={(m) => {
            setAuthMode(m);
            setSplashDone(true);
          }}
        />
      );
    }
    return (
      <CitizenAuthScreen
        initialMode={authMode}
        knownAccounts={knownAccounts}
        onSaveProfile={handleSaveProfile}
        onLogin={handleLogin}
        onCreateAccount={handleCreateAccount}
      />
    );
  }

  return (
    <div className="app-bg min-h-[100dvh] text-ink antialiased">
      {/* ===== FLOATING GLASS HEADER ===== */}
      <GlassHeader
        id="bayani-app-header"
        title="SINAG"
        subtitle="Safety in Every Step"
        leading={
          <BrandLogo className="h-8 w-8 shrink-0 object-contain" />
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              aria-label="Open profile"
              style={
                citizenProfile.avatar
                  ? { backgroundImage: `url("${citizenProfile.avatar}")` }
                  : undefined
              }
              className="press relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 bg-cover bg-center text-[11px] font-extrabold text-white transition-colors duration-[160ms] hover:bg-brand-700 after:absolute after:-inset-1 after:content-['']"
            >
              {citizenProfile.avatar ? null : session.user.username.charAt(0).toUpperCase()}
            </button>

            <div className="relative" ref={menuRef}>
              <IconButton
                label="Open menu"
                badge={unreadCount}
                expanded={isMenuOpen}
                controls="bayani-app-header-menu-panel"
                onClick={() => setIsMenuOpen((v) => !v)}
              >
                {isMenuOpen ? (
                  <X size={19} strokeWidth={1.9} />
                ) : (
                  <Menu size={19} strokeWidth={1.9} />
                )}
              </IconButton>
            </div>
          </>
        }
        menuId="bayani-app-header-menu"
        menu={
          isMenuOpen ? (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
              <div
                id="bayani-app-header-menu-panel"
                role="menu"
                aria-label="Account menu"
                className="glass animate-pop-in absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-panel p-1.5"
              >
                {/* Session identity */}
                <div className="flex items-center gap-2.5 rounded-card bg-brand-50 px-3 py-2.5">
                  <span
                    style={
                      citizenProfile.avatar
                        ? { backgroundImage: `url("${citizenProfile.avatar}")` }
                        : undefined
                    }
                    className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 bg-cover bg-center text-[12px] font-extrabold text-white"
                  >
                    {citizenProfile.avatar ? null : session.user.username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-[12px] font-extrabold text-ink">
                      {session.user.username}
                    </span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                      Protected citizen
                    </span>
                  </div>
                </div>

                {/* Notifications */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsNotificationsOpen(true);
                  }}
                  role="menuitem"
                  className="press mt-1.5 flex w-full items-center gap-2.5 rounded-ctl px-3 py-2.5 text-left transition-colors duration-[160ms] hover:bg-[var(--surface-sunken)]"
                >
                  <Bell size={16} strokeWidth={1.9} className="shrink-0 text-muted" />
                  <span className="t-caption text-muted">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[10px] font-extrabold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Profile */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsProfileOpen(true);
                  }}
                  role="menuitem"
                  className="press flex w-full items-center gap-2.5 rounded-ctl px-3 py-2.5 text-left transition-colors duration-[160ms] hover:bg-[var(--surface-sunken)]"
                >
                  <ShieldAlert size={16} strokeWidth={1.9} className="shrink-0 text-muted" />
                  <span className="t-caption text-muted">Profile</span>
                </button>

                {/* Log out */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleLogout();
                  }}
                  role="menuitem"
                  className="press flex w-full items-center gap-2.5 rounded-ctl px-3 py-2.5 text-left transition-colors duration-[160ms] hover:bg-danger-soft"
                >
                  <LogOut size={16} strokeWidth={1.9} className="shrink-0 text-danger" />
                  <span className="t-caption text-danger">Log out</span>
                </button>
              </div>
            </>
          ) : null
        }
      />

      {/* ===== MAIN CONTENT ===== */}
      <main
        id="bayani-app-main-content"
        className="mx-auto w-full max-w-[var(--app-max)] px-4 pb-[var(--dock-space)] pt-[76px]"
      >
        <div key={navTab} className="animate-screen-in">
          {renderCitizenScreen()}
        </div>
      </main>

      {/* ===== FLOATING GLASS BOTTOM NAVIGATION ===== */}
      <BottomNavigation<UserNavTab>
        id="bayani-app-bottom-nav"
        items={BOTTOM_NAV}
        active={navTab}
        onChange={setNavTab}
        alertOn={isEmergencyActive ? ['home'] : []}
      />

      {/* ===== RESPONDER STATUS TOAST ===== */}
      {statusToast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-space)+8px)] z-[80] flex justify-center px-4"
        >
          <div className="animate-toast-pop max-w-full rounded-field bg-success px-4 py-2.5 text-[12px] font-bold tracking-wide text-white shadow-[0_8px_24px_-10px_rgba(5,150,105,.9)]">
            {statusToast}
          </div>
        </div>
      )}

      {/* ===== MODALS (Available globally) ===== */}
      <UserNotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => incidentService.markAllNotificationsRead()}
      />

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        telemetry={telemetry}
      />

      <AudioEvidenceModal
        isOpen={isAudioEvidenceOpen}
        onClose={() => setIsAudioEvidenceOpen(false)}
        audioItems={audioEvidence}
        selectedIncident={inspectingIncident}
      />

      <IncidentDetailsModal
        incident={inspectingIncident}
        isOpen={Boolean(inspectingIncident)}
        onClose={() => setInspectingIncident(null)}
        onOpenAudioEvidence={() => {
          setInspectingIncident(null);
          setIsAudioEvidenceOpen(true);
        }}
      />

      {/* Emergency indicator fallback for color-blind accessibility */}
      {isEmergencyActive && (
        <div
          aria-live="assertive"
          className="sr-only"
        >
          Emergency alert active. Help has been requested.
        </div>
      )}
    </div>
  );
}