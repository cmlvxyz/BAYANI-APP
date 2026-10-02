import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface LiveGoogleMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  streetView?: boolean;
  pano?: string;
  heading?: number;
  pitch?: number;
  className?: string;
}

/** Neutral fallback center (Philippines) used only when no GPS/incident coordinates exist. */
export const FALLBACK_COORDS = { lat: 12.8797, lng: 121.774 };

/**
 * Google Maps JavaScript API key. Add it to the project-root `.env`:
 *   VITE_GOOGLE_MAPS_API_KEY=your-key-here
 * Without a key the component gracefully falls back to keyless embed iframes.
 */
const GOOGLE_MAPS_API_KEY: string | undefined =
  (import.meta as any)?.env?.VITE_GOOGLE_MAPS_API_KEY || undefined;

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
}) => {
  const frameCls = `w-full h-full border-0 ${className || ''}`;
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
        <p className="t-caption text-muted">{streetView ? 'Loading Street View…' : 'Loading map…'}</p>
      </div>
    </div>
  );

  if (streetView) {
    const src = pano
      ? `https://www.google.com/maps?pano=${encodeURIComponent(pano)}&cbp=11,${heading ?? 0},${pitch ?? 0},0,0&output=svembed&hl=en`
      : `https://www.google.com/maps?cbll=${lat},${lng}&cbp=11,0,0,0,0&output=svembed&hl=en`;
    // Hoisted out of the JSX: a nested template literal inside `key={...}` is
    // hard for the TS/JSX parser to track when other expressions wrap the element.
    const frameKey = pano ? `sv-pano-${pano}` : `sv-${lat},${lng}`;
    return (
      <div className={`relative h-full w-full ${className || ''}`}>
        <iframe
          key={frameKey}
          title="Google Street View"
          src={src}
          className={frameCls}
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
        className={frameCls}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={() => setLoaded(true)}
      />
      {overlay}
    </div>
  );
};

type RenderMode = 'loading' | 'street' | 'map' | 'error';
/** exact = pano at/near the coords, nearest = pano found within a wider radius, none = no coverage. */
type Coverage = 'exact' | 'nearest' | 'none' | null;

/** Google Maps JS API implementation with Street View coverage detection. */
const GoogleJsMap: React.FC<LiveGoogleMapProps> = (props) => {
  const { lat, lng, zoom = 16, streetView = false, pano, heading = 0, pitch = 0, className } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mode, setMode] = useState<RenderMode>('loading');
  const [coverage, setCoverage] = useState<Coverage>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMode('error');
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
        }
        map.setZoom(zoom);

        const panorama = map.getStreetView();

        // Plain map mode — no Street View requested.
        if (!streetView) {
          panorama.setVisible(false);
          setCoverage(null);
          setMode('map');
          return;
        }

        let result: { data: any; status: string } = { data: null, status: 'ZERO_RESULTS' };
        let level: Coverage = 'none';

        // 1) Explicit panorama id (e.g. recorded with the citizen's exact location).
        if (pano) {
          result = await findPanorama(g, { pano });
          if (result.status === 'OK' && result.data?.location?.pano) level = 'exact';
        }

        // 2) Tight radius around the incident coordinates.
        if (level === 'none') {
          result = await findPanorama(g, {
            location: center,
            radius: 30,
            preference: g.maps.StreetViewPreference?.NEAREST,
            source: g.maps.StreetViewSource?.OUTDOOR,
          });
          if (result.status === 'OK' && result.data?.location?.pano) level = 'exact';
        }

        // 3) Wider radius → nearest available panorama.
        if (level === 'none') {
          result = await findPanorama(g, {
            location: center,
            radius: 500,
            preference: g.maps.StreetViewPreference?.NEAREST,
            source: g.maps.StreetViewSource?.OUTDOOR,
          });
          if (result.status === 'OK' && result.data?.location?.pano) level = 'nearest';
        }

        if (cancelled) return;

        if (level === 'none') {
          panorama.setVisible(false);
          setCoverage('none');
          setMode('map');
          return;
        }

        const position = result.data.location.latLng;
        if (position) {
          map.setCenter(position);
          map.setZoom(zoom);
        }
        panorama.setPano(result.data.location.pano);
        panorama.setPov({
          heading: heading ?? result.data.location.pov?.heading ?? 0,
          pitch: pitch ?? 0,
        });
        panorama.setVisible(true);
        setCoverage(level);
        setMode('street');
      })
      .catch(() => {
        if (!cancelled) setMode('error');
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, zoom, streetView, pano, heading, pitch]);

  // If the API key is missing or the script failed, use the keyless embed fallback.
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
            <p className="t-caption text-muted">{streetView ? 'Loading Street View…' : 'Loading map…'}</p>
          </div>
        </div>
      )}

      {/* Nearest-panorama notice (exact coverage not available) */}
      {mode === 'street' && coverage === 'nearest' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 mx-auto max-w-[90%]">
          <p className="rounded-ctl bg-warn px-3 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-[.06em] text-white shadow-lg">
            Street View unavailable at exact location · showing nearest
          </p>
        </div>
      )}

      {/* No-coverage notice (map fallback) */}
      {mode === 'map' && streetView && coverage === 'none' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 mx-auto max-w-[90%]">
          <p className="rounded-ctl bg-[rgba(9,20,38,.92)] px-3 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-[.06em] text-white shadow-lg">
            No Street View here · showing map view
          </p>
        </div>
      )}
    </div>
  );
};

export const LiveGoogleMap: React.FC<LiveGoogleMapProps> = (props) =>
  GOOGLE_MAPS_API_KEY ? <GoogleJsMap {...props} /> : <EmbedMap {...props} />;
