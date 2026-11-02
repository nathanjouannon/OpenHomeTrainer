import {
  airDensityAtAltitude,
  DEFAULT_RIDER_PARAMS,
  type RiderParams,
  steadyStateSpeed,
} from '@hrt/physics';
import { emptyRoutePoint, type Route } from '@hrt/route-engine';

/**
 * Lap time at a constant power, from the steady-state speed on every 50 m
 * piece of the lap (inertia ignored: good enough for an estimate).
 */
export function estimateLapTimeS(
  route: Route,
  powerW: number,
  params: Partial<RiderParams> = {},
): number {
  const p = { ...DEFAULT_RIDER_PARAMS, ...params };
  const point = emptyRoutePoint();
  const step = 50;
  let time = 0;
  for (let d = 0; d < route.lengthM; d += step) {
    route.sampleAt(d + step / 2, point);
    const v = steadyStateSpeed(
      {
        powerW,
        gradePercent: point.gradePercent,
        airDensity: airDensityAtAltitude(point.z),
        draftFactor: 0,
      },
      p,
    );
    time += Math.min(step, route.lengthM - d) / Math.max(v, 1);
  }
  return time;
}
