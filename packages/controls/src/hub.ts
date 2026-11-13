import type { ControlAction } from './actions';
import type { ActionSource, Binding, InputEvent, Profile } from './events';

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as number),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as number),
};

export interface InputHubOptions {
  profile: Profile;
  timers?: Timers;
  /** Hold time that turns a press into a long press. */
  longPressMs?: number;
  /** Window to wait for a second tap when a control has a double-press binding. */
  doublePressMs?: number;
  /** Delay before a held control starts repeating its action. */
  repeatDelayMs?: number;
}

type Handler = (source: ActionSource) => void;

interface Held {
  longTimer?: unknown;
  longFired: boolean;
  repeatDelay?: unknown;
  repeatTimer?: unknown;
  /** Waiting for a possible second tap. */
  tapTimer?: unknown;
}

/**
 * Turns input events from any source into actions, through the active profile
 * (docs/15 §4.1). Knows nothing about the game: handlers are registered by it.
 */
export class InputHub {
  private _profile: Profile;
  private readonly timers: Timers;
  private readonly longPressMs: number;
  private readonly doublePressMs: number;
  private readonly repeatDelayMs: number;
  private readonly handlers = new Map<ControlAction, Set<Handler>>();
  private readonly inputListeners = new Set<(e: InputEvent) => void>();
  private readonly captures = new Set<(e: InputEvent) => void>();
  private readonly held = new Map<string, Held>();

  constructor(opts: InputHubOptions) {
    this._profile = opts.profile;
    this.timers = opts.timers ?? realTimers;
    this.longPressMs = opts.longPressMs ?? 500;
    this.doublePressMs = opts.doublePressMs ?? 300;
    this.repeatDelayMs = opts.repeatDelayMs ?? 400;
  }

  get profile(): Profile {
    return this._profile;
  }

  setProfile(profile: Profile): void {
    this.releaseAll();
    this._profile = profile;
  }

  /** Registers what an action does; returns the function that removes it. */
  on(action: ControlAction, handler: Handler): () => void {
    const set = this.handlers.get(action) ?? new Set();
    set.add(handler);
    this.handlers.set(action, set);
    return () => set.delete(handler);
  }

  /** Triggers an action directly (buttons of the interface, tests). */
  dispatch(action: ControlAction, source: ActionSource = 'ui'): boolean {
    const set = this.handlers.get(action);
    if (!set || set.size === 0) return false;
    for (const h of [...set]) h(source);
    return true;
  }

  /** Every event the hub receives, bound or not (live display of the mapping screen). */
  onInput(listener: (e: InputEvent) => void): () => void {
    this.inputListeners.add(listener);
    return () => this.inputListeners.delete(listener);
  }

  /**
   * "Press the button to assign": the next press goes to `listener` instead of
   * triggering an action. Returns the function that stops capturing.
   */
  capture(listener: (e: InputEvent) => void): () => void {
    this.captures.add(listener);
    return () => this.captures.delete(listener);
  }

  /**
   * Feeds one event in. Returns true when the event is bound to something the
   * game handles, so the caller can stop the browser's own reaction to the key.
   */
  handle(e: InputEvent): boolean {
    for (const l of [...this.inputListeners]) l(e);
    if (e.type === 'press' && !e.repeated && this.captures.size > 0) {
      for (const l of [...this.captures]) l(e);
      return true;
    }
    const key = `${e.source}|${e.deviceId}|${e.control}`;
    const bound = this.bindingsOf(e);
    const press = bound.find((b) => b.type === 'press');
    const long = bound.find((b) => b.type === 'long_press');
    const dbl = bound.find((b) => b.type === 'double_press');
    const live = (b: Binding | undefined): b is Binding => !!b && this.isHandled(b.action);
    const consumed = live(press) || live(long) || live(dbl);

    if (e.type === 'press') {
      if (e.repeated) {
        // Operating-system key repeat: kept only for plain bindings without their own repeat.
        if (press && !press.repeatMs && !long && !dbl) this.fire(press, e);
        return consumed;
      }
      // A pending first tap survives: this press may be its second tap.
      const prev = this.held.get(key);
      if (prev) this.clearHeld(prev);
      const state: Held = { longFired: false, tapTimer: prev?.tapTimer };
      this.held.set(key, state);
      if (long) {
        state.longTimer = this.timers.setTimeout(() => {
          state.longFired = true;
          this.fire(long, e);
        }, this.longPressMs);
      } else {
        this.tap(key, e, press, dbl, true);
      }
      return consumed;
    }

    // release
    const state = this.held.get(key);
    if (!state) return consumed;
    const wasLong = state.longFired;
    const hadLong = state.longTimer !== undefined;
    this.clearHeld(state);
    if (hadLong && !wasLong) this.tap(key, e, press, dbl, false);
    else if (!state.tapTimer) this.held.delete(key);
    return consumed;
  }

  /** Stops every pending timer and forgets held controls (focus lost, profile change). */
  releaseAll(): void {
    for (const key of [...this.held.keys()]) this.releaseKey(key);
  }

  dispose(): void {
    this.releaseAll();
    this.handlers.clear();
    this.inputListeners.clear();
    this.captures.clear();
  }

  private bindingsOf(e: InputEvent): Binding[] {
    return this._profile.bindings.filter((b) => b.source === e.source && b.control === e.control);
  }

  private isHandled(action: ControlAction): boolean {
    return (this.handlers.get(action)?.size ?? 0) > 0;
  }

  private fire(b: Binding, e: InputEvent): void {
    this.dispatch(b.action, e.source);
  }

  /** A short press happened: fire it now, wait for a second tap, or start repeating. */
  private tap(
    key: string,
    e: InputEvent,
    press: Binding | undefined,
    dbl: Binding | undefined,
    pressing: boolean,
  ): void {
    const state = this.held.get(key) ?? { longFired: false };
    this.held.set(key, state);
    if (dbl) {
      if (state.tapTimer !== undefined) {
        this.timers.clearTimeout(state.tapTimer);
        state.tapTimer = undefined;
        this.fire(dbl, e);
        return;
      }
      const timer = this.timers.setTimeout(() => {
        const s = this.held.get(key);
        if (s) s.tapTimer = undefined;
        if (press) this.fire(press, e);
      }, this.doublePressMs);
      state.tapTimer = timer;
      return;
    }
    if (!press) return;
    this.fire(press, e);
    if (pressing && press.repeatMs) {
      const ms = press.repeatMs;
      state.repeatDelay = this.timers.setTimeout(() => {
        state.repeatTimer = this.timers.setInterval(() => this.fire(press, e), ms);
      }, this.repeatDelayMs);
    }
  }

  private clearHeld(state: Held): void {
    if (state.longTimer !== undefined) this.timers.clearTimeout(state.longTimer);
    if (state.repeatDelay !== undefined) this.timers.clearTimeout(state.repeatDelay);
    if (state.repeatTimer !== undefined) this.timers.clearInterval(state.repeatTimer);
  }

  private releaseKey(key: string): void {
    const state = this.held.get(key);
    if (!state) return;
    this.clearHeld(state);
    if (state.tapTimer !== undefined) this.timers.clearTimeout(state.tapTimer);
    this.held.delete(key);
  }
}
