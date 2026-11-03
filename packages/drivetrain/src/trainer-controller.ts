// What the trainer is asked to do, built in layers (docs/04 §7, docs/15 §3.3):
// simulated grade → felt grade (difficulty, softened downhill) → virtual gear
// offset (strategy S1) → trainer bounds. The game speed never depends on it.

import { clamp } from '@hrt/shared';

export interface TrainerControllerOptions {
  /** Share of the real grade the rider feels, 0..1 (US-14: 50 % by default). */
  difficulty: number;
  /** Extra attenuation of negative grades (descents feel easier on most trainers). */
  descentFactor: number;
  /** S1: grade offset per unit of ln(ratio / neutral ratio), in %. */
  gearOffsetPerLogRatio: number;
  /** Grade range accepted by the trainer, in %. */
  minGradePercent: number;
  maxGradePercent: number;
  /** Time constant of the smoothing of the felt grade, in s. */
  smoothingTimeConstantS: number;
  /** A command is sent at least this often (keep-alive), in s. */
  maxIntervalS: number;
  /** Commands are never sent faster than this, except on gear changes, in s. */
  minIntervalS: number;
  /** Changes smaller than this are not sent, in %. */
  deadbandPercent: number;
}

export const DEFAULT_TRAINER_CONTROLLER_OPTIONS: Readonly<TrainerControllerOptions> = {
  difficulty: 0.5,
  descentFactor: 0.5,
  // One cog in the middle of a road cassette (≈ +10–14 % ratio) ≈ +1–1.3 % grade.
  gearOffsetPerLogRatio: 10,
  minGradePercent: -10,
  maxGradePercent: 20,
  smoothingTimeConstantS: 1,
  maxIntervalS: 1,
  minIntervalS: 0.25,
  deadbandPercent: 0.1,
};

export type TrainerCommand = { kind: 'sim'; gradePercent: number };

export interface TrainerControllerInput {
  /** Simulated (real) grade at the rider's position, in %. */
  gradePercent: number;
  /** Ratio of the engaged virtual gear, or null when virtual shifting is off. */
  gearRatio: number | null;
  /** Ratio of the neutral gear (no offset). */
  neutralRatio: number;
}

/** Felt grade (difficulty applied, descents softened), before the gear offset. */
export function feltGrade(gradePercent: number, o: TrainerControllerOptions): number {
  const g = gradePercent * clamp(o.difficulty, 0, 1);
  return g < 0 ? g * o.descentFactor : g;
}

/** Strategy S1: grade offset of a virtual gear, in %. */
export function gearGradeOffset(ratio: number, neutralRatio: number, perLogRatio: number): number {
  return perLogRatio * Math.log(ratio / neutralRatio);
}

/**
 * Turns the simulation state into trainer commands at a sensible rate:
 * smoothed grade, deadband and throttling, but immediate on a gear change
 * (target: button → command < 150 ms).
 */
export class TrainerController {
  private smoothed: number | null = null;
  private lastSent: number | null = null;
  private sinceSentS = Number.POSITIVE_INFINITY;
  private lastGearRatio: number | null = null;
  readonly options: TrainerControllerOptions;

  constructor(options: Partial<TrainerControllerOptions> = {}) {
    this.options = { ...DEFAULT_TRAINER_CONTROLLER_OPTIONS, ...options };
  }

  setDifficulty(difficulty: number): void {
    this.options.difficulty = clamp(difficulty, 0, 1);
  }

  /** Grade that would be sent right now (for the HUD and tests). */
  get targetGradePercent(): number | null {
    return this.lastSent;
  }

  /** Forces the next update to send a command (e.g. after a reconnection). */
  invalidate(): void {
    this.lastSent = null;
  }

  update(dtS: number, input: TrainerControllerInput): TrainerCommand | null {
    const o = this.options;
    const felt = feltGrade(input.gradePercent, o);
    const alpha = 1 - Math.exp(-dtS / Math.max(1e-3, o.smoothingTimeConstantS));
    this.smoothed = this.smoothed === null ? felt : this.smoothed + (felt - this.smoothed) * alpha;
    const offset =
      input.gearRatio === null
        ? 0
        : gearGradeOffset(input.gearRatio, input.neutralRatio, o.gearOffsetPerLogRatio);
    const target =
      Math.round(clamp(this.smoothed + offset, o.minGradePercent, o.maxGradePercent) * 100) / 100;

    this.sinceSentS += dtS;
    const gearChanged = input.gearRatio !== this.lastGearRatio;
    this.lastGearRatio = input.gearRatio;
    const due =
      this.lastSent === null ||
      gearChanged ||
      this.sinceSentS >= o.maxIntervalS ||
      (this.sinceSentS >= o.minIntervalS && Math.abs(target - this.lastSent) >= o.deadbandPercent);
    if (!due) return null;
    this.lastSent = target;
    this.sinceSentS = 0;
    return { kind: 'sim', gradePercent: target };
  }
}
