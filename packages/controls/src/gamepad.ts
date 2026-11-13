import type { InputEvent } from './events';

/** The part of a `Gamepad` the tracker reads (standard Gamepad API). */
export interface GamepadSnapshot {
  id: string;
  index: number;
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

/**
 * Compares successive polls of the Gamepad API (it has no button events) and
 * produces press and release events.
 */
export class GamepadTracker {
  private readonly previous = new Map<number, { deviceId: string; state: boolean[] }>();

  /** Call at every poll with every connected pad. */
  poll(pads: readonly GamepadSnapshot[]): InputEvent[] {
    const events: InputEvent[] = [];
    const seen = new Set<number>();
    for (const pad of pads) {
      seen.add(pad.index);
      const deviceId = `${pad.index}:${pad.id}`;
      const before = this.previous.get(pad.index)?.state ?? [];
      const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      for (let i = 0; i < now.length; i++) {
        const isDown = now[i] === true;
        if (isDown === (before[i] ?? false)) continue;
        events.push({
          source: 'gamepad',
          deviceId,
          control: `button:${i}`,
          type: isDown ? 'press' : 'release',
        });
      }
      this.previous.set(pad.index, { deviceId, state: now });
    }
    // A pad that disappears releases what it held.
    for (const [index, { deviceId, state }] of this.previous) {
      if (seen.has(index)) continue;
      state.forEach((down, i) => {
        if (down) {
          events.push({
            source: 'gamepad',
            deviceId,
            control: `button:${i}`,
            type: 'release',
          });
        }
      });
      this.previous.delete(index);
    }
    return events;
  }
}
