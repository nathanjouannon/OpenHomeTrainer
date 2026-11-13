import type { RideHeader, RideSample } from '@hrt/recorder';
import { describe, expect, it } from 'vitest';
import { bestLapRide, type Ghost, ghostFromBestLap, ghostFromRide } from './ghost';

/** 10 m/s for `seconds`, one sample per second. */
const samples = (seconds: number, speed = 10): RideSample[] =>
  Array.from(
    { length: seconds },
    (_, i) => ({ t: i + 1, distanceM: (i + 1) * speed }) as RideSample,
  );

const header = (laps: [number, number][], extra: Partial<RideHeader> = {}): RideHeader =>
  ({
    id: 'r',
    status: 'finished',
    route: { id: 'loop', name: { fr: '', en: '' }, lengthM: 1000, loop: true },
    laps: laps.map(([startS, endS], i) => ({ index: i + 1, startS, endS, trigger: 'loop' })),
    bestLapS: Math.min(...laps.map(([a, b]) => b - a)),
    ...extra,
  }) as unknown as RideHeader;

describe('Ghost of a whole ride', () => {
  const g = ghostFromRide(samples(100), 'x') as Ghost;

  it('interpolates distance and time', () => {
    expect(g.distanceAt(0)).toBe(0);
    expect(g.distanceAt(25.5)).toBeCloseTo(255, 9);
    expect(g.timeAt(255)).toBeCloseTo(25.5, 9);
  });

  it('stops at the end and has no time beyond its distance', () => {
    expect(g.distanceAt(500)).toBe(1000);
    expect(g.finishedAt(99)).toBe(false);
    expect(g.finishedAt(100)).toBe(true);
    expect(g.timeAt(1200)).toBeNull();
  });

  it('refuses a ride that went nowhere', () => {
    expect(ghostFromRide(samples(3, 1), 'x')).toBeNull();
  });
});

describe('Ghost of the best lap', () => {
  // Lap 1: 0-120 s (slow, 1200 m at 10 m/s... here 10 m/s all along), lap 2: 120-200 s.
  const fast: RideSample[] = [
    ...samples(120, 10),
    ...Array.from(
      { length: 80 },
      (_, i) => ({ t: 121 + i, distanceM: 1200 + (i + 1) * 15 }) as RideSample,
    ),
  ];
  const g = ghostFromBestLap(
    header([
      [0, 120],
      [120, 200],
    ]),
    fast,
    'best',
  ) as Ghost;

  it('takes the fastest lap, from its own origin', () => {
    expect(g.repeat).toBe(true);
    expect(g.durationS).toBeCloseTo(80, 6);
    expect(g.lengthM).toBeCloseTo(1200, 6);
    expect(g.distanceAt(40)).toBeCloseTo(600, 3);
  });

  it('repeats lap after lap', () => {
    expect(g.finishedAt(10_000)).toBe(false);
    expect(g.distanceAt(80 + 40)).toBeCloseTo(1200 + 600, 3);
    expect(g.timeAt(1200 + 600)).toBeCloseTo(120, 3);
  });

  it('needs a completed loop lap', () => {
    const h = header([]);
    expect(ghostFromBestLap(h, samples(100), 'x')).toBeNull();
  });
});

describe('bestLapRide', () => {
  it('picks the finished ride of the route with the fastest lap', () => {
    const a = header([[0, 100]], { id: 'a' });
    const b = header([[0, 90]], { id: 'b' });
    const other = header([[0, 50]], { id: 'o', route: { id: 'other' } as RideHeader['route'] });
    const unfinished = header([[0, 40]], { id: 'u', status: 'recording' });
    expect(bestLapRide([a, b, other, unfinished], 'loop')?.id).toBe('b');
    expect(bestLapRide([], 'loop')).toBeNull();
  });
});
