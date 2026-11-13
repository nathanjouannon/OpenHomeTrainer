// OpenBikeControl controller over Web Bluetooth: the game is the "central", the
// controller the "peripheral" (docs/15 §4.5). Reconnects by itself while the
// page stays open, like the trainer does.

import {
  encodeAppInfo,
  encodeHaptic,
  type HapticPattern,
  type InputHub,
  OBC_APP_INFO,
  OBC_BUTTON_STATE,
  OBC_HAPTIC,
  OBC_SERVICE,
  OBC_SUPPORTED_BUTTONS,
  ObcButtonTracker,
} from '@hrt/controls';

export type ObcStatus = 'disconnected' | 'connecting' | 'connected';

const APP_ID = 'homerealtrainer';
const APP_VERSION = '0.1.0';
const MAX_BACKOFF_MS = 30_000;

export class ObcController {
  private _status: ObcStatus = 'disconnected';
  private readonly tracker: ObcButtonTracker;
  private haptic: BluetoothRemoteGATTCharacteristic | null = null;
  private manualDisconnect = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private lastPayload = 0;

  constructor(
    readonly device: BluetoothDevice,
    private readonly hub: InputHub,
    private readonly onStatus: () => void,
  ) {
    this.tracker = new ObcButtonTracker(device.id);
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
  }

  get id() {
    return this.device.id;
  }

  get name() {
    return this.device.name ?? 'OpenBikeControl';
  }

  get status() {
    return this._status;
  }

  /** True once a controller gave a haptic characteristic. */
  get hasHaptic() {
    return this.haptic !== null;
  }

  /** Milliseconds since the last button message, to show the link is alive. */
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

  /** Vibration on the controller; ignored when it has none. */
  async buzz(pattern: HapticPattern = 'short', durationMs = 0, intensity = 0): Promise<void> {
    if (!this.haptic) return;
    try {
      await this.haptic.writeValueWithoutResponse(encodeHaptic(pattern, durationMs, intensity));
    } catch {
      // A failed vibration never matters more than the ride.
    }
  }

  private async setup(): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new Error('No GATT server on this device.');
    const server = await gatt.connect();
    const service = await server.getPrimaryService(OBC_SERVICE);
    const buttons = await service.getCharacteristic(OBC_BUTTON_STATE);
    buttons.addEventListener('characteristicvaluechanged', this.onValue);
    await buttons.startNotifications();
    // Optional characteristics: tell the controller what the game understands,
    // and keep the haptic one for shift feedback.
    try {
      const info = await service.getCharacteristic(OBC_APP_INFO);
      await info.writeValueWithoutResponse(
        encodeAppInfo(APP_ID, APP_VERSION, OBC_SUPPORTED_BUTTONS),
      );
    } catch {
      // Controllers without App Information still work (spec: devices assume all buttons).
    }
    try {
      this.haptic = await service.getCharacteristic(OBC_HAPTIC);
    } catch {
      this.haptic = null;
    }
  }

  private readonly onValue = (e: Event) => {
    const dv = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!dv) return;
    this.lastPayload = Date.now();
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    for (const ev of this.tracker.update(bytes)) this.hub.handle(ev);
  };

  private readonly onDisconnected = () => {
    this.release();
    this.haptic = null;
    if (this.manualDisconnect) return;
    this.setStatus('connecting');
    this.scheduleReconnect();
  };

  /** A controller that vanishes must not leave a button held (a repeating shift). */
  private release() {
    for (const ev of this.tracker.reset()) this.hub.handle(ev);
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

  private setStatus(s: ObcStatus) {
    if (this._status === s) return;
    this._status = s;
    this.onStatus();
  }
}

class ObcRegistry {
  private readonly controllers = new Map<string, ObcController>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly hub: InputHub) {}

  get list(): readonly ObcController[] {
    return [...this.controllers.values()];
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Opens the browser picker (must come from a click) and connects the chosen controller. */
  async pair(): Promise<ObcController> {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      throw new Error('bluetooth-unavailable');
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [OBC_SERVICE] }],
    });
    this.controllers.get(device.id)?.disconnect();
    const c = new ObcController(device, this.hub, () => this.emit());
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

  /** Vibrates every connected controller (confirmation of a shift). */
  buzzAll(pattern: HapticPattern = 'short'): void {
    for (const c of this.controllers.values()) {
      if (c.status === 'connected') void c.buzz(pattern);
    }
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const createObcRegistry = (hub: InputHub) => new ObcRegistry(hub);
export type { ObcRegistry };
