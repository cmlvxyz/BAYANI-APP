import React, { useEffect, useRef, useState } from 'react';

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

  if (streetView) {
    const src = pano
      ? `https://www.google.com/maps?pano=${encodeURIComponent(pano)}&cbp=11,${heading ?? 0},${pitch ?? 0},0,0&output=svembed&hl=en`
      : `https://www.google.com/maps?cbll=${lat},${lng}&cbp=11,0,0,0,0&output=svembed&hl=en`;
    return (
      <iframe
        key={`sv-${pano || `${lat},${lng}`}`}
        title="Google Street View"
        src={src}
        className={frameCls}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <iframe
      key={`${lat},${lng}`}
      title="Google Maps"
      src={`https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&hl=en&ie=UTF8&iwloc=B&output=embed`}
      className={frameCls}
      loading="lazy"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
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
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 text-xs font-bold text-slate-500">
          Loading map…
        </div>
      )}

      {/* Nearest-panorama notice (exact coverage not available) */}
      {mode === 'street' && coverage === 'nearest' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[90%] text-center bg-amber-500 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
          Street View unavailable at exact location. Showing nearest available panorama.
        </div>
      )}

      {/* No-coverage notice (map fallback) */}
      {mode === 'map' && streetView && coverage === 'none' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[90%] text-center bg-slate-800/95 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
          Street View unavailable at this location. Showing map view.
        </div>
      )}
    </div>
  );
};

export const LiveGoogleMap: React.FC<LiveGoogleMapProps> = (props) =>
  GOOGLE_MAPS_API_KEY ? <GoogleJsMap {...props} /> : <EmbedMap {...props} />;
