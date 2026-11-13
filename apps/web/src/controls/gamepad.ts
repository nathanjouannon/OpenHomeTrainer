import { type GamepadSnapshot, GamepadTracker, type InputHub } from '@hrt/controls';

export interface PadInfo {
  index: number;
  id: string;
}

/** Polls the Gamepad API (it has no button events) and feeds the hub. */
export class GamepadPoller {
  private readonly tracker = new GamepadTracker();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private known = '';
  private _pads: PadInfo[] = [];

  constructor(private readonly hub: InputHub) {}

  get pads(): readonly PadInfo[] {
    return this._pads;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.timer || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    // 8 ms: button to action well under the 150 ms budget (docs/15 §4.4).
    this.timer = setInterval(() => this.poll(), 8);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const e of this.tracker.poll([])) this.hub.handle(e);
  }

  private poll(): void {
    const pads: GamepadSnapshot[] = [];
    for (const p of navigator.getGamepads()) {
      if (p?.connected) pads.push({ id: p.id, index: p.index, buttons: p.buttons });
    }
    for (const e of this.tracker.poll(pads)) this.hub.handle(e);
    const key = pads.map((p) => `${p.index}:${p.id}`).join('|');
    if (key !== this.known) {
      this.known = key;
      this._pads = pads.map((p) => ({ index: p.index, id: p.id }));
      for (const l of this.listeners) l();
    }
  }
}
