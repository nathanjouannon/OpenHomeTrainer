// Villages, farms and roadside details, generated from the routes (no Three.js).
// Frame: x east, y north, z altitude. `yaw` is a heading (0 = north, clockwise).

import type { Route } from '@hrt/route-engine';
import { mulberry32, type Terrain, terrainHeightAt } from './world-data';

export interface VillageDef {
  id: string;
  name: string;
  /** World position (x east, y north), m. */
  center: [number, number];
  radiusM: number;
}

export const ROAD_HALF_WIDTH_M = 3.25;
export const SIDEWALK_WIDTH_M = 2;
export const SIDEWALK_HEIGHT_M = 0.14;

export interface Building {
  x: number;
  y: number;
  /** Ground floor level. */
  z: number;
  /** Direction the facade faces. */
  yaw: number;
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  kind: 'house' | 'farmhouse' | 'barn';
  /** Index in the colour palettes. */
  wallTint: number;
  roofTint: number;
}

export interface Prop {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ParkedCar extends Prop {
  color: number;
}

export interface VillageSign extends Prop {
  name: string;
  /** End of the village (name crossed out). */
  end: boolean;
}

/** A stretch of a route inside a village: sidewalks, lamps, pedestrians. */
export interface VillageSpan {
  routeId: string;
  village: string;
  fromM: number;
  toM: number;
}

export interface Pedestrian {
  routeId: string;
  /** Distance along the route, m. */
  startM: number;
  span: VillageSpan;
  /** 1 = right side of the road, −1 = left. */
  side: 1 | -1;
  speedMs: number;
  color: number;
}

export interface Settlements {
  buildings: Building[];
  spans: VillageSpan[];
  lamps: Prop[];
  signs: VillageSign[];
  parkedCars: ParkedCar[];
  pedestrians: Pedestrian[];
}

/** Coarse occupancy grid of the world (4 m cells). */
class Grid {
  readonly cell = 4;
  readonly n: number;
  readonly data: Uint8Array;
  private readonly half: number;

  constructor(sizeM: number) {
    this.n = Math.ceil(sizeM / this.cell);
    this.data = new Uint8Array(this.n * this.n);
    this.half = sizeM / 2;
  }

  private idx(x: number, y: number): number {
    const c = Math.floor((x + this.half) / this.cell);
    const r = Math.floor((this.half - y) / this.cell);
    if (c < 0 || r < 0 || c >= this.n || r >= this.n) return -1;
    return r * this.n + c;
  }

  mark(x: number, y: number, radius: number, value = 1) {
    const reach = Math.ceil(radius / this.cell);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.hypot(dx, dy) * this.cell > radius) continue;
        const i = this.idx(x + dx * this.cell, y + dy * this.cell);
        if (i >= 0) this.data[i] = Math.max(this.data[i] as number, value);
      }
    }
  }

  get(x: number, y: number): number {
    const i = this.idx(x, y);
    return i < 0 ? 255 : (this.data[i] as number);
  }

  /** True if a rotated rectangle only covers free cells. */
  rectFree(x: number, y: number, yaw: number, w: number, d: number): boolean {
    const fx = Math.sin(yaw);
    const fy = Math.cos(yaw);
    for (let a = -w / 2; a <= w / 2; a += 2) {
      for (let b = -d / 2; b <= d / 2; b += 2) {
        // Facade direction (fx, fy); width runs along its right-hand side.
        if (this.get(x + fy * a + fx * b, y - fx * a + fy * b) !== 0) return false;
      }
    }
    return true;
  }

  markRect(x: number, y: number, yaw: number, w: number, d: number, margin: number) {
    const fx = Math.sin(yaw);
    const fy = Math.cos(yaw);
    for (let a = -w / 2 - margin; a <= w / 2 + margin; a += 2) {
      for (let b = -d / 2 - margin; b <= d / 2 + margin; b += 2) {
        this.mark(x + fy * a + fx * b, y - fx * a + fy * b, 0, 2);
      }
    }
  }
}

/** Point at a lateral offset (positive = right of the direction of travel). */
export function lateral(route: Route, d: number, offset: number) {
  const p = route.sampleAt(d);
  return {
    x: p.x + Math.cos(p.heading) * offset,
    y: p.y - Math.sin(p.heading) * offset,
    z: p.z,
    heading: p.heading,
  };
}

/** Stretches of each route that lie inside a village. */
export function villageSpans(
  routes: readonly Route[],
  villages: readonly VillageDef[],
): VillageSpan[] {
  const out: VillageSpan[] = [];
  for (const route of routes) {
    for (const v of villages) {
      const inside = (i: number) =>
        Math.hypot((route.x[i] as number) - v.center[0], (route.y[i] as number) - v.center[1]) <
        v.radiusM;
      const n = route.pointCount;
      // Start scanning from a point outside the village so spans never wrap.
      let start = 0;
      while (start < n && inside(start)) start++;
      if (start === n) {
        out.push({ routeId: route.id, village: v.id, fromM: 0, toM: route.lengthM });
        continue;
      }
      let from: number | null = null;
      for (let k = 1; k <= n; k++) {
        const i = (start + k) % n;
        const d = route.d[i] as number;
        if (inside(i) && from === null) from = d;
        if (!inside(i) && from !== null) {
          const to = d < from ? d + route.lengthM : d;
          if (to - from > 40) out.push({ routeId: route.id, village: v.id, fromM: from, toM: to });
          from = null;
        }
      }
    }
  }
  return out;
}

/** True if distance `d` of a route lies inside one of the village spans. */
export const inSpan = (spans: readonly VillageSpan[], routeId: string, d: number, L: number) =>
  spans.some(
    (s) =>
      s.routeId === routeId &&
      ((d >= s.fromM && d <= s.toM) || (d + L >= s.fromM && d + L <= s.toM)),
  );

export function generateSettlements(
  terrain: Terrain,
  routes: readonly Route[],
  villages: readonly VillageDef[],
  waterLevelM: number | null,
  seed = 1234,
): Settlements {
  const rand = mulberry32(seed);
  const grid = new Grid(terrain.sizeM);
  // Road corridors: nothing is built on the roads, shoulders and sidewalks.
  for (const r of routes) {
    for (let i = 0; i < r.pointCount; i++) {
      grid.mark(r.x[i] as number, r.y[i] as number, ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M + 0.5);
    }
  }
  const spans = villageSpans(routes, villages);
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const buildings: Building[] = [];
  const lamps: Prop[] = [];
  const signs: VillageSign[] = [];
  const parkedCars: ParkedCar[] = [];
  const pedestrians: Pedestrian[] = [];
  const dry = (x: number, y: number) =>
    waterLevelM === null || terrainHeightAt(terrain, x, y) > waterLevelM + 1;

  const tryBuilding = (b: Omit<Building, 'z'>, roadZ: number, maxStep = 3.5): Building | null => {
    if (!grid.rectFree(b.x, b.y, b.yaw, b.width, b.depth)) return null;
    // Ground under the corners: skip steep or flooded plots.
    const fx = Math.sin(b.yaw);
    const fy = Math.cos(b.yaw);
    const corners = [-1, 1].flatMap((sa) =>
      [-1, 1].map((sb) => {
        const cx = b.x + fy * sa * (b.width / 2) + fx * sb * (b.depth / 2);
        const cy = b.y - fx * sa * (b.width / 2) + fy * sb * (b.depth / 2);
        // Keep a few metres of dry land around: no house overhanging the lake.
        const ox = b.x + fy * sa * (b.width / 2 + 5) + fx * sb * (b.depth / 2 + 5);
        const oy = b.y - fx * sa * (b.width / 2 + 5) + fy * sb * (b.depth / 2 + 5);
        return dry(cx, cy) && dry(ox, oy) ? terrainHeightAt(terrain, cx, cy) : Number.NaN;
      }),
    );
    if (corners.some(Number.isNaN)) return null;
    const lo = Math.min(...corners);
    const hi = Math.max(...corners);
    if (hi - lo > maxStep) return null;
    const z = Math.max(hi, roadZ + SIDEWALK_HEIGHT_M);
    if (z - lo > 4) return null;
    grid.markRect(b.x, b.y, b.yaw, b.width, b.depth, 0.5);
    const building = { ...b, z };
    buildings.push(building);
    return building;
  };

  for (const span of spans) {
    const route = routeById.get(span.routeId);
    if (!route) continue;
    const village = villages.find((v) => v.id === span.village);
    const L = route.lengthM;
    // Village signs, read when entering (right side) and when leaving.
    const enter = lateral(route, span.fromM, ROAD_HALF_WIDTH_M + 1.2);
    signs.push({ ...enter, yaw: enter.heading + Math.PI, name: village?.name ?? '', end: false });
    const exit = lateral(route, span.toM, ROAD_HALF_WIDTH_M + 1.2);
    signs.push({ ...exit, yaw: exit.heading + Math.PI, name: village?.name ?? '', end: true });

    for (const side of [1, -1] as const) {
      let d = span.fromM + 6 + rand() * 8;
      while (d < span.toM - 6) {
        const width = 7 + rand() * 6;
        const depth = 7 + rand() * 5;
        const setback = 1.5 + rand() * 4;
        const offset = ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M + setback + depth / 2;
        const p = lateral(route, d + width / 2, side * offset);
        const yaw = p.heading - (side * Math.PI) / 2;
        const placed =
          rand() < 0.85
            ? tryBuilding(
                {
                  x: p.x,
                  y: p.y,
                  yaw,
                  width,
                  depth,
                  wallHeight: 5 + rand() * 3.5,
                  roofHeight: 2 + rand() * 1.5,
                  kind: 'house',
                  wallTint: Math.floor(rand() * 8),
                  roofTint: Math.floor(rand() * 4),
                },
                p.z,
              )
            : null;
        // A car in front of some houses, in a gap or a driveway.
        if (placed && setback > 3 && rand() < 0.45) {
          const c = lateral(
            route,
            d + width + 2.5,
            side * (ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M + 1.4),
          );
          if (grid.get(c.x, c.y) !== 2) {
            parkedCars.push({
              x: c.x,
              y: c.y,
              z: c.z + SIDEWALK_HEIGHT_M,
              yaw: c.heading + (rand() < 0.5 ? 0 : Math.PI),
              color: Math.floor(rand() * 8),
            });
          }
        }
        d += width + 3 + rand() * 8;
      }
      // Street lamps on the sidewalk.
      for (let l = span.fromM + (side === 1 ? 10 : 25); l < span.toM; l += 32) {
        const lp = lateral(route, l, side * (ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M - 0.4));
        lamps.push({
          x: lp.x,
          y: lp.y,
          z: lp.z + SIDEWALK_HEIGHT_M,
          yaw: lp.heading - (side * Math.PI) / 2,
        });
      }
      // Pedestrians strolling on the sidewalks.
      const count = Math.max(1, Math.round((span.toM - span.fromM) / 70));
      for (let k = 0; k < count; k++) {
        pedestrians.push({
          routeId: route.id,
          startM: span.fromM + rand() * (span.toM - span.fromM),
          span,
          side,
          speedMs: (rand() < 0.5 ? 1 : -1) * (0.9 + rand() * 0.6),
          color: Math.floor(rand() * 8),
        });
      }
    }
    // Wrap-around spans are stored with toM > L; nothing else to do.
    void L;
  }

  // Farms along the roads, outside the villages.
  for (const route of routes) {
    let d = rand() * 300;
    while (d < route.lengthM) {
      d += 350 + rand() * 650;
      if (inSpan(spans, route.id, d % route.lengthM, route.lengthM)) continue;
      const side = rand() < 0.5 ? 1 : -1;
      const offset = 22 + rand() * 30;
      const p = lateral(route, d % route.lengthM, side * offset);
      const yaw = p.heading - (side * Math.PI) / 2 + (rand() - 0.5) * 0.4;
      const house = tryBuilding(
        {
          x: p.x,
          y: p.y,
          yaw,
          width: 10 + rand() * 4,
          depth: 8 + rand() * 3,
          wallHeight: 6 + rand() * 2,
          roofHeight: 2.5 + rand(),
          kind: 'farmhouse',
          wallTint: Math.floor(rand() * 8),
          roofTint: Math.floor(rand() * 4),
        },
        terrainHeightAt(terrain, p.x, p.y),
        2.5,
      );
      if (!house) continue;
      const b = lateral(route, (d + 20 + rand() * 10) % route.lengthM, side * (offset + 8));
      tryBuilding(
        {
          x: b.x,
          y: b.y,
          yaw: yaw + Math.PI / 2,
          width: 16 + rand() * 8,
          depth: 10 + rand() * 4,
          wallHeight: 6 + rand() * 2,
          roofHeight: 3,
          kind: 'barn',
          wallTint: Math.floor(rand() * 8),
          roofTint: 3,
        },
        terrainHeightAt(terrain, b.x, b.y),
        3,
      );
      if (rand() < 0.7) {
        const c = lateral(route, (d - 6) % route.lengthM, side * (offset - 6));
        parkedCars.push({
          x: c.x,
          y: c.y,
          z: terrainHeightAt(terrain, c.x, c.y),
          yaw: c.heading + rand() * Math.PI,
          color: Math.floor(rand() * 8),
        });
      }
    }
  }

  return { buildings, spans, lamps, signs, parkedCars, pedestrians };
}
