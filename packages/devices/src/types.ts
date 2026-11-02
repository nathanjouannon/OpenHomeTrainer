import type { Unsubscribe } from '@hrt/shared';

export interface SensorReading {
  powerW?: number;
  cadenceRpm?: number;
  heartRateBpm?: number;
  /** Speed reported by the device (informative only, never used by the physics). */
  speedKmh?: number;
  /** performance.now() at reception. */
  timestamp: number;
}

export type DeviceKind = 'trainer' | 'power' | 'heartrate' | 'cadence' | 'simulated';
export type DeviceCapability = 'power' | 'cadence' | 'heartRate' | 'sim' | 'erg' | 'resistance';
export type DeviceStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface Device {
  readonly id: string;
  readonly name: string;
  readonly kind: DeviceKind;
  readonly capabilities: ReadonlySet<DeviceCapability>;
  readonly status: DeviceStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onReading(cb: (r: SensorReading) => void): Unsubscribe;
  onStatus(cb: (s: DeviceStatus) => void): Unsubscribe;
}

export interface SimulationParams {
  gradePercent: number;
  windSpeedMs?: number;
  crr?: number;
  /** Wind resistance coefficient, in kg/m. */
  cwKgM?: number;
}

export interface ControllableTrainer extends Device {
  setSimulation(p: SimulationParams): Promise<void>;
  setTargetPower(watts: number): Promise<void>;
  setResistance?(levelPercent: number): Promise<void>;
}

export const isControllableTrainer = (d: Device): d is ControllableTrainer =>
  'setSimulation' in d && 'setTargetPower' in d;

export type DeviceErrorCode =
  | 'bluetooth-unavailable'
  | 'user-cancelled'
  | 'service-not-found'
  | 'connection-failed'
  | 'control-not-permitted'
  | 'command-failed'
  | 'not-connected';

/** Typed hardware error; `code` maps to a translated user message. */
export class DeviceError extends Error {
  constructor(
    readonly code: DeviceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DeviceError';
  }
}
