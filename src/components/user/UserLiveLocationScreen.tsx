import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Share2, Compass, Clock, Crosshair, X } from 'lucide-react';
import { Incident } from '../../types';
import { WearableDeviceTelemetry, hardwareService, LocationOverride, BALANGA_LOCATION } from '../../services/hardwareService';
import { LiveGoogleMap, FALLBACK_COORDS } from '../LiveGoogleMap';
import { watchGeolocation, ResolvedLocation } from '../../services/geolocationService';

const LOCATION_PRESETS: Record<string, LocationOverride> = {
  home: {
    lat: 14.5722433,
    lng: 120.5934988,
    label: 'Exact Location',
    city: 'Bataan',
    barangay: 'Exact Location',
    address: 'Exact location, Bataan',
    pano: 'wHKopOj2fWLWgF31K2KkeQ',
    heading: 61.63,
    pitch: 22.1,
  },
  balanga: { ...BALANGA_LOCATION },
  mariveles: { lat: 14.4333, lng: 120.4833, label: 'Mariveles', city: 'Mariveles', barangay: 'Bataan', address: 'Mariveles, Bataan' },
  dinalupihan: { lat: 14.8833, lng: 120.45, label: 'Dinalupihan', city: 'Dinalupihan', barangay: 'Bataan', address: 'Dinalupihan, Bataan' },
};

interface UserLiveLocationScreenProps {
  telemetry: WearableDeviceTelemetry;
  activeIncident: Incident | null;
  isEmergencyActive: boolean;
}

export const UserLiveLocationScreen: React.FC<UserLiveLocationScreenProps> = ({
  telemetry,
  activeIncident,
  isEmergencyActive,
}) => {
  const [secondsAgo, setSecondsAgo] = useState(8);
  const [copiedLink, setCopiedLink] = useState(false);
  const [gps, setGps] = useState<ResolvedLocation | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [override, setOverride] = useState<LocationOverride | null>(hardwareService.getLocationOverride());
  const [overridePreset, setOverridePreset] = useState('home');
  const [overrideBarangay, setOverrideBarangay] = useState('');
  const [overrideTouched, setOverrideTouched] = useState(false);
  const [forceMap, setForceMap] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => (prev >= 15 ? 2 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cleanup = watchGeolocation(
      (loc) => setGps(loc),
      () => setGpsError(true),
    );
    return cleanup;
  }, []);

  const handleShare = () => {
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const applyOverride = () => {
    const preset = LOCATION_PRESETS[overridePreset];
    const typed = overrideBarangay.trim();
    hardwareService.setLocationOverride({
      ...preset,
      label: typed ? `${typed}, ${preset.city}` : preset.label,
      address: typed ? `${typed}, ${preset.city}` : preset.address,
    });
    setOverride(hardwareService.getLocationOverride());
    setOverrideTouched(true);
  };

  const clearOverride = () => {
    hardwareService.setLocationOverride(null);
    setOverride(null);
  };

  const barangay = activeIncident ? activeIncident.location.barangay : (override?.barangay || gps?.region || telemetry.barangay);
  const city = activeIncident ? activeIncident.location.city : (override?.city || gps?.city || telemetry.city);
  const placeLabel = activeIncident
    ? (activeIncident.location.address || `${activeIncident.location.barangay}, ${activeIncident.location.city}`)
    : (override?.address || override?.label || gps?.label || telemetry.locationName || 'Address pending');
  const activeSourceTag = override
    ? 'MANUAL — FIXED'
    : (gps?.source === 'ip' ? 'APPROX — IP' : 'GPS — LIVE');

  const incidentCoords =
    isEmergencyActive && activeIncident &&
    (activeIncident.location.lat !== 0 || activeIncident.location.lng !== 0)
      ? { lat: activeIncident.location.lat, lng: activeIncident.location.lng }
      : null;
  const trackedCoords =
    incidentCoords ??
    (override ??
      (gps ?? (telemetry.latitude !== 0 && telemetry.longitude !== 0
        ? { lat: telemetry.latitude, lng: telemetry.longitude }
        : null)));
  const liveLat = trackedCoords ? trackedCoords.lat : FALLBACK_COORDS.lat;
  const liveLng = trackedCoords ? trackedCoords.lng : FALLBACK_COORDS.lng;
  const waitingForGps = !incidentCoords && !override && !gps && telemetry.latitude === 0;
  const hasExactLocation = Boolean(override || (isEmergencyActive && incidentCoords));
  const showStreetView = hasExactLocation && !forceMap;

  return (
    <div id="user-live-location-screen" className="space-y-4 pb-8">
      {/* Top Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <span>LIVE LOCATION</span>
          </h2>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>SHARING ACTIVE</span>
        </div>
      </div>

      {/* Main Map Container: Responsive (On mobile occupies substantial height; on desktop side-by-side) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Google Map Canvas / Visual Area */}
        <div className="lg:col-span-2 relative rounded-3xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm h-[380px] sm:h-[440px] select-none">
          {waitingForGps && !isEmergencyActive && (
            <div className="absolute top-14 left-3 z-10 pointer-events-none">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[11px] font-black uppercase shadow-lg">
                <span className="w-2 h-2 rounded-full bg-amber-100 animate-pulse" />
                {gpsError ? 'GPS unavailable — showing default view' : 'Waiting for GPS…'}
              </span>
            </div>
          )}

          <LiveGoogleMap
            lat={liveLat}
            lng={liveLng}
            zoom={16}
            streetView={showStreetView}
            pano={override?.pano}
            heading={override?.heading}
            pitch={override?.pitch}
            className="absolute inset-0"
          />

          {/* Map Controls Overlay */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-700/60 shadow-lg text-white text-xs">
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-mono text-[11px] font-bold">
                {liveLat.toFixed(4)}° N, {liveLng.toFixed(4)}° E
              </span>
              {!incidentCoords && (override || gps) && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                  override
                    ? 'bg-violet-500/30 text-violet-200'
                    : (gps?.source === 'ip' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/40 text-blue-200')
                }`}>
                  {activeSourceTag}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {hasExactLocation && (
                <button
                  onClick={() => setForceMap((v) => !v)}
                  className="bg-slate-900/90 backdrop-blur-md hover:bg-slate-700 px-2.5 py-1.5 rounded-2xl border border-slate-700/60 text-white text-[11px] font-bold active:scale-95 transition-all pointer-events-auto"
                >
                  {showStreetView ? 'MAP VIEW' : 'STREET VIEW'}
                </button>
              )}
              <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-2xl border border-slate-700/60 text-white text-[11px]">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-slate-300">Updated {secondsAgo}s ago</span>
              </div>
            </div>
          </div>

          {/* Emergency banner overlay */}
          {isEmergencyActive && (
            <div className="absolute top-14 left-3 z-10 pointer-events-none">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase shadow-lg animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-200" />
                SOS: {activeIncident?.incidentCode ?? 'Active'}
              </span>
            </div>
          )}

          {/* Map Bottom Bar */}
          <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end justify-between gap-2 text-xs text-slate-400">
            <div className="bg-slate-900/85 backdrop-blur-xs px-3 py-2 rounded-2xl border border-slate-700/60 min-w-0">

            </div>
            <button
              onClick={handleShare}
              className="bg-slate-800/90 hover:bg-slate-700 text-white p-2 rounded-xl border border-slate-700 active:scale-95 transition-all flex items-center gap-1 text-[11px]"
              title="Share secure tracking link"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Copied Link!' : 'Share'}</span>
            </button>
          </div>
        </div>

        {/* Side Panel / Bottom Card Info */}
        <div className="space-y-3">
          {/* Location Details Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-600" />
                <span>Current Coordinates</span>
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                override
                  ? 'text-violet-700 bg-violet-50 border-violet-200'
                  : (gps?.source === 'ip'
                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200')
              }`}>
                {activeSourceTag}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Address</span>
                <p className="font-bold text-slate-800 text-sm">
                  {placeLabel}
                </p>
                <p className="text-xs text-slate-500">
                  {barangay || city ? `${barangay}, ${city}, Philippines` : 'No address data yet'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Latitude</span>
                  <span className="font-mono font-bold text-slate-700">{liveLat.toFixed(6)}° N</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Longitude</span>
                  <span className="font-mono font-bold text-slate-700">{liveLng.toFixed(6)}° E</span>
                </div>
              </div>
            </div>
          </div>

          {/* Set My Location (manual hardware-location override) */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-violet-600" />
                <span>Set My Location</span>
              </h3>
              {override ? (
                <span className="text-[9px] font-black uppercase bg-violet-600 text-white px-2 py-0.5 rounded-full">
                  FIXED
                </span>
              ) : null}
            </div>

            <div className="space-y-2 text-xs">
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Area / Lungsod</span>
                <select
                  value={overridePreset}
                  onChange={(e) => setOverridePreset(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  {Object.entries(LOCATION_PRESETS).map(([key, p]) => (
                    <option key={key} value={key}>{p.city}, {p.barangay}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Barangay (opsiyonal)</span>
                <input
                  value={overrideBarangay}
                  onChange={(e) => setOverrideBarangay(e.target.value)}
                  placeholder="e.g. Talisay"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </label>

              <button
                onClick={applyOverride}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold active:scale-[0.98] transition-all"
              >
                {overrideTouched ? 'UPDATE FIXED LOCATION' : 'SET LOCATION'}
              </button>

              {override && (
                <button
                  onClick={clearOverride}
                  className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear fixed location (use GPS)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};