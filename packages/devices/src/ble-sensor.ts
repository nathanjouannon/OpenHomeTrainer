import { BleLog } from './ble-log';
import { CrankCadenceCalculator } from './cadence';
import { parseCyclingPowerMeasurement } from './cps';
import { Emitter } from './emitter';
import { CPS, HRS } from './ftms/uuids';
import { GattQueue } from './gatt-queue';
import { parseHeartRateMeasurement } from './hrs';
import {
  type Device,
  type DeviceCapability,
  DeviceError,
  type DeviceKind,
  type DeviceStatus,
  type SensorReading,
} from './types';

const MAX_BACKOFF_MS = 30_000;

interface SensorProfile {
  kind: Extract<DeviceKind, 'heartrate' | 'power'>;
  service: number;
  measurement: number;
  capabilities: DeviceCapability[];
  label: string;
}

const PROFILES = {
  heartrate: {
    kind: 'heartrate',
    service: HRS.service,
    measurement: HRS.measurement,
    capabilities: ['heartRate'],
    label: 'heart rate',
  },
  power: {
    kind: 'power',
    service: CPS.service,
    measurement: CPS.measurement,
    capabilities: ['power', 'cadence'],
    label: 'cycling power',
  },
} as const satisfies Record<string, SensorProfile>;

export type BleSensorType = keyof typeof PROFILES;

/** Opens the browser device picker for a sensor type. Must be called from a user gesture. */
export async function requestBluetoothDevice(services: number[]): Promise<BluetoothDevice> {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new DeviceError(
      'bluetooth-unavailable',
      'Web Bluetooth is not available (use Chrome or Edge on desktop).',
    );
  }
  try {
    return await navigator.bluetooth.requestDevice({
      filters: services.map((s) => ({ services: [s] })),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'NotFoundError') {
      throw new DeviceError('user-cancelled', 'No device selected.', { cause });
    }
    throw new DeviceError('connection-failed', String(cause), { cause });
  }
}

/**
 * Notify-only Bluetooth sensor (heart rate belt, power meter), with automatic
 * reconnection and exponential backoff.
 */
export class BleSensor implements Device {
  readonly kind: DeviceKind;
  readonly capabilities: ReadonlySet<DeviceCapability>;
  private _status: DeviceStatus = 'disconnected';
  private readonly readings = new Emitter<SensorReading>();
  private readonly statuses = new Emitter<DeviceStatus>();
  private readonly queue = new GattQueue();
  private readonly cadence = new CrankCadenceCalculator();
  private manualDisconnect = false;
  private readonly profile: SensorProfile;

  static async request(type: BleSensorType, log?: BleLog): Promise<BleSensor> {
    const device = await requestBluetoothDevice([PROFILES[type].service]);
    return new BleSensor(device, type, log);
  }

  constructor(
    private readonly device: BluetoothDevice,
    type: BleSensorType,
    readonly log: BleLog = new BleLog(),
  ) {
    this.profile = PROFILES[type];
    this.kind = this.profile.kind;
    this.capabilities = new Set(this.profile.capabilities);
    device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());
  }

  get id() {
    return this.device.id;
  }

  get name() {
    return this.device.name ?? this.profile.label;
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
      throw new DeviceError('connection-failed', `Connection failed: ${String(cause)}`, { cause });
    }
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.device.gatt?.disconnect();
    this.setStatus('disconnected');
  }

  private setStatus(s: DeviceStatus) {
    if (s === this._status) return;
    this._status = s;
    this.log.add({ dir: 'info', device: this.name, decoded: `status: ${s}` });
    this.statuses.emit(s);
  }

  private async setup() {
    const gatt = this.device.gatt;
    if (!gatt) throw new DeviceError('connection-failed', 'Device has no GATT server.');
    const server = await gatt.connect();
    const service = await server.getPrimaryService(this.profile.service).catch((cause) => {
      throw new DeviceError('service-not-found', `${this.profile.label} service not found.`, {
        cause,
      });
    });
    const measurement = await service.getCharacteristic(this.profile.measurement);
    measurement.addEventListener('characteristicvaluechanged', this.onMeasurement);
    await this.queue.run(() => measurement.startNotifications());
  }

  private readonly onMeasurement = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const now = performance.now();
    try {
      const reading: SensorReading = { timestamp: now };
      if (this.kind === 'heartrate') {
        reading.heartRateBpm = parseHeartRateMeasurement(value);
      } else {
        const m = parseCyclingPowerMeasurement(value);
        reading.powerW = m.powerW;
        if (m.crankRevolutions !== undefined && m.lastCrankEventTime !== undefined) {
          reading.cadenceRpm = this.cadence.update(m.crankRevolutions, m.lastCrankEventTime, now);
        }
      }
      this.log.add({
        dir: 'in',
        device: this.name,
        characteristic: this.profile.label,
        data: value,
        decoded: JSON.stringify(reading),
      });
      this.readings.emit(reading);
    } catch (err) {
      this.log.add({ dir: 'error', device: this.name, data: value, decoded: String(err) });
    }
  };

  private async handleDisconnect() {
    if (this.manualDisconnect) return;
    this.setStatus('reconnecting');
    for (let delay = 1000; !this.manualDisconnect; delay = Math.min(delay * 2, MAX_BACKOFF_MS)) {
      await new Promise((r) => setTimeout(r, delay));
      if (this.manualDisconnect) return;
      try {
        await this.setup();
        this.setStatus('connected');
        return;
      } catch (err) {
        this.log.add({ dir: 'error', device: this.name, decoded: `reconnect failed: ${err}` });
      }
    }
  }
}

/**
 * Previously authorized devices (Chrome: needs the "Web Bluetooth new
 * permissions backend"). Returns [] when the API is not available.
 */
export async function getAuthorizedDevices(): Promise<BluetoothDevice[]> {
  const bt = typeof navigator !== 'undefined' ? navigator.bluetooth : undefined;
  if (!bt || typeof bt.getDevices !== 'function') return [];
  try {
    return await bt.getDevices();
  } catch {
    return [];
  }
}
