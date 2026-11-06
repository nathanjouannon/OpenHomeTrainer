// Vegetation of the world (lot 2.6): tree species, the level-of-detail tiers
// they are drawn in around the camera, shrubs, and the grass, tall grass and
// flowers generated in tiles around the camera. No Three.js here, so that it
// can be tested. Frame: x east, y north, z altitude (m), except the instance
// matrices, which are in the scene frame (x east, y up, z south).

import type { Route } from '@hrt/route-engine';
import { VERGE_OUTER_M } from './roadside';
import { inSpan, type VillageSpan } from './settlements';
import { LAYER_COUNT, TERRAIN_LAYERS } from './terrain-splat';
import {
  fadeBandM,
  PLANT_REACH_MARGIN_M,
  REACH_AHEAD,
  reachDistance,
  type ViewDirection,
} from './vegetation-reach';
import { mulberry32, type Terrain, terrainHeightAt, valueNoise2d } from './world-data';

// ---------------------------------------------------------------- species

/** Tree species, in the order of their geometries (see vegetation-builders.ts). */
export const SPECIES = ['spruce', 'pine', 'beech', 'poplar', 'bush'] as const;
export type Species = (typeof SPECIES)[number];
/** Species of the forest (the bush is a shrub). */
export const TREE_SPECIES: readonly Species[] = ['spruce', 'pine', 'beech', 'poplar'];
export const SPECIES_INDEX: Record<Species, number> = {
  spruce: 0,
  pine: 1,
  beech: 2,
  poplar: 3,
  bush: 4,
};

/** Stable pseudo-random value in [0, 1) for a place (never moves a tree). */
export function placeHash(x: number, y: number, salt = 0): number {
  let h =
    (Math.floor(x * 7.31) * 374761393 + Math.floor(y * 7.31) * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Species of a tree: spruces on the high slopes and pines lower down;
 * beeches in the woods, poplars and ashes in the valley.
 */
export function speciesOf(kind: 'conifer' | 'broadleaf', x: number, y: number, z: number): Species {
  const r = placeHash(x, y, 5);
  if (kind === 'conifer') {
    const spruce = z > 1100 ? 0.85 : z > 700 ? 0.6 : 0.4;
    return r < spruce ? 'spruce' : 'pine';
  }
  const poplar = z < 600 ? 0.4 : 0.15;
  return r < poplar ? 'poplar' : 'beech';
}

// ------------------------------------------------------------------- tiers

/** A level of detail: 0 = full model, then simpler ones; the last tier of a group is the imposter. */
export interface TierBuffers {
  matrices: Float32Array;
  colors: Float32Array;
  count: number;
}

export interface VegetationBatch {
  /** Terrain chunk the batch belongs to. */
  chunk: number;
  /** Centre of the chunk (scene x and z). */
  center: { x: number; z: number };
  matrices: Float32Array;
  colors: Float32Array;
  /** Species index of each instance (SPECIES order). */
  species: Uint8Array;
  count: number;
}

export function createTierBuffers(capacity: number): TierBuffers {
  const n = Math.max(1, capacity);
  return { matrices: new Float32Array(n * 16), colors: new Float32Array(n * 3), count: 0 };
}

/**
 * Sorts the instances of the batches within `maxM` of (x, z) into the tiers of
 * their species: `radiiM[k]` is the distance where tier k ends, the last tier
 * going on to `maxM`. `out[species][tier]` are reset, then filled up to their
 * capacity. Returns the number of instances left out for lack of room.
 *
 * With `view`, distances are reach distances (further ahead of the camera,
 * see vegetation-reach.ts) and, when `view.fade` is set, an instance near a
 * limit goes into both tiers around it (and the last tier keeps the plants a
 * little past `maxM`): the materials dither between them.
 */
export function collectTiers(
  batches: readonly VegetationBatch[],
  x: number,
  z: number,
  radiiM: readonly number[],
  maxM: number,
  chunkM: number,
  out: readonly (readonly (TierBuffers | undefined)[])[],
  view?: { dir: ViewDirection; fade: boolean },
): number {
  for (const species of out) for (const tier of species) if (tier) tier.count = 0;
  const fade = view?.fade ?? false;
  const band = (limit: number) => (fade ? fadeBandM(limit) + PLANT_REACH_MARGIN_M : 0);
  const limits = [...radiiM, maxM];
  const last = limits.length - 1;
  const farthest = maxM + band(maxM);
  const reach = farthest * (view ? REACH_AHEAD : 1) + chunkM * Math.SQRT1_2;
  let dropped = 0;
  const push = (b: VegetationBatch, i: number, tier: number) => {
    const buffers = out[b.species[i] as number]?.[tier];
    if (!buffers) return;
    if (buffers.count * 16 >= buffers.matrices.length) {
      dropped++;
      return;
    }
    buffers.matrices.set(b.matrices.subarray(i * 16, i * 16 + 16), buffers.count * 16);
    buffers.colors.set(b.colors.subarray(i * 3, i * 3 + 3), buffers.count * 3);
    buffers.count++;
  };
  for (const b of batches) {
    if (Math.hypot(b.center.x - x, b.center.z - z) > reach) continue;
    for (let i = 0; i < b.count; i++) {
      const dx = (b.matrices[i * 16 + 12] as number) - x;
      const dz = (b.matrices[i * 16 + 14] as number) - z;
      const d = view ? reachDistance(dx, dz, view.dir) : Math.hypot(dx, dz);
      if (d > farthest) continue;
      let tier = 0;
      while (tier < last && d > (limits[tier] as number)) tier++;
      if (tier === last && d > maxM && !fade) continue;
      push(b, i, tier);
      if (!fade) continue;
      // In the band of the limit with the next tier, or of the previous one.
      const next = limits[tier] as number;
      if (tier < last && next - d < band(next)) push(b, i, tier + 1);
      const prev = tier > 0 ? (limits[tier - 1] as number) : null;
      if (prev !== null && d - prev < band(prev)) push(b, i, tier - 1);
    }
  }
  return dropped;
}

// -------------------------------------------------------------- road index

/** Nearest road to a point: distance, and where along which route. */
export interface RoadHit {
  distM: number;
  routeId: string;
  /** Distance along the route (m). */
  alongM: number;
}

/**
 * Spatial hash of the road segments, to ask how far a point is from a road
 * (and which one) in a handful of operations. Roads farther than the cell
 * size are not found: the answer is then Infinity.
 */
export class RoadIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly ax: number[] = [];
  private readonly ay: number[] = [];
  private readonly bx: number[] = [];
  private readonly by: number[] = [];
  private readonly startM: number[] = [];
  private readonly route: number[] = [];
  private readonly ids: string[] = [];

  constructor(
    routes: readonly Route[],
    readonly cellM = 24,
  ) {
    routes.forEach((route, r) => {
      this.ids.push(route.id);
      const n = route.pointCount;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (!route.loop && j === 0) break;
        this.add(
          r,
          route.x[i] as number,
          route.y[i] as number,
          route.x[j] as number,
          route.y[j] as number,
          route.d[i] as number,
        );
      }
    });
  }

  private key(cx: number, cy: number) {
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  private add(r: number, ax: number, ay: number, bx: number, by: number, startM: number) {
    const id = this.ax.length;
    this.ax.push(ax);
    this.ay.push(ay);
    this.bx.push(bx);
    this.by.push(by);
    this.startM.push(startM);
    this.route.push(r);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (this.cellM / 2)));
    let previous = Number.NaN;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const cx = Math.floor((ax + (bx - ax) * f) / this.cellM);
      const cy = Math.floor((ay + (by - ay) * f) / this.cellM);
      const key = this.key(cx, cy);
      if (key === previous) continue;
      previous = key;
      const list = this.cells.get(key);
      if (list) {
        if (list[list.length - 1] !== id) list.push(id);
      } else this.cells.set(key, [id]);
    }
  }

  /** Nearest road within one cell size of (x, y), written into `out`; false when none. */
  nearest(x: number, y: number, out: RoadHit): boolean {
    const cx = Math.floor(x / this.cellM);
    const cy = Math.floor(y / this.cellM);
    let best = Number.POSITIVE_INFINITY;
    let bestAlong = 0;
    let bestRoute = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.cells.get(this.key(cx + dx, cy + dy));
        if (!list) continue;
        for (const s of list) {
          const ax = this.ax[s] as number;
          const ay = this.ay[s] as number;
          const ex = (this.bx[s] as number) - ax;
          const ey = (this.by[s] as number) - ay;
          const len2 = ex * ex + ey * ey;
          const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
          const d = Math.hypot(x - ax - ex * t, y - ay - ey * t);
          if (d < best) {
            best = d;
            bestRoute = this.route[s] as number;
            bestAlong = (this.startM[s] as number) + Math.sqrt(len2) * t;
          }
        }
      }
    }
    if (bestRoute < 0) return false;
    out.distM = best;
    out.routeId = this.ids[bestRoute] as string;
    out.alongM = bestAlong;
    return true;
  }
}

// -------------------------------------------------------------- ground mask

/**
 * Where grass can grow, 0..255 at each heightmap sample: the grass and
 * meadow layers of the splatmap, a little of the bare earth.
 */
export function grassMask(splat: Uint8Array | null, samples: number): Uint8Array {
  const mask = new Uint8Array(samples * samples);
  if (!splat) return mask.fill(180);
  const grass = TERRAIN_LAYERS.indexOf('grass');
  const meadow = TERRAIN_LAYERS.indexOf('meadow');
  const dirt = TERRAIN_LAYERS.indexOf('dirt');
  for (let i = 0; i < mask.length; i++) {
    const o = i * LAYER_COUNT;
    const v =
      (splat[o + grass] as number) +
      (splat[o + meadow] as number) +
      (splat[o + dirt] as number) * 0.25;
    mask[i] = Math.min(255, v);
  }
  return mask;
}

/** Bilinear value of a heightmap-sized mask at (x, y), 0..1. */
export function maskAt(mask: Uint8Array, t: Terrain, x: number, y: number): number {
  const n = t.samples - 1;
  const half = t.sizeM / 2;
  const gx = Math.min(n, Math.max(0, ((x + half) / t.sizeM) * n));
  const gy = Math.min(n, Math.max(0, ((half - y) / t.sizeM) * n));
  const c0 = Math.min(n - 1, Math.floor(gx));
  const r0 = Math.min(n - 1, Math.floor(gy));
  const fx = gx - c0;
  const fy = gy - r0;
  const s = t.samples;
  const m00 = mask[r0 * s + c0] as number;
  const m10 = mask[r0 * s + c0 + 1] as number;
  const m01 = mask[(r0 + 1) * s + c0] as number;
  const m11 = mask[(r0 + 1) * s + c0 + 1] as number;
  return ((m00 * (1 - fx) + m10 * fx) * (1 - fy) + (m01 * (1 - fx) + m11 * fx) * fy) / 255;
}

// ------------------------------------------------------------------ shrubs

export interface ShrubInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  tint: number;
}

/**
 * Shrubs at the edge of the woods and in the hedges of the meadows: where the
 * forest cover is partial, scattered through the open ground, never on the
 * road, in the water, on cliffs or above the tree line.
 */
export function placeShrubs(
  terrain: Terrain,
  roads: RoadIndex,
  forest: (x: number, y: number, z: number) => number,
  waterLevelM: number | null,
  count: number,
  isBlocked: (x: number, y: number) => boolean,
  seed = 23,
): ShrubInstance[] {
  const t = terrain;
  const rand = mulberry32(seed);
  const half = t.sizeM / 2;
  const patches = valueNoise2d(seed + 1);
  const hit: RoadHit = { distM: 0, routeId: '', alongM: 0 };
  const out: ShrubInstance[] = [];
  for (let attempt = 0; out.length < count && attempt < count * 25; attempt++) {
    const x = (rand() * 2 - 1) * (half - 20);
    const y = (rand() * 2 - 1) * (half - 20);
    const z = terrainHeightAt(t, x, y);
    if (waterLevelM !== null && z < waterLevelM + 1.2) continue;
    if (z > 1700) continue;
    const f = forest(x, y, z);
    // Edge of the woods (partial cover), plus scattered ones in the open.
    const edge = Math.min(1, f * 4) * (1 - Math.min(1, Math.max(0, (f - 0.35) / 0.5)));
    const p = (0.18 + 0.82 * edge) * (0.25 + 0.75 * patches(x / 70, y / 70));
    if (rand() > p) continue;
    const slope =
      Math.hypot(
        terrainHeightAt(t, x + 4, y) - terrainHeightAt(t, x - 4, y),
        terrainHeightAt(t, x, y + 4) - terrainHeightAt(t, x, y - 4),
      ) / 8;
    if (slope > 0.8) continue;
    // Off the verge (ditches) and its grass: a few metres from the road edge.
    if (roads.nearest(x, y, hit) && hit.distM < VERGE_OUTER_M + 1.2) continue;
    if (isBlocked(x, y)) continue;
    out.push({
      x,
      y,
      z,
      scale: 0.7 + rand() * 0.9,
      rotation: rand() * Math.PI * 2,
      tint: rand(),
    });
  }
  return out;
}

// ------------------------------------------------------------- grass tiles

export type GrassKind = 'grass' | 'tall' | 'daisy' | 'buttercup' | 'violet';
export const GRASS_KINDS: readonly GrassKind[] = ['grass', 'tall', 'daisy', 'buttercup', 'violet'];

/** What a tile of grass needs to know about the world. */
export interface GrassSource {
  terrain: Terrain;
  /** Altitude of the scene origin (m), see toScene. */
  base: number;
  mask: Uint8Array;
  roads: RoadIndex;
  spans: readonly VillageSpan[];
  /** Lake level (m): no plant grows in or at the very edge of the water. */
  waterLevelM?: number | null;
}

/** Altitudes (m) between which the grass fades out, replaced by mountain ground. */
export const ALPINE_GRASS_M = [600, 1000] as const;
/** Plants stay this far above the lake level (m). */
export const WATER_MARGIN_M = 0.5;

/** Share of the grass left at an altitude, 1 in the valley, 0 on the high roads. */
export function alpineGrassShare(altitudeM: number): number {
  return 1 - smoothstep(ALPINE_GRASS_M[0], ALPINE_GRASS_M[1], altitudeM);
}

export interface GrassTileOptions {
  kind: GrassKind;
  /** Candidate clumps per m² (before the ground and the patches thin them out). */
  density: number;
  /** Tile origin (south-west corner, world x and y) and size (m). */
  x0: number;
  y0: number;
  sizeM: number;
}

/** Writes a clump matrix (Y rotation, scale, translation) at `offset` floats. */
export function writeClumpMatrix(
  out: Float32Array,
  offset: number,
  px: number,
  py: number,
  pz: number,
  rotation: number,
  sx: number,
  sy: number,
): void {
  const c = Math.cos(rotation) * sx;
  const s = Math.sin(rotation) * sx;
  out[offset] = c;
  out[offset + 1] = 0;
  out[offset + 2] = -s;
  out[offset + 3] = 0;
  out[offset + 4] = 0;
  out[offset + 5] = sy;
  out[offset + 6] = 0;
  out[offset + 7] = 0;
  out[offset + 8] = s;
  out[offset + 9] = 0;
  out[offset + 10] = c;
  out[offset + 11] = 0;
  out[offset + 12] = px;
  out[offset + 13] = py;
  out[offset + 14] = pz;
  out[offset + 15] = 1;
}

/** Roadside grass and flowers grow in a band along the verge, this wide (m). */
export const ROADSIDE_BAND_M = 5;
const FLOWER_BAND_M = 9;
const patchNoise = valueNoise2d(41);
const heightNoise = valueNoise2d(43);
const colourNoise = valueNoise2d(47);
const hit: RoadHit = { distM: 0, routeId: '', alongM: 0 };

/**
 * Generates the clumps of one tile into `matrices` (16 floats each, scene
 * frame, from instance 0) and `colors` (3 floats each); returns how many fit
 * (at most the capacity). Deterministic: the same tile always gets the same
 * clumps, so tiles can be dropped and rebuilt as the camera moves.
 *   - grass: everywhere the ground is grassy, in patches, off the verge;
 *   - tall: taller tufts in a band along the verge, thinning out with the distance;
 *   - flowers: patches of one species along the roads and in the meadows.
 */
export function generateGrassTile(
  src: GrassSource,
  o: GrassTileOptions,
  matrices: Float32Array,
  colors: Float32Array,
): number {
  const capacity = Math.floor(matrices.length / 16);
  const t = src.terrain;
  const seed =
    (Math.floor(o.x0 / o.sizeM) * 73856093) ^
    (Math.floor(o.y0 / o.sizeM) * 19349663) ^
    (GRASS_KINDS.indexOf(o.kind) * 83492791);
  const rand = mulberry32(seed);
  const wanted = Math.round(o.density * o.sizeM * o.sizeM);
  // Tiles without a road close enough skip the band kinds altogether.
  const roadside = o.kind !== 'grass';
  if (roadside) {
    const cx = o.x0 + o.sizeM / 2;
    const cy = o.y0 + o.sizeM / 2;
    if (!src.roads.nearest(cx, cy, hit) || hit.distM > o.sizeM * 0.75 + FLOWER_BAND_M) {
      if (o.kind === 'tall' || !flowerMeadow(src, cx, cy)) return 0;
    }
  }
  let n = 0;
  for (let i = 0; i < wanted && n < capacity; i++) {
    const x = o.x0 + rand() * o.sizeM;
    const y = o.y0 + rand() * o.sizeM;
    const roadDist = src.roads.nearest(x, y, hit) ? hit.distM : Number.POSITIVE_INFINITY;
    // The verge (gravel, ditch) stays bare.
    if (roadDist < VERGE_OUTER_M + 0.2) continue;
    if (roadDist < 30 && hit.alongM >= 0 && inSpan(src.spans, hit.routeId, hit.alongM, 0)) {
      // Lawns between the houses are fine, but not on the pavements.
      if (roadDist < VERGE_OUTER_M + 4) continue;
    }
    // No grass on the cliffs and the steep banks of the cuttings.
    const slope =
      Math.hypot(
        terrainHeightAt(t, x + 1.5, y) - terrainHeightAt(t, x - 1.5, y),
        terrainHeightAt(t, x, y + 1.5) - terrainHeightAt(t, x, y - 1.5),
      ) / 3;
    const ground = terrainHeightAt(t, x, y);
    // Nothing grows in the lake, and the grass thins out with the altitude.
    if (src.waterLevelM != null && ground < src.waterLevelM + WATER_MARGIN_M) continue;
    let p =
      maskAt(src.mask, t, x, y) * (1 - smoothstep(0.5, 0.85, slope)) * alpineGrassShare(ground);
    if (p <= 0) continue;
    let heightScale = 1;
    let color = 0;
    const patch = patchNoise(x / 7, y / 7);
    if (o.kind === 'grass') {
      p *= 0.3 + 0.7 * patch;
      heightScale = 0.75 + 0.6 * heightNoise(x / 30, y / 30);
    } else if (o.kind === 'tall') {
      const out = roadDist - (VERGE_OUTER_M + 0.2);
      if (out > ROADSIDE_BAND_M) continue;
      p *= (1 - out / ROADSIDE_BAND_M) * (0.25 + 0.75 * patch);
      heightScale = 0.8 + 0.5 * heightNoise(x / 12, y / 12);
    } else {
      // Flowers: one species per patch, along the roads and in meadows.
      const out = roadDist - (VERGE_OUTER_M + 0.2);
      const along = out < FLOWER_BAND_M ? 1 - out / FLOWER_BAND_M : 0;
      const meadow = flowerPatch(x, y);
      p *= Math.max(along * 0.8, meadow) * smoothstep(0.52, 0.72, patch);
      if (flowerSpecies(x, y) !== o.kind) continue;
      color = 1;
    }
    if (rand() > p) continue;
    const z = ground - src.base;
    // Slightly sunk, so that the roots never float on the bilinear ground.
    const sink = 0.04;
    const scale = (0.7 + 0.6 * rand()) * heightScale;
    writeClumpMatrix(matrices, n * 16, x, z - sink, -y, rand() * Math.PI * 2, scale, scale);
    const shade = 0.82 + 0.3 * rand();
    // Dry patches go yellow.
    const dry = o.kind === 'grass' || o.kind === 'tall' ? colourNoise(x / 40, y / 40) : 0.5;
    colors[n * 3] = shade * (0.95 + 0.25 * dry);
    colors[n * 3 + 1] = shade * (1.02 - 0.06 * dry + 0.02 * color);
    colors[n * 3 + 2] = shade * (0.85 - 0.2 * dry);
    n++;
  }
  return n;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Share of meadow flowers at a place, 0..1 (rare, in patches). */
function flowerPatch(x: number, y: number): number {
  return smoothstep(0.62, 0.8, colourNoise(x / 90 + 17, y / 90 + 5)) * 0.9;
}

/** Whether the tile centre lies in a flowery meadow (tiles away from the roads). */
function flowerMeadow(src: GrassSource, x: number, y: number): boolean {
  return flowerPatch(x, y) > 0.05 && maskAt(src.mask, src.terrain, x, y) > 0.3;
}

/** One species of flower per patch of ~25 m. */
export function flowerSpecies(x: number, y: number): GrassKind {
  const r = placeHash(Math.floor(x / 25), Math.floor(y / 25), 9);
  return r < 0.45 ? 'daisy' : r < 0.75 ? 'buttercup' : 'violet';
}

/** Keys of the tiles of `sizeM` whose centre is within `radiusM` of (x, y). */
export function tilesAround(
  x: number,
  y: number,
  radiusM: number,
  sizeM: number,
  /** Look direction in the world frame (x east, y north): reach distances instead. */
  dir?: { x: number; y: number },
) {
  const out: { ix: number; iy: number }[] = [];
  const box = dir ? radiusM * REACH_AHEAD : radiusM;
  const x0 = Math.floor((x - box) / sizeM);
  const x1 = Math.floor((x + box) / sizeM);
  const y0 = Math.floor((y - box) / sizeM);
  const y1 = Math.floor((y + box) / sizeM);
  // reachDistance takes the scene frame (x, z = -y); the direction is flipped alike.
  const view = dir ? { x: dir.x, z: -dir.y } : null;
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const dx = (ix + 0.5) * sizeM - x;
      const dy = (iy + 0.5) * sizeM - y;
      const d = view ? reachDistance(dx, -dy, view) : Math.hypot(dx, dy);
      if (d <= radiusM) out.push({ ix, iy });
    }
  }
  return out;
}
