// Box-filter downscaling of PNG images (lot 2.10): the Quaternius textures are
// 2048 px, far more than a rider seen from a few metres needs.

import { PNG } from 'pngjs';

/** Largest power-of-two side ≤ `maxSide` that divides the image side. */
export function targetSide(side: number, maxSide: number): number {
  let s = side;
  while (s > maxSide && s % 2 === 0) s /= 2;
  return s;
}

/** Averages `factor × factor` pixel blocks (all four channels). */
export function downscale(src: PNG, factor: number): PNG {
  if (factor <= 1) return src;
  const width = Math.floor(src.width / factor);
  const height = Math.floor(src.height / factor);
  const out = new PNG({ width, height });
  const n = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            sum += src.data[((y * factor + dy) * src.width + x * factor + dx) * 4 + c] as number;
          }
        }
        out.data[(y * width + x) * 4 + c] = Math.round(sum / n);
      }
    }
  }
  return out;
}

/** Re-encodes `buf` with its longest side at most `maxSide` (power-of-two steps). */
export function resizePng(buf: Uint8Array, maxSide: number): Uint8Array {
  const src = PNG.sync.read(Buffer.from(buf));
  const side = targetSide(Math.max(src.width, src.height), maxSide);
  const factor = Math.max(src.width, src.height) / side;
  if (factor <= 1) return buf;
  return PNG.sync.write(downscale(src, factor));
}
