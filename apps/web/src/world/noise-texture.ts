// Tileable value noise in a small texture: four independent channels, each a
// smooth noise of 32 cells per repetition (plus a finer octave). A shader
// reads four noises with one texture fetch, far cheaper than computing
// Perlin noise per pixel (lot 2.5: the asphalt shader).

import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { mulberry32 } from './world-data';

export const NOISE_TEXTURE_SIZE = 256;
/** Noise cells per repetition of the texture (coarse octave). */
export const NOISE_CELLS = 32;

/** One channel: value noise on a periodic lattice, smoothstep-interpolated. */
function tileableNoise(size: number, cells: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const lattice = Float32Array.from({ length: cells * cells }, () => rand());
  const out = new Float32Array(size * size);
  const at = (x: number, y: number) =>
    lattice[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)] as number;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size) * cells;
      const y = (py / size) * cells;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      out[py * size + px] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

/** RGBA bytes of the noise texture (exported for the tests). */
export function noiseData(size = NOISE_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let ch = 0; ch < 4; ch++) {
    const coarse = tileableNoise(size, NOISE_CELLS, 101 + ch * 17);
    const fine = tileableNoise(size, NOISE_CELLS * 2, 211 + ch * 23);
    for (let i = 0; i < size * size; i++) {
      // Two octaves, remapped so that the values spread over 0..1.
      const v = ((coarse[i] as number) * 0.7 + (fine[i] as number) * 0.3 - 0.5) * 1.6 + 0.5;
      data[i * 4 + ch] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
  }
  return data;
}

let shared: DataTexture | null = null;

/** The noise texture, created once and shared by the materials. */
export function noiseTexture(): DataTexture {
  if (shared) return shared;
  const t = new DataTexture(noiseData(), NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.colorSpace = NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  shared = t;
  return t;
}
