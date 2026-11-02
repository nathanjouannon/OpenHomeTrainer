import { clamp } from '@hrt/shared';
import { BleLog } from './ble-log';
import { Emitter } from './emitter';
import { encodeSetIndoorBikeSimulation, encodeSetTargetPower } from './ftms/control-point';
import type {
  ControllableTrainer,
  DeviceCapability,
  DeviceStatus,
  SensorReading,
  SimulationParams,
} from './types';

export interface SimulatedTrainerOptions {
  /** Reading rate, like a real trainer (FTMS notifies at 1–4 Hz). */
  readingIntervalMs?: number;
  initialPowerW?: number;
  baseCadenceRpm?: number;
  log?: BleLog;
  now?: () => number;
}

const POWER_STEP_W = 10;
const MAX_POWER_W = 2000;
/** ERG mode: fraction of the gap to the target closed per reading (smooth ramp). */
const ERG_RESPONSE = 0.35;

/**
 * Virtual trainer implementing the same interface as a real one.
 * The rider's power is set from the keyboard (or code); commands sent by the
 * app are logged as if they were real FTMS frames.
 */
export class SimulatedTrainer implements ControllableTrainer {
  readonly id = 'simulated-trainer';
  readonly name = 'Trainer simulé';
  readonly kind = 'simulated' as const;
  readonly capabilities = new Set<DeviceCapability>(['power', 'cadence', 'sim', 'erg']);
  readonly log: BleLog;

  private _status: DeviceStatus = 'disconnected';
  private readonly readings = new Emitter<SensorReading>();
  private readonly statuses = new Emitter<DeviceStatus>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly baseCadenceRpm: number;
  private readonly now: () => number;

  /** Power the rider is "producing" (set from the keyboard). */
  private riderPowerW: number;
  private currentPowerW: number;
  private gradePercent = 0;
  private ergTargetW: number | null = null;

  constructor(options: SimulatedTrainerOptions = {}) {
    this.intervalMs = options.readingIntervalMs ?? 250;
    this.riderPowerW = options.initialPowerW ?? 150;
    this.currentPowerW = this.riderPowerW;
    this.baseCadenceRpm = options.baseCadenceRpm ?? 90;
    this.now = options.now ?? (() => performance.now());
    this.log = options.log ?? new BleLog();
  }

  get status() {
    return this._status;
  }

  get mode(): 'sim' | 'erg' {
    return this.ergTargetW === null ? 'sim' : 'erg';
  }

  get targetPowerW() {
    return this.riderPowerW;
  }

  get currentGradePercent() {
    return this.gradePercent;
  }

  onReading(cb: (r: SensorReading) => void) {
    return this.readings.on(cb);
  }

  onStatus(cb: (s: DeviceStatus) => void) {
    return this.statuses.on(cb);
  }

  async connect(): Promise<void> {
    if (this.timer) return;
    this.setStatus('connecting');
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.setStatus('connected');
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setStatus('disconnected');
  }

  /** Sets the rider's power (SIM mode). */
  setRiderPower(watts: number): void {
    this.riderPowerW = clamp(Math.round(watts), 0, MAX_POWER_W);
  }

  /** Keyboard helper: +1 / -1 steps of 10 W. */
  adjustRiderPower(steps: number): void {
    this.setRiderPower(this.riderPowerW + steps * POWER_STEP_W);
  }

  async setSimulation(params: SimulationParams): Promise<void> {
    this.ergTargetW = null;
    this.gradePercent = params.gradePercent;
    this.logCommand(
      encodeSetIndoorBikeSimulation(params),
      `simulation: grade ${params.gradePercent} %`,
    );
  }

  async setTargetPower(watts: number): Promise<void> {
    this.ergTargetW = Math.max(0, watts);
    this.logCommand(encodeSetTargetPower(watts), `target power: ${watts} W`);
  }

  private logCommand(bytes: Uint8Array, decoded: string) {
    this.log.add({
      dir: 'out',
      device: this.name,
      characteristic: 'control point',
      data: bytes,
      decoded,
    });
  }

  private setStatus(s: DeviceStatus) {
    this._status = s;
    this.statuses.emit(s);
  }

  /** One reading. Public so tests can drive it without timers. */
  tick(): SensorReading {
    const target = this.ergTargetW ?? this.riderPowerW;
    this.currentPowerW +=
      (target - this.currentPowerW) * (this.ergTargetW === null ? 1 : ERG_RESPONSE);
    // "Feel" of SIM mode: a steeper felt grade lowers the cadence at the same power.
    const feltGrade = this.mode === 'sim' ? this.gradePercent : 0;
    const cadence =
      this.currentPowerW < 5 ? 0 : clamp(this.baseCadenceRpm - 2 * feltGrade, 50, 120);
    const reading: SensorReading = {
      timestamp: this.now(),
      powerW: Math.round(this.currentPowerW),
      cadenceRpm: Math.round(cadence),
    };
    this.readings.emit(reading);
    return reading;
  }
}
