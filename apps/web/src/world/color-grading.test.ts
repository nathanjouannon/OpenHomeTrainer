import { describe, expect, it } from 'vitest';
import { buildGradingLut, gradeColor, WORLD_LOOK } from './color-grading';

const NEUTRAL = { contrast: 1, saturation: 1, warmth: 0 };

describe('color grading', () => {
  it('leaves colours unchanged with a neutral look', () => {
    for (const [r, g, b] of [
      [0.1, 0.5, 0.9],
      [0.3, 0.3, 0.3],
      [1, 0, 0.5],
    ] as const) {
      const [cr, cg, cb] = gradeColor(r, g, b, NEUTRAL);
      expect(cr).toBeCloseTo(r);
      expect(cg).toBeCloseTo(g);
      expect(cb).toBeCloseTo(b);
    }
  });

  it('keeps black, mid grey and white in place', () => {
    for (const v of [0, 0.5, 1]) {
      const [r, g, b] = gradeColor(v, v, v, WORLD_LOOK);
      expect(r).toBeCloseTo(v, 1);
      expect(g).toBeCloseTo(v, 1);
      expect(b).toBeCloseTo(v, 1);
    }
  });

  it('never inverts the order of grey levels', () => {
    let prev = -1;
    for (let i = 0; i <= 64; i++) {
      const [, g] = gradeColor(i / 64, i / 64, i / 64, WORLD_LOOK);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it('adds contrast and saturation', () => {
    const [dark] = gradeColor(0.25, 0.25, 0.25, WORLD_LOOK);
    const [light] = gradeColor(0.75, 0.75, 0.75, WORLD_LOOK);
    expect(dark).toBeLessThan(0.25);
    expect(light).toBeGreaterThan(0.75);
    const [r, g, b] = gradeColor(0.3, 0.5, 0.2, WORLD_LOOK);
    expect(g - Math.min(r, b)).toBeGreaterThan(0.5 - 0.2);
  });

  it('builds a size³ RGBA table, red varying fastest', () => {
    const lut = buildGradingLut(4, NEUTRAL);
    expect(lut.length).toBe(4 * 4 * 4 * 4);
    expect([...lut.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...lut.subarray(4, 8)]).toEqual([85, 0, 0, 255]);
    expect([...lut.subarray(lut.length - 4)]).toEqual([255, 255, 255, 255]);
  });
});
