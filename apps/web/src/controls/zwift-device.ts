// Zwift Click v2 over Web Bluetooth (lot 3.11, docs/15 §1.4). The game is the
// "central". The Click sends nothing until it is greeted with "RideOn", so the
// greeting is sent after every (re)connection. Only the clear-text button and
// battery messages are used; the key exchange the Click also sends is ignored.
// One connection per Click; the left Click relays the right one, so a single
// connection already carries every button (the tracker removes duplicates).

import {
  type InputHub,
  parseZwiftBattery,
  ZWIFT_COMPANY_ID,
  ZWIFT_NOTIFY,
  ZWIFT_RIDE_ON,
  ZWIFT_SERVICE,
  ZwiftButtonTracker,
} from '@hrt/controls';

export type ZwiftStatus = 'disconnected' | 'connecting' | 'connected';

const MAX_BACKOFF_MS = 30_000;

export class ZwiftController {
  private _status: ZwiftStatus = 'disconnected';
  private _battery: number | null = null;
  private manualDisconnect = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private lastPayload = 0;

  constructor(
    readonly device: BluetoothDevice,
    private readonly tracker: ZwiftButtonTracker,
    private readonly hub: InputHub,
    private readonly onStatus: () => void,
  ) {
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
  }

  get id() {
    return this.device.id;
  }

  get name() {
    return this.device.name ?? 'Zwift Click';
  }

  get status() {
    return this._status;
  }

  /** Battery percentage reported by the Click, null until it says so. */
  get battery() {
    return this._battery;
  }

  /** Date of the last message of the Click, to show the link is alive. */
  get lastMessageAt() {
    return this.lastPayload;
  }

  async connect(): Promise<void> {
    this.manualDisconnect = false;
    this.setStatus('connecting');
    try {
      await this.setup();
      this.attempt = 0;
      this.setStatus('connected');
    } catch (cause) {
      this.setStatus('disconnected');
      throw cause;
    }
  }

  disconnect(): void {
    this.manualDisconnect = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.device.gatt?.connected) this.device.gatt.disconnect();
    this.release();
    this.setStatus('disconnected');
  }

  private async setup(): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new Error('No GATT server on this device.');
    const server = await gatt.connect();
    const service = await server.getPrimaryService(ZWIFT_SERVICE);
    const writable: BluetoothRemoteGATTCharacteristic[] = [];
    // Same sequence as the spike that worked on the real pair: listen to every
    // notifying characteristic first, then greet on every writable one.
    for (const c of await service.getCharacteristics()) {
      if (c.properties.notify || c.properties.indicate) {
        if (c.uuid === ZWIFT_NOTIFY) c.addEventListener('characteristicvaluechanged', this.onValue);
        await c.startNotifications();
      }
      if (c.properties.write || c.properties.writeWithoutResponse) writable.push(c);
    }
    // The standard battery service is optional: the 0x2A19 reading only
    // complements the battery message of the main characteristic.
    try {
      const battery = await (await server.getPrimaryService('battery_service')).getCharacteristic(
        'battery_level',
      );
      battery.addEventListener('characteristicvaluechanged', this.onBattery);
      await battery.startNotifications();
      const first = await battery.readValue();
      this.setBattery(first.getUint8(0));
    } catch {
      // No battery service: the percentage stays unknown.
    }
    for (const c of writable) await c.writeValueWithoutResponse(ZWIFT_RIDE_ON);
  }

  private readonly onValue = (e: Event) => {
    const dv = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!dv) return;
    this.lastPayload = Date.now();
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    const pct = parseZwiftBattery(bytes);
    if (pct !== null) this.setBattery(pct);
    for (const ev of this.tracker.update(this.id, bytes)) this.hub.handle(ev);
  };

  private readonly onBattery = (e: Event) => {
    const dv = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (dv && dv.byteLength > 0) {
      this.lastPayload = Date.now();
      this.setBattery(dv.getUint8(0));
    }
  };

  private readonly onDisconnected = () => {
    this.release();
    if (this.manualDisconnect) return;
    this.setStatus('connecting');
    this.scheduleReconnect();
  };

  /** A Click that vanishes must not leave a button held (a repeating shift). */
  private release() {
    for (const ev of this.tracker.drop(this.id)) this.hub.handle(ev);
  }

  private scheduleReconnect() {
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.setup().then(
        () => {
          this.attempt = 0;
          this.setStatus('connected');
        },
        () => {
          if (!this.manualDisconnect) this.scheduleReconnect();
        },
      );
    }, delay);
  }

  private setBattery(pct: number) {
    if (pct > 100 || this._battery === pct) return;
    this._battery = pct;
    this.onStatus();
  }

  private setStatus(s: ZwiftStatus) {
    if (this._status === s) return;
    this._status = s;
    this.onStatus();
  }
}

class ZwiftRegistry {
  private readonly controllers = new Map<string, ZwiftController>();
  private readonly listeners = new Set<() => void>();
  private readonly tracker = new ZwiftButtonTracker();

  constructor(private readonly hub: InputHub) {}

  private snapshot: readonly ZwiftController[] = [];

  /** Same array until something changes: React compares it with Object.is. */
  get list(): readonly ZwiftController[] {
    return this.snapshot;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Opens the browser picker (must come from a click) and connects the chosen Click. */
  async pair(): Promise<ZwiftController> {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      throw new Error('bluetooth-unavailable');
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'Zwift' },
        { manufacturerData: [{ companyIdentifier: ZWIFT_COMPANY_ID }] },
      ],
      optionalServices: [ZWIFT_SERVICE, 'battery_service', 'device_information'],
    });
    this.controllers.get(device.id)?.disconnect();
    const c = new ZwiftController(device, this.tracker, this.hub, () => this.emit());
    this.controllers.set(device.id, c);
    this.emit();
    await c.connect();
    return c;
  }

  forget(id: string): void {
    this.controllers.get(id)?.disconnect();
    this.controllers.delete(id);
    this.emit();
  }

  private emit() {
    this.snapshot = [...this.controllers.values()];
    for (const l of this.listeners) l();
  }
}

export const createZwiftRegistry = (hub: InputHub) => new ZwiftRegistry(hub);
export type { ZwiftRegistry };
