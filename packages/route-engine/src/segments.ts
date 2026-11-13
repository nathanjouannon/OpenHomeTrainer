// Timed segments (lot 3.5): detection of climbs and sprints on a route, and a
// tracker that times them from the total ridden distance.

import { emptyRoutePoint, Route, type RouteSegment } from './route';

const SAMPLE_STEP_M = 25;
/** A climb is a valley-to-peak leg with at least this gain, length and mean grade. */
const CLIMB_MIN_GAIN_M = 25;
const CLIMB_MIN_LENGTH_M = 400;
const CLIMB_MIN_GRADE = 2.5;
/** Altitude move that ends a leg (hysteresis against small bumps), m. */
const LEG_HYSTERESIS_M = 12;
/** Trimming looks at this many samples (100 m) and wants at least 1 m of gain over them. */
const TRIM_WINDOW = 4;
const TRIM_MIN_GAIN_M = 1;
const SPRINT_LENGTH_M = 1000;
/** A sprint stretch may not vary more than this in altitude, m. */
const SPRINT_MAX_RANGE_M = 8;
const MIN_ROUTE_FOR_SPRINT_M = 3000;

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Finds the climbs (one per sustained ascent) and at most one flat sprint of
 * 1 km on a route. Deterministic: the same route gives the same segments, so
 * the ids stay valid for personal bests. Stretches never wrap over the start
 * line of a loop.
 */
export function detectSegments(route: Route): RouteSegment[] {
  const L = route.lengthM;
  const n = Math.floor(L / SAMPLE_STEP_M) + 1;
  const p = emptyRoutePoint();
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = route.sampleAt(Math.min(L - 1e-6, i * SAMPLE_STEP_M), p).z;

  // Zigzag of extremes with hysteresis: legs go valley -> peak -> valley.
  const pivots: number[] = [];
  let dir = 0;
  let ext = 0;
  let hiI = 0;
  let loI = 0;
  for (let i = 1; i < n; i++) {
    const zi = z[i] as number;
    if (dir === 0) {
      // Direction not known yet: wait for a move larger than the hysteresis.
      if (zi > (z[hiI] as number)) hiI = i;
      if (zi < (z[loI] as number)) loI = i;
      if (zi - (z[loI] as number) > LEG_HYSTERESIS_M) {
        pivots.push(loI);
        dir = 1;
        ext = i;
      } else if ((z[hiI] as number) - zi > LEG_HYSTERESIS_M) {
        pivots.push(hiI);
        dir = -1;
        ext = i;
      }
    } else if (dir === 1) {
      if (zi > (z[ext] as number)) ext = i;
      else if ((z[ext] as number) - zi > LEG_HYSTERESIS_M) {
        pivots.push(ext);
        dir = -1;
        ext = i;
      }
    } else {
      if (zi < (z[ext] as number)) ext = i;
      else if (zi - (z[ext] as number) > LEG_HYSTERESIS_M) {
        pivots.push(ext);
        dir = 1;
        ext = i;
      }
    }
  }
  if (dir !== 0) pivots.push(ext);

  const spans: { startM: number; endM: number; type: 'climb' | 'sprint' }[] = [];
  for (let k = 0; k + 1 < pivots.length; k++) {
    let a = pivots[k] as number;
    let b = pivots[k + 1] as number;
    // Trim the flat lead-in and the flat top: a climb starts where it really rises.
    while (
      b - a > TRIM_WINDOW &&
      (z[a + TRIM_WINDOW] as number) - (z[a] as number) < TRIM_MIN_GAIN_M
    )
      a++;
    while (
      b - a > TRIM_WINDOW &&
      (z[b] as number) - (z[b - TRIM_WINDOW] as number) < TRIM_MIN_GAIN_M
    )
      b--;
    const gain = (z[b] as number) - (z[a] as number);
    const length = (b - a) * SAMPLE_STEP_M;
    if (
      gain >= CLIMB_MIN_GAIN_M &&
      length >= CLIMB_MIN_LENGTH_M &&
      (gain / length) * 100 >= CLIMB_MIN_GRADE
    ) {
      spans.push({ startM: a * SAMPLE_STEP_M, endM: b * SAMPLE_STEP_M, type: 'climb' });
    }
  }

  if (L >= MIN_ROUTE_FOR_SPRINT_M) {
    const w = Math.round(SPRINT_LENGTH_M / SAMPLE_STEP_M);
    let best: { i: number; range: number } | null = null;
    for (let i = 0; i + w < n; i++) {
      const startM = i * SAMPLE_STEP_M;
      const endM = startM + SPRINT_LENGTH_M;
      if (spans.some((s) => s.startM < endM && s.endM > startM)) continue;
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let j = i; j <= i + w; j++) {
        lo = Math.min(lo, z[j] as number);
        hi = Math.max(hi, z[j] as number);
      }
      const range = hi - lo;
      if (range <= SPRINT_MAX_RANGE_M && (best === null || range < best.range - 1e-9)) {
        best = { i, range };
      }
    }
    if (best) {
      const startM = best.i * SAMPLE_STEP_M;
      spans.push({ startM, endM: startM + SPRINT_LENGTH_M, type: 'sprint' });
    }
  }

  spans.sort((a, b) => a.startM - b.startM);
  let climbs = 0;
  let sprints = 0;
  return spans.map((s) => {
    const idx = s.type === 'climb' ? ++climbs : ++sprints;
    return {
      id: `${s.type}-${idx}`,
      name:
        s.type === 'climb'
          ? { fr: `Montée ${idx}`, en: `Climb ${idx}` }
          : { fr: `Sprint ${idx}`, en: `Sprint ${idx}` },
      type: s.type,
      startM: round1(s.startM),
      endM: round1(s.endM),
    };
  });
}

/** The route with detected segments, unless it already carries some. */
export function withSegments(route: Route): Route {
  if (route.meta.segments.length > 0) return route;
  const segments = detectSegments(route);
  if (segments.length === 0) return route;
  return new Route(
    { ...route.meta, segments },
    {
      d: Array.from(route.d),
      x: Array.from(route.x),
      y: Array.from(route.y),
      z: Array.from(route.z),
      grade: Array.from(route.grade),
      heading: Array.from(route.heading),
    },
  );
}

export interface SegmentStart {
  kind: 'start';
  segment: RouteSegment;
  /** 1-based lap on which the segment is ridden. */
  lap: number;
  timeS: number;
}

export interface SegmentEnd {
  kind: 'end';
  segment: RouteSegment;
  lap: number;
  startS: number;
  endS: number;
  durationS: number;
}

export type SegmentEvent = SegmentStart | SegmentEnd;

export interface ActiveSegment {
  segment: RouteSegment;
  lap: number;
  startS: number;
  /** Total distance at which the segment ends, m. */
  endDistanceM: number;
}

/**
 * Times segments from the total distance. Start and end times are interpolated
 * between two updates, like `LapTracker`. A loop repeats its segments every lap.
 */
export class SegmentTracker {
  private lastTimeS: number;
  private lastDistanceM: number;
  private readonly open = new Map<string, ActiveSegment>();

  constructor(
    private readonly segments: readonly RouteSegment[],
    private readonly lengthM: number,
    private readonly loop: boolean,
    startTimeS = 0,
    startDistanceM = 0,
  ) {
    this.lastTimeS = startTimeS;
    // Slightly behind, so that a segment starting at distance 0 is entered.
    this.lastDistanceM = startDistanceM - 1e-9;
  }

  /** The segment being ridden (the first one if several overlap), or null. */
  get active(): ActiveSegment | null {
    for (const a of this.open.values()) return a;
    return null;
  }

  update(timeS: number, totalDistanceM: number): SegmentEvent[] {
    const events: { atM: number; e: SegmentEvent }[] = [];
    const prev = this.lastDistanceM;
    const span = totalDistanceM - prev;
    const timeAt = (m: number) =>
      this.lastTimeS + (timeS - this.lastTimeS) * (span > 0 ? (m - prev) / span : 1);
    const firstLap = Math.floor(Math.max(0, prev) / this.lengthM);
    const lastLap = this.loop ? Math.floor(totalDistanceM / this.lengthM) : 0;
    for (let k = firstLap; k <= lastLap; k++) {
      for (const s of this.segments) {
        const startM = k * this.lengthM + s.startM;
        const endM = k * this.lengthM + s.endM;
        const key = `${s.id}#${k}`;
        if (startM > prev && startM <= totalDistanceM) {
          const startS = timeAt(startM);
          this.open.set(key, { segment: s, lap: k + 1, startS, endDistanceM: endM });
          events.push({ atM: startM, e: { kind: 'start', segment: s, lap: k + 1, timeS: startS } });
        }
        const a = this.open.get(key);
        if (a && endM > prev && endM <= totalDistanceM) {
          const endS = timeAt(endM);
          this.open.delete(key);
          events.push({
            atM: endM,
            e: {
              kind: 'end',
              segment: s,
              lap: k + 1,
              startS: a.startS,
              endS,
              durationS: endS - a.startS,
            },
          });
        }
      }
    }
    this.lastTimeS = timeS;
    this.lastDistanceM = totalDistanceM;
    // Start before end at equal distance (zero-length segments are not detected anyway).
    return events.sort((a, b) => a.atM - b.atM).map((x) => x.e);
  }
}
