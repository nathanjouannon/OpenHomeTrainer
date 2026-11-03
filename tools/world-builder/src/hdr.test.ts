import { describe, expect, it } from 'vitest';
import {
  clipHighlights,
  findSun,
  type HdrImage,
  luminancePercentile,
  parseHdr,
  writeHdr,
} from './hdr';

function image(width: number, height: number, fill = 0.5): HdrImage {
  const data = new Float32Array(width * height * 3);
  for (let i = 0; i < data.length; i++) data[i] = fill * (1 + (i % 7) / 10);
  return { width, height, data };
}

describe('hdr', () => {
  it('round-trips through RLE scanlines within the RGBE precision', () => {
    const img = image(300, 4);
    img.data[0] = 1234;
    img.data[5] = 0;
    const back = parseHdr(writeHdr(img));
    expect(back.width).toBe(300);
    expect(back.height).toBe(4);
    // RGBE shares one exponent per pixel: the error is relative to the brightest channel.
    for (let i = 0; i < img.data.length; i++) {
      const o = i - (i % 3);
      const max = Math.max(...img.data.subarray(o, o + 3));
      const a = img.data[i] as number;
      expect(Math.abs((back.data[i] as number) - a)).toBeLessThanOrEqual(max / 128 + 1e-6);
    }
  });

  it('finds the sun and gives its direction in the equirectangular convention', () => {
    const img = image(64, 32, 0.2);
    // Top quarter of the image (elevation ≈ +45°), three quarters across (azimuth ≈ +90°).
    const x = 48;
    const y = 8;
    img.data.set([5000, 4800, 4500], (y * 64 + x) * 3);
    const sun = findSun(img);
    expect((sun.azimuthRad * 180) / Math.PI).toBeCloseTo(92.8, 0);
    expect((sun.elevationRad * 180) / Math.PI).toBeCloseTo(42.2, 0);
    expect(sun.peak).toBeGreaterThan(4000);
  });

  it('clips only the highlights, keeping their hue', () => {
    const img = image(16, 8, 0.2);
    img.data.fill(0.2);
    img.data.set([100, 50, 25], 0);
    const level = luminancePercentile(img, 0.99);
    expect(clipHighlights(img, level)).toBe(1);
    const [r, g, b] = img.data;
    expect((r as number) / (g as number)).toBeCloseTo(2);
    expect((g as number) / (b as number)).toBeCloseTo(2);
    expect(0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number)).toBeCloseTo(
      level,
    );
  });
});
