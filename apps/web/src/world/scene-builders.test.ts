import { describe, expect, it } from 'vitest';
import { chunkDistanceM, chunkHasRoad, chunkLod, collectNear } from './scene-builders';

describe('collectNear', () => {
  const at = (points: [number, number][]) => {
    const matrices = new Float32Array(points.length * 16);
    points.forEach(([x, z], i) => {
      matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 5, z, 1], i * 16);
    });
    return matrices;
  };

  it('keeps the instances within the radius, horizontally', () => {
    const matrices = at([
      [10, 0],
      [0, 150],
      [300, 0],
    ]);
    const out = new Float32Array(16 * 10);
    expect(collectNear(matrices, 3, 0, 0, 200, out)).toBe(2);
    expect([out[12], out[14]]).toEqual([10, 0]);
    expect([out[16 + 12], out[16 + 14]]).toEqual([0, 150]);
  });

  it('never writes more than the buffer holds', () => {
    const out = new Float32Array(16);
    expect(
      collectNear(
        at([
          [1, 1],
          [2, 2],
        ]),
        2,
        0,
        0,
        1000,
        out,
      ),
    ).toBe(1);
  });

  it('appends after `start`', () => {
    const out = new Float32Array(16 * 4);
    const n = collectNear(at([[1, 1]]), 1, 0, 0, 10, out, 2);
    expect(n).toBe(3);
    expect([out[2 * 16 + 12], out[2 * 16 + 14]]).toEqual([1, 1]);
  });
});

describe('chunk levels of detail (lot 2.14)', () => {
  it('draws chunks without a road at the original three distances', () => {
    expect(chunkLod(500, false)).toBe(0);
    expect(chunkLod(2000, false)).toBe(1);
    expect(chunkLod(4000, false)).toBe(2);
  });

  it('never drops a chunk crossed by a road to the coarsest level', () => {
    expect(chunkLod(2000, true)).toBe(0);
    expect(chunkLod(2600, true)).toBe(1);
    expect(chunkLod(20000, true)).toBe(1);
  });

  it('keeps the current level a little past its threshold', () => {
    expect(chunkLod(1290, false, 1)).toBe(1);
    expect(chunkLod(1290, false, 0)).toBe(0);
    expect(chunkLod(1100, false, 1)).toBe(0);
  });

  it('measures the distance to the chunk, not to the map centre', () => {
    // 8 chunks of 1250 m on 10 km: chunk (row 0, col 7) is the north-east corner.
    expect(chunkDistanceM(10000, 0, 7, 4900, -4900)).toBe(0);
    expect(chunkDistanceM(10000, 0, 7, 3750 - 100, -4900)).toBe(100);
    expect(chunkDistanceM(10000, 0, 7, 3750 - 30, -3750 + 40)).toBeCloseTo(50);
  });

  it('flags the chunks a road runs through', () => {
    const t = { sizeM: 80, samples: 9, heights: new Float32Array(81), minElevationM: 0 };
    const nearRoad = new Uint8Array(81);
    nearRoad[1 * 9 + 1] = 1; // inside chunk (0, 0)
    expect(chunkHasRoad({ ...t, nearRoad }, 0, 0)).toBe(true);
    expect(chunkHasRoad({ ...t, nearRoad }, 7, 7)).toBe(false);
    expect(chunkHasRoad(t, 0, 0)).toBe(false);
  });
});
