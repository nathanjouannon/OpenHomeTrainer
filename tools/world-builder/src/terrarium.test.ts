import { describe, expect, it } from 'vitest';
import { decodeTerrarium, lonLatToPixel, metersPerPixel, offsetToLonLat } from './terrarium';

describe('terrarium', () => {
  it('decodes elevations', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(132, 76, 128)).toBeCloseTo(1100.5);
  });

  it('maps lon/lat to pixels', () => {
    expect(lonLatToPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const p = lonLatToPixel(5.55, 45.07, 13);
    expect(Math.floor(p.x / 256)).toBe(4222);
    expect(Math.floor(p.y / 256)).toBe(2944);
  });

  it('computes ground resolution', () => {
    expect(metersPerPixel(0, 13)).toBeCloseTo(19.11, 1);
  });

  it('converts local offsets', () => {
    const p = offsetToLonLat({ lat: 45, lon: 5 }, 0, 1113.2);
    expect(p.lat).toBeCloseTo(45.01);
    expect(p.lon).toBe(5);
  });
});
