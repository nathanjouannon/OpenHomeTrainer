// Three.js geometry builders for the world (terrain chunks, roads, trees).
// Scene frame: X = east, Y = up (altitude − base), Z = south (= −north).

import type { Route } from '@hrt/route-engine';
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
  const put = (v: number, r: number, c: number, drop: number) => {
    const i = r * s + c;
    const z = t.heights[i] as number;
    positions.set([-half + c * cell, z - baseElevation - drop, -half + r * cell], v * 3);
    norms.set(
      [normals[i * 3] as number, normals[i * 3 + 1] as number, normals[i * 3 + 2] as number],
      v * 3,
    );
    terrainColor(z, normals[i * 3 + 1] as number, i, waterLevel, color);
    colors.set([color.r, color.g, color.b], v * 3);
    uvs.set([(c * cell) / 24, (r * cell) / 24], v * 2);
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
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(3);
  for (let i = 0; i < size * size; i++) {
    const v = 200 + rand() * 55;
    img.data.set([v, v, v * 0.97, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export const ROAD_WIDTH_M = 6.5;
/** Length of one repetition of the road texture (dash + gap), m. */
const ROAD_TEXTURE_LENGTH_M = 12;

/** Asphalt with edge lines and a dashed centre line. */
export function roadTexture(): CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#4a4a4d';
  ctx.fillRect(0, 0, w, h);
  const rand = mulberry32(11);
  for (let i = 0; i < 4000; i++) {
    const v = 55 + rand() * 40;
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
  ctx.fillStyle = '#e8e8e0';
  ctx.fillRect(5, 0, 4, h);
  ctx.fillRect(w - 9, 0, 4, h);
  ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);
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

/** Ribbon mesh following a route, closed at the line for a loop. */
export function buildRoadGeometry(
  route: Route,
  base: number,
  widthM = ROAD_WIDTH_M,
): BufferGeometry {
  const n = route.pointCount;
  const count = route.loop ? n + 1 : n;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const normals = new Float32Array(count * 2 * 3);
  for (let k = 0; k < count; k++) {
    const i = k % n;
    const hd = route.heading[i] as number;
    // Right of the direction of travel: heading + 90°.
    const rx = Math.cos(hd) * (widthM / 2);
    const ry = -Math.sin(hd) * (widthM / 2);
    const x = route.x[i] as number;
    const y = route.y[i] as number;
    const z = (route.z[i] as number) - base + 0.04;
    positions.set([x - rx, z, -(y - ry), x + rx, z, -(y + ry)], k * 6);
    const d = k === n ? route.lengthM : (route.d[i] as number);
    const v = d / ROAD_TEXTURE_LENGTH_M;
    uvs.set([0, v, 1, v], k * 4);
    normals.set([0, 1, 0, 0, 1, 0], k * 6);
  }
  const indices: number[] = [];
  for (let k = 0; k < count - 1; k++) {
    const a = k * 2;
    const b = (k + 1) * 2;
    // Counter-clockwise seen from above.
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/** Tree models: one merged geometry per kind, coloured with vertex colours. */
export function treeGeometries(): { conifer: BufferGeometry; broadleaf: BufferGeometry } {
  const paint = (g: BufferGeometry, hex: string) => {
    const c = new Color(hex);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const trunk = () =>
    paint(new CylinderGeometry(0.15, 0.25, 3, 5, 1, true).translate(0, 1.5, 0), '#4a3524');
  const conifer = mergeGeometries([
    trunk(),
    paint(new ConeGeometry(2.1, 5, 7, 1, true).translate(0, 4.5, 0), '#ffffff'),
    paint(new ConeGeometry(1.5, 4, 7, 1, true).translate(0, 7, 0), '#ffffff'),
  ]);
  const broadleaf = mergeGeometries([
    trunk(),
    paint(new IcosahedronGeometry(2.6, 0).scale(1, 0.85, 1).translate(0, 5, 0), '#ffffff'),
  ]);
  if (!conifer || !broadleaf) throw new Error('Could not build tree geometries');
  conifer.computeVertexNormals();
  broadleaf.computeVertexNormals();
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
