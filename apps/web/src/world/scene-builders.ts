// Three.js geometry builders for the world (terrain chunks, roads).
// Scene frame: X = east, Y = up (altitude − base), Z = south (= −north).

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { LAYER_COUNT } from './terrain-splat';
import { cellSizeM, mulberry32, type Terrain } from './world-data';

export const CHUNKS_PER_SIDE = 8;
export const LOD_STEPS = [1, 2, 4] as const;

/** Per-sample normals of the whole heightmap (no seams between chunks). */
export function terrainNormals(t: Terrain): Float32Array {
  const s = t.samples;
  const cell = cellSizeM(t);
  const out = new Float32Array(s * s * 3);
  const h = (r: number, c: number) =>
    t.heights[Math.min(s - 1, Math.max(0, r)) * s + Math.min(s - 1, Math.max(0, c))] as number;
  const n = new Vector3();
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      // Scene X = column (east), scene Z = row (south).
      const dx = (h(r, c + 1) - h(r, c - 1)) / (2 * cell);
      const dz = (h(r + 1, c) - h(r - 1, c)) / (2 * cell);
      n.set(-dx, 1, -dz).normalize();
      out.set([n.x, n.y, n.z], (r * s + c) * 3);
    }
  }
  return out;
}

const GRASS = new Color('#5a7a35');
const MEADOW = new Color('#7d8f45');
const FOREST_FLOOR = new Color('#3f5a2a');
const ROCK = new Color('#857d72');
const SNOW = new Color('#eef1f4');
const SHORE = new Color('#8f8a63');

function hash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Terrain colour from altitude and slope (grass → rock → snow). */
function terrainColor(z: number, up: number, i: number, waterLevel: number | null, out: Color) {
  const rockiness = Math.min(1, Math.max(0, (0.86 - up) / 0.18));
  const variation = hash(i);
  out.copy(GRASS).lerp(MEADOW, variation * 0.6);
  if (z > 800) out.lerp(FOREST_FLOOR, Math.min(1, (z - 800) / 500) * 0.6);
  if (waterLevel !== null && z < waterLevel + 2.5) out.lerp(SHORE, 0.7);
  out.lerp(ROCK, rockiness);
  if (z > 1850) out.lerp(SNOW, Math.min(1, (z - 1850) / 250) * (1 - rockiness * 0.6));
  return out;
}

/**
 * Geometry of one terrain chunk at a LOD step, with a skirt hanging down along
 * the edges to hide cracks between chunks at different LODs.
 */
export function buildChunkGeometry(
  t: Terrain,
  normals: Float32Array,
  chunkRow: number,
  chunkCol: number,
  step: number,
  baseElevation: number,
  waterLevel: number | null,
  /** Splat weights per sample (terrain-splat.ts), for the PBR terrain material. */
  splat: Uint8Array | null = null,
): BufferGeometry {
  const s = t.samples;
  const cellsPerChunk = (s - 1) / CHUNKS_PER_SIDE;
  const n = cellsPerChunk / step + 1;
  const cell = cellSizeM(t);
  const half = t.sizeM / 2;
  const r0 = chunkRow * cellsPerChunk;
  const c0 = chunkCol * cellsPerChunk;
  const skirt = 4 * (n - 1);
  const vertexCount = n * n + skirt;
  const positions = new Float32Array(vertexCount * 3);
  const norms = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const splat0 = splat ? new Uint8Array(vertexCount * 3) : null;
  const splat1 = splat ? new Uint8Array(vertexCount * 3) : null;
  const color = new Color();
  // Coarse LODs skip samples: near a road, take the lowest sample of the
  // skipped block so the coarse surface never rises above the asphalt.
  const heightOf = (r: number, c: number) => {
    const i = r * s + c;
    if (step === 1 || !t.nearRoad) return t.heights[i] as number;
    let min = t.heights[i] as number;
    let near = t.nearRoad[i] === 1;
    for (let dr = -step + 1; dr < step; dr++) {
      for (let dc = -step + 1; dc < step; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= s || cc >= s) continue;
        const j = rr * s + cc;
        if (t.nearRoad[j]) near = true;
        min = Math.min(min, t.heights[j] as number);
      }
    }
    return near ? min : (t.heights[i] as number);
  };
  const put = (v: number, r: number, c: number, drop: number) => {
    const i = r * s + c;
    const z = heightOf(r, c);
    positions.set([-half + c * cell, z - baseElevation - drop, -half + r * cell], v * 3);
    norms.set(
      [normals[i * 3] as number, normals[i * 3 + 1] as number, normals[i * 3 + 2] as number],
      v * 3,
    );
    terrainColor(z, normals[i * 3 + 1] as number, i, waterLevel, color);
    colors.set([color.r, color.g, color.b], v * 3);
    uvs.set([(c * cell) / 4, (r * cell) / 4], v * 2);
    if (splat && splat0 && splat1) {
      splat0.set(splat.subarray(i * LAYER_COUNT, i * LAYER_COUNT + 3), v * 3);
      splat1.set(splat.subarray(i * LAYER_COUNT + 3, i * LAYER_COUNT + 6), v * 3);
    }
  };
  for (let j = 0; j < n; j++)
    for (let k = 0; k < n; k++) put(j * n + k, r0 + j * step, c0 + k * step, 0);

  const indices: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let k = 0; k < n - 1; k++) {
      const a = j * n + k;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  // Skirt: walk the border clockwise, duplicate each vertex 15 m lower.
  const border: number[] = [];
  for (let k = 0; k < n - 1; k++) border.push(k);
  for (let j = 0; j < n - 1; j++) border.push(j * n + n - 1);
  for (let k = n - 1; k > 0; k--) border.push((n - 1) * n + k);
  for (let j = n - 1; j > 0; j--) border.push(j * n);
  border.forEach((top, idx) => {
    const r = r0 + Math.floor(top / n) * step;
    const c = c0 + (top % n) * step;
    put(n * n + idx, r, c, 15);
  });
  for (let idx = 0; idx < border.length; idx++) {
    const a = border[idx] as number;
    const b = border[(idx + 1) % border.length] as number;
    const a2 = n * n + idx;
    const b2 = n * n + ((idx + 1) % border.length);
    indices.push(a, b, a2, b, b2, a2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(norms, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  if (splat0 && splat1) {
    g.setAttribute('splat0', new BufferAttribute(splat0, 3, true));
    g.setAttribute('splat1', new BufferAttribute(splat1, 3, true));
  }
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Terrain attributes at any point (x east, y north): splat weights
 * interpolated between the heightmap samples, fallback colour and detail
 * texture coordinates as on the chunks. Used by the verges of the roads.
 */
export function groundSampler(
  t: Terrain,
  normals: Float32Array,
  waterLevel: number | null,
  splat: Uint8Array | null,
): (
  x: number,
  y: number,
) => {
  splat: number[];
  color: [number, number, number];
  uv: [number, number];
} {
  const s = t.samples;
  const cell = cellSizeM(t);
  const half = t.sizeM / 2;
  const color = new Color();
  return (x, y) => {
    const gc = Math.min(s - 1, Math.max(0, (x + half) / cell));
    const gr = Math.min(s - 1, Math.max(0, (half - y) / cell));
    const c0 = Math.min(s - 2, Math.floor(gc));
    const r0 = Math.min(s - 2, Math.floor(gr));
    const fc = gc - c0;
    const fr = gr - r0;
    const weights = new Array<number>(LAYER_COUNT).fill(0);
    if (splat) {
      const corners: [number, number, number][] = [
        [r0, c0, (1 - fr) * (1 - fc)],
        [r0, c0 + 1, (1 - fr) * fc],
        [r0 + 1, c0, fr * (1 - fc)],
        [r0 + 1, c0 + 1, fr * fc],
      ];
      for (const [r, c, w] of corners) {
        for (let k = 0; k < LAYER_COUNT; k++) {
          weights[k] =
            (weights[k] as number) + ((splat[(r * s + c) * LAYER_COUNT + k] as number) / 255) * w;
        }
      }
    } else {
      weights[0] = 1;
    }
    const i = Math.round(gr) * s + Math.round(gc);
    terrainColor(t.heights[i] as number, normals[i * 3 + 1] as number, i, waterLevel, color);
    return {
      splat: weights,
      color: [color.r, color.g, color.b],
      uv: [(x + half) / 4, (half - y) / 4],
    };
  };
}

/** Grainy detail texture multiplied over the vertex colours. */
export function terrainDetailTexture(): CanvasTexture {
  // One tile = 4 × 4 m of meadow: short blades of varying brightness and hue,
  // multiplied over the vertex colours (so it stays close to white).
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = 'rgb(214,220,205)';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(3);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const l = 3 + rand() * 6;
    const a = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    const v = 150 + rand() * 105;
    ctx.strokeStyle = `rgb(${v * (0.92 + rand() * 0.12)},${v},${v * (0.8 + rand() * 0.12)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Scene position of a world point. */
export const toScene = (x: number, y: number, z: number, base: number, out = new Vector3()) =>
  out.set(x, z - base, -y);

/**
 * Appends to `out` (from instance `start`) the instance matrices of `matrices`
 * whose position is within `radiusM` of (x, z), horizontally; returns the new
 * instance count, at most `out.length / 16`. Feeds the shadow-only copies of
 * instanced objects around the camera.
 */
export function collectNear(
  matrices: ArrayLike<number> & { subarray(a: number, b: number): Float32Array },
  count: number,
  x: number,
  z: number,
  radiusM: number,
  out: Float32Array,
  start = 0,
): number {
  const max = Math.floor(out.length / 16);
  const r2 = radiusM * radiusM;
  let n = start;
  for (let i = 0; i < count && n < max; i++) {
    const dx = (matrices[i * 16 + 12] as number) - x;
    const dz = (matrices[i * 16 + 14] as number) - z;
    if (dx * dx + dz * dz > r2) continue;
    out.set(matrices.subarray(i * 16, i * 16 + 16), n * 16);
    n++;
  }
  return n;
}
