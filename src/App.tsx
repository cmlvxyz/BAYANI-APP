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
/** Header logo: loads the full PNG logo from the Response Center (bayani-alert, port 4000);
 *  falls back to the local SVG shield so the app still shows a logo when RC is offline. */
const HeaderLogo = ({ className }: { className?: string }) => {
  const [logoFailed, setLogoFailed] = useState(false);
  if (logoFailed) {
    return <img src="/logo.svg" alt="Bayani App logo" className={`${className} object-contain`} />;
  }
  return (
    <img
      src="http://localhost:4000/src/assets/images/logo%20(2).png"
      alt="Bayani App logo"
      className={`${className} object-contain`}
      onError={() => setLogoFailed(true)}
    />
  );
};
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

// Services
import { hardwareService, WearableDeviceTelemetry, BALANGA_LOCATION } from './services/hardwareService';
import { incidentService } from './services/incidentService';
import { connectBridge, emitResolve, emitLogout, emitAudioLive, fetchIncidents } from './services/bridgeClient';
import { loadCitizenProfile, saveCitizenProfile } from './services/profileService';
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
import { UserContactsScreen } from './components/user/UserContactsScreen';
import { UserSettingsScreen } from './components/user/UserSettingsScreen';
import { UserNotificationsModal } from './components/user/UserNotificationsModal';
import { UserProfileModal } from './components/user/UserProfileModal';
import { AudioEvidenceModal } from './components/user/AudioEvidenceModal';
import { IncidentDetailsModal } from './components/user/IncidentDetailsModal';

interface NavItem {
  key: UserNavTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const BOTTOM_NAV: NavItem[] = [
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
  // Exact-location acquisition state for the SOS flow.
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    const profile = loadCitizenProfile();
    const email = profile.email?.trim() || undefined;
    await citizenRegister(username, password, email);
  };

  const handleLogout = () => {
    const liveSession = getCitizenSession();
    if (liveSession?.user?.username) emitLogout(liveSession.user.username);
    citizenLogout();
    setSplashDone(true); // skip the splash when logging out
    setAuthMode('register'); // pagkatapos mag-logout, register form ang unang lalabas
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

  // Close the header menu on outside click / Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
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
    document.title = active ? `${active.label} | Bayani App` : 'Bayani App';
  }, [navTab]);

  // Subscribe to hardware & incident state changes
  useEffect(() => {
    const unsubHw = hardwareService.subscribe((tel) => {
      setTelemetry(tel);
    });

    const unsubInc = incidentService.subscribe(() => {
      setActiveIncident(incidentService.getActiveIncident());
      setContacts(incidentService.getContacts());
      setNotifications(incidentService.getNotifications());
      setAudioEvidence(incidentService.getAudioEvidence());
    });

    const unsubBridge = connectBridge({
      onStatusUpdate: (inc) => {
        if (inc.status === 'WAIT FOR ME') {
          const uname = (getCitizenSession()?.user?.username || 'BAYANI').toUpperCase();
          setStatusToast(`${uname} ${inc.status}!`);
        } else if (inc.status === 'ON THE WAY') {
          setStatusToast('BAYANI IS ON THE WAY!');
        }
        if (inc.id) incidentService.applyIncomingStatus(inc.id, inc.status!, inc.assignedResponder);
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
      unsubHw();
      unsubInc();
      unsubBridge();
    };
  }, []);

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

  // Auto-dismiss the responder status toast ("BAYANI IS ON THE WAY!") after a few seconds.
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

    // 2) The wearable's current known coordinates — fire immediately.
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

    // 3) No coordinate yet — use the demo location so the alarm still goes
    // out instantly (never blocked on a slow GPS fix).
    publishWith({
      lat: BALANGA_LOCATION.lat,
      lng: BALANGA_LOCATION.lng,
      label: BALANGA_LOCATION.label,
      address: BALANGA_LOCATION.address,
      city: BALANGA_LOCATION.city,
      region: BALANGA_LOCATION.barangay,
      accuracy: 0,
      gpsTimestamp: new Date().toISOString(),
      source: 'override',
    });
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
            stealthMode={telemetry.stealthMode}
            locating={locating}
            locationError={locationError}
          />
        );
      case 'map':
        return (
          <UserLiveLocationScreen
            telemetry={telemetry}
            activeIncident={activeIncident}
            isEmergencyActive={isEmergencyActive}
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

  const isActive = (key: UserNavTab) => navTab === key;

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
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-50 to-blue-200 text-slate-800 antialiased font-sans">
      {/* ===== GLOBAL TOP HEADER ===== */}
      {/* Global top header — FIXED, hindi gumagalaw kahit mag-scroll */}
      <div className="fixed top-5 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <header
        id="bayani-app-header"
        className="pointer-events-auto bg-white rounded-4xl shadow-sm w-[min(70%,40rem)] h-14 px-4 sm:px-6"
      >
        <div className="flex items-center justify-between gap-3 h-full">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <HeaderLogo className="w-10 h-10 sm:w-11 sm:h-11 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-black text-slate-900 text-sm sm:text-base tracking-wider uppercase leading-tight">
                BAYANI
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-tight">
                Safety in Every Step
              </p>
            </div>
          </div>

          {/* Session + Compact menu: SOS, Bridge, Notifications, Profile */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1.5 rounded-full bg-blue-600/10 border border-blue-200 text-blue-700 text-[11px] font-extrabold uppercase tracking-wider">
              {session.user.username}
            </span>
            <div className="relative" ref={menuRef}>
            <button
              id="bayani-app-header-menu"
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label="Open menu"
              aria-expanded={isMenuOpen}
              className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              {!isMenuOpen && unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
                {/* SOS status */}
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isEmergencyActive ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className={`text-[11px] font-black uppercase tracking-wider ${isEmergencyActive ? 'text-red-600' : 'text-emerald-600'}`}>
                    {isEmergencyActive ? 'SOS Active' : 'Protection Armed'}
                  </span>
                </button>

                {/* Bridge status */}
                <button
                  onClick={() => setIsMenuOpen(false)}
                  title={bridgeOnline ? 'Connected to Response Center (port 4000)' : 'Bridge offline — start bridge-server.mjs'}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${bridgeOnline ? 'bg-blue-500' : 'bg-red-400'} animate-pulse`} />
                  <span className={`text-[11px] font-black uppercase tracking-wider ${bridgeOnline ? 'text-blue-600' : 'text-red-600'}`}>
                    {bridgeOnline ? 'Bridge Link' : 'Bridge Off'}
                  </span>
                </button>

                {/* Notifications */}
                <button
                  onClick={() => { setIsMenuOpen(false); setIsNotificationsOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <Bell className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="ml-auto w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Profile */}
                <button
                  onClick={() => { setIsMenuOpen(false); setIsProfileOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Profile</span>
                </button>
              {/* Log out */}
                <button
                  onClick={() => { setIsMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-red-600">Log out</span>
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <main className="min-w-0 pb-24 pt-20" id="bayani-app-main-content">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 p-4 sm:p-6 w-full">
            {renderCitizenScreen()}
          </div>
        </div>
      </main>

      {/* ===== BOTTOM NAVIGATION (always visible) ===== */}
      <nav
        id="bayani-app-bottom-nav"
        aria-label="Bottom Navigation"
        className="fixed bottom-5 left-0 right-0 z-40 bg-white/70 backdrop-blur-md rounded-4xl shadow-sm mx-auto w-[min(80%,40rem)] border border-slate-200/70 select-none"
      >
        <div className="grid grid-cols-4 h-14">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.key);
            return (
              <button
                key={item.key}
                onClick={() => setNavTab(item.key)}
                className={`flex flex-col items-center justify-center gap-1 transition-all active:scale-95 touch-manipulation ${
                  active ? 'text-blue-600 font-bold' : 'text-slate-400'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'scale-110' : ''}`} />
                  {item.key === 'home' && isEmergencyActive && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400 animate-ping" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ===== RESPONDER STATUS TOAST ===== */}
      {statusToast && (
        <div
          role="status"
          className="fixed bottom-24 right-4 z-[80] max-w-[80vw] whitespace-nowrap px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold tracking-wide shadow-xl border border-emerald-300 animate-toast-pop"
        >
          {statusToast}
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