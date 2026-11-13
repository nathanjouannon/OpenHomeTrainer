// OpenBikeControl over Bluetooth (spec MIT: github.com/OpenBikeControl/openbikecontrol-protocol,
// PROTOCOL.md and BLE.md). Pure encoding and decoding, no Bluetooth here.

import type { InputEvent } from './events';

export const OBC_SERVICE = 'd273f680-d548-419d-b9d1-fa0472345229';
export const OBC_BUTTON_STATE = 'd273f681-d548-419d-b9d1-fa0472345229';
export const OBC_HAPTIC = 'd273f682-d548-419d-b9d1-fa0472345229';
export const OBC_APP_INFO = 'd273f683-d548-419d-b9d1-fa0472345229';

const MSG_BUTTON_STATE = 0x01;
const MSG_HAPTIC = 0x03;
const MSG_APP_INFO = 0x04;

export const OBC_SHIFT_UP = 0x01;
export const OBC_SHIFT_DOWN = 0x02;
export const OBC_DIFFICULTY_UP = 0x30;
export const OBC_DIFFICULTY_DOWN = 0x31;

export const obcControl = (id: number) => `button:0x${id.toString(16).padStart(2, '0')}`;

export interface ObcButtonChange {
  id: number;
  /** 0 released, 1 pressed, 2–255 analog value. */
  state: number;
}

/** Decodes a Button State notification; null when it is not one. */
export function parseButtonState(bytes: ArrayLike<number>): ObcButtonChange[] | null {
  if (bytes.length < 1 || bytes[0] !== MSG_BUTTON_STATE) return null;
  const out: ObcButtonChange[] = [];
  for (let i = 1; i + 1 < bytes.length; i += 2) {
    out.push({ id: bytes[i] as number, state: bytes[i + 1] as number });
  }
  return out;
}

/**
 * Keeps the state of every button of one controller and turns notifications
 * into press and release events.
 *
 * A controller may send several actions for one physical button (spec,
 * "Multiple Actions Per Button"): `[+ shift, + difficulty]`. Both would move
 * the target power in a workout, so when shift and difficulty are pressed in
 * the same notification, the difficulty ones are dropped.
 */
export class ObcButtonTracker {
  private readonly down = new Set<number>();

  constructor(private readonly deviceId: string) {}

  update(bytes: ArrayLike<number>): InputEvent[] {
    const changes = parseButtonState(bytes);
    if (!changes) return [];
    const pressedNow = changes.filter((c) => c.state !== 0);
    const hasShift = pressedNow.some((c) => c.id === OBC_SHIFT_UP || c.id === OBC_SHIFT_DOWN);
    const events: InputEvent[] = [];
    for (const { id, state } of changes) {
      // 0x01 is "not used" for gear selection and angles (spec): kept as a plain press elsewhere.
      const isDown = state !== 0;
      const wasDown = this.down.has(id);
      if (isDown === wasDown && !(isDown && state > 1)) continue;
      const droppedDuplicate =
        hasShift && isDown && (id === OBC_DIFFICULTY_UP || id === OBC_DIFFICULTY_DOWN);
      if (isDown) this.down.add(id);
      else this.down.delete(id);
      if (droppedDuplicate) continue;
      events.push({
        source: 'obc',
        deviceId: this.deviceId,
        control: obcControl(id),
        type: isDown ? 'press' : 'release',
        ...(state > 1 ? { value: state } : {}),
      });
    }
    return events;
  }

  /** Forgets everything (disconnection) and releases what was held. */
  reset(): InputEvent[] {
    const events = [...this.down].map(
      (id): InputEvent => ({
        source: 'obc',
        deviceId: this.deviceId,
        control: obcControl(id),
        type: 'release',
      }),
    );
    this.down.clear();
    return events;
  }
}

/** Message to write to App Information right after connecting. */
export function encodeAppInfo(
  appId: string,
  appVersion: string,
  buttons: readonly number[],
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const id = enc.encode(appId).slice(0, 32);
  const ver = enc.encode(appVersion).slice(0, 32);
  const out = new Uint8Array(5 + id.length + ver.length + buttons.length);
  let o = 0;
  out[o++] = MSG_APP_INFO;
  out[o++] = 0x01;
  out[o++] = id.length;
  out.set(id, o);
  o += id.length;
  out[o++] = ver.length;
  out.set(ver, o);
  o += ver.length;
  out[o++] = buttons.length;
  for (const b of buttons) out[o++] = b & 0xff;
  return out;
}

export const HAPTIC_PATTERNS = {
  stop: 0x00,
  short: 0x01,
  double: 0x02,
  triple: 0x03,
  long: 0x04,
  success: 0x05,
  warning: 0x06,
  error: 0x07,
} as const;

export type HapticPattern = keyof typeof HAPTIC_PATTERNS;

/** Haptic command; `durationMs` 0 and `intensity` 0 mean the controller's defaults. */
export function encodeHaptic(
  pattern: HapticPattern,
  durationMs = 0,
  intensity = 0,
): Uint8Array<ArrayBuffer> {
  const units = Math.max(0, Math.min(255, Math.round(durationMs / 10)));
  return Uint8Array.of(
    MSG_HAPTIC,
    HAPTIC_PATTERNS[pattern],
    units,
    Math.max(0, Math.min(255, Math.round(intensity))),
  );
}
