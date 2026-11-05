import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { collectTiers, createTierBuffers, tilesAround, type VegetationBatch } from './plants';
import {
  fadeBandM,
  grassFadeFor,
  grassSlots,
  PLANT_REACH_MARGIN_M,
  REACH_AHEAD,
  REACH_BEHIND,
  reachDistance,
  viewDirection,
} from './vegetation-reach';

/** Looking north: scene -Z. */
const north = { x: 0, z: -1 };

describe('reach distance', () => {
  it('reaches further ahead than behind, as far on the sides', () => {
    expect(reachDistance(0, -REACH_AHEAD * 40, north)).toBeCloseTo(40, 6);
    expect(reachDistance(0, REACH_BEHIND * 40, north)).toBeCloseTo(40, 6);
    expect(reachDistance(40, 0, north)).toBeCloseTo(40, 6);
    expect(reachDistance(-40, 0, north)).toBeCloseTo(40, 6);
  });

  it('turns with the camera', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 0);
    camera.lookAt(100, 0, 0);
    camera.updateMatrixWorld();
    const dir = viewDirection(camera, { x: 0, z: 0 });
    expect(dir.x).toBeCloseTo(1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
    // Straight down: the last direction stays.
    camera.lookAt(0, -10, 0);
    camera.updateMatrixWorld();
    expect(viewDirection(camera, { x: 0.6, z: 0.8 })).toEqual({ x: 0.6, z: 0.8 });
  });

  it('costs about the same as a circle', () => {
    // Area of the two half-ellipses over the area of the circle.
    expect((REACH_AHEAD + REACH_BEHIND) / 2).toBeLessThan(1.25);
  });
});

describe('collectTiers with the view', () => {
  const at = (x: number, z: number): VegetationBatch => {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    m[12] = x;
    m[14] = z;
    return {
      chunk: 0,
      center: { x, z },
      matrices: m,
      colors: new Float32Array(3),
      species: new Uint8Array([0]),
      count: 1,
    };
  };
  const tiersOf = (x: number, z: number, fade: boolean) => {
    const out = [[0, 1, 2].map(() => createTierBuffers(4))];
    collectTiers([at(x, z)], 0, 0, [50, 200], 500, 1250, out, { dir: north, fade });
    return (out[0] ?? []).flatMap((t, i) => (t.count > 0 ? [i] : []));
  };

  it('sorts by reach distance', () => {
    // 70 m ahead is 44 reach metres: still the first tier; 70 m behind is the second.
    expect(tiersOf(0, -70, false)).toEqual([0]);
    expect(tiersOf(0, 70, false)).toEqual([1]);
  });

  it('puts a plant near a limit in both tiers around it', () => {
    expect(tiersOf(50, 0, true)).toEqual([0, 1]);
    expect(tiersOf(50 - fadeBandM(50) - PLANT_REACH_MARGIN_M - 1, 0, true)).toEqual([0]);
    expect(tiersOf(50 + fadeBandM(50) + PLANT_REACH_MARGIN_M + 1, 0, true)).toEqual([1]);
    expect(tiersOf(200, 0, true)).toEqual([1, 2]);
  });

  it('keeps the plants a little past the last limit to fade them out', () => {
    expect(tiersOf(505, 0, false)).toEqual([]);
    expect(tiersOf(505, 0, true)).toEqual([2]);
  });
});

describe('grass reach', () => {
  it('selects the tiles further ahead', () => {
    // World frame: looking north is +y.
    const tiles = tilesAround(0, 0, 40, 12, { x: 0, y: 1 });
    const ys = tiles.map((t) => (t.iy + 0.5) * 12);
    expect(Math.max(...ys)).toBeGreaterThan(50);
    expect(Math.min(...ys)).toBeGreaterThan(-40);
    expect(tiles.length).toBeLessThan(grassSlots(40, 12));
  });

  it('fades the grass out before the tiles end', () => {
    const f = grassFadeFor(52, 12);
    // Every point within fullM + fadeM is covered by a selected tile.
    expect(f.fullM + f.fadeM).toBeLessThanOrEqual(52 - 12 * Math.SQRT1_2 + 1e-9);
    expect(f.thinFromM).toBeLessThan(f.fullM);
    expect(f.keepFar).toBeGreaterThan(0);
  });
});
