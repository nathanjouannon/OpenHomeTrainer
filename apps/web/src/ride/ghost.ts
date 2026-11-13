// Ghosts (lot 3.6): a past ride replayed as a rider to race against, either a
// whole earlier ride or the best lap of a loop (repeated lap after lap).
// Pure data, no DOM. Time is riding time (pauses excluded), as in the session.

import type { RideHeader, RideSample } from '@hrt/recorder';

export type GhostKind = 'ride' | 'bestLap';

/** `?ghost=` value that asks for the best lap of the route. */
export const BEST_LAP_GHOST = 'best';

export class Ghost {
  /**
   * @param times strictly increasing, starting at 0, s
   * @param distances non-decreasing, starting at 0, m
   * @param repeat the profile is one lap, played again and again (best lap)
   */
  constructor(
    readonly kind: GhostKind,
    readonly label: string,
    private readonly times: readonly number[],
    private readonly distances: readonly number[],
    readonly repeat: boolean,
  ) {
    if (times.length < 2 || times.length !== distances.length) {
      throw new Error('A ghost needs at least two points');
    }
  }

  /** Duration of the recorded profile (the lap time for a repeating ghost), s. */
  get durationS(): number {
    return this.times[this.times.length - 1] as number;
  }

  /** Distance of the recorded profile (the lap length for a repeating ghost), m. */
  get lengthM(): number {
    return this.distances[this.distances.length - 1] as number;
  }

  /** The replay is over (never for a repeating ghost). */
  finishedAt(timeS: number): boolean {
    return !this.repeat && timeS >= this.durationS;
  }

  /** Where the ghost is after `timeS` of riding, m. */
  distanceAt(timeS: number): number {
    const t = Math.max(0, timeS);
    if (this.repeat) {
      const k = Math.floor(t / this.durationS);
      return k * this.lengthM + interp(this.times, this.distances, t - k * this.durationS);
    }
    return interp(this.times, this.distances, Math.min(t, this.durationS));
  }

  /**
   * When the ghost is (or was) at `distanceM`, s; null if it never gets there
   * (a replayed ride that stopped before).
   */
  timeAt(distanceM: number): number | null {
    const d = Math.max(0, distanceM);
    if (this.repeat) {
      const k = Math.floor(d / this.lengthM);
      return k * this.durationS + interp(this.distances, this.times, d - k * this.lengthM);
    }
    if (d > this.lengthM) return null;
    return interp(this.distances, this.times, d);
  }
}

/** Linear interpolation of ys over a non-decreasing xs (flat parts return the first y). */
function interp(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (x <= (xs[0] as number)) return ys[0] as number;
  if (x >= (xs[n - 1] as number)) return ys[n - 1] as number;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] as number) <= x) lo = mid;
    else hi = mid;
  }
  const x0 = xs[lo] as number;
  const x1 = xs[hi] as number;
  const f = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
  return (ys[lo] as number) + ((ys[hi] as number) - (ys[lo] as number)) * f;
}

/** Points (t, distance) of the samples, starting at the origin. */
function track(samples: readonly RideSample[]): { t: number[]; d: number[] } {
  const t = [0];
  const d = [0];
  for (const s of samples) {
    if (s.t > (t[t.length - 1] as number)) {
      t.push(s.t);
      d.push(Math.max(s.distanceM, d[d.length - 1] as number));
    }
  }
  return { t, d };
}

/** The whole ride as a ghost; null when too short to be worth racing. */
export function ghostFromRide(samples: readonly RideSample[], label: string): Ghost | null {
  const { t, d } = track(samples);
  if (t.length < 2 || (d[d.length - 1] as number) < 50) return null;
  return new Ghost('ride', label, t, d, false);
}

/** The ride's best lap (a completed loop lap) as a repeating ghost; null without one. */
export function ghostFromBestLap(
  header: RideHeader,
  samples: readonly RideSample[],
  label: string,
): Ghost | null {
  let best: { startS: number; endS: number } | null = null;
  for (const lap of header.laps) {
    if (lap.trigger !== 'loop') continue;
    if (best === null || lap.endS - lap.startS < best.endS - best.startS) best = lap;
  }
  if (!best) return null;
  const { t, d } = track(samples);
  if (t.length < 2) return null;
  const at = (s: number) => interp(t, d, s);
  const d0 = at(best.startS);
  const times = [0];
  const dists = [0];
  for (let i = 0; i < t.length; i++) {
    const ti = t[i] as number;
    if (ti > best.startS && ti < best.endS) {
      times.push(ti - best.startS);
      dists.push(Math.max(0, (d[i] as number) - d0));
    }
  }
  times.push(best.endS - best.startS);
  dists.push(at(best.endS) - d0);
  if ((dists[dists.length - 1] as number) < 50) return null;
  return new Ghost('bestLap', label, times, dists, true);
}

/** The finished ride of a route holding the fastest loop lap, or null. */
export function bestLapRide(headers: readonly RideHeader[], routeId: string): RideHeader | null {
  let best: RideHeader | null = null;
  for (const h of headers) {
    if (h.status !== 'finished' || h.route?.id !== routeId || h.bestLapS === null) continue;
    if (best === null || h.bestLapS < (best.bestLapS as number)) best = h;
  }
  return best;
}

export interface GhostLive {
  kind: GhostKind;
  /** Date of the replayed ride, for display. */
  label: string;
  /** Ghost position, m, and the one at the previous step (render interpolation). */
  distanceM: number;
  prevDistanceM: number;
  /** Rider minus ghost, m (negative = behind). */
  gapM: number;
  /**
   * Time the rider is behind (positive) or ahead of (negative) the ghost at the
   * rider's distance, s; null while the ghost has not come that far.
   */
  gapS: number | null;
  finished: boolean;
}
