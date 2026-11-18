// Virtual drivetrain (docs/15-vitesses-virtuelles-et-commandes.md §3): real
// chainrings and a real cassette, shifted like a real bike. The rear shifts
// one cog at a time, the front changes chainring (the cog stays), and at the
// end of the cassette the front shifts by itself (like Shimano synchro shift).

export interface Gear {
  /** Virtual ratio chainring / cog. */
  ratio: number;
  chainring: number;
  cog: number;
}

export interface DrivetrainConfig {
  /** Chainring teeth, any order. */
  chainrings: readonly number[];
  /** Cog teeth, any order. */
  cassette: readonly number[];
  wheelCircumferenceM: number;
  /**
   * Single ladder of numbered speeds (1 = easiest) with no chainring, like
   * Zwift: the label is "14 / 24" and front shifts do nothing.
   */
  ladder?: boolean;
}

export const CASSETTE_SPEEDS = [10, 11, 12, 13] as const;
export type CassetteSpeeds = (typeof CASSETTE_SPEEDS)[number];
export const DEFAULT_CASSETTE_SPEEDS: CassetteSpeeds = 12;

/** Common road cassettes, smallest cog first. */
export const CASSETTES: Readonly<Record<CassetteSpeeds, readonly number[]>> = {
  10: [11, 12, 13, 14, 15, 17, 19, 21, 24, 28],
  11: [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 28],
  12: [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34],
  13: [11, 12, 13, 14, 15, 16, 17, 19, 21, 23, 26, 30, 34],
};

/** Compact crankset. */
export const ROAD_CHAINRINGS = [34, 50] as const;
const WHEEL_700x25_M = 2.105;

export const isCassetteSpeeds = (n: unknown): n is CassetteSpeeds =>
  CASSETTE_SPEEDS.includes(n as CassetteSpeeds);

/** Road bike: compact 50/34 crankset and a cassette of `speeds` cogs. */
export function roadDrivetrain(speeds: CassetteSpeeds = DEFAULT_CASSETTE_SPEEDS): DrivetrainConfig {
  return {
    chainrings: ROAD_CHAINRINGS,
    cassette: CASSETTES[speeds],
    wheelCircumferenceM: WHEEL_700x25_M,
  };
}

export const LADDER_SPEEDS = 24;

/**
 * Zwift-style drivetrain: `speeds` numbered speeds on a single chainring, no
 * chainring to manage. The ratios run geometrically (each speed a constant
 * step harder) over the same range as the road preset, from 34×34 to 50×11.
 */
export function ladderDrivetrain(speeds = LADDER_SPEEDS): DrivetrainConfig {
  const n = Math.max(2, Math.round(speeds));
  const chainring = ROAD_CHAINRINGS[1];
  const easiest = 1; // 34×34
  const hardest = chainring / 11;
  const cassette = Array.from({ length: n }, (_, i) => {
    const ratio = easiest * (hardest / easiest) ** (i / (n - 1));
    return chainring / ratio;
  });
  return { chainrings: [chainring], cassette, wheelCircumferenceM: WHEEL_700x25_M, ladder: true };
}

/** Speed imposed by a ratio at a cadence, in m/s (informative: the game speed comes from power). */
export const gearSpeedMs = (cadenceRpm: number, ratio: number, wheelCircumferenceM: number) =>
  (cadenceRpm / 60) * ratio * wheelCircumferenceM;

/** Current gear of the virtual drivetrain. */
export class Gearbox {
  /** Chainrings, smallest (easiest) first. */
  readonly chainrings: readonly number[];
  /** Cogs, largest (easiest) first. */
  readonly cogs: readonly number[];
  private front: number;
  private rear: number;
  private readonly start: { front: number; rear: number };
  /** Ratio of the starting gear: no offset is applied to the trainer there. */
  readonly neutralRatio: number;

  constructor(readonly config: DrivetrainConfig) {
    if (config.chainrings.length === 0 || config.cassette.length === 0) {
      throw new Error('A drivetrain needs at least one chainring and one cog');
    }
    this.chainrings = [...config.chainrings].sort((a, b) => a - b);
    this.cogs = [...config.cassette].sort((a, b) => b - a);
    // Start on the big ring, on the cog closest to the middle of the whole range.
    const min = (this.chainrings[0] as number) / (this.cogs[0] as number);
    const max = (this.chainrings.at(-1) as number) / (this.cogs.at(-1) as number);
    const middle = Math.sqrt(min * max);
    const front = this.chainrings.length - 1;
    const chainring = this.chainrings[front] as number;
    let rear = 0;
    this.cogs.forEach((cog, i) => {
      const best = this.cogs[rear] as number;
      if (
        Math.abs(Math.log(chainring / cog / middle)) < Math.abs(Math.log(chainring / best / middle))
      ) {
        rear = i;
      }
    });
    this.start = { front, rear };
    this.front = front;
    this.rear = rear;
    this.neutralRatio = chainring / (this.cogs[rear] as number);
  }

  /** Chainring position, 0 = smallest. */
  get frontIndex() {
    return this.front;
  }

  /** Cog position, 0 = largest (easiest). */
  get rearIndex() {
    return this.rear;
  }

  get cogCount() {
    return this.cogs.length;
  }

  /** One number per combination, for recording (front × cog count + rear). */
  get index() {
    return this.front * this.cogs.length + this.rear;
  }

  get gear(): Gear {
    const chainring = this.chainrings[this.front] as number;
    const cog = this.cogs[this.rear] as number;
    return { ratio: chainring / cog, chainring, cog };
  }

  private set(front: number, rear: number): boolean {
    const changed = front !== this.front || rear !== this.rear;
    this.front = front;
    this.rear = rear;
    return changed;
  }

  /** Index of the cog that gives, on `front`, the ratio just past `ratio` in `direction`. */
  private cogPast(front: number, ratio: number, direction: 1 | -1): number {
    const chainring = this.chainrings[front] as number;
    const order = direction > 0 ? this.cogs.keys() : [...this.cogs.keys()].reverse();
    for (const i of order) {
      const r = chainring / (this.cogs[i] as number);
      if (direction > 0 ? r > ratio : r < ratio) return i;
    }
    return direction > 0 ? this.cogs.length - 1 : 0;
  }

  /** Harder gear: next smaller cog, or the next chainring at the end of the cassette. */
  shiftUp(): boolean {
    if (this.rear < this.cogs.length - 1) return this.set(this.front, this.rear + 1);
    if (this.front === this.chainrings.length - 1) return false;
    const front = this.front + 1;
    return this.set(front, this.cogPast(front, this.gear.ratio, 1));
  }

  /** Easier gear: next larger cog, or the previous chainring at the end of the cassette. */
  shiftDown(): boolean {
    if (this.rear > 0) return this.set(this.front, this.rear - 1);
    if (this.front === 0) return false;
    const front = this.front - 1;
    return this.set(front, this.cogPast(front, this.gear.ratio, -1));
  }

  /** Bigger chainring, same cog. */
  shiftFrontUp(): boolean {
    return this.set(Math.min(this.chainrings.length - 1, this.front + 1), this.rear);
  }

  /** Smaller chainring, same cog. */
  shiftFrontDown(): boolean {
    return this.set(Math.max(0, this.front - 1), this.rear);
  }

  reset(): boolean {
    return this.set(this.start.front, this.start.rear);
  }

  /** "50×17", or "14 / 24" on a ladder drivetrain. */
  label(): string {
    // Cogs run from the largest (easiest, speed 1) to the smallest.
    if (this.config.ladder) return `${this.rear + 1} / ${this.cogs.length}`;
    const g = this.gear;
    return `${g.chainring}×${g.cog}`;
  }
}

// ---- Custom drivetrain (lot 3.8) ----

export const MIN_TEETH = 8;
export const MAX_TEETH = 70;
export const MAX_CHAINRINGS = 3;
export const MAX_COGS = 16;

/** Teeth counts typed by the rider ("50, 34" or "11 12 13"): sorted, distinct, or null if invalid. */
export function parseTeeth(text: string, maxCount: number): number[] | null {
  const parts = text.split(/[\s,;/]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > maxCount) return null;
  const teeth = parts.map(Number);
  if (teeth.some((n) => !Number.isInteger(n) || n < MIN_TEETH || n > MAX_TEETH)) return null;
  return [...new Set(teeth)].sort((a, b) => a - b);
}

export interface CustomDrivetrain {
  chainrings: number[];
  cassette: number[];
}

/** Drivetrain from the rider's own chainrings and cassette. */
export function customDrivetrain(custom: CustomDrivetrain): DrivetrainConfig {
  return {
    chainrings: custom.chainrings,
    cassette: custom.cassette,
    wheelCircumferenceM: WHEEL_700x25_M,
  };
}

/**
 * Ratio of the gear really engaged on the trainer: its chainring over its
 * single cog (Zwift Cog: one fixed cog, so the ratio comes from the chainring
 * of the bike). Null when either is unknown.
 */
export function physicalRatio(chainring: number | null, cog: number | null): number | null {
  if (!chainring || !cog || chainring <= 0 || cog <= 0) return null;
  return chainring / cog;
}
