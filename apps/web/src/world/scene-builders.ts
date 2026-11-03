// Three.js geometry builders for the world (terrain chunks, roads, trees).
// Scene frame: X = east, Y = up (altitude − base), Z = south (= −north).

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cellSizeM, mulberry32, type Terrain, type TreeInstance } from './world-data';

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
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
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
 * Tree models: one merged geometry per kind, with vertex colours (darker
 * towards the bottom, a cheap ambient occlusion) and jittered vertices so the
 * crowns look organic rather than geometric.
 */
export function treeGeometries(): { conifer: BufferGeometry; broadleaf: BufferGeometry } {
  const rand = mulberry32(17);
  const shade = (g: BufferGeometry, hex: string, jitter: number) => {
    const geometry = g.index ? g.toNonIndexed() : g;
    const pos = geometry.getAttribute('position');
    const c = new Color(hex);
    const colors = new Float32Array(pos.count * 3);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const minY = box?.min.y ?? 0;
    const spanY = Math.max(0.01, (box?.max.y ?? 1) - minY);
    // Same displacement for vertices at the same place, so faces stay closed.
    const offsets = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let o = offsets.get(key);
      if (!o) {
        o = [(rand() - 0.5) * jitter, (rand() - 0.5) * jitter, (rand() - 0.5) * jitter];
        offsets.set(key, o);
      }
      const k = 0.6 + 0.4 * ((pos.getY(i) - minY) / spanY);
      pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
      colors.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry;
  };
  const trunk = () =>
    shade(new CylinderGeometry(0.14, 0.26, 3.2, 6, 1, true).translate(0, 1.6, 0), '#5a4330', 0);
  const conifer = mergeGeometries([
    trunk(),
    shade(new ConeGeometry(2.3, 3.6, 9, 1, true).translate(0, 3.4, 0), '#ffffff', 0.35),
    shade(new ConeGeometry(1.9, 3.3, 9, 1, true).translate(0, 5.1, 0), '#ffffff', 0.3),
    shade(new ConeGeometry(1.45, 3, 8, 1, true).translate(0, 6.7, 0), '#ffffff', 0.25),
    shade(new ConeGeometry(0.9, 2.4, 7, 1, true).translate(0, 8.2, 0), '#ffffff', 0.15),
  ]);
  const broadleaf = mergeGeometries([
    trunk(),
    shade(new IcosahedronGeometry(2.2, 0).scale(1.1, 0.85, 1).translate(0, 4.6, 0), '#ffffff', 0.7),
    shade(new IcosahedronGeometry(1.7, 0).translate(1.2, 5.6, 0.4), '#ffffff', 0.5),
    shade(new IcosahedronGeometry(1.6, 0).translate(-1.0, 5.4, -0.7), '#ffffff', 0.5),
    shade(new IcosahedronGeometry(1.5, 0).translate(0.1, 6.6, 0.2), '#ffffff', 0.45),
  ]);
  if (!conifer || !broadleaf) throw new Error('Could not build tree geometries');
  conifer.computeVertexNormals();
  broadleaf.computeVertexNormals();
  return { conifer, broadleaf };
}

/**
 * Low-poly silhouettes of the tree models, only drawn into the shadow maps
 * (about a quarter of the triangles; nobody sees the shape of a shadow's facets).
 */
export function shadowTreeGeometries(): { conifer: BufferGeometry; broadleaf: BufferGeometry } {
  // Positions only, non-indexed (the icosahedron has no index).
  const flat = (g: BufferGeometry) => {
    const out = new BufferGeometry();
    out.setAttribute('position', (g.index ? g.toNonIndexed() : g).getAttribute('position'));
    return out;
  };
  const trunk = () => flat(new CylinderGeometry(0.2, 0.2, 3.2, 3, 1, true).translate(0, 1.6, 0));
  const conifer = mergeGeometries([
    trunk(),
    flat(new ConeGeometry(2.2, 4.4, 6, 1, true).translate(0, 3.6, 0)),
    flat(new ConeGeometry(1.5, 4.2, 6, 1, true).translate(0, 6.6, 0)),
  ]);
  const broadleaf = mergeGeometries([
    trunk(),
    flat(new IcosahedronGeometry(2.6, 0).scale(1.1, 0.95, 1).translate(0, 5.2, 0)),
  ]);
  if (!conifer || !broadleaf) throw new Error('Could not build tree shadow geometries');
  return { conifer, broadleaf };
}

export interface TreeBatch {
  kind: TreeInstance['kind'];
  chunk: number;
  center: Vector3;
  matrices: Float32Array;
  colors: Float32Array;
  count: number;
}

/** Groups trees by terrain chunk and kind, ready for InstancedMesh. */
export function batchTrees(trees: readonly TreeInstance[], t: Terrain, base: number): TreeBatch[] {
  const half = t.sizeM / 2;
  const chunkM = t.sizeM / CHUNKS_PER_SIDE;
  const groups = new Map<string, TreeInstance[]>();
  for (const tree of trees) {
    const col = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((tree.x + half) / chunkM));
    const row = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((half - tree.y) / chunkM));
    const key = `${row * CHUNKS_PER_SIDE + col}:${tree.kind}`;
    const list = groups.get(key) ?? [];
    list.push(tree);
    groups.set(key, list);
  }
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const pos = new Vector3();
  const scale = new Vector3();
  const color = new Color();
  const out: TreeBatch[] = [];
  for (const [key, list] of groups) {
    const [chunkStr, kind] = key.split(':') as [string, TreeInstance['kind']];
    const chunk = Number(chunkStr);
    const matrices = new Float32Array(list.length * 16);
    const colors = new Float32Array(list.length * 3);
    list.forEach((tree, i) => {
      toScene(tree.x, tree.y, tree.z - 0.3, base, pos);
      q.setFromAxisAngle(up, tree.rotation);
      scale.set(tree.scale, tree.scale * (0.85 + tree.tint * 0.4), tree.scale);
      m.compose(pos, q, scale).toArray(matrices, i * 16);
      if (kind === 'conifer') color.setHSL(0.3 + tree.tint * 0.05, 0.4, 0.16 + tree.tint * 0.07);
      else color.setHSL(0.22 + tree.tint * 0.08, 0.45, 0.22 + tree.tint * 0.1);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const row = Math.floor(chunk / CHUNKS_PER_SIDE);
    const col = chunk % CHUNKS_PER_SIDE;
    const center = new Vector3(-half + (col + 0.5) * chunkM, 0, -half + (row + 0.5) * chunkM);
    out.push({ kind, chunk, center, matrices, colors, count: list.length });
  }
  return out;
}

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

/** Same as `collectNear`, over the tree batches of one kind. */
export function collectNearTrees(
  batches: readonly TreeBatch[],
  kind: TreeInstance['kind'],
  x: number,
  z: number,
  radiusM: number,
  chunkSizeM: number,
  out: Float32Array,
): number {
  // A batch covers one chunk: skip those entirely out of reach.
  const reach = radiusM + chunkSizeM * Math.SQRT1_2;
  let n = 0;
  for (const b of batches) {
    if (b.kind !== kind) continue;
    if (Math.hypot(b.center.x - x, b.center.z - z) > reach) continue;
    n = collectNear(b.matrices, b.count, x, z, radiusM, out, n);
  }
  return n;
}
