// Smartphone remote, game side (lot 3.10): connects to the local relay
// (apps/api) with a private room identifier and turns what the phones press
// into hub events. The phone opens the companion page the relay serves.

import {
  type InputHub,
  parseHostMessage,
  RemoteButtonTracker,
  ROOM_ID_PATTERN,
} from '@hrt/controls';

export type RemoteStatus =
  /** Switched off by the rider. */
  | 'off'
  /** Looking for the relay. */
  | 'connecting'
  /** The relay does not answer (not started). */
  | 'unavailable'
  /** Connected to the relay, no phone yet. */
  | 'waiting'
  /** At least one phone is connected. */
  | 'connected';

export interface RemoteState {
  status: RemoteStatus;
  /** Phones currently connected. */
  phones: number;
  /** Addresses a phone can open to reach the companion page (empty until the relay answers). */
  urls: readonly string[];
  room: string;
}

const KEY = 'hrt.remote.v1';
const API_PORT = 8787;
const MAX_BACKOFF_MS = 15_000;

interface Stored {
  enabled: boolean;
  room: string;
}

export const newRoomId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

function load(): Stored {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    if (o && typeof o.room === 'string' && ROOM_ID_PATTERN.test(o.room)) {
      return { enabled: o.enabled === true, room: o.room };
    }
  } catch {
    // Unreadable storage: start with a new room.
  }
  return { enabled: false, room: newRoomId() };
}

export class RemoteLink {
  private stored: Stored = load();
  private _state: RemoteState = {
    status: 'off',
    phones: 0,
    urls: [],
    room: this.stored.room,
  };
  private readonly tracker = new RemoteButtonTracker();
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private generation = 0;
  private readonly apiBase =
    typeof location === 'undefined' ? '' : `http://${location.hostname}:${API_PORT}`;

  constructor(private readonly hub: InputHub) {}

  get state(): RemoteState {
    return this._state;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get enabled() {
    return this.stored.enabled;
  }

  /** Switches the remote on or off; the choice is remembered. */
  setEnabled(on: boolean): void {
    this.stored.enabled = on;
    this.save();
    if (on) this.start();
    else this.stop();
  }

  /** Connects again if the rider left the remote on (called when a screen needs inputs). */
  resume(): void {
    if (this.stored.enabled && !this.socket && !this.retry) this.start();
  }

  /** A new room invalidates the QR code printed or scanned before. */
  regenerate(): void {
    this.stored.room = newRoomId();
    this.save();
    const wasOn = this.stored.enabled;
    this.stop();
    this.patch({ room: this.stored.room });
    if (wasOn) this.start();
  }

  /** Vibration on the phones: confirms that a shift reached the game. */
  buzz(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send('{"t":"buzz"}');
  }

  /** Address to open on the phone, for the QR code. */
  phoneUrl(base: string): string {
    return `${base}/remote?r=${this._state.room}`;
  }

  private start(): void {
    this.stop(false);
    const generation = ++this.generation;
    this.patch({ status: 'connecting', phones: 0 });
    void this.open(generation);
  }

  private async open(generation: number): Promise<void> {
    try {
      const res = await fetch(`${this.apiBase}/info`);
      const info = (await res.json()) as { port?: number; lan?: string[] };
      if (generation !== this.generation) return;
      const port = info.port ?? API_PORT;
      const urls = (info.lan ?? []).map((ip) => `http://${ip}:${port}`);
      this.patch({ urls });
      const ws = new WebSocket(
        `${this.apiBase.replace(/^http/, 'ws')}/ws?role=host&room=${this._state.room}`,
      );
      this.socket = ws;
      ws.onopen = () => {
        this.attempt = 0;
        this.patch({ status: 'waiting' });
      };
      ws.onmessage = (e) => {
        const msg = parseHostMessage(String(e.data));
        if (!msg) return;
        if (msg.t === 'peers') {
          this.patch({
            phones: msg.remotes,
            status: msg.remotes > 0 ? 'connected' : 'waiting',
          });
        }
        for (const ev of this.tracker.update(msg)) this.hub.handle(ev);
      };
      ws.onclose = () => {
        if (generation !== this.generation) return;
        this.socket = null;
        this.releaseAll();
        this.patch({ status: 'unavailable', phones: 0 });
        this.scheduleRetry(generation);
      };
    } catch {
      if (generation !== this.generation) return;
      this.patch({ status: 'unavailable', phones: 0 });
      this.scheduleRetry(generation);
    }
  }

  private scheduleRetry(generation: number): void {
    if (this.retry) clearTimeout(this.retry);
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
    this.retry = setTimeout(() => {
      this.retry = null;
      if (generation === this.generation) void this.open(generation);
    }, delay);
  }

  private stop(report = true): void {
    this.generation++;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const ws = this.socket;
    this.socket = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    this.attempt = 0;
    this.releaseAll();
    if (report) this.patch({ status: 'off', phones: 0 });
  }

  /** A link that drops must not leave a phone button held (a repeating shift). */
  private releaseAll(): void {
    for (const ev of this.tracker.reset()) this.hub.handle(ev);
  }

  private patch(p: Partial<RemoteState>): void {
    this._state = { ...this._state, ...p };
    for (const l of this.listeners) l();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.stored));
    } catch {
      // The remote still works for this session.
    }
  }
}
