import { flatten } from '@hrt/workouts';
import { describe, expect, it } from 'vitest';
import {
  blocksToWorkout,
  type ErgBlock,
  flatErgRoute,
  windowIntervals,
  zoomWindow,
} from './erg-workout';

const steady = (id: string, durationS: number, w: number): ErgBlock => ({
  id,
  kind: 'steady',
  durationS,
  fromW: w,
  toW: w,
});

describe('blocksToWorkout', () => {
  it('gives null without a playable block (free ERG)', () => {
    expect(blocksToWorkout([], 'x')).toBeNull();
    expect(blocksToWorkout([steady('a', 0, 200)], 'x')).toBeNull();
  });

  it('turns blocks into steps in watts', () => {
    const w = blocksToWorkout(
      [steady('a', 300, 150), { id: 'b', kind: 'ramp', durationS: 60, fromW: 150, toW: 250 }],
      'x',
    );
    expect(w).not.toBeNull();
    const iv = flatten(w as NonNullable<typeof w>, 200);
    expect(iv.map((i) => [i.startS, i.fromW, i.toW])).toEqual([
      [0, 150, 150],
      [300, 150, 250],
    ]);
  });
});

describe('windowIntervals', () => {
  const w = blocksToWorkout(
    [{ id: 'r', kind: 'ramp', durationS: 100, fromW: 100, toW: 200 }, steady('s', 100, 250)],
    'x',
  );
  const iv = flatten(w as NonNullable<typeof w>, 200);

  it('cuts a ramp at the edges and shifts to 0', () => {
    const out = windowIntervals(iv, 50, 150);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ startS: 0, durationS: 50, fromW: 150, toW: 200 });
    expect(out[1]).toMatchObject({ startS: 50, durationS: 50, fromW: 250, toW: 250 });
  });

  it('drops what is outside', () => {
    expect(windowIntervals(iv, 120, 140)).toHaveLength(1);
  });
});

describe('zoomWindow', () => {
  it('stays inside the workout', () => {
    expect(zoomWindow(0, 3600, 600)).toEqual([0, 600]);
    expect(zoomWindow(3590, 3600, 600)).toEqual([3000, 3600]);
    expect(zoomWindow(1000, 3600, 600)).toEqual([800, 1400]);
  });
  it('shrinks to a short workout', () => {
    expect(zoomWindow(10, 120, 600)).toEqual([0, 120]);
  });
});

describe('flatErgRoute', () => {
  it('is a flat loop', () => {
    const r = flatErgRoute();
    expect(r.loop).toBe(true);
    expect(r.lengthM).toBeGreaterThan(900);
    expect(r.meta.ascentM).toBe(0);
  });
});

import { blockError, ergDeviation } from './erg-workout';

describe('ergDeviation', () => {
  it('matches the design examples', () => {
    expect(ergDeviation(143, 140)).toMatchObject({ kind: 'ok' });
    expect(ergDeviation(143, 130)).toMatchObject({ kind: 'high', diffW: 13 });
    expect(Math.round(ergDeviation(143, 130).gaugePct)).toBe(70);
    expect(ergDeviation(137, 150)).toMatchObject({ kind: 'low', diffW: -13 });
    expect(ergDeviation(181, 120).gaugePct).toBe(100);
  });
  it('tolerates 5 W at low targets', () => {
    expect(ergDeviation(104, 100).kind).toBe('ok');
    expect(ergDeviation(106, 100).kind).toBe('high');
  });
});

describe('blockError', () => {
  it('flags power out of range and durations over 6 h', () => {
    expect(blockError({ ...steady('a', 60, 2400) })).toBe('power');
    expect(blockError(steady('a', 7 * 3600, 100))).toBe('duration');
    expect(blockError(steady('a', 60, 100))).toBeNull();
  });
});
