import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Share2, Compass, Clock, Crosshair, X } from 'lucide-react';
import { Incident } from '../../types';
import { WearableDeviceTelemetry, hardwareService, LocationOverride, BALANGA_LOCATION } from '../../services/hardwareService';
import { LiveGoogleMap, FALLBACK_COORDS } from '../LiveGoogleMap';
import { watchGeolocation, ResolvedLocation } from '../../services/geolocationService';
import { Badge, Button, GlassCard, TextField, SelectField } from '../ui';

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
  /** Any usable location (incident, manual override, device GPS or IP geolocation). */
  const hasRealLocation = Boolean(trackedCoords);
  /** Street View is the primary view; the map is the explicit alternative. */
  const showStreetView = hasRealLocation && !forceMap;

  return (
    <div id="user-live-location-screen" className="space-y-4 pb-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="t-heading flex items-center gap-2 text-ink">
          <MapPin size={18} strokeWidth={1.9} className="text-brand-600" />
          Live location
        </h2>
        <Badge
          tone="success"
          icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}
        >
          Sharing active
        </Badge>
      </header>

      {/* Map */}
      <GlassCard flush className="overflow-hidden p-0">
        <div className="relative h-[300px] w-full sm:h-[380px]">
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

          {waitingForGps && !isEmergencyActive && (
            <div className="pointer-events-none absolute left-3 top-3">
              <Badge tone="warning">
                {gpsError ? 'GPS unavailable — default view' : 'Waiting for GPS…'}
              </Badge>
            </div>
          )}

          {isEmergencyActive && (
            <div className="pointer-events-none absolute left-3 top-3">
              <Badge tone="danger">SOS · {activeIncident?.incidentCode ?? 'Active'}</Badge>
            </div>
          )}

          {/* Coordinates strip */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-end">
            <div className="flex items-center gap-1.5 rounded-ctl bg-[rgba(9,20,38,.82)] px-2.5 py-1.5 font-mono text-[11px] font-bold text-white">
              <Compass size={13} strokeWidth={2} className="text-brand-200" />
              {liveLat.toFixed(4)}° N, {liveLng.toFixed(4)}° E
            </div>
          </div>

          {/* Controls */}
          <div className="absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-2">
            {hasRealLocation && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setForceMap((v) => !v)}
                className="border-white/25 bg-[rgba(9,20,38,.82)] text-white hover:bg-[rgba(9,20,38,.92)]"
                icon={showStreetView ? <MapPin size={14} strokeWidth={2} /> : <Compass size={14} strokeWidth={2} />}
              >
                {showStreetView ? 'Map view' : 'Street View'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleShare}
              icon={<Share2 size={14} strokeWidth={2} />}
              className="border-white/25 bg-[rgba(9,20,38,.82)] text-white hover:bg-[rgba(9,20,38,.92)]"
            >
              {copiedLink ? 'Copied link!' : 'Share'}
            </Button>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 rounded-ctl bg-[rgba(9,20,38,.82)] px-2.5 py-1.5 text-[11px] font-semibold text-white/85 sm:flex">
            <Clock size={13} strokeWidth={2} className="text-white/60" />
            Updated {secondsAgo}s ago
          </div>
        </div>
      </GlassCard>

      {/* Coordinates card */}
      <GlassCard>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-brand-50 text-brand-600">
              <Navigation size={16} strokeWidth={1.9} />
            </span>
            <p className="t-heading text-ink">Current coordinates</p>
          </div>
          <Badge tone={override ? 'brand' : gps?.source === 'ip' ? 'warning' : 'success'}>
            {activeSourceTag}
          </Badge>
        </div>

        <div className="mt-3.5 space-y-3">
          <div>
            <p className="t-caption text-muted">Address</p>
            <p className="text-[14px] font-extrabold text-ink">{placeLabel}</p>
            <p className="t-body text-muted">
              {barangay || city ? `${barangay}, ${city}, Philippines` : 'No address data yet'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-ctl bg-[var(--surface-sunken)] px-3 py-2.5">
              <p className="t-caption text-muted">Latitude</p>
              <p className="font-mono text-[13px] font-bold text-ink">{liveLat.toFixed(6)}° N</p>
            </div>
            <div className="rounded-ctl bg-[var(--surface-sunken)] px-3 py-2.5">
              <p className="t-caption text-muted">Longitude</p>
              <p className="font-mono text-[13px] font-bold text-ink">{liveLng.toFixed(6)}° E</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Optional override — automatic detection above is always on */}
      <GlassCard>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-brand-50 text-brand-600">
              <Crosshair size={16} strokeWidth={1.9} />
            </span>
            <p className="t-heading text-ink">Override location</p>
          </div>
          {override ? <Badge tone="brand">Fixed</Badge> : <Badge tone="success">Auto</Badge>}
        </div>

        <p className="t-body mt-2 text-muted">
          Your location is detected automatically. Only pin it manually if the detected
          position is wrong.
        </p>

        <div className="mt-3.5 space-y-3.5">
          <SelectField
            label="Area / city"
            value={overridePreset}
            onChange={(e) => setOverridePreset(e.target.value)}
          >
            {Object.entries(LOCATION_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.city}, {p.barangay}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Barangay (optional)"
            type="text"
            value={overrideBarangay}
            onChange={(e) => setOverrideBarangay(e.target.value)}
            placeholder="e.g. Talisay"
          />

          <Button variant="primary" fullWidth onClick={applyOverride}>
            {overrideTouched ? 'Update pinned location' : 'Pin this location'}
          </Button>

          {override && (
            <Button
              variant="ghost"
              fullWidth
              onClick={clearOverride}
              icon={<X size={15} strokeWidth={2} />}
            >
              Remove pin — back to automatic
            </Button>
          )}
        </div>
      </GlassCard>
    </div>
  );
};
