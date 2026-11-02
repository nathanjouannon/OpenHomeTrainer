import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import type { RoadLoop } from './road';
import { type Heightfield, heightAt } from './terrain';

/** Small seeded PRNG: the same seed always gives the same forest. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TreeInstances {
  count: number;
  matrices: Float32Array;
  colors: Float32Array;
}

const ROAD_CLEARANCE_M = 12;

/** Places `count` trees on the terrain, away from the road. */
export function placeTrees(
  hf: Heightfield,
  road: RoadLoop,
  count: number,
  seed = 42,
): TreeInstances {
  const rand = mulberry32(seed);
  const half = hf.sizeM / 2 - 50;

  // Coarse occupancy grid of cells too close to the road.
  const cell = 8;
  const gridSize = Math.ceil(hf.sizeM / cell);
  const blocked = new Uint8Array(gridSize * gridSize);
  const reach = Math.ceil(ROAD_CLEARANCE_M / cell);
  for (const p of road.points) {
    const gc = Math.floor((p.x + hf.sizeM / 2) / cell);
    const gr = Math.floor((p.z + hf.sizeM / 2) / cell);
    for (let r = gr - reach; r <= gr + reach; r++) {
      for (let c = gc - reach; c <= gc + reach; c++) {
        if (r >= 0 && c >= 0 && r < gridSize && c < gridSize) blocked[r * gridSize + c] = 1;
      }
    }
  }

  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 3);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const pos = new Vector3();
  const scale = new Vector3();
  const color = new Color();
  let placed = 0;
  for (let attempt = 0; placed < count && attempt < count * 20; attempt++) {
    const x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    const gc = Math.floor((x + hf.sizeM / 2) / cell);
    const gr = Math.floor((z + hf.sizeM / 2) / cell);
    if (blocked[gr * gridSize + gc]) continue;
    const s = 0.7 + rand() * 0.8;
    pos.set(x, heightAt(hf, x, z) - 0.3, z);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    scale.set(s, s * (0.85 + rand() * 0.4), s);
    m.compose(pos, q, scale).toArray(matrices, placed * 16);
    color.setHSL(0.27 + rand() * 0.08, 0.45 + rand() * 0.2, 0.18 + rand() * 0.1);
    colors.set([color.r, color.g, color.b], placed * 3);
    placed++;
  }
  return { count: placed, matrices, colors };
}
