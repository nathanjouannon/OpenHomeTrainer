// Water of the lake (lot 2.7): where it is, and the normal map of its ripples.
// No Three.js here, so that it can be tested.

import { mulberry32, type Terrain } from './world-data';

export interface LakeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Bounding box (x east, y north, m) of the ground under `levelM`, null when dry. */
export function lakeBounds(t: Terrain, levelM: number): LakeBounds | null {
  const s = t.samples;
  const cell = t.sizeM / (s - 1);
  const half = t.sizeM / 2;
  let minC = s;
  let maxC = -1;
  let minR = s;
  let maxR = -1;
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      if ((t.heights[r * s + c] as number) >= levelM) continue;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }
  if (maxC < 0) return null;
  return {
    minX: -half + minC * cell,
    maxX: -half + maxC * cell,
    minY: half - maxR * cell,
    maxY: half - minR * cell,
  };
}

export const WATER_NORMAL_SIZE = 256;

/**
 * RGBA bytes of a seamless normal map of small waves: a sum of sines with
 * whole numbers of periods (so that it tiles exactly), their slopes computed
 * analytically. Encoded as usual (n × 0.5 + 0.5), blue = up.
 */
export function waterNormalData(size = WATER_NORMAL_SIZE, slope = 0.3): Uint8Array {
  const rand = mulberry32(2711);
  const waves: { kx: number; ky: number; amp: number; phase: number }[] = [];
  for (let i = 0; i < 16; i++) {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      kx = Math.round((rand() * 2 - 1) * 26);
      ky = Math.round((rand() * 2 - 1) * 26);
    }
    waves.push({ kx, ky, amp: 1 / Math.hypot(kx, ky) ** 1.1, phase: rand() * Math.PI * 2 });
  }
  // Scale so that the mean slope is `slope`.
  const norm =
    slope /
    Math.sqrt(
      waves.reduce((a, w) => a + (w.amp * 2 * Math.PI * Math.hypot(w.kx, w.ky)) ** 2 / 2, 0),
    );
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c =
          Math.cos(2 * Math.PI * (w.kx * u + w.ky * v) + w.phase) * w.amp * 2 * Math.PI * norm;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const len = Math.hypot(dx, dy, 1);
      const o = (py * size + px) * 4;
      data[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  return data;
}
