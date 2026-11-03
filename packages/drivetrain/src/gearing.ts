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

  /** "50×17". */
  label(): string {
    const g = this.gear;
    return `${g.chainring}×${g.cog}`;
  }
}
