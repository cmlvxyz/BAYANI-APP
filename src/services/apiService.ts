/**
 * Bayani App - API Service Abstraction Layer
 */

import { WearableDeviceTelemetry } from './hardwareService';

export interface SOSEventPayload {
  deviceId: string;
  event: 'SOS' | 'CANCEL';
  latitude: number;
  longitude: number;
  battery: number;
  timestamp: string;
  audioStatus: string;
  wearerId?: string;
  stealthMode?: boolean;
}

export const apiService = {
  /**
   * Future HTTP POST to /api/sos
   */
  async postSOSEvent(payload: SOSEventPayload): Promise<{ success: boolean; incidentId: string }> {
    await new Promise((r) => setTimeout(r, 150));
    return {
      success: true,
      incidentId: `BA-2026-${String(Math.floor(Math.random() * 900) + 100)}`,
    };
  },

  /**
   * Future HTTP GET to /api/device/:id/telemetry
   */
  async getDeviceTelemetry(deviceId: string): Promise<Partial<WearableDeviceTelemetry>> {
    return {
      deviceId,
      battery: 82,
      gsmSignal: 'Strong',
      gpsFix: 'Locked',
    };
  },
};