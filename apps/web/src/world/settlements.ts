// Villages, farms and roadside details, generated from the routes (no Three.js).
// Frame: x east, y north, z altitude. `yaw` is a heading (0 = north, clockwise).

import type { Route } from '@hrt/route-engine';
import {
  type BuildingStyle,
  chaletShare,
  LOT_FRONT_MIN_M,
  type Lot,
  pickBarnStyle,
  pickFence,
  pickHouseStyle,
  STYLE_DIMS,
} from './building-styles';
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
/** Footprint of a parked car (`carGeometry`), m. */
export const CAR_LENGTH_M = 4.1;
export const CAR_WIDTH_M = 1.8;
/** Steepest plot a car is parked on: height spread under its four corners (m). */
const CAR_MAX_TILT_M = 0.4;
/** Highest a parking pad stands above the ground under it (m). */
const PAD_MAX_HEIGHT_M = 1.6;
/**
 * No corner of a parked car comes closer to a road axis: beyond the verge
 * slope (`VERGE_OUTER_M` = 6.55 m in roadside.ts, checked by a test), on the
 * flat ground next to the road.
 */
export const CAR_ROAD_CLEARANCE_M = ROAD_HALF_WIDTH_M + 3.3 + 0.2;
/** Free length kept between a village car and the houses before and after it (m). */
const VILLAGE_CAR_GAP_M = 1.5;
/**
 * Village cars park beside the sidewalk, on a paved parking pad level with it:
 * next to the road the ground is sunk under the road level (the terrain grid
 * is too coarse to rise again within a few metres), a car standing on it
 * looked parked in a ditch. Car centre and pad edges, from the road axis (m).
 */
const VILLAGE_CAR_OFFSET_M = ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M + 0.5 + CAR_WIDTH_M / 2;
const PAD_OUTER_M = VILLAGE_CAR_OFFSET_M + CAR_WIDTH_M / 2 + 0.6;
const PAD_INNER_M = ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M;
/** Top of the sidewalks and pads above the route altitude (`buildSidewalks`, checked by a test). */
/** The fence line stands this far beyond the outer edge of the sidewalk (m). */
const SIDEWALK_GAP_M = 0.35;
/** Steepest lot: height between the street side and the house floor (m). */
const LOT_MAX_RISE_M = 1.2;
/** Deepest drop under the fence line (m). */
const LOT_MAX_DROP_M = 1.5;
const between = (r: readonly [number, number], u: number) => r[0] + (r[1] - r[0]) * u;
export const PAD_TOP_M = SIDEWALK_HEIGHT_M + 0.04;

export interface Building {
  x: number;
  y: number;
  /** Ground floor level. */
  z: number;
  /** Lowest ground under the walls: the foundations go down to it. */
  groundM: number;
  /** Direction the facade faces. */
  yaw: number;
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  kind: 'house' | 'farmhouse' | 'barn';
  /** Shape of the house (lot 2.16): plain-land house, chalet or barn. */
  style: BuildingStyle;
  /** Garden fence, gate and gravel path between the street and the house. */
  lot?: Lot;
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
  /** Nose-up angle (rad), on a sloping parking pad. */
  pitch?: number;
}

/** Paved parking pad of a village car, level with the sidewalk. */
export interface ParkingPad extends Footprint {
  /** Top, at the sidewalk level (m). */
  z: number;
  /** Nose-up angle along `yaw` (rad): the slope of the street. */
  pitch: number;
  /** Lowest ground under the pad: its sides go down to it. */
  groundM: number;
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
  /** Parking pads under the village cars. */
  pads: ParkingPad[];
  pedestrians: Pedestrian[];
}

/**
 * A rotated rectangle on the ground: `d` along the heading `yaw` (the facing
 * of a building, the length of a car), `w` across it.
 */
export interface Footprint {
  x: number;
  y: number;
  yaw: number;
  w: number;
  d: number;
}

/**
 * True if two footprints closer than `gap` overlap (separating axes): each one
 * is grown by `gap / 2` on every side.
 */
export function footprintsOverlap(a: Footprint, b: Footprint, gap = 0): boolean {
  const margin = gap / 2;
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  // Half extent of a footprint projected on a unit axis of heading t.
  const reach = (f: Footprint, t: number) =>
    (Math.abs(Math.cos(t - f.yaw)) * f.d) / 2 + (Math.abs(Math.sin(t - f.yaw)) * f.w) / 2 + margin;
  for (const t of axes) {
    const along = Math.abs((b.x - a.x) * Math.sin(t) + (b.y - a.y) * Math.cos(t));
    if (along > reach(a, t) + reach(b, t)) return false;
  }
  return true;
}

const buildingFootprint = (b: Pick<Building, 'x' | 'y' | 'yaw' | 'width' | 'depth'>) => ({
  x: b.x,
  y: b.y,
  yaw: b.yaw,
  w: b.width,
  d: b.depth,
});

/** The four corners of a footprint. */
export function footprintCorners(f: Footprint): [number, number][] {
  const fx = Math.sin(f.yaw);
  const fy = Math.cos(f.yaw);
  return [-1, 1].flatMap((sl) =>
    [-1, 1].map((sw): [number, number] => [
      f.x + fx * sl * (f.d / 2) + fy * sw * (f.w / 2),
      f.y + fy * sl * (f.d / 2) - fx * sw * (f.w / 2),
    ]),
  );
}

/** Horizontal distance to the nearest road axis, from segments bucketed in cells. */
class RoadDistance {
  private readonly cell = 32;
  private readonly buckets = new Map<string, [number, number, number, number][]>();

  constructor(routes: readonly Route[]) {
    for (const r of routes) {
      const n = r.pointCount;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (!r.loop && j === 0) break;
        const seg: [number, number, number, number] = [
          r.x[i] as number,
          r.y[i] as number,
          r.x[j] as number,
          r.y[j] as number,
        ];
        const c0 = Math.floor(Math.min(seg[0], seg[2]) / this.cell);
        const c1 = Math.floor(Math.max(seg[0], seg[2]) / this.cell);
        const r0 = Math.floor(Math.min(seg[1], seg[3]) / this.cell);
        const r1 = Math.floor(Math.max(seg[1], seg[3]) / this.cell);
        for (let c = c0; c <= c1; c++) {
          for (let k = r0; k <= r1; k++) {
            const key = `${c},${k}`;
            const list = this.buckets.get(key);
            if (list) list.push(seg);
            else this.buckets.set(key, [seg]);
          }
        }
      }
    }
  }

  /** Exact below one cell (32 m), at least one cell beyond. */
  at(x: number, y: number): number {
    const cc = Math.floor(x / this.cell);
    const rc = Math.floor(y / this.cell);
    let best = Number.POSITIVE_INFINITY;
    for (let c = cc - 1; c <= cc + 1; c++) {
      for (let k = rc - 1; k <= rc + 1; k++) {
        for (const [ax, ay, bx, by] of this.buckets.get(`${c},${k}`) ?? []) {
          const dx = bx - ax;
          const dy = by - ay;
          const len2 = dx * dx + dy * dy;
          const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
          best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
        }
      }
    }
    return best;
  }
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

/**
 * Stretches of each route that lie inside a village: one street per route
 * and village (its longest passage: a loop that runs by a village twice, on
 * the way down and along the shore, had houses on both roads, docs/16 §1),
 * and none on a road another route already has as a street (shared roads).
 */
export function villageSpans(
  routes: readonly Route[],
  villages: readonly VillageDef[],
): VillageSpan[] {
  const out: VillageSpan[] = [];
  routes.forEach((route, ri) => {
    for (const v of villages) {
      const inside = (i: number) =>
        Math.hypot((route.x[i] as number) - v.center[0], (route.y[i] as number) - v.center[1]) <
        v.radiusM;
      const n = route.pointCount;
      const passages: VillageSpan[] = [];
      // Start scanning from a point outside the village so spans never wrap.
      let start = 0;
      while (start < n && inside(start)) start++;
      if (start === n) {
        passages.push({ routeId: route.id, village: v.id, fromM: 0, toM: route.lengthM });
      } else {
        let from: number | null = null;
        for (let k = 1; k <= n; k++) {
          const i = (start + k) % n;
          const d = route.d[i] as number;
          if (inside(i) && from === null) from = d;
          if (!inside(i) && from !== null) {
            const to = d < from ? d + route.lengthM : d;
            if (to - from > 40)
              passages.push({ routeId: route.id, village: v.id, fromM: from, toM: to });
            from = null;
          }
        }
      }
      const longest = passages.reduce<VillageSpan | null>(
        (a, b) => (!a || b.toM - b.fromM > a.toM - a.fromM ? b : a),
        null,
      );
      if (!longest) continue;
      if (onEarlierStreet(route, longest, routes.slice(0, ri), out)) continue;
      out.push(longest);
    }
  });
  return out;
}

/** True if most of a span runs on the street of an earlier route (within 3 m). */
function onEarlierStreet(
  route: Route,
  span: VillageSpan,
  earlier: readonly Route[],
  streets: readonly VillageSpan[],
): boolean {
  const L = route.lengthM;
  let on = 0;
  let total = 0;
  for (let d = span.fromM; d <= span.toM; d += 10) {
    const p = route.sampleAt(d % L);
    total++;
    const hit = streets.some((s) => {
      const other = earlier.find((r) => r.id === s.routeId);
      if (!other) return false;
      for (let e = s.fromM; e <= s.toM; e += 2.5) {
        const q = other.sampleAt(e % other.lengthM);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 3) return true;
      }
      return false;
    });
    if (hit) on++;
  }
  return total > 0 && on / total > 0.5;
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
  // Styles and garden choices have their own stream: the layout draws stay the same.
  const styleRand = mulberry32(seed + 2016);
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
  const carFootprints: Footprint[] = [];
  const pads: ParkingPad[] = [];
  const dry = (x: number, y: number) =>
    waterLevelM === null || terrainHeightAt(terrain, x, y) > waterLevelM + 1;

  const tryBuilding = (
    b: Omit<Building, 'z' | 'groundM'>,
    roadZ: number,
    maxStep = 3.5,
  ): Building | null => {
    if (!grid.rectFree(b.x, b.y, b.yaw, b.width, b.depth)) return null;
    const footprint = buildingFootprint(b);
    if (carFootprints.some((c) => footprintsOverlap(footprint, c, 0.6))) return null;
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
    const building = { ...b, z, groundM: lo };
    buildings.push(building);
    return building;
  };

  /** Fence, gate and gravel path in front of a house, or undefined on a steep or sunken plot. */
  const makeLot = (
    b: Building,
    fence: Lot['fence'],
    frontM: number,
    roadZ: number,
  ): Lot | undefined => {
    if (Math.abs(b.z - roadZ) > LOT_MAX_RISE_M) return undefined;
    const fx = Math.sin(b.yaw);
    const fy = Math.cos(b.yaw);
    // Ground along the fence line, just beyond the facade.
    let groundM = Number.POSITIVE_INFINITY;
    for (const sa of [-1, -0.5, 0, 0.5, 1]) {
      const a = sa * (b.width / 2 + 1.2);
      const f = b.depth / 2 + frontM;
      const x = b.x + fy * a + fx * f;
      const y = b.y - fx * a + fy * f;
      if (!dry(x, y)) return undefined;
      groundM = Math.min(groundM, terrainHeightAt(terrain, x, y));
    }
    if (roadZ - groundM > LOT_MAX_DROP_M) return undefined;
    const gate = styleRand() < 0.75;
    return {
      fence,
      frontM,
      gate,
      gravel: gate && styleRand() < 0.8,
      roadZ,
      groundM,
    };
  };

  // Parked cars stand on the ground (the terrain, sunk under the road level
  // near the roads: never the road altitude), on a nearly flat plot clear of
  // the roads and their verges, of the buildings and of the other cars
  // (exact footprints: the 4 m grid is too coarse for a car).
  const roadDistance = new RoadDistance(routes);
  /** True if a footprint is clear of the buildings and of the other cars and pads. */
  const clear = (f: Footprint) =>
    !buildings.some((b) => footprintsOverlap(f, buildingFootprint(b), 0.6)) &&
    !carFootprints.some((c) => footprintsOverlap(f, c, 0.4));
  /** Lowest and highest ground under the corners of a footprint, null over water. */
  const groundUnder = (f: Footprint): [number, number] | null => {
    const heights = footprintCorners(f).map(([px, py]) =>
      dry(px, py) ? terrainHeightAt(terrain, px, py) : Number.NaN,
    );
    if (heights.some(Number.isNaN)) return null;
    return [Math.min(...heights), Math.max(...heights)];
  };
  const park = (f: Footprint, car: ParkedCar) => {
    grid.markRect(f.x, f.y, f.yaw, f.w, f.d, 0.5);
    carFootprints.push(f);
    parkedCars.push(car);
  };

  // Farm cars stand on the ground (the terrain), on a nearly flat plot clear of
  // the roads and their verges, of the buildings and of the other cars (exact
  // footprints: the 4 m grid is too coarse for a car).
  const tryCar = (x: number, y: number, yaw: number, color: number): boolean => {
    // Yaw is a heading: the car's length runs along it (the depth of the footprint).
    const car = { x, y, yaw, w: CAR_WIDTH_M, d: CAR_LENGTH_M };
    if (footprintCorners(car).some(([px, py]) => roadDistance.at(px, py) < CAR_ROAD_CLEARANCE_M)) {
      return false;
    }
    const ground = groundUnder(car);
    if (!ground || ground[1] - ground[0] > CAR_MAX_TILT_M || !clear(car)) return false;
    park(car, { x, y, z: terrainHeightAt(terrain, x, y), yaw, color });
    return true;
  };

  // Village cars stand on a parking pad beside the sidewalk, sloping with the street.
  const tryVillageCar = (
    route: Route,
    along: number,
    side: 1 | -1,
    flip: boolean,
    color: number,
  ): boolean => {
    const p = lateral(route, along, side * ((PAD_INNER_M + PAD_OUTER_M) / 2));
    const pad = {
      x: p.x,
      y: p.y,
      yaw: p.heading,
      w: PAD_OUTER_M - PAD_INNER_M,
      d: CAR_LENGTH_M + 1.2,
    };
    // Beyond the sidewalk of its road (its inner edge lies against it) and
    // clear of any other road; the inside of a bend is allowed a little.
    if (footprintCorners(pad).some(([px, py]) => roadDistance.at(px, py) < PAD_INNER_M - 0.3)) {
      return false;
    }
    const ground = groundUnder(pad);
    if (!ground || !clear(pad)) return false;
    const top = p.z + PAD_TOP_M;
    // Do not perch a pad over a deep drop.
    if (top - ground[0] > PAD_MAX_HEIGHT_M) return false;
    const grade = (route.sampleAt(along + 2).z - route.sampleAt(along - 2).z) / 4;
    const pitch = Math.atan(grade);
    const c = lateral(route, along, side * VILLAGE_CAR_OFFSET_M);
    pads.push({ ...pad, z: top, pitch, groundM: ground[0] });
    park(pad, {
      x: c.x,
      y: c.y,
      z: top,
      yaw: c.heading + (flip ? Math.PI : 0),
      pitch: flip ? -pitch : pitch,
      color,
    });
    return true;
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
        const style = pickHouseStyle(route.sampleAt(d % route.lengthM).z, styleRand);
        const dims = STYLE_DIMS[style];
        const width = between(dims.width, rand());
        const depth = between(dims.depth, rand());
        const fence = pickFence(style, styleRand);
        const setback = fence ? LOT_FRONT_MIN_M + 0.35 + rand() * 2 : 1.5 + rand() * 4;
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
                  wallHeight: between(dims.wallHeight, rand()),
                  roofHeight: between(dims.roofHeight, rand()),
                  kind: 'house',
                  style,
                  wallTint: Math.floor(rand() * 8),
                  roofTint: Math.floor(rand() * 4),
                },
                p.z,
              )
            : null;
        if (placed && fence) {
          placed.lot = makeLot(placed, fence, setback - SIDEWALK_GAP_M, p.z + SIDEWALK_HEIGHT_M);
        }
        // A car beside some houses, in the gap after the house, beyond the verge;
        // the next house leaves it room.
        let parkedUntil = 0;
        if (placed && setback > 3 && rand() < 0.45) {
          const along = d + width + VILLAGE_CAR_GAP_M + CAR_LENGTH_M / 2 + 0.6;
          const flip = rand() < 0.5;
          if (tryVillageCar(route, along, side, flip, Math.floor(rand() * 8))) {
            parkedUntil = along + CAR_LENGTH_M / 2 + 0.6 + VILLAGE_CAR_GAP_M;
          }
        }
        d = Math.max(d + width + 3 + rand() * 8, parkedUntil);
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
      const altitude = route.sampleAt(d % route.lengthM).z;
      const alpine = styleRand() < chaletShare(altitude);
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
          style: alpine ? 'chalet-classic' : 'gable',
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
          style: pickBarnStyle(altitude, styleRand),
          wallTint: Math.floor(rand() * 8),
          roofTint: 3,
        },
        terrainHeightAt(terrain, b.x, b.y),
        3,
      );
      if (rand() < 0.7) {
        // In the yard, between the farmhouse and the road.
        const c = lateral(route, (d - 6) % route.lengthM, side * (offset - house.depth / 2 - 4));
        tryCar(c.x, c.y, c.heading + rand() * Math.PI, Math.floor(rand() * 8));
      }
    }
  }

  return { buildings, spans, lamps, signs, parkedCars, pads, pedestrians };
}
