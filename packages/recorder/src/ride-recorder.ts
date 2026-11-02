import { computeStats } from './stats';
import type { LapTrigger, RideHeader, RideLap, RideSample } from './types';

export interface RecorderInput {
  powerW: number;
  cadenceRpm: number;
  heartRateBpm: number | null;
  speedMs: number;
  distanceM: number;
  lap: number;
  lapDistanceM: number;
  altitudeM: number;
  gradePercent: number;
  gear: number | null;
}

export type NewRide = Pick<
  RideHeader,
  'id' | 'route' | 'worldId' | 'rider' | 'appVersion' | 'goal'
>;

/** Stats of the samples recorded between two lap marks (riding time, s). */
export function lapFromSamples(
  samples: readonly RideSample[],
  index: number,
  startS: number,
  endS: number,
  trigger: LapTrigger,
  ftpW: number | null,
): RideLap {
  // Sample t covers the second (t-1, t]: it belongs to the lap where most of that second was ridden.
  const inLap = (s: RideSample) => s.t - 0.5 > startS && s.t - 0.5 <= endS;
  const firstIdx = samples.findIndex(inLap);
  const lapSamples = firstIdx < 0 ? [] : samples.slice(firstIdx).filter(inLap);
  const before = firstIdx > 0 ? samples[firstIdx - 1] : undefined;
  const stats = computeStats(lapSamples, {
    ftpW,
    startDistanceM: before?.distanceM ?? 0,
    ...(before ? { startAltitudeM: before.altitudeM, startTs: before.ts } : {}),
  });
  return { index, startS, endS, trigger, stats };
}

/** Closes the last lap and computes the ride statistics. */
export function finalizeRide(
  header: RideHeader,
  samples: readonly RideSample[],
  now: number,
): RideHeader {
  const ftp = header.rider.ftpW;
  // Lap stats are recomputed: when a lap was marked, its last second may not have been recorded yet.
  const laps = header.laps.map((l) =>
    lapFromSamples(samples, l.index, l.startS, l.endS, l.trigger, ftp),
  );
  const lastEnd = laps.at(-1)?.endS ?? 0;
  const endS = samples.at(-1)?.t ?? lastEnd;
  // Keep a trailing partial lap only if something was ridden in it.
  if (endS - lastEnd >= 1 || laps.length === 0) {
    laps.push(lapFromSamples(samples, laps.length + 1, lastEnd, endS, 'end', ftp));
  }
  const stats = computeStats(samples, { ftpW: ftp, startDistanceM: 0, startTs: header.startedAt });
  const loopLaps = laps.filter((l) => l.trigger === 'loop');
  return {
    ...header,
    status: 'finished',
    updatedAt: now,
    durationS: stats.durationS,
    distanceM: stats.distanceM,
    ascentM: stats.ascentM,
    stats,
    laps,
    bestLapS: loopLaps.length ? Math.min(...loopLaps.map((l) => l.endS - l.startS)) : null,
  };
}

/**
 * Turns the 20 Hz simulation into 1 Hz samples (power and cadence averaged
 * over the second) and keeps the laps.
 */
export class RideRecorder {
  private readonly _samples: RideSample[] = [];
  private _header: RideHeader;
  private ridingS = 0;
  private acc = { dt: 0, power: 0, cadence: 0 };

  constructor(
    ride: NewRide,
    private readonly now: () => number = () => Date.now(),
  ) {
    const t = now();
    this._header = {
      ...ride,
      startedAt: t,
      updatedAt: t,
      status: 'recording',
      durationS: 0,
      distanceM: 0,
      ascentM: 0,
      stats: null,
      laps: [],
      bestLapS: null,
    };
  }

  get header(): RideHeader {
    return this._header;
  }

  get samples(): readonly RideSample[] {
    return this._samples;
  }

  /** Riding time (pauses excluded), s. */
  get ridingTimeS(): number {
    return this.ridingS;
  }

  /** Advances by one simulation step; returns a sample when a full second has been ridden. */
  step(dtS: number, input: RecorderInput): RideSample | null {
    this.ridingS += dtS;
    this.acc.dt += dtS;
    this.acc.power += input.powerW * dtS;
    this.acc.cadence += input.cadenceRpm * dtS;
    const t = this._samples.length + 1;
    // Per-second accumulator (a global float sum of 0.05 s steps drifts over hours).
    if (this.acc.dt + 1e-6 < 1) return null;
    const sample: RideSample = {
      t,
      ts: this.now(),
      powerW: Math.round(this.acc.power / this.acc.dt),
      cadenceRpm: Math.round(this.acc.cadence / this.acc.dt),
      heartRateBpm: input.heartRateBpm === null ? null : Math.round(input.heartRateBpm),
      speedMs: input.speedMs,
      distanceM: input.distanceM,
      lap: input.lap,
      lapDistanceM: input.lapDistanceM,
      altitudeM: input.altitudeM,
      gradePercent: input.gradePercent,
      gear: input.gear,
    };
    this.acc = { dt: Math.max(0, this.acc.dt - 1), power: 0, cadence: 0 };
    this._samples.push(sample);
    this._header = {
      ...this._header,
      updatedAt: sample.ts,
      durationS: t,
      distanceM: sample.distanceM,
    };
    return sample;
  }

  /** Closes the current lap at riding time `atS` (line crossing or manual lap). */
  markLap(atS: number, trigger: LapTrigger): RideLap {
    const laps = this._header.laps;
    const startS = laps.at(-1)?.endS ?? 0;
    const lap = lapFromSamples(
      this._samples,
      laps.length + 1,
      startS,
      atS,
      trigger,
      this._header.rider.ftpW,
    );
    const loopTimes = [...laps, lap]
      .filter((l) => l.trigger === 'loop')
      .map((l) => l.endS - l.startS);
    this._header = {
      ...this._header,
      laps: [...laps, lap],
      bestLapS: loopTimes.length ? Math.min(...loopTimes) : null,
    };
    return lap;
  }

  finish(): RideHeader {
    this._header = finalizeRide(this._header, this._samples, this.now());
    return this._header;
  }
}
