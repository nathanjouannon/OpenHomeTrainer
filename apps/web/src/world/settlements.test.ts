import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLoopRoute, Route, type RouteJson, type WorldManifest } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { asphaltLiftM } from './road-builders';
import { VERGE_OUTER_M } from './roadside';
import {
  CAR_LENGTH_M,
  CAR_ROAD_CLEARANCE_M,
  CAR_WIDTH_M,
  footprintCorners,
  footprintsOverlap,
  generateSettlements,
  PAD_TOP_M,
  ROAD_HALF_WIDTH_M,
  SIDEWALK_HEIGHT_M,
  villageSpans,
} from './settlements';
import { flattenAlongRoutes, ROAD_SINK_M, type Terrain, terrainHeightAt } from './world-data';

const flatTerrain = (): Terrain => ({
  sizeM: 4000,
  samples: 401,
  heights: new Float32Array(401 * 401).fill(500),
  minElevationM: 500,
});

const square = buildLoopRoute({
  id: 'square',
  name: { fr: 's', en: 's' },
  worldId: 'w',
  controls: [
    [-1000, -1000],
    [1000, -1000],
    [1000, 1000],
    [-1000, 1000],
  ],
  elevationAt: () => 500,
});

describe('settlements on a synthetic world', () => {
  const terrain = flatTerrain();
  flattenAlongRoutes(terrain, [square]);
  const c = square.sampleAt(square.lengthM * 0.125);
  const village = {
    id: 'v',
    name: 'Village',
    center: [c.x, c.y] as [number, number],
    radiusM: 300,
  };
  const s = generateSettlements(terrain, [square], [village], null);

  it('finds the stretch of road inside the village', () => {
    const [span] = villageSpans([square], [village]);
    expect(span?.toM).toBeGreaterThan(span?.fromM ?? 0);
    expect((span?.toM ?? 0) - (span?.fromM ?? 0)).toBeCloseTo(600, -2);
  });

  it('lines the village street with houses, lamps, signs and people', () => {
    expect(s.buildings.filter((b) => b.kind === 'house').length).toBeGreaterThan(30);
    expect(s.lamps.length).toBeGreaterThan(20);
    expect(s.signs).toHaveLength(2);
    expect(s.pedestrians.length).toBeGreaterThan(5);
  });

  it('never builds on the road', () => {
    for (const b of s.buildings) {
      let min = Number.POSITIVE_INFINITY;
      for (let i = 0; i < square.pointCount; i++) {
        min = Math.min(
          min,
          Math.hypot((square.x[i] as number) - b.x, (square.y[i] as number) - b.y),
        );
      }
      // Distance from the road axis to the building centre, minus half its size.
      expect(min - Math.max(b.width, b.depth) / 2).toBeGreaterThan(ROAD_HALF_WIDTH_M);
    }
  });

  it('sinks the ground under the road below the asphalt', () => {
    const p = square.sampleAt(1234);
    expect(terrainHeightAt(terrain, p.x, p.y)).toBeCloseTo(p.z - ROAD_SINK_M, 3);
  });
});

const WORLD_DIR = resolve(import.meta.dirname, '../../public/worlds/world-1');

describe.runIf(existsSync(resolve(WORLD_DIR, 'world.json')))('settlements of world-1', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(WORLD_DIR, 'world.json'), 'utf8'),
  ) as WorldManifest;
  const buf = readFileSync(resolve(WORLD_DIR, manifest.heightmap.file));
  const terrain: Terrain = {
    sizeM: manifest.heightmap.sizeM,
    samples: manifest.heightmap.samples,
    heights: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice(),
    minElevationM: manifest.heightmap.minElevationM,
  };
  const routes = manifest.routes.map((r) =>
    Route.fromJson(JSON.parse(readFileSync(resolve(WORLD_DIR, r.file), 'utf8')) as RouteJson),
  );
  flattenAlongRoutes(terrain, routes);
  const villages = manifest.villages ?? [];
  const s = generateSettlements(terrain, routes, villages, manifest.waterLevelM);

  it('fills every village', () => {
    for (const v of villages) {
      expect(
        s.spans.some((sp) => sp.village === v.id),
        `${v.id} has no road`,
      ).toBe(true);
    }
    expect(s.buildings.length).toBeGreaterThan(80);
    expect(s.parkedCars.length).toBeGreaterThan(10);
  });

  // Floating cars and cars in facades (docs/16 §2).
  it('parks every car on the ground or on a parking pad', () => {
    for (const c of s.parkedCars) {
      const pad = s.pads.find((p) => Math.hypot(p.x - c.x, p.y - c.y) < 2);
      const floor = pad ? pad.z : terrainHeightAt(terrain, c.x, c.y);
      expect(Math.abs(c.z - floor), `car at ${c.x},${c.y}`).toBeLessThan(0.05);
    }
    expect(s.pads.length).toBeGreaterThan(10);
  });

  it('builds the pads down to the ground, level with the sidewalks', () => {
    expect(PAD_TOP_M).toBeCloseTo(SIDEWALK_HEIGHT_M + asphaltLiftM(0), 6);
    for (const p of s.pads) {
      expect(p.z).toBeGreaterThan(p.groundM);
      expect(p.z - p.groundM).toBeLessThan(1.7);
      expect(Math.abs(p.pitch)).toBeLessThan(0.2);
    }
  });

  it('never parks a car inside a building', () => {
    for (const c of s.parkedCars) {
      for (const b of s.buildings) {
        // Car centre and corners in the frame of the building (a along the width, f its facing).
        const fx = Math.sin(b.yaw);
        const fy = Math.cos(b.yaw);
        const inside = (x: number, y: number) => {
          const dx = x - b.x;
          const dy = y - b.y;
          return (
            Math.abs(dx * fy - dy * fx) < b.width / 2 && Math.abs(dx * fx + dy * fy) < b.depth / 2
          );
        };
        const cx = Math.sin(c.yaw);
        const cy = Math.cos(c.yaw);
        const corners = [-1, 1].flatMap((l) =>
          [-1, 1].map((w) => [
            c.x + cx * l * (CAR_LENGTH_M / 2) + cy * w * (CAR_WIDTH_M / 2),
            c.y + cy * l * (CAR_LENGTH_M / 2) - cx * w * (CAR_WIDTH_M / 2),
          ]),
        );
        for (const [x, y] of [[c.x, c.y], ...corners] as [number, number][]) {
          expect(inside(x, y), `car at ${c.x},${c.y} in a ${b.kind}`).toBe(false);
        }
      }
    }
  });

  it('stands every building on its ground (floor above it, foundations reaching it)', () => {
    for (const b of s.buildings) {
      expect(b.z).toBeGreaterThanOrEqual(b.groundM);
      expect(b.z - b.groundM).toBeLessThanOrEqual(4);
    }
  });
});

describe('footprints', () => {
  const car = { x: 0, y: 0, yaw: 0, w: CAR_WIDTH_M, d: CAR_LENGTH_M };

  it('overlap only when closer than the gap', () => {
    // Side by side, 0.5 m apart.
    const next = { ...car, x: CAR_WIDTH_M + 0.5 };
    expect(footprintsOverlap(car, next)).toBe(false);
    expect(footprintsOverlap(car, next, 0.4)).toBe(false);
    expect(footprintsOverlap(car, next, 0.6)).toBe(true);
    // Nose to tail (yaw 0 = north: the length runs along y).
    expect(footprintsOverlap(car, { ...car, y: CAR_LENGTH_M - 0.1 })).toBe(true);
    // Rotated a quarter turn: 4.1 m long across x now.
    expect(footprintsOverlap(car, { ...car, x: 2.8, yaw: Math.PI / 2 })).toBe(true);
    expect(footprintsOverlap(car, { ...car, x: 3.1, yaw: Math.PI / 2 })).toBe(false);
  });

  it('has corners at the ends of its length and width', () => {
    const corners = footprintCorners({ ...car, yaw: Math.PI / 2 });
    for (const [x, y] of corners) {
      expect(Math.abs(x)).toBeCloseTo(CAR_LENGTH_M / 2, 6);
      expect(Math.abs(y)).toBeCloseTo(CAR_WIDTH_M / 2, 6);
    }
  });

  it('keeps the cars beyond the verges', () => {
    expect(CAR_ROAD_CLEARANCE_M).toBeGreaterThan(VERGE_OUTER_M);
  });
});
