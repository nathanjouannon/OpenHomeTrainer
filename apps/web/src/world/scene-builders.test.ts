import { describe, expect, it } from 'vitest';
import { collectNear } from './scene-builders';

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
