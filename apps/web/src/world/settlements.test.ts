import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLoopRoute, Route, type RouteJson, type WorldManifest } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { generateSettlements, ROAD_HALF_WIDTH_M, villageSpans } from './settlements';
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
  it('fills every village', () => {
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
    for (const v of villages) {
      expect(
        s.spans.some((sp) => sp.village === v.id),
        `${v.id} has no road`,
      ).toBe(true);
    }
    expect(s.buildings.length).toBeGreaterThan(80);
    expect(s.parkedCars.length).toBeGreaterThan(10);
  });
});
