import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation, Share2, Compass, Clock, Crosshair, Loader2, X, MapPinned } from 'lucide-react';
import { Incident } from '../../types';
import { WearableDeviceTelemetry, hardwareService, LocationOverride, BALANGA_LOCATION } from '../../services/hardwareService';
import { LiveGoogleMap, StreetViewCoverage, hasGoogleMapsApiKey } from '../LiveGoogleMap';
import { Badge, Button, GlassCard, TextField, SelectField } from '../ui';
import { CitizenProfile, loadCitizenProfile, saveCitizenProfile } from '../../services/profileService';
import type { UseLiveLocationResult } from '../../hooks/useLiveLocation';

/**
 * Optional manual positions kept strictly as a testing aid. They never drive
 * the automatic Live Location flow, and they carry no baked-in panorama ids or
 * camera angles - the map resolves the nearest panorama from coordinates.
 */
const LOCATION_PRESETS: Record<string, LocationOverride> = {
  balanga: { ...BALANGA_LOCATION },
  mariveles: {
    lat: 14.4333,
    lng: 120.4833,
    label: 'Mariveles',
    city: 'Mariveles',
    barangay: 'Bataan',
    address: 'Mariveles, Bataan',
  },
  dinalupihan: {
    lat: 14.8833,
    lng: 120.45,
    label: 'Dinalupihan',
    city: 'Dinalupihan',
    barangay: 'Bataan',
    address: 'Dinalupihan, Bataan',
  },
};

interface UserLiveLocationScreenProps {
  telemetry: WearableDeviceTelemetry;
  activeIncident: Incident | null;
  isEmergencyActive: boolean;
  /**
   * Single GPS watcher owned by the app shell. The citizen never has to pick
   * their position - it always comes from the device.
   */
  liveLocation: UseLiveLocationResult;
}

const formatCoord = (value: number) => value.toFixed(6);

export const UserLiveLocationScreen: React.FC<UserLiveLocationScreenProps> = ({
  telemetry,
  activeIncident,
  isEmergencyActive,
  liveLocation,
}) => {
  const { phase, fix, anchor, place, reconnecting, error, start } = liveLocation;

  const [secondsAgo, setSecondsAgo] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [override, setOverride] = useState<LocationOverride | null>(hardwareService.getLocationOverride());
  const [overridePreset, setOverridePreset] = useState('balanga');
  const [overrideBarangay, setOverrideBarangay] = useState('');
  const [overrideTouched, setOverrideTouched] = useState(false);
const [coverage, setCoverage] = useState<StreetViewCoverage>(null);
  const [showMapView, setShowMapView] = useState(false);
  const [keyless, setKeyless] = useState(!hasGoogleMapsApiKey());
  const [profile, setProfile] = useState<CitizenProfile>(loadCitizenProfile);
  const [addressDraft, setAddressDraft] = useState(() => loadCitizenProfile().address);

  useEffect(() => {
    const next = loadCitizenProfile();
    setProfile(next);
    setAddressDraft(next.address);
  }, []);

  const saveAddress = useCallback(() => {
    const next = { ...loadCitizenProfile(), address: addressDraft.trim() };
    saveCitizenProfile(next);
    setProfile(next);
  }, [addressDraft]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => (prev >= 15 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Any real fix resets us back to Street View as the primary experience.
  useEffect(() => {
    if (anchor) setShowMapView(false);
  }, [anchor]);

  const handleShare = () => {
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleRequestLocation = useCallback(() => start(), [start]);

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

  // The live device fix always wins for POSITION; the override card is a
  // testing aid only. For the human-readable LABEL we prefer the citizen's
  // verified address, because reverse geocoding can only resolve to the nearest
  // mapped feature (a road or subdivision) and never to a house number.
  const usingOverride = !fix && Boolean(override);
  const coords = usingOverride
    ? { lat: override!.lat, lng: override!.lng, accuracy: 0, heading: null, speed: null, timestamp: Date.now() }
    : anchor;

  const needsPermission = phase === 'idle' || phase === 'denied' || phase === 'unsupported';
  const locating = phase === 'locating' || phase === 'unavailable';

  const verifiedAddress = profile.address.trim();
  const detectedAddress =
    verifiedAddress ||
    (usingOverride ? override!.address : '') ||
    place?.address ||
    activeIncident?.location.address ||
    telemetry.locationName ||
    '';

  const detectedBarangay = place?.region || (usingOverride ? override!.barangay : '') || telemetry.barangay || '';
  const detectedCity = place?.city || (usingOverride ? override!.city : '') || telemetry.city || '';

  const sourceLabel = usingOverride
    ? 'MANUAL — TEST'
    : fix
      ? 'GPS — LIVE'
      : 'WAITING FOR GPS';

  const displayError = overrideTouched ? null : error;

  return (
    <div className="space-y-4 pb-4">
      <GlassCard className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3.5">
          <div>
            <h1 className="t-title-sm">Live Location</h1>
            <p className="t-caption mt-0.5 text-muted">
              Real-time street-level view of your current position
            </p>
          </div>
          <Badge tone={fix ? 'success' : 'neutral'} className="shrink-0">
            {fix ? 'GPS LIVE' : 'NO FIX'}
          </Badge>
        </div>

        {/* ---- Viewport: Street View is the primary experience ---- */}
        <div className="relative h-[300px] w-full bg-[var(--surface-sunken)] sm:h-[340px]">
          {needsPermission ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                <Navigation size={24} strokeWidth={2} className="text-brand-600" />
              </div>
              <p className="t-title-sm">Location access required</p>
              <p className="t-caption max-w-[36ch] text-muted">
                SINAG needs your device location to show your position on Street View and to
                keep responders pointed to the right place.
              </p>
              <Button onClick={handleRequestLocation} disabled={phase === 'unsupported'}>
                <Crosshair size={16} />
                Enable Location
              </Button>
            </div>
          ) : locating && !coords ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5">
              <Loader2 size={22} strokeWidth={2} className="animate-spin text-brand-600" />
              <p className="t-caption text-muted">Finding your location…</p>
            </div>
          ) : coords ? (
            <>
              <LiveGoogleMap
                lat={coords.lat}
                lng={coords.lng}
                streetView={!showMapView}
                heading={coords.heading}
                pitch={0}
                loadingLabel="Loading Street View…"
                emptyLabel="Street View unavailable at this location"
                onCoverageChange={setCoverage}
                onKeylessFallback={() => setKeyless(true)}
              />

              {/* Map is only ever offered as an explicit fallback. */}
              {coverage === 'none' && !showMapView && (
                <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-[92%]">
                  <Button
                    onClick={() => setShowMapView(true)}
                    className="w-full shadow-lg"
                    variant="secondary"
                  >
                    <MapPin size={15} />
                    Open Map View
                  </Button>
                </div>
              )}

              {showMapView && (
                <div className="absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-[92%] justify-center">
                  <Button onClick={() => setShowMapView(false)} variant="secondary" className="shadow-lg">
                    <Crosshair size={15} />
                    Back to Street View
                  </Button>
                </div>
              )}

              {reconnecting && (
                <div className="absolute inset-x-0 top-0 z-10 flex justify-center bg-warn/95 px-3 py-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[.06em] text-white">
                    Reconnecting to location…
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 px-6 text-center">
              <p className="t-body-sm font-semibold text-ink">Locating you…</p>
              <p className="t-caption text-muted">
                Waiting for your device to report a GPS position.
              </p>
            </div>
          )}
        </div>

        {keyless && (
          <div className="flex items-start gap-2 border-t border-hairline bg-warn/10 px-4 py-2.5">
            <Compass size={15} className="mt-0.5 shrink-0 text-warn" />
            <p className="t-caption text-muted">
              Street View is running in keyless mode. Set{' '}
              <code className="font-mono text-[10px]">VITE_GOOGLE_MAPS_API_KEY</code> to enable the
              nearest-panorama search and heading control.
            </p>
          </div>
        )}
      </GlassCard>

      {/* ---- Position read-out, straight from the device ---- */}
      <GlassCard className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="t-caption text-muted">Your location</p>
            <p className="t-body-sm mt-0.5 truncate font-semibold text-ink">
              {detectedAddress || 'Resolving your address…'}
            </p>
            <p className="t-caption mt-0.5 text-muted">
              {verifiedAddress
                ? `Verified address · ${[detectedBarangay, detectedCity].filter(Boolean).join(', ') || 'Philippines'}`
                : usingOverride
                  ? 'Manual test position'
                  : fix
                    ? 'Nearest mapped place to your GPS · not a house number'
                    : 'Address pending'}
            </p>
          </div>
          <Badge tone={fix ? 'success' : 'neutral'} className="shrink-0">
            {sourceLabel}
          </Badge>
        </div>

        {/* Reverse geocoding can only resolve to the nearest mapped feature
            (a road or subdivision), so the house number has to come from the
            citizen. Position stays live GPS either way. */}
        <div className="rounded-ctl bg-[var(--surface-sunken)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <MapPinned size={15} className="mt-0.5 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <TextField
                label="Verified address"
                value={addressDraft}
                placeholder="e.g. 949 National Road, St. Francis II, Limay, Bataan"
                onChange={(e) => setAddressDraft(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <Button onClick={saveAddress} variant="secondary" size="sm">
                  Save address
                </Button>
                {verifiedAddress && addressDraft.trim() !== verifiedAddress && (
                  <span className="t-caption text-muted">Unsaved changes</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-ctl bg-sunken px-3 py-2.5">
          <div>
            <p className="t-caption text-muted">Latitude</p>
            <p className="t-body-sm font-mono font-semibold text-ink">
              {fix ? formatCoord(fix.lat) : '—'}
            </p>
          </div>
          <div>
            <p className="t-caption text-muted">Longitude</p>
            <p className="t-body-sm font-mono font-semibold text-ink">
              {fix ? formatCoord(fix.lng) : '—'}
            </p>
          </div>
          <div>
            <p className="t-caption text-muted">Accuracy</p>
            <p className="t-body-sm font-semibold text-ink">
              {fix && fix.accuracy > 0 ? `±${Math.round(fix.accuracy)} m` : '—'}
            </p>
          </div>
          <div>
            <p className="t-caption text-muted">Heading</p>
            <p className="t-body-sm font-semibold text-ink">
              {fix && fix.heading !== null ? `${Math.round(fix.heading)}°` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 t-caption text-muted">
            <Clock size={13} />
            Updated {secondsAgo}s ago
          </p>
          <Button onClick={handleShare} variant="secondary">
            <Share2 size={15} />
            {copiedLink ? 'Link copied' : 'Share location'}
          </Button>
        </div>

        {displayError && (
          <div className="flex items-start gap-2 rounded-ctl bg-danger-soft px-3 py-2.5">
            <MapPin size={15} className="mt-0.5 shrink-0 text-danger" />
            <p className="t-caption text-danger">{displayError}</p>
          </div>
        )}
      </GlassCard>

      {/* ---- Optional manual position (testing aid only) ---- */}
      <GlassCard className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="t-body-sm font-semibold text-ink">Testing position</p>
            <p className="t-caption mt-0.5 text-muted">
              Optional. Live Location always uses your real device GPS.
            </p>
          </div>
          {override && (
            <Button onClick={clearOverride} variant="ghost" className="shrink-0">
              <X size={15} />
              Clear
            </Button>
          )}
        </div>

        <SelectField
          label="Test area"
          value={overridePreset}
          onChange={(event) => setOverridePreset(event.target.value)}
        >
          {Object.entries(LOCATION_PRESETS).map(([value, preset]) => (
            <option key={value} value={value}>
              {preset.label}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Barangay (optional)"
          value={overrideBarangay}
          placeholder="e.g. St Francis II"
          onChange={(event) => setOverrideBarangay(event.target.value)}
        />

        <Button onClick={applyOverride} variant="secondary">
          Apply test position
        </Button>
      </GlassCard>
    </div>
  );
};