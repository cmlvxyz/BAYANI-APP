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

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<Pick<ResolvedLocation, 'city' | 'region' | 'country' | 'label'>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return {};
    }
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.municipality || a.village || a.county || '';
    const region = a.state || a.province || a.region || '';
    const label = data.display_name
      ? String(data.display_name).split(',').slice(0, 5).join(',').trim()
      : [city, region].filter(Boolean).join(', ');
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