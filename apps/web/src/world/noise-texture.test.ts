import { describe, expect, it } from 'vitest';
import { NOISE_TEXTURE_SIZE, noiseData } from './noise-texture';

describe('noise texture', () => {
  const size = NOISE_TEXTURE_SIZE;
  const data = noiseData(size);
  const at = (x: number, y: number, ch: number) => data[(y * size + x) * 4 + ch] as number;

  it('spreads each channel over the whole range, centred on the middle', () => {
    for (let ch = 0; ch < 4; ch++) {
      let sum = 0;
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < size * size; i++) {
        const v = data[i * 4 + ch] as number;
        sum += v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      expect(sum / (size * size)).toBeGreaterThan(100);
      expect(sum / (size * size)).toBeLessThan(155);
      expect(hi - lo).toBeGreaterThan(180);
    }
  });

  it('is smooth and tiles without a seam', () => {
    let inside = 0;
    let seam = 0;
    for (let y = 0; y < size; y++) {
      inside = Math.max(inside, Math.abs(at(100, y, 0) - at(101, y, 0)));
      seam = Math.max(seam, Math.abs(at(size - 1, y, 0) - at(0, y, 0)));
    }
    // White noise would jump by up to 255 between neighbours.
    expect(inside).toBeLessThan(64);
    expect(seam).toBeLessThan(64);
  });

  it('gives four independent channels', () => {
    let same = 0;
    for (let i = 0; i < size * size; i += 97) {
      if (Math.abs((data[i * 4] as number) - (data[i * 4 + 1] as number)) < 3) same++;
    }
    expect(same / ((size * size) / 97)).toBeLessThan(0.1);
  });
});
