import { describe, expect, it } from 'vitest';
import { lakeBounds, waterNormalData } from './lake';
import type { Terrain } from './world-data';

describe('lakeBounds', () => {
  const s = 101;
  const terrain = (h: (x: number, y: number) => number): Terrain => {
    const heights = new Float32Array(s * s);
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) heights[r * s + c] = h(-500 + c * 10, 500 - r * 10);
    }
    return { sizeM: 1000, samples: s, heights, minElevationM: 0 };
  };

  it('boxes the ground under the water level', () => {
    // A basin of 200 × 100 m centred on (100, −50).
    const t = terrain((x, y) => (Math.abs(x - 100) <= 100 && Math.abs(y + 50) <= 50 ? 0 : 50));
    const b = lakeBounds(t, 10);
    expect(b).toEqual({ minX: 0, maxX: 200, minY: -100, maxY: 0 });
  });

  it('is null without a lake', () => {
    expect(
      lakeBounds(
        terrain(() => 50),
        10,
      ),
    ).toBeNull();
  });
});

describe('waterNormalData', () => {
  const size = 64;
  const data = waterNormalData(size, 0.3);

  it('holds unit normals pointing up', () => {
    for (let i = 0; i < size * size; i++) {
      const n = [0, 1, 2].map((k) => ((data[i * 4 + k] as number) / 255) * 2 - 1) as [
        number,
        number,
        number,
      ];
      expect(Math.hypot(...n)).toBeCloseTo(1, 1);
      expect(n[2]).toBeGreaterThan(0.5);
    }
  });

  it('has ripples of the asked steepness, not a flat sheet', () => {
    let sum = 0;
    for (let i = 0; i < size * size; i++) {
      const x = ((data[i * 4] as number) / 255) * 2 - 1;
      const y = ((data[i * 4 + 1] as number) / 255) * 2 - 1;
      sum += x * x + y * y;
    }
    expect(Math.sqrt(sum / (size * size))).toBeGreaterThan(0.1);
    expect(Math.sqrt(sum / (size * size))).toBeLessThan(0.5);
  });

  it('is deterministic and tiles: the sines have whole numbers of periods', () => {
    expect(Array.from(waterNormalData(size, 0.3).subarray(0, 64))).toEqual(
      Array.from(data.subarray(0, 64)),
    );
    // The next sample after the last column is the first one: neighbours differ little.
    const jump = (a: number, b: number) => Math.abs((data[a] as number) - (data[b] as number));
    let across = 0;
    let inside = 0;
    for (let y = 0; y < size; y++) {
      across += jump((y * size + size - 1) * 4, y * size * 4);
      inside += jump((y * size + 10) * 4, (y * size + 11) * 4);
    }
    expect(across / size).toBeLessThan((inside / size) * 3 + 6);
  });
});
