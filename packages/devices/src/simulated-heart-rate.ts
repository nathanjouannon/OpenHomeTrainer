import { Emitter } from './emitter';
import type { Device, DeviceCapability, DeviceStatus, SensorReading } from './types';

/**
 * Heart rate belt for development: the heart rate drifts towards a value
 * derived from the power the rider produces (slow, like a real heart).
 */
export class SimulatedHeartRateMonitor implements Device {
  readonly id = 'simulated-heart-rate';
  readonly name = 'Cardio simulé';
  readonly kind = 'heartrate' as const;
  readonly capabilities = new Set<DeviceCapability>(['heartRate']);
  private _status: DeviceStatus = 'disconnected';
  private readonly readings = new Emitter<SensorReading>();
  private readonly statuses = new Emitter<DeviceStatus>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private hr = 70;

  constructor(
    private readonly powerW: () => number,
    private readonly options: { restBpm?: number; maxBpm?: number; ftpW?: number } = {},
  ) {}

  get status() {
    return this._status;
  }

  onReading(cb: (r: SensorReading) => void) {
    return this.readings.on(cb);
  }

  onStatus(cb: (s: DeviceStatus) => void) {
    return this.statuses.on(cb);
  }

  async connect() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(1), 1000);
    this._status = 'connected';
    this.statuses.emit('connected');
  }

  async disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._status = 'disconnected';
    this.statuses.emit('disconnected');
  }

  /** One reading after `dtS` seconds. Public for tests. */
  tick(dtS: number): SensorReading {
    const rest = this.options.restBpm ?? 60;
    const max = this.options.maxBpm ?? 185;
    const ftp = this.options.ftpW ?? 250;
    const target = rest + (max - rest) * Math.min(1, 0.15 + (0.75 * this.powerW()) / ftp);
    // Time constant ~30 s.
    this.hr += (target - this.hr) * (1 - Math.exp(-dtS / 30));
    const reading = { timestamp: performance.now(), heartRateBpm: Math.round(this.hr) };
    this.readings.emit(reading);
    return reading;
  }
}
