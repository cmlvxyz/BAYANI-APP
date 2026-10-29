/**
 * Bayani Alert - Live Location Hook
 *
 * Single owner of `navigator.geolocation.watchPosition` for the whole app, so
 * the Home card, the Live Location screen and the emergency sharing path all
 * read the same fix instead of each opening their own GPS watcher.
 *
 * Behaviour required by the Live Location feature:
 *   - real device GPS only (no IP estimate, no hardcoded city fallback)
 *   - permission state is surfaced so the UI can ask the user to enable it
 *   - the last valid fix is retained when the signal drops temporarily
 *   - a movement threshold gates expensive work (Street View + sharing)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { haversineMeters, reverseGeocode } from '../services/geolocationService';

/** Distance the citizen must travel before we refresh panorama/sharing state. */
export const DEFAULT_MOVEMENT_THRESHOLD_METERS = 25;

/** A single GPS reading straight off the device. */
export interface LiveFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy in meters. */
  accuracy: number;
  /** Compass heading in degrees, or null when the device cannot supply one. */
  heading: number | null;
  /** Ground speed in m/s, or null when unknown. */
  speed: number | null;
  /** Epoch milliseconds as reported by the browser. */
  timestamp: number;
}

export type LiveLocationPhase =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'unsupported';

export interface LiveLocationPlace {
  address: string;
  city: string;
  region: string;
}

export interface LiveLocationState {
  phase: LiveLocationPhase;
  /** Latest real device fix, or null before the first successful read. */
  fix: LiveFix | null;
  /**
   * Last fix that crossed the movement threshold. This is the coordinate the
   * Street View panorama is anchored to, so a stationary device does not keep
   * re-querying the panorama service.
   */
  anchor: LiveFix | null;
  /** Reverse-geocoded label for `fix`. Never a hardcoded placeholder. */
  place: LiveLocationPlace | null;
  /** True when we still hold a fix but have not heard from the device lately. */
  reconnecting: boolean;
  /** Meters travelled since the last emitted movement update. */
  distanceSinceAnchor: number;
  error: string | null;
}

export interface UseLiveLocationOptions {
  /** Start/stop tracking. Keep false until the user reaches a location screen. */
  enabled?: boolean;
  movementThresholdMeters?: number;
  /** Fires only when the citizen travels at least `movementThresholdMeters`. */
  onMovement?: (fix: LiveFix) => void;
  /** Fires on every accepted fix (used to keep live sharing state fresh). */
  onFix?: (fix: LiveFix) => void;
}

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

/** No fresh reading for this long -> show the "reconnecting" affordance. */
const STALE_AFTER_MS = 20000;

const ERROR_MESSAGES: Record<number, string> = {
  1: 'Location permission was denied. Enable location access to see your position on Street View.',
  2: 'Your location could not be determined. Check your device location settings and try again.',
  3: 'Getting your location took too long. Move to an open area and try again.',
};

export function useLiveLocation(options: UseLiveLocationOptions = {}) {
  const {
    enabled = false,
    movementThresholdMeters = DEFAULT_MOVEMENT_THRESHOLD_METERS,
    onMovement,
    onFix,
  } = options;

  const [phase, setPhase] = useState<LiveLocationPhase>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'idle' : 'unsupported',
  );
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [anchor, setAnchor] = useState<LiveFix | null>(null);
  const [place, setPlace] = useState<LiveLocationPlace | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [distanceSinceAnchor, setDistanceSinceAnchor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Callbacks live in refs so the watch is never torn down just because a
  // parent re-rendered with a new inline closure.
  const onMovementRef = useRef(onMovement);
  const onFixRef = useRef(onFix);
  const anchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const latestFixRef = useRef<LiveFix | null>(null);
  const lastGeocodeRef = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeSeqRef = useRef(0);

  useEffect(() => {
    onMovementRef.current = onMovement;
    onFixRef.current = onFix;
  }, [onMovement, onFix]);

  const clearWatchRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    clearWatchRef.current?.();
    clearWatchRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setPhase('unsupported');
      setError('This browser does not support live location tracking.');
      return;
    }
    clearWatchRef.current?.();

    setPhase('locating');
    setError(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next: LiveFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.max(0, position.coords.accuracy || 0),
          heading: Number.isFinite(position.coords.heading ?? NaN)
            ? (position.coords.heading as number)
            : null,
          speed: Number.isFinite(position.coords.speed ?? NaN)
            ? (position.coords.speed as number)
            : null,
          timestamp: position.timestamp,
        };

        setPhase((prev) => (prev === 'ready' ? prev : 'ready'));
        setError(null);
        setReconnecting(false);
        onFixRef.current?.(next);

        // Movement gate: only "big" moves reset the anchor.
        const anchorPos = anchorRef.current;
        if (!anchorPos) {
          anchorRef.current = { lat: next.lat, lng: next.lng };
          setAnchor(next);
          setDistanceSinceAnchor(0);
          onMovementRef.current?.(next);
        } else {
          const moved = haversineMeters(anchorPos, next);
          setDistanceSinceAnchor(moved);
          if (moved >= movementThresholdMeters) {
            anchorRef.current = { lat: next.lat, lng: next.lng };
            setAnchor(next);
            setDistanceSinceAnchor(0);
            onMovementRef.current?.(next);
          }
        }

        // Reverse geocode the real fix, but only when it has actually moved.
        const lastGeocoded = lastGeocodeRef.current;
        if (!lastGeocoded || haversineMeters(lastGeocoded, next) >= 100) {
          const seq = ++geocodeSeqRef.current;
          lastGeocodeRef.current = { lat: next.lat, lng: next.lng };
          reverseGeocode(next.lat, next.lng).then((result) => {
            // Ignore responses that arrive after a newer request started.
            if (seq !== geocodeSeqRef.current) return;
            if (!result.label && !result.city) return;
            setPlace({
              address: result.label || result.city || `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`,
              city: result.city || '',
              region: result.region || '',
            });
          });
        }

        latestFixRef.current = next;
        setFix(next);
      },
      (positionError) => {
        const message =
          ERROR_MESSAGES[positionError.code] ||
          'Live location is temporarily unavailable. Please try again.';
        setError(message);
        if (positionError.code === 1) {
          // Permission is terminal until the user changes browser settings.
          clearWatchRef.current?.();
          clearWatchRef.current = null;
          setPhase('denied');
        } else {
          setPhase('unavailable');
        }
      },
      POSITION_OPTIONS,
    );

    clearWatchRef.current = () => navigator.geolocation.clearWatch(watchId);
  }, [movementThresholdMeters]);

  // Watch the clock so a silent GPS drop surfaces as "reconnecting" instead of
  // silently showing a stale pin.
  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = window.setInterval(() => {
      const latest = latestFixRef.current;
      if (latest && Date.now() - latest.timestamp > STALE_AFTER_MS) {
        setReconnecting(true);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    start();
    return stop;
  }, [enabled, start, stop]);

  return useMemo(
    () => ({ phase, fix, anchor, place, reconnecting, distanceSinceAnchor, error, start, stop }),
    [phase, fix, anchor, place, reconnecting, distanceSinceAnchor, error, start, stop],
  );
}

export type UseLiveLocationResult = ReturnType<typeof useLiveLocation>;