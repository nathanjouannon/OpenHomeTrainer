// Connected devices, by role, shared by every screen (lot 1.1).

import {
  BleLog,
  BleSensor,
  type Device,
  DeviceError,
  type DeviceErrorCode,
  type DeviceStatus,
  FtmsTrainer,
  getAuthorizedDevices,
  isControllableTrainer,
  type SensorReading,
  SimulatedHeartRateMonitor,
  SimulatedTrainer,
} from '@hrt/devices';
import { useSyncExternalStore } from 'react';
import { getSettings } from './settings';

export type Role = 'trainer' | 'heartrate' | 'powermeter';
export const ROLES: Role[] = ['trainer', 'heartrate', 'powermeter'];

export interface Slot {
  device: Device | null;
  status: DeviceStatus;
  error: DeviceErrorCode | null;
  last: SensorReading | null;
  simulated: boolean;
}

interface RememberedDevice {
  role: Role;
  id: string;
  name: string;
}

const REMEMBER_KEY = 'hrt.devices.v1';

const emptySlot = (): Slot => ({
  device: null,
  status: 'disconnected',
  error: null,
  last: null,
  simulated: false,
});

class DeviceHub {
  readonly log = new BleLog();
  private slots: Record<Role, Slot> = {
    trainer: emptySlot(),
    heartrate: emptySlot(),
    powermeter: emptySlot(),
  };
  private readonly unsubs: Partial<Record<Role, (() => void)[]>> = {};
  private readonly readingListeners = new Set<(role: Role, r: SensorReading) => void>();
  private readonly changeListeners = new Set<() => void>();
  private snapshot = { ...this.slots };

  get bluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  getSlots = (): Readonly<Record<Role, Slot>> => this.snapshot;

  /** Latest reading of a role (not part of the React snapshot, read it by polling). */
  lastReading(role: Role): SensorReading | null {
    return this.slots[role].last;
  }

  subscribe = (cb: () => void) => {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  };

  /** Readings of every connected device (the ride session listens here). */
  onReading(cb: (role: Role, r: SensorReading) => void): () => void {
    this.readingListeners.add(cb);
    return () => this.readingListeners.delete(cb);
  }

  private changed() {
    this.snapshot = { ...this.slots };
    for (const cb of this.changeListeners) cb();
  }

  private patch(role: Role, p: Partial<Slot>) {
    this.slots[role] = { ...this.slots[role], ...p };
    this.changed();
  }

  get simulatedTrainer(): SimulatedTrainer | null {
    const d = this.slots.trainer.device;
    return d instanceof SimulatedTrainer ? d : null;
  }

  get controllableTrainer() {
    const d = this.slots.trainer.device;
    return d && isControllableTrainer(d) ? d : null;
  }

  private async attach(role: Role, device: Device, simulated: boolean) {
    await this.detach(role);
    this.patch(role, { device, status: device.status, error: null, last: null, simulated });
    this.unsubs[role] = [
      device.onReading((r) => {
        this.slots[role] = { ...this.slots[role], last: r };
        for (const cb of this.readingListeners) cb(role, r);
      }),
      device.onStatus((status) => this.patch(role, { status })),
    ];
    try {
      await device.connect();
      if (!simulated) this.remember({ role, id: device.id, name: device.name });
    } catch (err) {
      this.patch(role, { error: err instanceof DeviceError ? err.code : 'connection-failed' });
      await this.detach(role);
      throw err;
    }
  }

  private async detach(role: Role) {
    for (const off of this.unsubs[role] ?? []) off();
    this.unsubs[role] = [];
    const d = this.slots[role].device;
    if (d) await d.disconnect().catch(() => undefined);
    this.patch(role, { device: null, status: 'disconnected', last: null, simulated: false });
  }

  async connectBluetooth(role: Role): Promise<void> {
    try {
      const device =
        role === 'trainer'
          ? await FtmsTrainer.request(this.log)
          : await BleSensor.request(role === 'heartrate' ? 'heartrate' : 'power', this.log);
      await this.attach(role, device, false);
    } catch (err) {
      this.patch(role, { error: err instanceof DeviceError ? err.code : 'connection-failed' });
    }
  }

  async connectSimulated(role: Role): Promise<void> {
    if (role === 'powermeter') return;
    const ftp = getSettings().profile.ftpW ?? 200;
    const device =
      role === 'trainer'
        ? new SimulatedTrainer({ initialPowerW: Math.round((ftp * 0.7) / 10) * 10, log: this.log })
        : new SimulatedHeartRateMonitor(() => this.slots.trainer.last?.powerW ?? 0, { ftpW: ftp });
    await this.attach(role, device, true);
  }

  async disconnect(role: Role): Promise<void> {
    await this.detach(role);
  }

  remembered(): RememberedDevice[] {
    try {
      return JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '[]') as RememberedDevice[];
    } catch {
      return [];
    }
  }

  private remember(d: RememberedDevice) {
    const list = this.remembered().filter((x) => x.role !== d.role);
    list.push(d);
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(list));
    this.changed();
  }

  forget(role: Role): void {
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify(this.remembered().filter((x) => x.role !== role)),
    );
    void this.detach(role);
  }

  /**
   * Reconnects a remembered device without the picker when the browser allows
   * it (getDevices); otherwise opens the picker.
   */
  async reconnect(role: Role): Promise<void> {
    const saved = this.remembered().find((d) => d.role === role);
    const known = saved ? (await getAuthorizedDevices()).find((d) => d.id === saved.id) : undefined;
    if (!known) return this.connectBluetooth(role);
    const device =
      role === 'trainer'
        ? new FtmsTrainer(known, this.log)
        : new BleSensor(known, role === 'heartrate' ? 'heartrate' : 'power', this.log);
    await this.attach(role, device, false).catch(() => undefined);
  }

  /** At least one source of power is connected. */
  get hasPowerSource(): boolean {
    return (
      this.slots.trainer.status === 'connected' || this.slots.powermeter.status === 'connected'
    );
  }
}

export const deviceHub = new DeviceHub();

export function useDevices(): Readonly<Record<Role, Slot>> {
  return useSyncExternalStore(deviceHub.subscribe, deviceHub.getSlots, deviceHub.getSlots);
}
