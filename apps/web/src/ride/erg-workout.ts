// Pure helpers of the ERG page: blocks typed by the rider → workout, the flat
// route that stands in for a road, and the zoom window of the graph.

import { loopRouteFromPoints, type Route } from '@hrt/route-engine';
import { type Interval, type Step, type Workout, watts } from '@hrt/workouts';

/** One block of the editor, in watts. A ramp goes from `fromW` to `toW`. */
export interface ErgBlock {
  id: string;
  kind: 'steady' | 'ramp';
  durationS: number;
  fromW: number;
  toW: number;
}

export const MIN_BLOCK_S = 5;
export const MAX_BLOCK_S = 6 * 3600;
export const MAX_ERG_W = 2000;
export const DEFAULT_FREE_W = 130;

const clampW = (w: number) => Math.min(MAX_ERG_W, Math.max(0, Math.round(w)));

/** Blocks the runner can play: positive duration, power within bounds. */
export function validBlocks(blocks: readonly ErgBlock[]): ErgBlock[] {
  return blocks.filter(
    (b) => Number.isFinite(b.durationS) && b.durationS >= MIN_BLOCK_S && b.durationS <= MAX_BLOCK_S,
  );
}

/** The workout of the blocks, or null when there is none (free ERG). */
export function blocksToWorkout(blocks: readonly ErgBlock[], name: string): Workout | null {
  const steps: Step[] = validBlocks(blocks).map((b) =>
    b.kind === 'ramp'
      ? {
          type: 'ramp',
          durationS: Math.round(b.durationS),
          from: watts(clampW(b.fromW)),
          to: watts(clampW(b.toW)),
        }
      : { type: 'steady', durationS: Math.round(b.durationS), power: watts(clampW(b.fromW)) },
  );
  if (steps.length === 0) return null;
  return { id: 'erg-session', name, steps, source: 'custom' };
}

/**
 * Part of the workout between `fromS` and `toS`, cut at the edges and shifted
 * so that `fromS` becomes 0: the zoomed graph. Ramps keep their slope.
 */
export function windowIntervals(
  intervals: readonly Interval[],
  fromS: number,
  toS: number,
): Interval[] {
  const out: Interval[] = [];
  for (const i of intervals) {
    const end = i.startS + i.durationS;
    if (end <= fromS || i.startS >= toS) continue;
    const a = Math.max(i.startS, fromS);
    const b = Math.min(end, toS);
    const at = (s: number) => i.fromW + ((i.toW - i.fromW) * (s - i.startS)) / i.durationS;
    out.push({
      ...i,
      startS: a - fromS,
      durationS: b - a,
      fromW: at(a),
      toW: at(b),
    });
  }
  return out;
}

/** Window of `spanS` seconds that keeps the current time in its first third. */
export function zoomWindow(elapsedS: number, totalS: number, spanS: number): [number, number] {
  const span = Math.min(spanS, Math.max(totalS, 1));
  const from = Math.min(Math.max(0, elapsedS - span / 3), Math.max(0, totalS - span));
  return [from, from + span];
}

/** Id of the stand-in route and world: the ride is recorded under this name. */
export const ERG_ROUTE_ID = 'erg';

/**
 * A flat circle of 1 km: the session needs a route, the ERG page has no road.
 * Distance and laps count up but mean nothing here.
 */
export function flatErgRoute(): Route {
  const n = 64;
  const r = 1000 / (2 * Math.PI);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    x[i] = r * Math.cos(a);
    y[i] = r * Math.sin(a);
  }
  return loopRouteFromPoints({
    id: ERG_ROUTE_ID,
    name: { fr: 'Séance ERG', en: 'ERG session' },
    worldId: ERG_ROUTE_ID,
    x,
    y,
    z: new Float64Array(n),
  });
}

/** Gap between the power ridden and the target (tolerance ±5 %, 5 W at least). */
export type ErgDeviation = { kind: 'ok' | 'high' | 'low'; diffW: number; gaugePct: number };

export function ergDeviation(powerW: number, targetW: number): ErgDeviation {
  const diffW = Math.round(powerW - targetW);
  const tol = Math.max(5, 0.05 * targetW);
  const kind = diffW > tol ? 'high' : diffW < -tol ? 'low' : 'ok';
  // 50 % is on target; the gauge spans ±25 % of the target.
  const gaugePct = Math.min(100, Math.max(0, 50 + (200 * diffW) / Math.max(1, targetW)));
  return { kind, diffW, gaugePct };
}

/** Error of a block for the editor, or null when it can be played. */
export function blockError(b: ErgBlock): 'power' | 'duration' | null {
  if (b.fromW < 0 || b.fromW > MAX_ERG_W || b.toW < 0 || b.toW > MAX_ERG_W) return 'power';
  if (b.durationS > MAX_BLOCK_S) return 'duration';
  return null;
}

export const blockTooShort = (b: ErgBlock): boolean => b.durationS < MIN_BLOCK_S;
