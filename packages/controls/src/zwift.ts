// Zwift Click v2 over Bluetooth, as observed on the developer's own pair
// (docs/15 §1.4, spike 3.11). Pure decoding and tracking, no Bluetooth here.
// Only the clear-text button messages are read: no unlock, no encryption is
// touched (docs/11 §4).

import type { InputEvent } from './events';

export const ZWIFT_SERVICE = '0000fc82-0000-1000-8000-00805f9b34fb';
/** Notifications of the controller (buttons, battery). */
export const ZWIFT_NOTIFY = '00000002-19ca-4651-86e5-fa29dcdd09d1';
export const ZWIFT_COMPANY_ID = 0x094a;

/** Plain greeting the controller needs before it reports its buttons. */
export const ZWIFT_RIDE_ON: Uint8Array<ArrayBuffer> = new TextEncoder().encode('RideOn');

/** Bit of the button message → control name. Left unit 0-3 and 8, right unit 4-7 and 12. */
export const ZWIFT_BUTTON_BITS: Readonly<Record<number, string>> = {
  0: 'left',
  1: 'up',
  2: 'right',
  3: 'down',
  4: 'a',
  5: 'b',
  6: 'y',
  7: 'z',
  8: 'minus',
  12: 'plus',
};

export const zwiftControl = (name: string) => `button:${name}`;

const MSG_BUTTONS = 0x23;
const MSG_BUTTONS_FIELD = 0x08;
const MSG_BATTERY = 0x19;
const MSG_BATTERY_FIELD = 0x10;

/**
 * Names of the buttons held in a button message (`23 08 <varint>`, a bit at 0
 * means pressed; the varint carries 7 bits per byte). Null when it is not one.
 * Bits with no known button are ignored.
 */
export function parseZwiftButtons(bytes: ArrayLike<number>): string[] | null {
  if (bytes.length < 3 || bytes[0] !== MSG_BUTTONS || bytes[1] !== MSG_BUTTONS_FIELD) return null;
  let value = 0;
  for (let i = 2, shift = 0; i < bytes.length && shift < 28; i++, shift += 7) {
    const b = bytes[i] as number;
    value += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
  }
  const names: string[] = [];
  for (const [bit, name] of Object.entries(ZWIFT_BUTTON_BITS)) {
    if (Math.floor(value / 2 ** Number(bit)) % 2 === 0) names.push(name);
  }
  return names;
}

/** Battery percentage from `19 10 <%>`; null when it is not a battery message. */
export function parseZwiftBattery(bytes: ArrayLike<number>): number | null {
  if (bytes.length < 3 || bytes[0] !== MSG_BATTERY || bytes[1] !== MSG_BATTERY_FIELD) return null;
  const pct = bytes[2] as number;
  return pct <= 100 ? pct : null;
}

/**
 * Turns the button messages of every connected Click into press and release
 * events. The left Click relays the buttons of the right one, so with both
 * connected the same press arrives twice: each connection keeps its own state
 * and a button counts as held while at least one connection holds it, which
 * gives one press and one release.
 */
export class ZwiftButtonTracker {
  private readonly perConnection = new Map<string, Set<string>>();
  private readonly down = new Set<string>();

  constructor(private readonly deviceId = 'zwift') {}

  /** One button message from `connection`; a message with other content gives nothing. */
  update(connection: string, bytes: ArrayLike<number>): InputEvent[] {
    const held = parseZwiftButtons(bytes);
    if (!held) return [];
    this.perConnection.set(connection, new Set(held));
    return this.sync();
  }

  /** A connection is gone: what only it held is released. */
  drop(connection: string): InputEvent[] {
    this.perConnection.delete(connection);
    return this.sync();
  }

  private sync(): InputEvent[] {
    const now = new Set<string>();
    for (const held of this.perConnection.values()) for (const n of held) now.add(n);
    const events: InputEvent[] = [];
    for (const name of now) {
      if (this.down.has(name)) continue;
      this.down.add(name);
      events.push(this.event(name, 'press'));
    }
    for (const name of [...this.down]) {
      if (now.has(name)) continue;
      this.down.delete(name);
      events.push(this.event(name, 'release'));
    }
    return events;
  }

  private event(name: string, type: 'press' | 'release'): InputEvent {
    return { source: 'zwift', deviceId: this.deviceId, control: zwiftControl(name), type };
  }
}
