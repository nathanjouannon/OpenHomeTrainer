import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { downscale, resizePng, targetSide } from './png-resize';

function image(w: number, h: number, fill: (x: number, y: number) => number[]): PNG {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      png.data.set(fill(x, y), (y * w + x) * 4);
    }
  }
  return png;
}

describe('png-resize', () => {
  it('halves the side until it fits', () => {
    expect(targetSide(2048, 1024)).toBe(1024);
    expect(targetSide(2048, 256)).toBe(256);
    expect(targetSide(256, 1024)).toBe(256);
    expect(targetSide(1000, 300)).toBe(250);
  });

  it('averages the blocks of pixels', () => {
    const src = image(2, 2, (x, y) => [x * 100, y * 100, 50, 255]);
    const out = downscale(src, 2);
    expect([out.width, out.height]).toEqual([1, 1]);
    expect([...out.data]).toEqual([50, 50, 50, 255]);
  });

  it('leaves a small image untouched', () => {
    const buf = PNG.sync.write(image(4, 4, () => [1, 2, 3, 255]));
    expect(resizePng(buf, 8)).toBe(buf);
    const small = PNG.sync.read(Buffer.from(resizePng(buf, 2)));
    expect([small.width, small.height]).toEqual([2, 2]);
  });
});
