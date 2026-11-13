// Strategy S3 (docs/15 §3.3), experimental "realistic mode": the engaged gear
// and the cadence give the speed the rider would ride on the road,
//   v_gear = cadence/60 × ratio × circumference,
// and the trainer is put in ERG at the power that speed needs on the current
// grade. A harder gear or a faster cadence therefore asks for more power, as
// on a real bike. The game speed still comes from the measured power.

import { clamp } from '@hrt/shared';
import { ErgController, type ErgControllerOptions, type ErgUpdate } from './erg-controller';
import { gearSpeedMs } from './gearing';

export interface GearPowerOptions {
  /** Time constant of the cadence filter, in s. */
  cadenceTimeConstantS: number;
  minPowerW: number;
  maxPowerW: number;
  /** Follows a moving target: τ ≈ this many seconds (docs/15 §6: ±5 % within 5 s). */
  erg: Partial<ErgControllerOptions>;
}

export const DEFAULT_GEAR_POWER_OPTIONS: Readonly<GearPowerOptions> = {
  cadenceTimeConstantS: 0.8,
  minPowerW: 0,
  maxPowerW: 2000,
  erg: {
    rampS: 1,
    // The target already follows the cadence: a low cadence is not a spiral of death.
    spiralMinTargetW: Number.POSITIVE_INFINITY,
  },
};

export interface GearPowerInput {
  /** Cadence in rpm; S3 needs a sensor, the caller falls back to S1 without one. */
  cadenceRpm: number;
  paused: boolean;
  /** Ratio of the engaged virtual gear. */
  ratio: number;
  wheelCircumferenceM: number;
  /** Grade the rider feels (difficulty applied), in %. */
  gradePercent: number;
  /** Resistive force (gravity + rolling + aero) at a speed and grade, in N. */
  resistiveForceN: (speedMs: number, gradePercent: number) => number;
  /** Drivetrain efficiency (0..1). */
  efficiency: number;
}

/** Power needed to ride at the speed imposed by a gear and a cadence, in W. */
export function gearTargetPowerW(
  input: Pick<
    GearPowerInput,
    | 'cadenceRpm'
    | 'ratio'
    | 'wheelCircumferenceM'
    | 'gradePercent'
    | 'resistiveForceN'
    | 'efficiency'
  >,
): number {
  const v = gearSpeedMs(input.cadenceRpm, input.ratio, input.wheelCircumferenceM);
  const force = input.resistiveForceN(v, input.gradePercent);
  // Coasting downhill: the road would push the rider, no power is asked.
  return Math.max(0, (force * v) / Math.max(0.5, input.efficiency));
}

export class GearPowerController {
  private readonly options: GearPowerOptions;
  private readonly erg: ErgController;
  private cadence: number | null = null;

  constructor(options: Partial<GearPowerOptions> = {}) {
    this.options = {
      ...DEFAULT_GEAR_POWER_OPTIONS,
      ...options,
      erg: { ...DEFAULT_GEAR_POWER_OPTIONS.erg, ...options.erg },
    };
    this.erg = new ErgController(0, {
      minPowerW: this.options.minPowerW,
      maxPowerW: this.options.maxPowerW,
      ...this.options.erg,
    });
  }

  /** Power currently asked of the trainer, in W. */
  get commandW(): number | null {
    return this.erg.commandW;
  }

  /** Smoothed target before the ERG ramp, in W. */
  get targetW(): number {
    return this.erg.targetW;
  }

  invalidate(): void {
    this.erg.invalidate();
  }

  update(dtS: number, input: GearPowerInput): ErgUpdate {
    const alpha = 1 - Math.exp(-dtS / Math.max(1e-3, this.options.cadenceTimeConstantS));
    this.cadence =
      this.cadence === null
        ? input.cadenceRpm
        : this.cadence + (input.cadenceRpm - this.cadence) * alpha;
    const target = gearTargetPowerW({ ...input, cadenceRpm: this.cadence });
    this.erg.setTarget(clamp(target, this.options.minPowerW, this.options.maxPowerW));
    return this.erg.update(dtS, { cadenceRpm: input.cadenceRpm, paused: input.paused });
  }
}
