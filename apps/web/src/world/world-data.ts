// World loading and terrain preparation (no Three.js here, so it is testable).
// Frame: x east, y north, z altitude (m). The heightmap row 0 is the north edge.

import { Route, type RouteJson, type WorldManifest } from '@hrt/route-engine';
import type { Settlements } from './settlements';

export interface Terrain {
  sizeM: number;
  samples: number;
  /** Absolute altitudes (m), modified along the roads. */
  heights: Float32Array;
  minElevationM: number;
  /** 1 where a sample was lowered for a road (coarse LODs keep these low). */
  nearRoad?: Uint8Array;
  /** Horizontal distance of each sample to the nearest road axis (m), Infinity when far. */
  roadDistM?: Float32Array;
}

/** The ground under the road and its shoulders is sunk this much under the asphalt. */
export const ROAD_SINK_M = 0.6;

export interface WorldData {
  manifest: WorldManifest;
  baseUrl: string;
  terrain: Terrain;
  routes: Map<string, Route>;
}

export const cellSizeM = (t: Terrain) => t.sizeM / (t.samples - 1);

/** Bilinear altitude at (x, y), clamped at the edges. */
export function terrainHeightAt(t: Terrain, x: number, y: number): number {
  const n = t.samples - 1;
  const half = t.sizeM / 2;
  const gx = Math.min(n, Math.max(0, ((x + half) / t.sizeM) * n));
  const gy = Math.min(n, Math.max(0, ((half - y) / t.sizeM) * n));
  const c0 = Math.min(n - 1, Math.floor(gx));
  const r0 = Math.min(n - 1, Math.floor(gy));
  const fx = gx - c0;
  const fy = gy - r0;
  const s = t.samples;
  const h = t.heights;
  const h00 = h[r0 * s + c0] ?? 0;
  const h10 = h[r0 * s + c0 + 1] ?? 0;
  const h01 = h[(r0 + 1) * s + c0] ?? 0;
  const h11 = h[(r0 + 1) * s + c0 + 1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
}

export const WORLD_BASE_URL = '/worlds';

export async function fetchManifest(worldId: string): Promise<WorldManifest> {
  const res = await fetch(`${WORLD_BASE_URL}/${worldId}/world.json`);
  if (!res.ok) throw new Error(`World ${worldId} not found (HTTP ${res.status})`);
  const manifest = (await res.json()) as WorldManifest;
  if (manifest.format !== 'hrt-world/1') throw new Error(`Unsupported world format`);
  return manifest;
}

export async function fetchRoute(worldId: string, file: string): Promise<Route> {
  const res = await fetch(`${WORLD_BASE_URL}/${worldId}/${file}`);
  if (!res.ok) throw new Error(`Route ${file} not found (HTTP ${res.status})`);
  return Route.fromJson((await res.json()) as RouteJson);
}

export async function loadWorld(
  worldId: string,
  onProgress: (fraction: number) => void = () => undefined,
): Promise<WorldData> {
  const manifest = await fetchManifest(worldId);
  onProgress(0.1);
  const baseUrl = `${WORLD_BASE_URL}/${worldId}`;
  const [heightBuf, ...routes] = await Promise.all([
    fetch(`${baseUrl}/${manifest.heightmap.file}`).then((r) => {
      if (!r.ok) throw new Error(`Heightmap not found (HTTP ${r.status})`);
      return r.arrayBuffer();
    }),
    ...manifest.routes.map((r) => fetchRoute(worldId, r.file)),
  ]);
  onProgress(0.6);
  const { samples, sizeM, minElevationM } = manifest.heightmap;
  const heights = new Float32Array(heightBuf as ArrayBuffer);
  if (heights.length !== samples * samples) throw new Error('Heightmap size mismatch');
  const terrain: Terrain = { sizeM, samples, heights, minElevationM };
  const routeMap = new Map(routes.map((r) => [r.id, r]));
  flattenAlongRoutes(terrain, [...routeMap.values()]);
  onProgress(0.8);
  return { manifest, baseUrl, terrain, routes: routeMap };
}

/**
 * Lays the terrain under the roads: flat and sunk ROAD_SINK_M under the
 * asphalt within the road width plus one grid cell (the gravel shoulders hide
 * the step), blended back to the natural ground over `falloffM` (cuts and
 * embankments). Sinking it matters: the terrain grid is coarser than the road,
 * so a flat terrain exactly at road level pokes through on bends and slopes.
 */
export function flattenAlongRoutes(
  t: Terrain,
  routes: readonly Route[],
  halfWidthM = 4,
  falloffM = 30,
): void {
  const s = t.samples;
  const cell = cellSizeM(t);
  const half = t.sizeM / 2;
  // Every vertex of a cell crossed by the road must be flat, otherwise the
  // bilinear surface pokes through the asphalt.
  const fullM = halfWidthM + cell * 1.2;
  const falloff = Math.max(falloffM, fullM + cell);
  const bestDist = new Float32Array(s * s).fill(Number.POSITIVE_INFINITY);
  const target = new Float32Array(s * s);
  const reach = Math.ceil(falloff / cell);
  for (const route of routes) {
    const n = route.pointCount;
    const step = route.lengthM / n;
    const sub = Math.max(1, Math.round(step));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!route.loop && j === 0) break;
      for (let k = 0; k < sub; k++) {
        const f = k / sub;
        const px = (route.x[i] as number) + ((route.x[j] as number) - (route.x[i] as number)) * f;
        const py = (route.y[i] as number) + ((route.y[j] as number) - (route.y[i] as number)) * f;
        const pz = (route.z[i] as number) + ((route.z[j] as number) - (route.z[i] as number)) * f;
        const cc = Math.round((px + half) / cell);
        const rc = Math.round((half - py) / cell);
        for (let r = rc - reach; r <= rc + reach; r++) {
          if (r < 0 || r >= s) continue;
          for (let c = cc - reach; c <= cc + reach; c++) {
            if (c < 0 || c >= s) continue;
            const dist = Math.hypot(-half + c * cell - px, half - r * cell - py);
            const idx = r * s + c;
            if (dist < (bestDist[idx] as number)) {
              bestDist[idx] = dist;
              target[idx] = pz;
            }
          }
        }
      }
    }
  }
  const nearRoad = new Uint8Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const dist = bestDist[i] as number;
    if (dist >= falloff) continue;
    nearRoad[i] = 1;
    const w = dist <= fullM ? 1 : 1 - (dist - fullM) / (falloff - fullM);
    const smooth = w * w * (3 - 2 * w);
    const h = t.heights[i] as number;
    const flat = (target[i] as number) - ROAD_SINK_M;
    // Never raise the ground next to a road above the sunk level (no grass on the asphalt).
    t.heights[i] = dist <= fullM ? flat : h + (flat - h) * smooth;
  }
  t.nearRoad = nearRoad;
  t.roadDistM = bestDist;
}

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

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  /** 0..1, used for the colour variation. */
  tint: number;
  kind: 'conifer' | 'broadleaf';
}

/**
 * Where nothing may grow: within `clearanceM` of a road, under a building or
 * a parked car, on the pavements of a village. Returns a test for a place (x, y).
 */
export function occupancy(
  world: Pick<WorldData, 'terrain' | 'routes'>,
  built: Pick<Settlements, 'buildings' | 'parkedCars' | 'spans'> | undefined,
  clearanceM: number,
): (x: number, y: number) => boolean {
  const t = world.terrain;
  const half = t.sizeM / 2;
  const occCell = 6;
  const occN = Math.ceil(t.sizeM / occCell);
  const blocked = new Uint8Array(occN * occN);
  const reach = Math.ceil(clearanceM / occCell);
  for (const route of world.routes.values()) {
    for (let i = 0; i < route.pointCount; i++) {
      const gc = Math.floor(((route.x[i] as number) + half) / occCell);
      const gr = Math.floor((half - (route.y[i] as number)) / occCell);
      for (let r = gr - reach; r <= gr + reach; r++) {
        for (let c = gc - reach; c <= gc + reach; c++) {
          if (r >= 0 && c >= 0 && r < occN && c < occN) blocked[r * occN + c] = 1;
        }
      }
    }
  }
  const block = (x: number, y: number, radius: number) => {
    const r = Math.ceil(radius / occCell);
    const gc = Math.floor((x + half) / occCell);
    const gr = Math.floor((half - y) / occCell);
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const rr = gr + dr;
        const cc = gc + dc;
        if (rr >= 0 && cc >= 0 && rr < occN && cc < occN) blocked[rr * occN + cc] = 1;
      }
    }
  };
  // No tree through a roof, a car or a village sidewalk.
  for (const b of built?.buildings ?? []) {
    // A decorated house also keeps its garden (fence, gravel path) clear of trees.
    block(b.x, b.y, Math.max(b.width, b.depth) / 2 + 2 + (b.lot ? b.lot.frontM : 0));
  }
  for (const c of built?.parkedCars ?? []) block(c.x, c.y, 3);
  for (const span of built?.spans ?? []) {
    const route = world.routes.get(span.routeId);
    if (!route) continue;
    for (let d = span.fromM; d < span.toM; d += 5) {
      const p = route.sampleAt(d);
      block(p.x, p.y, 9);
    }
  }
  return (x, y) => {
    const gc = Math.floor((x + half) / occCell);
    const gr = Math.floor((half - y) / occCell);
    return gc < 0 || gr < 0 || gc >= occN || gr >= occN || blocked[gr * occN + gc] === 1;
  };
}

/**
 * Procedural forest: patches of trees (value noise), none on roads, water,
 * cliffs or above the tree line; conifers higher up.
 */
export function placeTrees(
  world: Pick<WorldData, 'terrain' | 'routes' | 'manifest'>,
  count: number,
  seed = 7,
  built?: Pick<Settlements, 'buildings' | 'parkedCars' | 'spans'>,
): TreeInstance[] {
  const t = world.terrain;
  const rand = mulberry32(seed);
  const half = t.sizeM / 2;
  const isBlocked = occupancy(world, built, 10);
  const water = world.manifest.waterLevelM;
  const forest = forestCover(seed);
  const out: TreeInstance[] = [];
  for (let attempt = 0; out.length < count && attempt < count * 30; attempt++) {
    const x = (rand() * 2 - 1) * (half - 20);
    const y = (rand() * 2 - 1) * (half - 20);
    if (isBlocked(x, y)) continue;
    const z = terrainHeightAt(t, x, y);
    if (water !== null && z < water + 1.5) continue;
    if (z > 1750 + rand() * 150) continue;
    const slope =
      Math.hypot(
        terrainHeightAt(t, x + 5, y) - terrainHeightAt(t, x - 5, y),
        terrainHeightAt(t, x, y + 5) - terrainHeightAt(t, x, y - 5),
      ) / 10;
    if (slope > 0.9) continue;
    if (rand() > forest(x, y, z)) continue;
    const conifer = z > 900 ? rand() < 0.85 : rand() < 0.35;
    out.push({
      x,
      y,
      z,
      scale: 0.7 + rand() * 0.7,
      rotation: rand() * Math.PI * 2,
      tint: rand(),
      kind: conifer ? 'conifer' : 'broadleaf',
    });
  }
  return out;
}

/**
 * Share of the trees kept at (x, y, z), 0..1 (before the road, water, slope
 * and altitude rules): forest patches and open meadows, the valley floor
 * mostly open fields. Also the forest floor of the terrain (lot 2.4).
 */
export function forestCover(seed = 7): (x: number, y: number, z: number) => number {
  const noise = valueNoise2d(seed);
  return (x, y, z) => {
    const density = noise(x / 900, y / 900) * 0.7 + noise(x / 220, y / 220) * 0.3;
    const valley = z < 520 ? 0.45 : 0;
    return Math.min(1, Math.max(0, density * 1.6 - 0.45 - valley));
  };
}

/** Smooth value noise in 0..1, period-free, one unit = one cell. */
export function valueNoise2d(seed: number): (x: number, y: number) => number {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x, y) => {
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
  };
}
