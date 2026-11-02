import { BleLog } from '../ble-log';
import { Emitter } from '../emitter';
import { GattQueue } from '../gatt-queue';
import {
  type ControllableTrainer,
  type DeviceCapability,
  DeviceError,
  type DeviceStatus,
  type SensorReading,
  type SimulationParams,
} from '../types';
import {
  type ControlPointResponse,
  encodeRequestControl,
  encodeSetIndoorBikeSimulation,
  encodeSetTargetPower,
  encodeSetTargetResistanceLevel,
  encodeStartOrResume,
  opCodeName,
  parseControlPointResponse,
  ResultCode,
} from './control-point';
import {
  type FitnessMachineFeatures,
  parseFitnessMachineFeature,
  parseSupportedPowerRange,
  parseSupportedResistanceRange,
  type SupportedRange,
} from './feature';
import { parseIndoorBikeData } from './indoor-bike-data';
import { describeFitnessMachineStatus, isControlPermissionLost } from './status';
import { CPS, FTMS, HRS } from './uuids';

const RESPONSE_TIMEOUT_MS = 3000;
const MAX_BACKOFF_MS = 30_000;

export interface FtmsTrainerInfo {
  features?: FitnessMachineFeatures;
  powerRange?: SupportedRange;
  resistanceRange?: SupportedRange;
}

type LastCommand = { kind: 'sim'; params: SimulationParams } | { kind: 'erg'; watts: number };

/** Smart trainer driven over Web Bluetooth with the Fitness Machine Service. */
export class FtmsTrainer implements ControllableTrainer {
  readonly kind = 'trainer' as const;
  readonly capabilities = new Set<DeviceCapability>(['power', 'cadence']);
  readonly info: FtmsTrainerInfo = {};

  private _status: DeviceStatus = 'disconnected';
  private readonly readings = new Emitter<SensorReading>();
  private readonly statuses = new Emitter<DeviceStatus>();
  private readonly queue = new GattQueue();
  private controlPoint: BluetoothRemoteGATTCharacteristic | null = null;
  private pendingResponse: ((r: ControlPointResponse) => void) | null = null;
  private manualDisconnect = false;
  private lastCommand: LastCommand | null = null;

  /** Opens the browser device picker. Must be called from a user gesture (click). */
  static async request(log?: BleLog): Promise<FtmsTrainer> {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      throw new DeviceError(
        'bluetooth-unavailable',
        'Web Bluetooth is not available (use Chrome or Edge on desktop).',
      );
    }
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS.service] }],
        optionalServices: [CPS.service, HRS.service],
      });
      return new FtmsTrainer(device, log);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'NotFoundError') {
        throw new DeviceError('user-cancelled', 'No device selected.', { cause });
      }
      throw new DeviceError('connection-failed', String(cause), { cause });
    }
  }

  constructor(
    private readonly device: BluetoothDevice,
    readonly log: BleLog = new BleLog(),
  ) {
    device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());
  }

  get id() {
    return this.device.id;
  }

  get name() {
    return this.device.name ?? 'FTMS trainer';
  }

  get status() {
    return this._status;
  }

  onReading(cb: (r: SensorReading) => void) {
    return this.readings.on(cb);
  }

  onStatus(cb: (s: DeviceStatus) => void) {
    return this.statuses.on(cb);
  }

  async connect(): Promise<void> {
    this.manualDisconnect = false;
    this.setStatus('connecting');
    try {
      await this.setup();
      this.setStatus('connected');
    } catch (cause) {
      this.setStatus('disconnected');
      if (cause instanceof DeviceError) throw cause;
      throw new DeviceError(
        'connection-failed',
        `Connection failed. Is another app (Zwift, manufacturer app) connected to the trainer? ${String(cause)}`,
        { cause },
      );
    }
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.device.gatt?.disconnect();
    this.setStatus('disconnected');
  }

  async setSimulation(params: SimulationParams): Promise<void> {
    this.lastCommand = { kind: 'sim', params };
    await this.command(encodeSetIndoorBikeSimulation(params));
  }

  async setTargetPower(watts: number): Promise<void> {
    this.lastCommand = { kind: 'erg', watts };
    await this.command(encodeSetTargetPower(watts));
  }

  async setResistance(level: number): Promise<void> {
    await this.command(encodeSetTargetResistanceLevel(level));
  }

  private setStatus(s: DeviceStatus) {
    if (s === this._status) return;
    this._status = s;
    this.log.add({ dir: 'info', device: this.name, decoded: `status: ${s}` });
    this.statuses.emit(s);
  }

  private async setup(): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new DeviceError('connection-failed', 'Device has no GATT server.');
    const server = await gatt.connect();
    const service = await server.getPrimaryService(FTMS.service).catch((cause) => {
      throw new DeviceError('service-not-found', 'Fitness Machine Service not found.', { cause });
    });

    const feature = await this.read(service, FTMS.feature, 'feature');
    if (feature) {
      this.info.features = parseFitnessMachineFeature(feature);
      const t = this.info.features.targetSettings;
      if (t.has('indoorBikeSimulation')) this.capabilities.add('sim');
      if (t.has('powerTarget')) this.capabilities.add('erg');
      if (t.has('resistanceTarget')) this.capabilities.add('resistance');
      if (this.info.features.machine.has('heartRate')) this.capabilities.add('heartRate');
    }
    const power = await this.read(service, FTMS.supportedPowerRange, 'power range');
    if (power) this.info.powerRange = parseSupportedPowerRange(power);
    const resistance = await this.read(
      service,
      FTMS.supportedResistanceLevelRange,
      'resistance range',
    );
    if (resistance) this.info.resistanceRange = parseSupportedResistanceRange(resistance);

    const bikeData = await service.getCharacteristic(FTMS.indoorBikeData);
    // Same listener reference on every (re)connection, so it is never registered twice.
    bikeData.addEventListener('characteristicvaluechanged', this.onBikeData);
    await this.queue.run(() => bikeData.startNotifications());

    const status = await service.getCharacteristic(FTMS.status).catch(() => null);
    if (status) {
      status.addEventListener('characteristicvaluechanged', this.onMachineStatus);
      await this.queue.run(() => status.startNotifications());
    }

    const controlPoint = await service.getCharacteristic(FTMS.controlPoint);
    controlPoint.addEventListener('characteristicvaluechanged', this.onControlPoint);
    await this.queue.run(() => controlPoint.startNotifications());
    this.controlPoint = controlPoint;

    await this.command(encodeRequestControl());
    await this.command(encodeStartOrResume());
  }

  private async read(
    service: BluetoothRemoteGATTService,
    uuid: number,
    label: string,
  ): Promise<DataView | null> {
    try {
      const characteristic = await service.getCharacteristic(uuid);
      const value = await this.queue.run(() => characteristic.readValue());
      this.log.add({ dir: 'in', device: this.name, characteristic: label, data: value });
      return value;
    } catch {
      this.log.add({ dir: 'info', device: this.name, decoded: `${label}: not available` });
      return null;
    }
  }

  /** Writes to the control point and waits for the trainer's response indication. */
  private command(bytes: Uint8Array<ArrayBuffer>): Promise<ControlPointResponse | null> {
    return this.queue.run(async () => {
      const cp = this.controlPoint;
      if (!cp) throw new DeviceError('not-connected', 'Trainer is not connected.');
      const op = bytes[0] ?? -1;
      this.log.add({
        dir: 'out',
        device: this.name,
        characteristic: 'control point',
        data: bytes,
        decoded: opCodeName(op),
      });
      const response = new Promise<ControlPointResponse | null>((resolve) => {
        const timer = setTimeout(() => {
          this.pendingResponse = null;
          this.log.add({
            dir: 'error',
            device: this.name,
            decoded: `${opCodeName(op)}: no response`,
          });
          resolve(null);
        }, RESPONSE_TIMEOUT_MS);
        this.pendingResponse = (r) => {
          clearTimeout(timer);
          resolve(r);
        };
      });
      await cp.writeValueWithResponse(bytes);
      const r = await response;
      if (r && r.resultCode === ResultCode.controlNotPermitted) {
        throw new DeviceError('control-not-permitted', 'The trainer refused control.');
      }
      if (r && !r.ok) throw new DeviceError('command-failed', r.description);
      return r;
    });
  }

  private readonly onBikeData = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    try {
      const d = parseIndoorBikeData(value);
      this.log.add({
        dir: 'in',
        device: this.name,
        characteristic: 'indoor bike data',
        data: value,
        decoded: JSON.stringify(d),
      });
      const reading: SensorReading = { timestamp: performance.now() };
      if (d.powerW !== undefined) reading.powerW = d.powerW;
      if (d.cadenceRpm !== undefined) reading.cadenceRpm = d.cadenceRpm;
      if (d.speedKmh !== undefined) reading.speedKmh = d.speedKmh;
      if (d.heartRateBpm !== undefined) reading.heartRateBpm = d.heartRateBpm;
      this.readings.emit(reading);
    } catch (err) {
      this.log.add({ dir: 'error', device: this.name, data: value, decoded: String(err) });
    }
  };

  private readonly onControlPoint = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const r = parseControlPointResponse(value);
    this.log.add({
      dir: 'in',
      device: this.name,
      characteristic: 'control point',
      data: value,
      decoded: r?.description ?? 'unexpected frame',
    });
    if (r && this.pendingResponse) {
      const resolve = this.pendingResponse;
      this.pendingResponse = null;
      resolve(r);
    }
  };

  private readonly onMachineStatus = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    this.log.add({
      dir: 'in',
      device: this.name,
      characteristic: 'machine status',
      data: value,
      decoded: describeFitnessMachineStatus(value),
    });
    if (isControlPermissionLost(value)) {
      // Another app took control: try to get it back.
      void this.command(encodeRequestControl()).catch(() => undefined);
    }
  };

  private async handleDisconnect() {
    this.controlPoint = null;
    if (this.manualDisconnect) return;
    this.setStatus('reconnecting');
    for (let delay = 1000; !this.manualDisconnect; delay = Math.min(delay * 2, MAX_BACKOFF_MS)) {
      await new Promise((r) => setTimeout(r, delay));
      if (this.manualDisconnect) return;
      try {
        await this.setup();
        this.setStatus('connected');
        await this.reapplyLastCommand();
        return;
      } catch (err) {
        this.log.add({
          dir: 'error',
          device: this.name,
          decoded: `reconnect failed: ${String(err)}`,
        });
      }
    }
  }

  private async reapplyLastCommand() {
    const last = this.lastCommand;
    if (last?.kind === 'sim') await this.setSimulation(last.params);
    if (last?.kind === 'erg') await this.setTargetPower(last.watts);
  }
}
