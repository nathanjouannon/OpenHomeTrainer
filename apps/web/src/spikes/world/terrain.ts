import { BufferAttribute, BufferGeometry, Color } from 'three';

/**
 * Square heightfield centered on the origin.
 * x points east, z points south (row 0 = north edge), y is up.
 * Heights are relative to `baseElevationM` to keep float precision.
 */
export interface Heightfield {
  sizeM: number;
  samples: number;
  heights: Float32Array;
  baseElevationM: number;
  source: 'dem' | 'procedural';
  attribution?: string;
}

interface HeightmapMeta {
  format: string;
  sizeM: number;
  samples: number;
  minElevationM: number;
  attribution: string;
}

/** Loads the heightmap produced by `pnpm fetch-dem`, or falls back to procedural terrain. */
export async function loadHeightfield(baseUrl = '/worlds/spike'): Promise<Heightfield> {
  try {
    const metaRes = await fetch(`${baseUrl}/heightmap.json`);
    if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
    const meta = (await metaRes.json()) as HeightmapMeta;
    const binRes = await fetch(`${baseUrl}/heightmap.bin`);
    if (!binRes.ok) throw new Error(`HTTP ${binRes.status}`);
    const raw = new Float32Array(await binRes.arrayBuffer());
    if (raw.length !== meta.samples * meta.samples) throw new Error('Heightmap size mismatch');
    const base = meta.minElevationM;
    const heights = raw.map((h) => h - base);
    return {
      sizeM: meta.sizeM,
      samples: meta.samples,
      heights,
      baseElevationM: base,
      source: 'dem',
      attribution: meta.attribution,
    };
  } catch {
    return proceduralHeightfield();
  }
}

// Deterministic value noise (fBm), used when no DEM is available.
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export function proceduralHeightfield(sizeM = 4000, samples = 513): Heightfield {
  const heights = new Float32Array(samples * samples);
  for (let r = 0; r < samples; r++) {
    for (let c = 0; c < samples; c++) {
      const x = (c / (samples - 1)) * 6;
      const y = (r / (samples - 1)) * 6;
      let h = 0;
      let amp = 220;
      let freq = 1;
      for (let o = 0; o < 6; o++) {
        h += valueNoise(x * freq, y * freq) * amp;
        amp *= 0.45;
        freq *= 2.1;
      }
      heights[r * samples + c] = h;
    }
  }
  return { sizeM, samples, heights, baseElevationM: 600, source: 'procedural' };
}

export const cellSize = (hf: Heightfield) => hf.sizeM / (hf.samples - 1);

/** Bilinear height at world position (x, z). */
export function heightAt(hf: Heightfield, x: number, z: number): number {
  const half = hf.sizeM / 2;
  const n = hf.samples - 1;
  const gx = Math.min(n, Math.max(0, ((x + half) / hf.sizeM) * n));
  const gz = Math.min(n, Math.max(0, ((z + half) / hf.sizeM) * n));
  const c0 = Math.min(n - 1, Math.floor(gx));
  const r0 = Math.min(n - 1, Math.floor(gz));
  const fx = gx - c0;
  const fz = gz - r0;
  const s = hf.samples;
  const h = hf.heights;
  const h00 = h[r0 * s + c0] ?? 0;
  const h10 = h[r0 * s + c0 + 1] ?? 0;
  const h01 = h[(r0 + 1) * s + c0] ?? 0;
  const h11 = h[(r0 + 1) * s + c0 + 1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

const GRASS = new Color('#5d7a3a');
const DRY = new Color('#8a8455');
const ROCK = new Color('#7d776f');

/** Grid mesh with vertex colors by slope (grass → rock). */
export function buildTerrainGeometry(hf: Heightfield): BufferGeometry {
  const s = hf.samples;
  const half = hf.sizeM / 2;
  const cell = cellSize(hf);
  const positions = new Float32Array(s * s * 3);
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      const i = r * s + c;
      positions[i * 3] = -half + c * cell;
      positions[i * 3 + 1] = hf.heights[i] ?? 0;
      positions[i * 3 + 2] = -half + r * cell;
    }
  }
  const indices = new Uint32Array((s - 1) * (s - 1) * 6);
  let k = 0;
  for (let r = 0; r < s - 1; r++) {
    for (let c = 0; c < s - 1; c++) {
      const a = r * s + c;
      const b = a + 1;
      const d = a + s;
      const e = d + 1;
      indices.set([a, d, b, b, d, e], k);
      k += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(s * s * 3);
  const color = new Color();
  for (let i = 0; i < s * s; i++) {
    const up = normals.getY(i);
    const rockiness = Math.min(1, Math.max(0, (0.93 - up) / 0.2));
    const dryness = hash(i, 7) * 0.35;
    color.copy(GRASS).lerp(DRY, dryness).lerp(ROCK, rockiness);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
