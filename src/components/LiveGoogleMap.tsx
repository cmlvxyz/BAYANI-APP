import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

/**
 * Street View coverage for the requested position.
 *   exact   -> a panorama sits on (or within a few metres of) the fix
 *   nearest -> the closest available panorama, which may be further away
 *   none    -> no Street View imagery anywhere near the fix
 */
export type StreetViewCoverage = 'exact' | 'nearest' | 'none' | null;

interface LiveGoogleMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  streetView?: boolean;
  pano?: string;
  /** Device heading in degrees. Applied without re-running the panorama lookup. */
  heading?: number | null;
  pitch?: number;
  className?: string;
  /** Lets the parent surface the "Street View unavailable" fallback affordance. */
  onCoverageChange?: (coverage: StreetViewCoverage) => void;
  /** True when no Google Maps key is configured (embed fallback in use). */
  onKeylessFallback?: () => void;
  loadingLabel?: string;
  emptyLabel?: string;
}

/**
 * Google Maps JavaScript API key. Add it to the project-root `.env`:
 *   VITE_GOOGLE_MAPS_API_KEY=your-key-here
 * Without a key we still show a real Street View panorama via the keyless
 * embed, but the JS API features (nearest-panorama search, heading control and
 * coverage detection) are unavailable.
 */
const GOOGLE_MAPS_API_KEY: string | undefined =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || undefined;

/** True when the JS API path is available. */
export const hasGoogleMapsApiKey = (): boolean => Boolean(GOOGLE_MAPS_API_KEY);

/** Radius, in meters, searched around the live fix for the nearest panorama. */
const PANORAMA_SEARCH_RADIUS = 1000;

/** A panorama this close to the fix counts as an exact match. */
const EXACT_MATCH_METERS = 30;

const SCRIPT_ID = 'bayani-google-maps-js';
let googleMapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string): Promise<any> {
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google?.maps) {
      resolve(w.google);
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const onLoad = () => {
      const g = (window as any).google;
      if (g?.maps) resolve(g);
      else reject(new Error('Google Maps loaded without the maps namespace'));
    };
    const onError = () => reject(new Error('Google Maps JavaScript API failed to load'));

    if (script) {
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
      return;
    }

    script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Keyless fallback: Google Maps / Street View embed iframes. */
const EmbedMap: React.FC<LiveGoogleMapProps> = ({
  lat,
  lng,
  zoom = 16,
  streetView = false,
  pano,
  heading,
  pitch,
  className,
  loadingLabel,
}) => {
  // The embed iframe reports no progress, so hold a skeleton until it fires
  // `load` (with a timeout so the panel can never get stuck behind it).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const t = window.setTimeout(() => setLoaded(true), 6000);
    return () => window.clearTimeout(t);
  }, [lat, lng, pano, streetView]);

  const overlay = !loaded && (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-sunken)]">
      <div className="flex flex-col items-center gap-2.5">
        <Loader2 size={20} strokeWidth={2} className="animate-spin text-brand-600" />
        <p className="t-caption text-muted">{loadingLabel || (streetView ? 'Loading Street View…' : 'Loading map…')}</p>
      </div>
    </div>
  );

  if (streetView) {
    const src = pano
      ? `https://www.google.com/maps?pano=${encodeURIComponent(pano)}&cbp=11,${heading ?? 0},${pitch ?? 0},0,0&output=svembed&hl=en`
      : `https://www.google.com/maps?cbll=${lat},${lng}&cbp=11,${heading ?? 0},${pitch ?? 0},0,0&output=svembed&hl=en`;
    // Hoisted out of the JSX: a nested template literal inside `key={...}` is
    // hard for the TS/JSX parser to track when other expressions wrap the element.
    const frameKey = pano ? `sv-pano-${pano}` : `sv-${lat},${lng}`;
    return (
      <div className={`relative h-full w-full ${className || ''}`}>
        <iframe
          key={frameKey}
          title="Google Street View"
          src={src}
          className="w-full h-full border-0"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setLoaded(true)}
        />
        {overlay}
      </div>
    );
  }

  const frameKey = `map-${lat},${lng}`;
  return (
    <div className={`relative h-full w-full ${className || ''}`}>
      <iframe
        key={frameKey}
        title="Google Maps"
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&hl=en&ie=UTF8&iwloc=B&output=embed`}
        className="w-full h-full border-0"
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setLoaded(true)}
      />
      {overlay}
    </div>
  );
};

type RenderMode = 'loading' | 'street' | 'map' | 'empty' | 'error';

/** Google Maps JS API implementation: one map + one panorama, updated in place. */
const GoogleJsMap: React.FC<LiveGoogleMapProps> = (props) => {
  const {
    lat,
    lng,
    zoom = 16,
    streetView = false,
    pano,
    heading,
    pitch = 0,
    className,
    onCoverageChange,
    onKeylessFallback,
    loadingLabel,
    emptyLabel,
  } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const panoramaRef = useRef<any>(null);
  const [mode, setMode] = useState<RenderMode>('loading');
  const [coverage, setCoverage] = useState<StreetViewCoverage>(null);

  // Callbacks held in refs so reporting coverage never re-triggers the lookup.
  const coverageCbRef = useRef(onCoverageChange);
  const keylessCbRef = useRef(onKeylessFallback);
  useEffect(() => {
    coverageCbRef.current = onCoverageChange;
    keylessCbRef.current = onKeylessFallback;
  }, [onCoverageChange, onKeylessFallback]);

  const reportCoverage = (next: StreetViewCoverage) => {
    setCoverage(next);
    coverageCbRef.current?.(next);
  };

  // Headings arrive many times per second; apply them straight to the live
  // panorama so we never re-run the (rate-limited) getPanorama lookup for them.
  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!panorama || mode !== 'street') return;
    panorama.setPov({
      heading: heading ?? panorama.getPov?.().heading ?? 0,
      pitch: pitch ?? 0,
    });
  }, [heading, pitch, mode]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMode('error');
      keylessCbRef.current?.();
      return;
    }

    let cancelled = false;
    setMode('loading');

    const findPanorama = (g: any, request: any): Promise<{ data: any; status: string }> =>
      new Promise((resolve) => {
        new g.maps.StreetViewService().getPanorama(request, (data: any, status: any) =>
          resolve({ data, status }),
        );
      });

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(async (g) => {
        if (cancelled || !hostRef.current) return;
        const center = { lat, lng };

        let map = mapRef.current;
        if (!map) {
          map = new g.maps.Map(hostRef.current, {
            center,
            zoom,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
          });
          mapRef.current = map;
        } else {
          map.setCenter(center);
          map.setZoom(zoom);
        }

        const panorama = map.getStreetView();
        panoramaRef.current = panorama;

        // Plain map mode - no Street View requested.
        if (!streetView) {
          panorama.setVisible(false);
          reportCoverage(null);
          setMode('map');
          return;
        }

        let data: any = null;
        let level: StreetViewCoverage = 'none';

        // 1) Explicit panorama id (recorded with the citizen's exact position).
        if (pano) {
          const explicit = await findPanorama(g, { pano });
          if (explicit.status === 'OK' && explicit.data?.location?.pano) {
            data = explicit.data;
            level = 'exact';
          }
        }

        // 2) Nearest panorama to the live GPS fix.
        if (!data) {
          const nearest = await findPanorama(g, {
            location: center,
            radius: PANORAMA_SEARCH_RADIUS,
            preference: g.maps.StreetViewPreference?.NEAREST,
            source: g.maps.StreetViewSource?.GOOGLE,
          });
          if (nearest.status === 'OK' && nearest.data?.location?.pano) {
            data = nearest.data;
            const panoLatLng = nearest.data.location.latLng;
            level =
              panoLatLng && distanceMeters(center, panoLatLng) <= EXACT_MATCH_METERS
                ? 'exact'
                : 'nearest';
          }
        }

        if (cancelled) return;

        if (!data) {
          panorama.setVisible(false);
          reportCoverage('none');
          setMode('empty');
          return;
        }

        const position = data.location.latLng;
        if (position) {
          map.setCenter(position);
          map.setZoom(zoom);
        }
        panorama.setPano(data.location.pano);
        panorama.setPov({
          heading: heading ?? data.location.pov?.heading ?? 0,
          pitch: pitch ?? 0,
        });
        panorama.setVisible(true);
        reportCoverage(level);
        setMode('street');
      })
      .catch(() => {
        if (cancelled) return;
        // API could not load at all - degrade to the keyless embed so the
        // citizen still sees imagery instead of a blank panel.
        setMode('error');
        keylessCbRef.current?.();
      });

    return () => {
      cancelled = true;
    };
    // Intentionally excludes heading/pitch: they are applied by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, streetView, pano]);

  if (mode === 'error') {
    return <EmbedMap {...props} />;
  }

  return (
    <div className={`relative w-full h-full ${className || ''}`}>
      <div ref={hostRef} className="absolute inset-0" />

      {mode === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-sunken)]">
          <div className="flex flex-col items-center gap-2.5">
            <Loader2 size={20} strokeWidth={2} className="animate-spin text-brand-600" />
            <p className="t-caption text-muted">{loadingLabel || (streetView ? 'Loading Street View…' : 'Loading map…')}</p>
          </div>
        </div>
      )}

      {/* No Street View imagery anywhere near the fix. The parent decides
          whether to offer the map fallback, so no world map sneaks in here. */}
      {mode === 'empty' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--surface-sunken)] px-6 text-center">
          <p className="t-body-sm font-semibold text-ink">
            {emptyLabel || 'Street View unavailable at this location'}
          </p>
          <p className="t-caption text-muted">
            We could not find street-level imagery near your current position.
          </p>
        </div>
      )}

      {/* Nearest-panorama notice (exact coverage not available) */}
      {mode === 'street' && coverage === 'nearest' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 mx-auto max-w-[90%]">
          <p className="rounded-ctl bg-warn px-3 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-[.06em] text-white shadow-lg">
            Showing the nearest Street View to your position
          </p>
        </div>
      )}
    </div>
  );
};

export const LiveGoogleMap: React.FC<LiveGoogleMapProps> = (props) => {
  const { onKeylessFallback } = props;

  // When no API key is configured we never mount the JS path, so surface the
  // degraded mode from here instead of from inside GoogleJsMap.
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) onKeylessFallback?.();
  }, [onKeylessFallback]);

  return GOOGLE_MAPS_API_KEY ? <GoogleJsMap {...props} /> : <EmbedMap {...props} />;
};