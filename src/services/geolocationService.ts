/**
 * Bayani Alert - Geolocation Resolution Service
 */

export interface ResolvedLocation {
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country?: string;
  label?: string;
  source: 'gps' | 'ip';
}

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | 'ERROR';

export class GeolocationError extends Error {
  public readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
  }
}

export interface ExactPosition {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters, as reported by the device. */
  accuracy: number;
  /** ISO-8601 timestamp of when the GPS fix was captured. */
  timestamp: string;
  source: 'gps';
  label?: string;
  city?: string;
  region?: string;
}

async function ipFallback(): Promise<ResolvedLocation> {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) {
    throw new Error('IP geolocation request failed');
  }
  const data = await res.json();
  if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
    throw new Error('IP geolocation returned no coordinates');
  }
  const city = data.city || '';
  const region = data.region || '';
  return {
    lat: data.latitude,
    lng: data.longitude,
    city,
    region,
    country: data.country_name || 'Philippines',
    label: [city, region].filter(Boolean).join(', '),
    source: 'ip',
  };
}

/**
 * Normalise a place/road name for display.
 *
 * OpenStreetMap carries a few Philippine quirks that read badly in the app:
 *   - "Saint Francis Ⅱ" uses the Unicode Roman numeral; we want "St. Francis II"
 *   - the Bataan national highway is tagged "Old National Road"; locally it is
 *     simply "National Road", and responders search for it under that name
 * Narrow, explicit list so we never mangle unrelated names.
 */
function normalizePlaceName(raw: string): string {
  let name = String(raw || '').trim();
  if (!name) return '';

  // Unicode Roman numerals -> ASCII, so "Francis Ⅱ" becomes "Francis II".
  const roman: Record<string, string> = {
    'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV',
    'Ⅴ': 'V', 'Ⅵ': 'VI', 'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X',
  };
  name = name.replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, (ch) => roman[ch] || ch);

  // "Saint Francis II" -> "St. Francis II" (Philippine postal convention).
  name = name.replace(/\bSaint\b/g, 'St.');

  // "Old National Road" -> "National Road" (PH national highway naming).
  name = name.replace(/^Old\s+(National\s+Road)$/i, '$1');

  return name.replace(/\s+/g, ' ').trim();
}

interface NominatimAddress {
  road?: string;
  residential?: string;
  pedestrian?: string;
  quarter?: string;
  suburb?: string;
  village?: string;
  city?: string;
  town?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

/**
 * Build a clean Philippine address from Nominatim's structured address parts.
 *
 * The previous implementation took `display_name`, split it on commas and kept
 * the first five chunks. That produced artefacts such as
 * "Old National Road, Saay, Saint, Francis II, Limay, Bataan" because Nominatim
 * repeats the barangay name and injects a zone ("Saay") that is not part of a
 * postal address. Ordering the parts explicitly gives
 * "National Road, St. Francis II, Limay, Bataan".
 */
function formatAddressFromParts(a: NominatimAddress): {
  label: string;
  city: string;
  region: string;
} {
  const city = normalizePlaceName(a.city || a.town || a.municipality || a.county || '');
  const region = normalizePlaceName(a.state || '');
  const barangay = normalizePlaceName(
    a.quarter || a.village || a.suburb || '',
  );
  const street = normalizePlaceName(a.road || a.residential || a.pedestrian || '');

  const parts = [street, barangay, city, region].filter(Boolean);

  return {
    // Drop a trailing barangay that just repeats the city name.
    label: [...new Set(parts)].filter(Boolean).join(', '),
    city,
    region,
  };
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<Pick<ResolvedLocation, 'city' | 'region' | 'country' | 'label'>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return {};
    }
    const data = await res.json();
    const a = (data.address || {}) as NominatimAddress;
    const { label, city, region } = formatAddressFromParts(a);
    if (!label) return {};
    return { city, region, country: a.country || 'Philippines', label };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export function resolveLocation(): Promise<ResolvedLocation> {
  const getGps = new Promise<ResolvedLocation>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' }),
      () => reject(new Error('GPS denied or unavailable')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });

  return getGps
    .then(async (loc) => {
      const place = await reverseGeocode(loc.lat, loc.lng);
      return { ...loc, ...place };
    })
    .catch(() => ipFallback());
}

/**
 * Obtain the citizen's EXACT GPS position for an emergency alert.
 *
 * Requests a high-accuracy fix (10s timeout, no cached position) and:
 *   - captures latitude, longitude, accuracy (meters) and fix timestamp
 *   - NEVER falls back to a fake/static coordinate or a silent IP estimate —
 *     if the device cannot produce a GPS fix the promise rejects with a
 *     user-facing `GeolocationError` instead.
 */
export function getExactAlertPosition(): Promise<ExactPosition> {
  return new Promise<ExactPosition>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeolocationError('UNSUPPORTED', 'Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.max(0, pos.coords.accuracy || 0),
          timestamp: new Date(pos.timestamp).toISOString(),
          source: 'gps',
        });
      },
      (err: GeolocationPositionError) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(new GeolocationError(
              'PERMISSION_DENIED',
              'Location permission is required to send your exact location with this alert.',
            ));
            break;
          case err.POSITION_UNAVAILABLE:
            reject(new GeolocationError(
              'POSITION_UNAVAILABLE',
              'Your current location could not be determined. Please check your device location settings and try again.',
            ));
            break;
          case err.TIMEOUT:
            reject(new GeolocationError(
              'TIMEOUT',
              'Location request timed out. Please try again.',
            ));
            break;
          default:
            reject(new GeolocationError(
              'ERROR',
              'Could not determine your exact location. Please try again.',
            ));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }).then(async (pos) => {
    // Best-effort reverse geocode for a friendly address label. The alert's
    // exact coordinates are never altered by this — only the label is enriched.
    const place = await reverseGeocode(pos.latitude, pos.longitude);
    return { ...pos, label: place.label, city: place.city, region: place.region };
  });
}

export function watchGeolocation(
  onUpdate: (loc: ResolvedLocation) => void,
  onError: () => void,
): () => void {
  if (!('geolocation' in navigator)) {
    onError();
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords: ResolvedLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        source: 'gps',
      };
      onUpdate(coords);
      reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((place) => {
        onUpdate({ ...coords, ...place });
      });
    },
    () => {
      ipFallback().then(onUpdate).catch(onError);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

const EARTH_RADIUS_METERS = 6371008.8;

/**
 * Great-circle (haversine) distance in meters between two GPS fixes.
 * Shared by the live-location watcher to decide when a movement is large
 * enough to warrant a Street View / sharing refresh.
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}