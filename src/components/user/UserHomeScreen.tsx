import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  MapPin, 
  Users, 
  BatteryCharging, 
  Wifi, 
  Radio, 
  Mic, 
  PhoneCall, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Navigation,
  EyeOff
} from 'lucide-react';
import { Incident, UserNavTab } from '../../types';
import { WearableDeviceTelemetry, hardwareService, BALANGA_LOCATION } from '../../services/hardwareService';

interface UserHomeScreenProps {
  telemetry: WearableDeviceTelemetry;
  activeIncident: Incident | null;
  onSimulateHardwareSOS: () => void;
  onConfirmHelped: () => void;
  onNavigateTab: (tab: UserNavTab) => void;
  stealthMode: boolean;
  /** True while the app is requesting the exact GPS fix before raising the SOS. */
  locating: boolean;
  /** User-facing GPS error message (alert is NOT sent) — null when idle. */
  locationError: string | null;
}

export const UserHomeScreen: React.FC<UserHomeScreenProps> = ({
  telemetry,
  activeIncident,
  onSimulateHardwareSOS,
  onConfirmHelped,
  onNavigateTab,
  stealthMode,
  locating,
  locationError,
}) => {
  const [showSimNotice, setShowSimNotice] = useState(true);
  const [switchOn, setSwitchOn] = useState(false);
  const isEmergency = telemetry.event === 'SOS' || (activeIncident && activeIncident.status !== 'RESOLVED' && activeIncident.status !== 'CANCELLED');

  // Slide the SOS switch back to OFF once the emergency is resolved/cancelled
  useEffect(() => {
    if (!isEmergency) setSwitchOn(false);
  }, [isEmergency]);

  // If the GPS fix failed, the alarm was NOT sent — revert the switch.
  useEffect(() => {
    if (locationError) setSwitchOn(false);
  }, [locationError]);

  // Animate the switch to ON first, then fire the SOS
  const handlePressSOS = () => {
    if (switchOn || locating) return;
    setSwitchOn(true);
    setTimeout(() => onSimulateHardwareSOS(), 200);
  };

  // Honest transmission label driven by the real state machine (sosQueue).
  const sending = activeIncident?.sending;
  const transmission = (() => {
    switch (sending?.state) {
      case 'CREATED':
      case 'LOCATION_SNAPSHOT_TAKEN':
        return { label: 'Preparing alert…', tone: 'amber' as const };
      case 'SAVED_OFFLINE':
        return { label: 'Saved offline — auto-retry on next connection', tone: 'amber' as const };
      case 'SENDING':
        return { label: 'Sending to Response Center…', tone: 'amber' as const };
      case 'SERVER_RECEIVED':
        return { label: 'Received by the Response Center', tone: 'emerald' as const };
      case 'FAILED':
        return { label: `Could not send — ${sending.error || 'no connection'}`, tone: 'red' as const };
      default:
        return null;
    }
  })();

  return (
    <div id="user-home-screen" className="space-y-4 pb-6">
      {/* 1. SAFE STATE SCREEN */}
      {!isEmergency && (
        <>
          {/* Main "YOU ARE SAFE" Card */}
          <section 
            id="card-status-safe"
            className="rounded-3xl p-5 bg-gradient-to-b from-white to-slate-50 border border-slate-200/80 shadow-xs"
          >
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 ring-8 ring-emerald-50/50">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                YOU ARE SAFE
              </h2>
            </div>

            {/* Status Checklist Grid */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-4 border-t border-slate-100">
              <div className="p-2.5 rounded-2xl bg-white border border-slate-100 flex items-center gap-2.5 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Radio className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Device</span>
                  <span className="text-xs font-bold text-emerald-600 truncate block">CONNECTED</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-white border border-slate-100 flex items-center gap-2.5 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">GPS</span>
                  <span className="text-xs font-bold text-emerald-600 truncate block">READY</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-white border border-slate-100 flex items-center gap-2.5 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Wifi className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Comms</span>
                  <span className="text-xs font-bold text-emerald-600 truncate block">CONNECTED</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-white border border-slate-100 flex items-center gap-2.5 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Audio</span>
                  <span className="text-xs font-bold text-purple-700 truncate block">READY</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-white border border-slate-100 flex items-center gap-2.5 shadow-2xs col-span-2 sm:col-span-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <BatteryCharging className="w-4 h-4" />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Battery</span>
                    <span className="text-xs font-bold text-slate-800">{telemetry.battery}%</span>
                  </div>
                  <div className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full" 
                      style={{ width: `${telemetry.battery}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Location Detection quick-fix */}
          <section className="rounded-3xl p-4 sm:p-5 bg-amber-50 border border-amber-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Location Detection</span>
              </h3>
              {hardwareService.getLocationOverride() ? (
                <span className="text-[9px] font-black uppercase bg-violet-600 text-white px-2 py-0.5 rounded-full">
                  FIXED
                </span>
              ) : (
                <span className="text-[9px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                  AUTO — CHECK
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                id="btn-home-set-balanga"
                onClick={() => hardwareService.setLocationOverride(BALANGA_LOCATION)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>SET SA BALANGA CITY</span>
              </button>
              <button
                onClick={() => onNavigateTab('map')}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>PRECISE SET (LIVE MAP)</span>
              </button>
            </div>
          </section>

          {/* Wearable Emergency Trigger Card (with Demo Squeeze Simulation) */}
          <section 
            id="card-wearable-trigger"
            className="rounded-3xl p-5 bg-white border border-slate-200/80 shadow-xs space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Wearable Connected
                </span>
                <h3 className="font-extrabold text-slate-900 text-base mt-1">
                  Emergency SOS Trigger
                </h3>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                READY
              </span>
            </div>

            <button
              id="btn-simulate-hardware-sos"
              type="button"
              onClick={handlePressSOS}
              aria-pressed={switchOn}
              aria-label="Press Bayani Alert hardware to send emergency SOS"
              disabled={locating}
              className="w-full flex flex-col items-center gap-3 rounded-2xl bg-white border border-slate-200/80 px-4 py-5 shadow-xs hover:border-red-300 hover:bg-red-50/40 active:scale-[0.98] transition-all disabled:cursor-wait disabled:opacity-90"
            >
              <img
                src="/bayani.png"
                alt="Bayani Alert emergency SOS hardware"
                className={`w-full max-w-sm h-auto object-contain select-none transition-transform duration-200 ${
                  switchOn ? 'scale-[0.97]' : ''
                }`}
                draggable="false"
              />

              {locating ? (
                <span className="text-sm font-bold text-red-600">
                  Getting your location…
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-700">
                  Press the Bayani Alert device to send emergency SOS
                </span>
              )}
            </button>
          </section>

          {/* GPS error (alert was NOT sent) */}
          {locationError && (
            <section className="rounded-3xl p-4 border border-red-200 bg-red-50 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-red-700 uppercase tracking-wide">
                    Emergency alert not sent
                  </p>
                  <p className="text-xs text-red-600/90 mt-0.5">{locationError}</p>
                  <p className="text-[10px] text-red-500/80 mt-1">
                    Please try again once your device has a GPS fix.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Quick Navigation Cards */}
          <section className="grid grid-cols-1 gap-2.5">
            <button
              onClick={() => onNavigateTab('contacts')}
              className="p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-300 transition-all flex items-center justify-between text-left group shadow-xs active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Emergency Contacts</h4>
                  <p className="text-[11px] text-slate-500">
                    Your trusted contacts &amp; authorities
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
            </button>
          </section>
        </>
      )}

      {/* 2. EMERGENCY SCREEN (WHEN HARDWARE SOS IS ACTIVATED) */}
      {isEmergency && activeIncident && (
        <div id="emergency-screen" className="space-y-4 animate-fadeIn">
          {/* Main Emergency Alert Card */}
          <section 
            id="card-emergency-active"
            className="rounded-3xl p-5 bg-gradient-to-b from-red-400 to-red-400 text-white shadow-xl shadow-red-900/20 border border-red-400 relative overflow-hidden"
          >
            {/* Background subtle radar pulse */}
            <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white text-red-600 flex items-center justify-center shadow-md shrink-0">
                <AlertTriangle className="w-7 h-7 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-red-200/80 px-2 py-0.5 rounded-full border border-red-400/40">
                  SOS SIGNAL SENT
                </span>
                <h2 className="text-2xl font-black tracking-tight mt-0.5">
                  SOS ACTIVATED
                </h2>
              </div>
            </div>

            <p className="text-xs text-red-100 mt-2 font-medium">
              Emergency alert raised. The Response Center is being notified.
            </p>

            {/* Real transmission state — hindi minamarkang "delivered" kung hindi
                naman pa talaga na-acknowledge ng server. */}
            {transmission && (
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
                transmission.tone === 'emerald'
                  ? 'bg-emerald-900/40 border-emerald-400/40 text-emerald-100'
                  : transmission.tone === 'red'
                  ? 'bg-red-900/50 border-red-400/50 text-red-100'
                  : 'bg-amber-900/40 border-amber-400/40 text-amber-100'
              }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  transmission.tone === 'emerald' ? 'bg-emerald-300' : transmission.tone === 'red' ? 'bg-red-300' : 'bg-amber-300 animate-pulse'
                }`} />
                <span>{transmission.label}</span>
              </div>
            )}

            {/* Key Emergency Telemetry Grid */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-2xl bg-red-800/60 border border-red-400/40 backdrop-blur-xs">
                <span className="text-[10px] text-red-200 block font-semibold uppercase">Incident ID</span>
                <span className="font-mono font-bold text-white text-xs">{activeIncident.incidentCode}</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-red-800/60 border border-red-400/40 backdrop-blur-xs">
                <span className="text-[10px] text-red-200 block font-semibold uppercase">Time Activated</span>
                <span className="font-bold text-white text-xs">{activeIncident.timeActivated}</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-red-800/60 border border-red-400/40 backdrop-blur-xs">
                <span className="text-[10px] text-red-200 block font-semibold uppercase">GPS</span>
                <span className="font-bold text-emerald-300 text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {activeIncident.gpsStatus}
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-red-800/60 border border-red-400/40 backdrop-blur-xs">
                <span className="text-[10px] text-red-200 block font-semibold uppercase">Audio</span>
                <span className="font-bold text-purple-200 text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-300 animate-pulse" />
                  {activeIncident.audioStatus}
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-red-800/60 border border-red-400/40 backdrop-blur-xs col-span-2">
                <span className="text-[10px] text-red-200 block font-semibold uppercase">Communication</span>
                <span className="font-bold text-white text-xs">{activeIncident.communicationStatus}</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-red-800/60 border border-red-400/40 backdrop-blur-xs col-span-2">
                <span className="text-[10px] text-red-200 block font-semibold uppercase">Location</span>
                <span className="font-bold text-white text-[11px] block">
                  {activeIncident.location.address || `${activeIncident.location.barangay}, ${activeIncident.location.city}`}
                </span>
                <span className="text-[10px] text-red-200 block">
                  {activeIncident.location.barangay}, {activeIncident.location.city}, {activeIncident.location.country}
                </span>
              </div>
            </div>

            {/* Quick Emergency Action Buttons */}
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                id="btn-emergency-contact-responder"
                onClick={() => alert(`Calling assigned responder: ${activeIncident.assignedResponder?.name || 'Response Center'}${activeIncident.assignedResponder?.phone ? ` (${activeIncident.assignedResponder.phone})` : ''}`)}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>CONTACT RESPONDER</span>
              </button>
            </div>
          </section>

          {/* Confirm helped — only once Bayani is ON THE WAY */}
          {activeIncident.status === 'ON THE WAY' && (
            <button
              id="btn-emergency-confirm-helped"
              onClick={onConfirmHelped}
              className="w-full py-4 px-5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-900/20 border border-emerald-400 active:scale-[0.98] animate-splash-fadein"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>CONFIRM HELP RECEIVED — SAFE NA AKO</span>
            </button>
          )}

          {/* Responder arrival */}
          {activeIncident.assignedResponder && (
            <section className="rounded-3xl p-5 bg-white border border-slate-200/80 shadow-xs">
              <div className="rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-blue-950 block">{activeIncident.assignedResponder.name}</span>
                    <span className="text-[10px] text-blue-700">{activeIncident.assignedResponder.unit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-medium">EST. ARRIVAL</span>
                  <span className="font-black text-blue-600 text-xs">{activeIncident.assignedResponder.eta}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};