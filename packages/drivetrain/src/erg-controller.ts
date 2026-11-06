// ERG mode (docs/03 §4, docs/04 §8): turns a target power into smooth trainer
// commands. The physics keeps running on the measured power; only the command
// sent to the trainer changes.
//  - target changes (interval change, ±5 W) are ramped over a few seconds;
//  - cadence 0 (stopped, paused): the command decays gradually, never drops;
//  - "spiral of death": cadence too low for too long while the target is high
//    → the command falls back to a recovery power until the rider spins again.

import { clamp } from '@hrt/shared';

export interface ErgControllerOptions {
  /** Time to reach a new target, in s. */
  rampS: number;
  /** Ramp when coming back from a stop or a spiral, in s (gentler). */
  resumeRampS: number;
  /** Slowest ramp speed, so that small changes are not stretched out, in W/s. */
  minSlewWPerS: number;
  /** Decay speed when the rider stops pedalling, in W/s. */
  decayWPerS: number;
  /** Command held while stopped or recovering, in W. */
  recoveryPowerW: number;
  minPowerW: number;
  maxPowerW: number;
  /** Spiral of death: cadence below this for `spiralDelayS`, with a target ≥ `spiralMinTargetW`. */
  spiralCadenceRpm: number;
  spiralDelayS: number;
  spiralMinTargetW: number;
  /** The rider is considered back when cadence stays above this for `resumeDelayS`. */
  resumeCadenceRpm: number;
  resumeDelayS: number;
  /** Below this cadence the rider has stopped pedalling, for `stoppedDelayS`. */
  stoppedCadenceRpm: number;
  stoppedDelayS: number;
  /** A command is sent at least this often (keep-alive), in s. */
  maxIntervalS: number;
  /** Commands are never sent faster than this, in s. */
  minIntervalS: number;
  /** Changes smaller than this are not sent, in W. */
  deadbandW: number;
}

export const DEFAULT_ERG_CONTROLLER_OPTIONS: Readonly<ErgControllerOptions> = {
  rampS: 2.5,
  resumeRampS: 5,
  minSlewWPerS: 10,
  decayWPerS: 30,
  recoveryPowerW: 50,
  minPowerW: 0,
  maxPowerW: 2000,
  spiralCadenceRpm: 50,
  spiralDelayS: 5,
  spiralMinTargetW: 100,
  resumeCadenceRpm: 70,
  resumeDelayS: 3,
  stoppedCadenceRpm: 5,
  stoppedDelayS: 1,
  maxIntervalS: 1,
  minIntervalS: 0.25,
  deadbandW: 1,
};

/** `active` follows the target; `stopped` decays; `spiral` waits for the rider to recover. */
export type ErgState = 'active' | 'stopped' | 'spiral';

export type ErgEvent = 'spiral' | 'recovered';

export interface ErgInput {
  /** Cadence in rpm, or null when no sensor provides it (spiral logic is then off). */
  cadenceRpm: number | null;
  /** The ride is paused: handled like a stop. */
  paused: boolean;
}

export interface ErgUpdate {
  /** Power to send to the trainer now, in W, or null when nothing is due. */
  powerW: number | null;
  event: ErgEvent | null;
}

export class ErgController {
  readonly options: ErgControllerOptions;
  private _targetW: number;
  private _state: ErgState = 'active';
  private commandedW: number | null = null;
  private lastSentW: number | null = null;
  private slewWPerS = 0;
  private sinceSentS = Number.POSITIVE_INFINITY;
  private lowCadenceS = 0;
  private goodCadenceS = 0;
  private effectiveW: number | null = null;

  constructor(targetW: number, options: Partial<ErgControllerOptions> = {}) {
    this.options = { ...DEFAULT_ERG_CONTROLLER_OPTIONS, ...options };
    this._targetW = this.clampTarget(targetW);
  }

  private clampTarget(w: number): number {
    return Math.round(clamp(w, this.options.minPowerW, this.options.maxPowerW));
  }

  get targetW(): number {
    return this._targetW;
  }

  get state(): ErgState {
    return this._state;
  }

  /** Power currently being commanded (after ramp, decay or recovery), in W. */
  get commandW(): number | null {
    return this.commandedW === null ? null : Math.round(this.commandedW);
  }

  setTarget(watts: number): void {
    this._targetW = this.clampTarget(watts);
  }

  adjustTarget(deltaW: number): void {
    this.setTarget(this._targetW + deltaW);
  }

  /** The rider chooses to resume after a spiral, without waiting for the cadence. */
  resume(): void {
    if (this._state === 'spiral') this.enterActive();
  }

  /** Forces the next update to send a command (e.g. after a reconnection). */
  invalidate(): void {
    this.lastSentW = null;
  }

  private enterActive() {
    this._state = 'active';
    this.lowCadenceS = 0;
    this.goodCadenceS = 0;
    this.effectiveW = null;
  }

  private watchCadence(dtS: number, input: ErgInput): ErgEvent | null {
    const o = this.options;
    const cadence = input.cadenceRpm;
    if (cadence === null) {
      this.lowCadenceS = 0;
      this.goodCadenceS = 0;
      if (this._state === 'stopped') this._state = 'active';
      return null;
    }
    if (this._state === 'spiral') {
      this.goodCadenceS = cadence >= o.resumeCadenceRpm ? this.goodCadenceS + dtS : 0;
      if (this.goodCadenceS >= o.resumeDelayS) {
        this.enterActive();
        return 'recovered';
      }
      return null;
    }
    const stopped = input.paused || cadence < o.stoppedCadenceRpm;
    if (stopped) {
      this.goodCadenceS = 0;
      this.lowCadenceS += dtS;
      // Pausing is immediate; a cadence of 0 must last a moment (sensor glitch).
      if (input.paused || this.lowCadenceS >= o.stoppedDelayS) this._state = 'stopped';
      return null;
    }
    if (this._state === 'stopped') this._state = 'active';
    if (cadence < o.spiralCadenceRpm && this._targetW >= o.spiralMinTargetW) {
      this.lowCadenceS += dtS;
      if (this.lowCadenceS >= o.spiralDelayS) {
        this._state = 'spiral';
        this.goodCadenceS = 0;
        return 'spiral';
      }
    } else {
      this.lowCadenceS = 0;
    }
    return null;
  }

  update(dtS: number, input: ErgInput): ErgUpdate {
    const o = this.options;
    const event = this.watchCadence(dtS, input);

    const goal =
      this._state === 'active' ? this._targetW : Math.min(this._targetW, o.recoveryPowerW);
    if (this.commandedW === null) this.commandedW = goal;

    // The ramp speed is fixed when the goal changes, so that the whole move takes `rampS`.
    if (goal !== this.effectiveW) {
      const gap = Math.abs(goal - this.commandedW);
      if (this._state === 'active') {
        const coming = this.effectiveW !== null && this.effectiveW < goal && this.wasRecovering;
        const time = coming ? o.resumeRampS : o.rampS;
        this.slewWPerS = Math.max(gap / time, o.minSlewWPerS);
      } else {
        this.slewWPerS = o.decayWPerS;
      }
      this.wasRecovering = this._state !== 'active';
      this.effectiveW = goal;
    }
    const step = this.slewWPerS * dtS;
    const diff = goal - this.commandedW;
    this.commandedW += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;

    const watts = Math.round(this.commandedW);
    this.sinceSentS += dtS;
    const due =
      this.lastSentW === null ||
      this.sinceSentS >= o.maxIntervalS ||
      (this.sinceSentS >= o.minIntervalS && Math.abs(watts - this.lastSentW) >= o.deadbandW);
    if (!due) return { powerW: null, event };
    this.lastSentW = watts;
    this.sinceSentS = 0;
    return { powerW: watts, event };
  }

  private wasRecovering = false;
}
