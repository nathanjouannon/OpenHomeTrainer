// Roadside layout (lot 2.5): the stretches of each road that get a guardrail,
// a low stone wall or a field fence, the depth of the ditches, the delineator
// posts, and the samples of a road already drawn by an earlier route (shared
// stretches). Also the instance matrices of the roadside modules. No Three.js
// here, so that it can be tested. Frame: x east, y north, z altitude.

import type { Route } from '@hrt/route-engine';
import { inSpan, lateral, type Prop, ROAD_HALF_WIDTH_M, type VillageSpan } from './settlements';
import { type Terrain, terrainHeightAt, valueNoise2d } from './world-data';

/** Texture layers of the roads, in the order of their texture arrays. */
export const ROAD_LAYERS = ['asphalt', 'gravel', 'masonry'] as const;
export type RoadLayer = (typeof ROAD_LAYERS)[number];

/** Size of one repetition of each road texture (m). */
export const ROAD_TILE_M: Record<RoadLayer, number> = { asphalt: 2, gravel: 1.6, masonry: 2.4 };

/** Width of the gravel shoulder beyond the asphalt (m). */
export const SHOULDER_WIDTH_M = 0.7;

/**
 * Cross-section of the verge, from the asphalt edge outwards: gravel
 * shoulder, then a grass slope down to the sunk ground (`flat`), or a ditch
 * and its outer bank (`ditch`). Heights are relative to the road axis; the
 * last point dives just under the terrain, sunk ROAD_SINK_M under the road.
 * The terrain cuts the bottom of the deepest ditches flat.
 */
export const VERGE_PROFILE = [
  { offsetM: ROAD_HALF_WIDTH_M - 0.03, flat: 0.035, ditch: 0.035 },
  { offsetM: ROAD_HALF_WIDTH_M + SHOULDER_WIDTH_M, flat: -0.01, ditch: -0.01 },
  { offsetM: ROAD_HALF_WIDTH_M + 1.1, flat: -0.17, ditch: -0.2 },
  { offsetM: ROAD_HALF_WIDTH_M + 1.8, flat: -0.36, ditch: -0.7 },
  { offsetM: ROAD_HALF_WIDTH_M + 2.5, flat: -0.5, ditch: -0.3 },
  { offsetM: ROAD_HALF_WIDTH_M + 3.3, flat: -0.68, ditch: -0.68 },
] as const;

/** Outer edge of the verge: the terrain takes over from here (m from the axis). */
export const VERGE_OUTER_M = VERGE_PROFILE[5].offsetM;

export type RunKind = 'guardrail' | 'wall' | 'fence';

/** A stretch of one side of a road lined with guardrails, a wall or a fence. */
export interface RoadsideRun {
  routeId: string;
  /** 1 = right of the direction of travel, −1 = left. */
  side: 1 | -1;
  kind: RunKind;
  fromM: number;
  toM: number;
}

/** Placement of each kind of module: distance from the axis, base height, length. */
export const MODULES: Record<
  RunKind,
  { offsetM: number; lengthM: number; base: { dzM: number } | 'terrain' }
> = {
  // Post line on the outer edge of the shoulder, beam facing the road.
  guardrail: { offsetM: ROAD_HALF_WIDTH_M + 0.95, lengthM: 4, base: { dzM: -0.06 } },
  // Wall centre just beyond the shoulder (the wall is 0.45 m thick).
  wall: { offsetM: ROAD_HALF_WIDTH_M + 1.0, lengthM: 2, base: { dzM: -0.08 } },
  // Field fences stand on the ground beyond the verge.
  fence: { offsetM: VERGE_OUTER_M + 2.2, lengthM: 3, base: 'terrain' },
};

export interface RoadsideLayout {
  runs: RoadsideRun[];
  delineators: Prop[];
  /** Per route and sample: 1 when an earlier route already draws the road there. */
  shared: Map<string, Uint8Array>;
  /**
   * Per route and sample: 1 where the road crosses (or meets) a road drawn
   * before it, another route or its own earlier passage: its asphalt goes
   * a few millimetres over the other one there instead of fighting it.
   */
  crossing?: Map<string, Uint8Array>;
  /** Per route: ditch depth 0..1 at each sample, right side then left side. */
  ditch: Map<string, [Float32Array, Float32Array]>;
}

export interface RoadsideInput {
  /** Terrain already flattened along the roads (natural beyond ~30 m). */
  terrain: Terrain;
  routes: readonly Route[];
  spans: readonly VillageSpan[];
  /** Buildings and other places where no fence may run. */
  buildings: readonly { x: number; y: number }[];
  waterLevelM: number | null;
  /** Forest cover 0..1 (fences only run along open fields). */
  forest: (x: number, y: number, z: number) => number;
  seed?: number;
}

/** Thresholds of the layout rules (exported for the tests). */
export const RULES = {
  /**
   * Two routes closer than this share the road (m). A loop laid on the road
   * of another (world-builder, network.ts) has its samples on that road's
   * line, between two of its samples 5 m apart: up to 2.5 m from the nearest.
   */
  sharedM: 2.6,
  /** No furniture and no ditch where another road passes within this distance (m). */
  junctionM: 14,
  /** Furniture keeps this far from the village spans (m). */
  villageMarginM: 25,
  /** Guardrail: the ground falls by more than this at 35 m and at 60 m from the axis. */
  guardrailDrop35M: 12,
  guardrailDrop60M: 24,
  /** Stone parapet instead, by patches, where the ground falls less steeply. */
  wallDrop35M: 6,
  wallDrop60M: 12,
  /** Stone walls along the lake: shore within this distance of the axis (m). */
  shoreM: 32,
  /** Fences: open, gently sloping fields, away from buildings. */
  fenceMaxDropM: 2.5,
  fenceMaxForest: 0.2,
  fenceMaxAltitudeM: 1400,
  fenceBuildingClearM: 35,
  /** Gaps up to this length inside a run are filled (m). */
  fillGapM: 30,
  /** Shortest run kept, by kind (m). */
  minRunM: { guardrail: 40, wall: 30, fence: 45 } as Record<RunKind, number>,
  delineatorStepM: 50,
} as const;

/** A sample within this distance of an earlier road's sample lies on the crossing (m). */
const CROSSING_REACH_M = ROAD_HALF_WIDTH_M * 2 + 1;

/** Spatial hash of the route samples, for the "another road nearby" tests. */
class SampleGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly cellM = 20;

  constructor(private readonly routes: readonly Route[]) {
    routes.forEach((r, ri) => {
      for (let i = 0; i < r.pointCount; i++) {
        const key = this.key(r.x[i] as number, r.y[i] as number);
        const list = this.cells.get(key) ?? [];
        if (list.length === 0) this.cells.set(key, list);
        list.push(ri, i);
      }
    });
  }

  private key(x: number, y: number) {
    return Math.floor(x / this.cellM) * 100_003 + Math.floor(y / this.cellM);
  }

  /**
   * True if a sample of another road lies within `radius` of (x, y): another
   * route (only those before `ri` when `earlierOnly`), or the same route more
   * than 60 m away along it (the other leg of a hairpin; when `earlierOnly`,
   * only before `d`: a loop that rides a road twice, out and back, lot 2.13).
   */
  near(ri: number, d: number, x: number, y: number, radius: number, earlierOnly = false) {
    const reach = Math.ceil(radius / this.cellM);
    const cx = Math.floor(x / this.cellM);
    const cy = Math.floor(y / this.cellM);
    const r2 = radius * radius;
    const route = this.routes[ri] as Route;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gy = cy - reach; gy <= cy + reach; gy++) {
        const list = this.cells.get(gx * 100_003 + gy);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const oi = list[k] as number;
          const i = list[k + 1] as number;
          if (earlierOnly && oi > ri) continue;
          const other = this.routes[oi] as Route;
          if (oi === ri) {
            if (earlierOnly && (other.d[i] as number) >= d) continue;
            const dd = Math.abs((other.d[i] as number) - d);
            if (Math.min(dd, route.lengthM - dd) < 60) continue;
          }
          const dx = (other.x[i] as number) - x;
          const dy = (other.y[i] as number) - y;
          if (dx * dx + dy * dy < r2) return true;
        }
      }
    }
    return false;
  }
}

type SampleKind = RunKind | null;

/** Turns per-sample kinds into runs: short gaps filled, short runs dropped. */
export function samplesToRuns(
  kinds: readonly SampleKind[],
  stepM: number,
  lengthM: number,
): { kind: RunKind; fromM: number; toM: number }[] {
  const n = kinds.length;
  const fill = Math.round(RULES.fillGapM / stepM);
  const filled = kinds.slice();
  // Fill short gaps between two samples of the same kind.
  let last: { kind: RunKind; i: number } | null = null;
  for (let i = 0; i < n; i++) {
    const k = kinds[i];
    if (!k) continue;
    if (last && last.kind === k && i - last.i > 1 && i - last.i <= fill + 1) {
      for (let j = last.i + 1; j < i; j++) filled[j] = k;
    }
    last = { kind: k, i };
  }
  const runs: { kind: RunKind; fromM: number; toM: number }[] = [];
  let i = 0;
  while (i < n) {
    const k = filled[i];
    if (!k) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && filled[j + 1] === k) j++;
    const fromM = i * stepM;
    const toM = Math.min(lengthM, (j + 1) * stepM);
    if (toM - fromM >= RULES.minRunM[k]) runs.push({ kind: k, fromM, toM });
    i = j + 1;
  }
  return runs;
}

export function planRoadside(input: RoadsideInput): RoadsideLayout {
  const { terrain: t, routes, spans, waterLevelM, forest } = input;
  const grid = new SampleGrid(routes);
  const noise = valueNoise2d(input.seed ?? 21);
  const buildingGrid = new SampleGridPoints(input.buildings, RULES.fenceBuildingClearM);
  const runs: RoadsideRun[] = [];
  const delineators: Prop[] = [];
  const shared = new Map<string, Uint8Array>();
  const crossing = new Map<string, Uint8Array>();
  const ditch = new Map<string, [Float32Array, Float32Array]>();

  routes.forEach((route, ri) => {
    const n = route.pointCount;
    const step = route.lengthM / n;
    const L = route.lengthM;
    const sharedMask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const d = route.d[i] as number;
      if (grid.near(ri, d, route.x[i] as number, route.y[i] as number, RULES.sharedM, true)) {
        sharedMask[i] = 1;
      }
    }
    shared.set(route.id, sharedMask);
    const crossMask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (sharedMask[i]) continue;
      const d = route.d[i] as number;
      if (grid.near(ri, d, route.x[i] as number, route.y[i] as number, CROSSING_REACH_M, true)) {
        crossMask[i] = 1;
      }
    }
    crossing.set(route.id, crossMask);
    const ditches: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
    ditch.set(route.id, ditches);

    for (const side of [1, -1] as const) {
      const kinds: SampleKind[] = new Array(n).fill(null);
      const depth = ditches[side === 1 ? 0 : 1];
      // Samples that must stay without a ditch, even after smoothing.
      const noDitch = new Uint8Array(n).fill(1);
      for (let i = 0; i < n; i++) {
        if (sharedMask[i]) continue;
        const d = route.d[i] as number;
        const z = route.z[i] as number;
        const at = (o: number) => lateral(route, d, side * o);
        const near = at(VERGE_OUTER_M + 2);
        const inVillage =
          inSpan(spans, route.id, d, L) ||
          inSpan(spans, route.id, (d + RULES.villageMarginM) % L, L) ||
          inSpan(spans, route.id, (d - RULES.villageMarginM + L) % L, L);
        const junction =
          grid.near(ri, d, route.x[i] as number, route.y[i] as number, RULES.junctionM) ||
          grid.near(ri, d, near.x, near.y, RULES.junctionM - 4);
        if (inVillage || junction) continue;
        const ground = (o: number) => {
          const p = at(o);
          return terrainHeightAt(t, p.x, p.y);
        };
        const drop35 = z - ground(35);
        const drop60 = z - ground(60);
        const shore = waterLevelM !== null && ground(RULES.shoreM) < waterLevelM;
        // Old masonry parapets by patches, more of them low down.
        const masonry = noise(near.x / 500 - 11.3, near.y / 500 + 4.7) > (z < 900 ? 0.45 : 0.6);
        let kind: SampleKind = null;
        if (drop35 > RULES.guardrailDrop35M && drop60 > RULES.guardrailDrop60M) {
          // Walls on the less steep drops only; guardrails above the steepest.
          kind = masonry && drop35 < RULES.guardrailDrop35M * 1.6 ? 'wall' : 'guardrail';
        } else if (drop35 > RULES.wallDrop35M && drop60 > RULES.wallDrop60M) {
          kind = masonry ? 'wall' : null;
        } else if (shore) {
          kind = noise(near.x / 200, near.y / 200) > 0.4 ? 'wall' : null;
        } else {
          const f = at(MODULES.fence.offsetM + 2);
          const fz = terrainHeightAt(t, f.x, f.y);
          const open =
            Math.abs(drop35) < RULES.fenceMaxDropM &&
            Math.abs(drop60) < RULES.fenceMaxDropM * 2 &&
            fz < RULES.fenceMaxAltitudeM &&
            forest(f.x, f.y, fz) < RULES.fenceMaxForest &&
            !buildingGrid.near(f.x, f.y);
          // Pastures by patches (about one open field in two is fenced).
          if (open && noise(f.x / 350 + 7.1, f.y / 350 - 3.3) > 0.5) kind = 'fence';
        }
        kinds[i] = kind;
        // Ditches on flat ground and on the uphill side, none above a drop.
        if (!shore && drop35 < 2.5) {
          const rise = -drop35;
          const patches = 0.25 + 0.75 * noise(near.x / 140, near.y / 140);
          depth[i] = rise > 1.5 ? 1 : patches;
          noDitch[i] = 0;
        }
      }
      for (const r of samplesToRuns(kinds, step, L)) {
        runs.push({ routeId: route.id, side, ...r });
        // Nothing to dig under a guardrail or a wall.
        if (r.kind !== 'fence') {
          for (let i = Math.floor(r.fromM / step); i * step < r.toM && i < n; i++) noDitch[i] = 1;
        }
      }
      for (let i = 0; i < n; i++) if (noDitch[i]) depth[i] = 0;
      // Ditches fade in and out where they start and stop.
      smoothInPlace(depth, 3);
      for (let i = 0; i < n; i++) if (noDitch[i]) depth[i] = 0;

      // Delineators: every 50 m where no guardrail or wall stands.
      for (let d = 0; d < L; d += RULES.delineatorStepM) {
        const i = Math.min(n - 1, Math.round(d / step));
        if (sharedMask[i]) continue;
        if (inSpan(spans, route.id, d, L)) continue;
        const guarded = runs.some(
          (r) =>
            r.routeId === route.id &&
            r.side === side &&
            r.kind !== 'fence' &&
            d >= r.fromM - 5 &&
            d <= r.toM + 5,
        );
        if (guarded) continue;
        const p = lateral(route, d, side * (ROAD_HALF_WIDTH_M + SHOULDER_WIDTH_M + 0.1));
        if (grid.near(ri, d, p.x, p.y, ROAD_HALF_WIDTH_M + 1)) continue;
        if (waterLevelM !== null && terrainHeightAt(t, p.x, p.y) < waterLevelM + 0.3) continue;
        delineators.push({ x: p.x, y: p.y, z: p.z - 0.04, yaw: p.heading });
      }
    }
  });
  return { runs, delineators, shared, crossing, ditch };
}

/** Moving average over ±`radius` samples (no wrap: the ends just average less). */
function smoothInPlace(a: Float32Array, radius: number) {
  const src = a.slice();
  for (let i = 0; i < a.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k++) {
      const v = src[i + k];
      if (v === undefined) continue;
      sum += v;
      count++;
    }
    a[i] = sum / count;
  }
}

/** Points with a clearance radius, looked up on a coarse grid. */
class SampleGridPoints {
  private readonly cells = new Map<number, { x: number; y: number }[]>();

  constructor(
    points: readonly { x: number; y: number }[],
    private readonly radius: number,
  ) {
    for (const p of points) {
      const key = this.key(p.x, p.y);
      const list = this.cells.get(key) ?? [];
      if (list.length === 0) this.cells.set(key, list);
      list.push(p);
    }
  }

  private key(x: number, y: number) {
    return Math.floor(x / this.radius) * 100_003 + Math.floor(y / this.radius);
  }

  near(x: number, y: number): boolean {
    const cx = Math.floor(x / this.radius);
    const cy = Math.floor(y / this.radius);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const p of this.cells.get(gx * 100_003 + gy) ?? []) {
          if (Math.hypot(p.x - x, p.y - y) < this.radius) return true;
        }
      }
    }
    return false;
  }
}

/** Ditch depth 0..1 at distance `d` of a route (linear between samples). */
export function ditchAt(depth: Float32Array, stepM: number, d: number): number {
  const f = d / stepM;
  const i = Math.floor(f);
  const a = depth[Math.min(depth.length - 1, Math.max(0, i))] ?? 0;
  const b = depth[(i + 1) % depth.length] ?? a;
  return a + (b - a) * (f - i);
}

/** Height a guardrail beam sinks to at the ends of a run (m). */
export const GUARDRAIL_END_DROP_M = 0.75;

/**
 * Instance matrices (column-major, scene frame: X east, Y up, Z south) of the
 * modules of a run. A module's geometry runs along local +Z from 0 to its
 * nominal length, with +X towards the road and +Y up. The matrices are
 * sheared rather than rotated: the posts stay vertical on slopes while the
 * rails follow the road. The modules are stretched to fill the run exactly.
 */
export function runMatrices(
  route: Route,
  run: RoadsideRun,
  terrain: Terrain,
  base: number,
): Float32Array {
  const spec = MODULES[run.kind];
  const length = run.toM - run.fromM;
  const count = Math.max(1, Math.round(length / spec.lengthM));
  const stepM = length / count;
  // Along the right side, local +X (left of the module) points to the road;
  // along the left side, the modules run backwards.
  const points: { x: number; y: number; z: number }[] = [];
  for (let k = 0; k <= count; k++) {
    const d = run.fromM + k * stepM;
    const p = lateral(route, d % route.lengthM, run.side * spec.offsetM);
    const z = spec.base === 'terrain' ? terrainHeightAt(terrain, p.x, p.y) : p.z + spec.base.dzM;
    points.push({ x: p.x, y: p.y, z });
  }
  if (run.side === -1) points.reverse();
  const out = new Float32Array(count * 16);
  const ramp = run.kind === 'guardrail' ? GUARDRAIL_END_DROP_M / spec.lengthM : 0;
  for (let k = 0; k < count; k++) {
    const a = points[k] as { x: number; y: number; z: number };
    const b = points[k + 1] as { x: number; y: number; z: number };
    // Scene coordinates.
    const ax = a.x;
    const ay = a.z - base;
    const az = -a.y;
    const cx = b.x - a.x;
    const cy = b.z - a.z;
    const cz = -(b.y - a.y);
    const h = Math.hypot(cx, cz) || 1;
    // X = up × chord direction (horizontal, unit).
    const xx = cz / h;
    const xz = -cx / h;
    let zy = cy / spec.lengthM;
    let oy = ay;
    if (k === 0) {
      zy += ramp;
      oy -= ramp * spec.lengthM;
    }
    if (k === count - 1) zy -= ramp;
    out.set(
      [xx, 0, xz, 0, 0, 1, 0, 0, cx / spec.lengthM, zy, cz / spec.lengthM, 0, ax, oy, az, 1],
      k * 16,
    );
  }
  return out;
}
