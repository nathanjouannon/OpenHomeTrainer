import { toHex } from './bytes';
import { Emitter } from './emitter';

export interface BleLogEntry {
  /** Monotonic sequence number. */
  seq: number;
  /** performance.now() */
  t: number;
  /** Wall-clock time (ISO), useful when sharing logs. */
  at: string;
  dir: 'in' | 'out' | 'info' | 'error';
  device: string;
  characteristic?: string;
  hex?: string;
  decoded?: string;
}

/** Ring buffer of raw BLE frames, exportable as JSON to feed test fixtures. */
export class BleLog {
  private readonly entries: BleLogEntry[] = [];
  private seq = 0;
  private readonly changes = new Emitter<BleLogEntry>();

  constructor(
    private readonly capacity = 20_000,
    private readonly now: () => number = () => performance.now(),
  ) {}

  add(
    entry: Omit<BleLogEntry, 'seq' | 't' | 'at' | 'hex'> & { data?: DataView | Uint8Array },
  ): void {
    const { data, ...rest } = entry;
    const full: BleLogEntry = {
      seq: this.seq++,
      t: this.now(),
      at: new Date().toISOString(),
      ...rest,
      ...(data ? { hex: toHex(data) } : {}),
    };
    this.entries.push(full);
    if (this.entries.length > this.capacity) this.entries.shift();
    this.changes.emit(full);
  }

  onEntry(cb: (e: BleLogEntry) => void) {
    return this.changes.on(cb);
  }

  all(): readonly BleLogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }

  toJSON(meta: Record<string, unknown> = {}): string {
    return JSON.stringify({ format: 'hrt-ble-log/1', ...meta, entries: this.entries }, null, 2);
  }
}
