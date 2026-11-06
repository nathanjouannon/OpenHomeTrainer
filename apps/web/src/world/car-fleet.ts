// Which car stands or drives where (lot 2.17): small cars and family cars on
// the plain, 4x4s, SUVs and pickups as the road climbs, trucks on the farms.

import { CAR_SPECS, type CarClass } from './car-geometry';

/** Altitude (m) where the plain fleet starts giving way to the mountain one. */
const PLAIN_TOP_M = 500;
const MOUNTAIN_FROM_M = 900;

/** Weight of each body class at an altitude (0 = plain, 1 = mountain), on a farm or not. */
function classWeight(klass: CarClass, t: number, farm: boolean): number {
  switch (klass) {
    case 'city':
      return 3 * (1 - t) + 0.4;
    case 'compact':
      return 2.5 * (1 - t) + 0.5;
    case 'wagon':
      return 2 + t * 0.5;
    case 'minivan':
      return 1.2 * (1 - t) + 0.2;
    case 'suv':
      return 1.2 + 1.8 * t;
    case 'offroad':
      return 0.15 + 1.6 * t + (farm ? 1 : 0);
    case 'pickup':
      return 0.1 + 1.1 * t + (farm ? 2.5 : 0);
    case 'van':
      return 0.5 + (farm ? 1.5 : 0);
  }
}

/**
 * Index in `CAR_SPECS` of a car for a place.
 * `maxLengthM` leaves out the cars too long for a village parking pad.
 */
export function pickCarModel(
  altitudeM: number,
  farm: boolean,
  rand: () => number,
  maxLengthM = Number.POSITIVE_INFINITY,
): number {
  const t = Math.min(Math.max((altitudeM - PLAIN_TOP_M) / (MOUNTAIN_FROM_M - PLAIN_TOP_M), 0), 1);
  const weights = CAR_SPECS.map((s) =>
    s.lengthM <= maxLengthM ? classWeight(s.klass, t, farm) : 0,
  );
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (const [i, w] of weights.entries()) {
    r -= w;
    if (r < 0) return i;
  }
  return Math.max(
    weights.findIndex((w) => w > 0),
    0,
  );
}
