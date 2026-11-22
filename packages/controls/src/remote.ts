// Smartphone remote: the protocol between the companion page on the phone, the
// local relay (apps/api) and the game (lot 3.10). Pure, no DOM, no network.

import type { InputEvent } from './events';

/** Big buttons of the companion page; each one is a control of source `remote`. */
export const REMOTE_BUTTONS = [
  'shiftUp',
  'shiftDown',
  'shiftFrontUp',
  'shiftFrontDown',
  'ergUp',
  'ergDown',
  'ergUp10',
  'ergDown10',
  'pause',
  'cameraNext',
  'lap',
  'intervalNext',
] as const;

export type RemoteButton = (typeof REMOTE_BUTTONS)[number];

export const isRemoteButton = (v: unknown): v is RemoteButton =>
  typeof v === 'string' && (REMOTE_BUTTONS as readonly string[]).includes(v);

/** Room identifiers are the only secret of the link: 128 random bits in hex. */
export const ROOM_ID_PATTERN = /^[0-9a-f]{32}$/;

/** Phone → relay. */
export type PhoneMessage = { t: 'press' | 'release'; b: RemoteButton };

/** Relay → game. `r` names the phone that sent it. */
export type HostMessage =
  | { t: 'press' | 'release'; b: RemoteButton; r: string }
  | { t: 'left'; r: string }
  | { t: 'peers'; remotes: number };

/** Game → phone (relayed), or relay → phone. */
export type RemoteNotice = { t: 'buzz' } | { t: 'peers'; hosts: number };

const parseJson = (raw: string): Record<string, unknown> | null => {
  try {
    const o: unknown = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Reads a message sent by a phone; anything unexpected gives null. */
export function parsePhoneMessage(raw: string): PhoneMessage | null {
  const o = parseJson(raw);
  if (!o || (o.t !== 'press' && o.t !== 'release') || !isRemoteButton(o.b)) return null;
  return { t: o.t, b: o.b };
}

/** Reads a message sent by the game to the phones. */
export function parseNotice(raw: string): RemoteNotice | null {
  const o = parseJson(raw);
  if (o?.t === 'buzz') return { t: 'buzz' };
  return null;
}

/** Reads a message the relay forwards to the game. */
export function parseHostMessage(raw: string): HostMessage | null {
  const o = parseJson(raw);
  if (!o) return null;
  if ((o.t === 'press' || o.t === 'release') && isRemoteButton(o.b) && typeof o.r === 'string') {
    return { t: o.t, b: o.b, r: o.r };
  }
  if (o.t === 'left' && typeof o.r === 'string') return { t: 'left', r: o.r };
  if (o.t === 'peers' && typeof o.remotes === 'number') return { t: 'peers', remotes: o.remotes };
  return null;
}

/** Hub event for a button of a phone. */
export const remoteEvent = (
  remoteId: string,
  button: RemoteButton,
  type: InputEvent['type'],
): InputEvent => ({
  source: 'remote',
  deviceId: `remote:${remoteId}`,
  control: `button:${button}`,
  type,
});

/**
 * Keeps what each phone holds down, so a phone that vanishes (screen off, Wi-Fi
 * lost) releases its buttons instead of leaving a shift repeating.
 */
export class RemoteButtonTracker {
  private readonly held = new Map<string, Set<RemoteButton>>();

  /** Events to give the hub for a message; presses of a held button are ignored. */
  update(msg: HostMessage): InputEvent[] {
    if (msg.t === 'peers') return [];
    if (msg.t === 'left') return this.release(msg.r);
    const set = this.held.get(msg.r) ?? new Set<RemoteButton>();
    if (msg.t === 'press') {
      if (set.has(msg.b)) return [];
      set.add(msg.b);
      this.held.set(msg.r, set);
      return [remoteEvent(msg.r, msg.b, 'press')];
    }
    if (!set.delete(msg.b)) return [];
    if (set.size === 0) this.held.delete(msg.r);
    return [remoteEvent(msg.r, msg.b, 'release')];
  }

  /** Releases the buttons of one phone. */
  release(remoteId: string): InputEvent[] {
    const set = this.held.get(remoteId);
    this.held.delete(remoteId);
    return set ? [...set].map((b) => remoteEvent(remoteId, b, 'release')) : [];
  }

  /** Releases everything (the link to the relay is lost). */
  reset(): InputEvent[] {
    return [...this.held.keys()].flatMap((r) => this.release(r));
  }
}
