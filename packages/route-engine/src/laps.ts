export interface CompletedLap {
  /** 1-based lap number. */
  lap: number;
  startS: number;
  endS: number;
  durationS: number;
}

export interface LapCrossing extends CompletedLap {
  isBest: boolean;
  /** Time compared to the previous best lap (negative = faster); null for the first lap. */
  deltaToBestS: number | null;
}

/**
 * Detects start/finish line crossings on a loop from the total distance,
 * and keeps lap times. Crossing times are interpolated between two updates.
 */
export class LapTracker {
  private readonly completed: CompletedLap[] = [];
  private lapStartS = 0;
  private lastTimeS = 0;
  private lastDistanceM = 0;
  private best: number | null = null;

  constructor(
    readonly lapLengthM: number,
    startTimeS = 0,
    startDistanceM = 0,
  ) {
    if (!(lapLengthM > 0)) throw new Error('Lap length must be positive');
    this.lapStartS = startTimeS;
    this.lastTimeS = startTimeS;
    this.lastDistanceM = startDistanceM;
  }

  get laps(): readonly CompletedLap[] {
    return this.completed;
  }

  get bestLapS(): number | null {
    return this.best;
  }

  get lastLap(): CompletedLap | null {
    return this.completed.at(-1) ?? null;
  }

  /** Current lap number (1-based). */
  get currentLap(): number {
    return Math.floor(this.lastDistanceM / this.lapLengthM) + 1;
  }

  currentLapTimeS(nowS: number = this.lastTimeS): number {
    return nowS - this.lapStartS;
  }

  /** Feeds the total distance; returns the crossings that happened since the last update. */
  update(timeS: number, totalDistanceM: number): LapCrossing[] {
    const out: LapCrossing[] = [];
    const prevLap = Math.floor(this.lastDistanceM / this.lapLengthM);
    const nextLap = Math.floor(totalDistanceM / this.lapLengthM);
    for (let k = prevLap + 1; k <= nextLap; k++) {
      const lineM = k * this.lapLengthM;
      const span = totalDistanceM - this.lastDistanceM;
      const f = span > 0 ? (lineM - this.lastDistanceM) / span : 1;
      const crossS = this.lastTimeS + (timeS - this.lastTimeS) * f;
      const lap: CompletedLap = {
        lap: k,
        startS: this.lapStartS,
        endS: crossS,
        durationS: crossS - this.lapStartS,
      };
      const deltaToBestS = this.best === null ? null : lap.durationS - this.best;
      const isBest = this.best === null || lap.durationS < this.best;
      if (isBest) this.best = lap.durationS;
      this.completed.push(lap);
      this.lapStartS = crossS;
      out.push({ ...lap, isBest, deltaToBestS });
    }
    this.lastTimeS = timeS;
    this.lastDistanceM = totalDistanceM;
    return out;
  }
}
