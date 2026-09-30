/**
 * Bayani Alert - Hardware & Hardware Simulation Service
 */

export interface WearableDeviceTelemetry {
  deviceId: string;
  event: 'IDLE' | 'SOS';
  latitude: number;
  longitude: number;
  /** Horizontal accuracy (meters) of the last GPS fix; 0 when unknown. */
  locationAccuracy: number;
  /** ISO-8601 timestamp when the last GPS fix was captured. */
  locationTimestamp: string | null;
  /** Origin of the coordinates currently held by the hardware. */
  locationSource: 'gps' | 'ip' | 'override';
  locationName: string;
  barangay: string;
  city: string;
  battery: number;
  timestamp: string;
  audioStatus: 'ready' | 'recording' | 'stored';
  gsmSignal: 'Strong' | 'Moderate' | 'Weak' | 'Offline';
  gpsFix: 'Locked' | 'Searching' | 'Acquired';
  bleConnected: boolean;
  stealthMode: boolean;
}

export const DEFAULT_WEARABLE_STATE: WearableDeviceTelemetry = {
  deviceId: 'BA-001',
  event: 'IDLE',
  latitude: 0,
  longitude: 0,
  locationAccuracy: 0,
  locationTimestamp: null,
  locationSource: 'gps',
  locationName: '',
  barangay: '',
  city: '',
  battery: 82,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  audioStatus: 'ready',
  gsmSignal: 'Strong',
  gpsFix: 'Locked',
  bleConnected: true,
  stealthMode: false,
};

export interface LocationOverride {
  lat: number;
  lng: number;
  label: string;
  city: string;
  barangay: string;
  address: string;
  /** Optional exact Google Street View panorama id + view orientation. */
  pano?: string;
  heading?: number;
  pitch?: number;
}

export const BALANGA_LOCATION: LocationOverride = {
  lat: 14.6781,
  lng: 120.5439,
  label: 'Balanga City',
  city: 'Balanga City',
  barangay: 'Bataan',
  address: 'Apcas School, Balanga City, Bataan',
};

type HardwareListener = (telemetry: WearableDeviceTelemetry) => void;

class HardwareService {
  private telemetry: WearableDeviceTelemetry = { ...DEFAULT_WEARABLE_STATE };
  private listeners: HardwareListener[] = [];
  private override: LocationOverride | null = null;

  public getTelemetry(): WearableDeviceTelemetry {
    return { ...this.telemetry };
  }

  public getLocationOverride(): LocationOverride | null {
    return this.override ? { ...this.override } : null;
  }

  public setLocationOverride(override: LocationOverride | null) {
    this.override = override;
    if (override) {
      this.telemetry = {
        ...this.telemetry,
        latitude: override.lat,
        longitude: override.lng,
        locationName: override.address || override.label,
        barangay: override.barangay,
        city: override.city,
        locationAccuracy: 0,
        locationTimestamp: new Date().toISOString(),
        locationSource: 'override',
      };
    }
    this.notify();
  }

  public subscribe(listener: HardwareListener): () => void {
    this.listeners.push(listener);
    listener(this.telemetry);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.telemetry });
    }
  }

  public simulateHardwareSOS(coords?: {
    lat: number;
    lng: number;
    label?: string;
    address?: string;
    city?: string;
    region?: string;
    accuracy?: number;
    gpsTimestamp?: string;
    source?: 'gps' | 'ip' | 'override';
  }): WearableDeviceTelemetry {
    this.telemetry = {
      ...this.telemetry,
      event: 'SOS',
      latitude: coords ? coords.lat : (this.override ? this.override.lat : this.telemetry.latitude),
      longitude: coords ? coords.lng : (this.override ? this.override.lng : this.telemetry.longitude),
      locationName: coords?.address ?? coords?.label ?? (this.override?.address ?? (this.override?.label ?? this.telemetry.locationName)),
      barangay: coords?.region ?? (this.override?.barangay ?? this.telemetry.barangay),
      city: coords?.city ?? (this.override?.city ?? this.telemetry.city),
      locationAccuracy: typeof coords?.accuracy === 'number' ? Math.max(0, coords.accuracy) : this.telemetry.locationAccuracy,
      locationTimestamp: coords?.gpsTimestamp ?? new Date().toISOString(),
      locationSource: coords?.source ?? 'gps',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      audioStatus: 'recording',
      gpsFix: 'Acquired',
    };
    this.notify();
    return { ...this.telemetry };
  }

  public resetHardware(): WearableDeviceTelemetry {
    this.telemetry = {
      ...this.telemetry,
      event: 'IDLE',
      audioStatus: 'ready',
    };
    this.notify();
    return { ...this.telemetry };
  }

  public setStealthMode(enabled: boolean) {
    this.telemetry = {
      ...this.telemetry,
      stealthMode: enabled,
    };
    this.notify();
  }
}

export const hardwareService = new HardwareService();