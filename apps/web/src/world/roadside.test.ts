import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildLoopRoute,
  loopRouteFromPoints,
  Route,
  type RouteJson,
  type WorldManifest,
} from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { buildRoadSurfaces, ownStretches } from './road-builders';
import {
  MODULES,
  planRoadside,
  type RoadsideRun,
  runMatrices,
  samplesToRuns,
  VERGE_OUTER_M,
  VERGE_PROFILE,
} from './roadside';
import { generateSettlements, lateral, ROAD_HALF_WIDTH_M, villageSpans } from './settlements';
import {
  flattenAlongRoutes,
  forestCover,
  ROAD_SINK_M,
  type Terrain,
  terrainHeightAt,
} from './world-data';

const SIZE = 4000;
const SAMPLES = 401;

/** Terrain from a height function of (x east, y north). */
function terrainOf(h: (x: number, y: number) => number): Terrain {
  const heights = new Float32Array(SAMPLES * SAMPLES);
  const cell = SIZE / (SAMPLES - 1);
  for (let r = 0; r < SAMPLES; r++) {
    for (let c = 0; c < SAMPLES; c++) {
      heights[r * SAMPLES + c] = h(-SIZE / 2 + c * cell, SIZE / 2 - r * cell);
    }
  }
  return { sizeM: SIZE, samples: SAMPLES, heights, minElevationM: 0 };
}

const loop = (
  id: string,
  controls: [number, number][],
  elevationAt: (x: number, y: number) => number,
) => buildLoopRoute({ id, name: { fr: id, en: id }, worldId: 'w', controls, elevationAt });

const square = loop(
  'square',
  [
    [-1000, -1000],
    [1000, -1000],
    [1000, 1000],
    [-1000, 1000],
  ],
  () => 500,
);

describe('samplesToRuns', () => {
  it('fills short gaps and drops short runs', () => {
    const kinds = [
      ...Array(20).fill('fence'),
      ...Array(4).fill(null), // 20 m gap: filled
      ...Array(20).fill('fence'),
      ...Array(30).fill(null),
      ...Array(5).fill('guardrail'), // 25 m: too short
      ...Array(30).fill(null),
    ];
    const runs = samplesToRuns(kinds, 5, kinds.length * 5);
    expect(runs).toEqual([{ kind: 'fence', fromM: 0, toM: 220 }]);
  });
});

describe('roadside of a flat square loop with a village', () => {
  const terrain = terrainOf(() => 500);
  flattenAlongRoutes(terrain, [square]);
  const c = square.sampleAt(square.lengthM * 0.125);
  const village = { id: 'v', name: 'V', center: [c.x, c.y] as [number, number], radiusM: 300 };
  const s = generateSettlements(terrain, [square], [village], null);
  const layout = planRoadside({
    terrain,
    routes: [square],
    spans: s.spans,
    buildings: s.buildings,
    waterLevelM: null,
    forest: () => 0,
  });

  it('places delineator posts on the shoulders, outside the village only', () => {
    expect(layout.delineators.length).toBeGreaterThan(100);
    for (const p of layout.delineators) {
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(250);
    }
  });

  it('fences some open fields, never in the village, and no guardrail on the flat', () => {
    expect(layout.runs.some((r) => r.kind === 'fence')).toBe(true);
    expect(layout.runs.some((r) => r.kind !== 'fence')).toBe(false);
    for (const r of layout.runs) {
      for (let d = r.fromM; d <= r.toM; d += 10) {
        const p = square.sampleAt(d % square.lengthM);
        expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(300);
      }
    }
  });

  it('digs ditches of depth 0..1, none in the village', () => {
    const [right, left] = layout.ditch.get('square') ?? [];
    expect(right && left).toBeTruthy();
    const step = square.lengthM / square.pointCount;
    for (const depth of [right, left] as Float32Array[]) {
      expect(Math.max(...depth)).toBeGreaterThan(0.5);
      for (let i = 0; i < depth.length; i++) {
        const v = depth[i] as number;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        const p = square.sampleAt(i * step);
        if (Math.hypot(p.x - c.x, p.y - c.y) < 250) expect(v).toBe(0);
      }
    }
  });

  it('builds one asphalt and one verge geometry dipping under the terrain', () => {
    const roads = buildRoadSurfaces([square], 0, layout, s.spans, () => ({
      splat: [1, 0, 0, 0, 0, 0],
      color: [0, 1, 0],
      uv: [0, 0],
    }));
    // About 1 km per verge piece.
    expect(roads.verges.length).toBe(Math.round(square.lengthM / 1000));
    expect(roads.verges[0]?.ground.getAttribute('splat0')).toBeTruthy();
    const uv = roads.asphalt?.getAttribute('uv');
    expect(uv).toBeTruthy();
    for (let i = 0; i < (uv?.count ?? 0); i++) {
      expect(Math.abs(uv?.getX(i) ?? 0)).toBeCloseTo(ROAD_HALF_WIDTH_M, 5);
    }
    let outer = 0;
    for (const piece of roads.verges) {
      const pos = piece.ground.getAttribute('position');
      for (let i = 0; i < pos.count; i += 7) {
        const x = pos.getX(i);
        const y = -pos.getZ(i);
        let best = Number.POSITIVE_INFINITY;
        for (let k = 0; k < square.pointCount; k++) {
          best = Math.min(
            best,
            Math.hypot((square.x[k] as number) - x, (square.y[k] as number) - y),
          );
        }
        // The outer edge of the verge lies under the sunk ground.
        if (Math.abs(best - VERGE_OUTER_M) < 0.05) {
          expect(pos.getY(i)).toBeLessThan(terrainHeightAt(terrain, x, y));
          outer++;
        }
      }
    }
    expect(outer).toBeGreaterThan(20);
    expect(roads.sidewalks).toBeTruthy();
    expect(roads.curbs).toBeTruthy();
  });

  it('keeps the bottom of the deepest ditch above the sunk ground... or cut flat by it', () => {
    const bottom = VERGE_PROFILE[3];
    expect(bottom.ditch).toBeLessThan(-ROAD_SINK_M);
    expect(VERGE_PROFILE[4].ditch).toBeGreaterThan(-ROAD_SINK_M);
    expect(VERGE_PROFILE[5].flat).toBeLessThan(-ROAD_SINK_M);
  });
});

describe('roadside on a hillside', () => {
  // The ground falls by 40 % towards the south.
  const terrain = terrainOf((_x, y) => 800 + y * 0.4);
  const road = loop(
    'hill',
    [
      [-1200, 0],
      [1200, 0],
      [1200, 60],
      [-1200, 60],
    ],
    (_x, y) => 800 + y * 0.4,
  );
  flattenAlongRoutes(terrain, [road]);
  const layout = planRoadside({
    terrain,
    routes: [road],
    spans: [],
    buildings: [],
    waterLevelM: null,
    forest: () => 0,
  });

  it('guards the downhill side only', () => {
    const guarded = layout.runs.filter((r) => r.kind === 'guardrail' || r.kind === 'wall');
    expect(guarded.reduce((n, r) => n + r.toM - r.fromM, 0)).toBeGreaterThan(1500);
    for (const r of guarded) {
      const d = (r.fromM + r.toM) / 2;
      const out = lateral(road, d, r.side * 30);
      const p = road.sampleAt(d);
      // The guarded side is the one where the ground falls away.
      expect(terrainHeightAt(terrain, out.x, out.y)).toBeLessThan(p.z - 5);
    }
  });

  it('stands the modules upright, facing the road, end to end', () => {
    const run = layout.runs.find((r) => r.kind === 'guardrail') as RoadsideRun;
    expect(run).toBeTruthy();
    const m = runMatrices(road, run, terrain, 0);
    const count = m.length / 16;
    expect(count).toBeGreaterThan(5);
    for (let k = 0; k < count; k++) {
      const o = k * 16;
      // Y column: straight up, unscaled (vertical posts on slopes).
      expect([m[o + 4], m[o + 5], m[o + 6]]).toEqual([0, 1, 0]);
      // X column: horizontal unit vector pointing to the road.
      expect(Math.hypot(m[o] as number, m[o + 2] as number)).toBeCloseTo(1, 5);
      const p = road.sampleAt((run.fromM + run.toM) / 2);
      const toRoad = [p.x - (m[o + 12] as number), -p.y - (m[o + 14] as number)];
      const facing =
        (m[o] as number) * (toRoad[0] as number) + (m[o + 2] as number) * (toRoad[1] as number);
      if (Math.hypot(toRoad[0] as number, toRoad[1] as number) < 20)
        expect(facing).toBeGreaterThan(0);
    }
    // Consecutive modules meet: the end of one is the origin of the next (ramps aside).
    for (let k = 1; k < count - 1; k++) {
      const a = k * 16;
      const b = (k + 1) * 16;
      const len = MODULES.guardrail.lengthM;
      expect((m[a + 12] as number) + (m[a + 8] as number) * len).toBeCloseTo(
        m[b + 12] as number,
        3,
      );
      expect((m[a + 14] as number) + (m[a + 10] as number) * len).toBeCloseTo(
        m[b + 14] as number,
        3,
      );
    }
  });

  it('digs no ditch above the drop', () => {
    const [right, left] = layout.ditch.get('hill') as [Float32Array, Float32Array];
    const step = road.lengthM / road.pointCount;
    for (const [side, depth] of [
      [1, right],
      [-1, left],
    ] as const) {
      for (let i = 0; i < depth.length; i += 10) {
        const out = lateral(road, i * step, side * 35);
        const p = road.sampleAt(i * step);
        if (terrainHeightAt(terrain, out.x, out.y) < p.z - 6) expect(depth[i]).toBe(0);
      }
    }
  });
});

describe('shared stretches', () => {
  it('lets the first route draw a road two routes share', () => {
    const a = square;
    const b = Route.fromJson({ ...square.toJson(), id: 'square-2' });
    const terrain = terrainOf(() => 500);
    flattenAlongRoutes(terrain, [a, b]);
    const layout = planRoadside({
      terrain,
      routes: [a, b],
      spans: [],
      buildings: [],
      waterLevelM: null,
      forest: () => 0,
    });
    expect(ownStretches(a, layout.shared.get(a.id))).toEqual([[0, a.lengthM]]);
    expect(ownStretches(b, layout.shared.get(b.id))).toEqual([]);
    expect(layout.runs.every((r) => r.routeId === a.id)).toBe(true);
  });
});

const WORLD_DIR = resolve(import.meta.dirname, '../../public/worlds/world-1');

describe.runIf(existsSync(resolve(WORLD_DIR, 'world.json')))('roadside of world-1', () => {
  it('guards the mountain roads and fences the fields of the valley', () => {
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
    const layout = planRoadside({
      terrain,
      routes,
      spans: s.spans,
      buildings: s.buildings,
      waterLevelM: manifest.waterLevelM,
      forest: forestCover(7),
    });
    const length = (routeId: string, kind: string) =>
      layout.runs
        .filter((r) => r.routeId === routeId && r.kind === kind)
        .reduce((n, r) => n + r.toM - r.fromM, 0);
    expect(length('boucle-du-col', 'guardrail')).toBeGreaterThan(3000);
    expect(length('boucle-du-col', 'wall')).toBeGreaterThan(500);
    expect(length('boucle-du-lac', 'guardrail')).toBe(0);
    expect(length('boucle-du-lac', 'fence')).toBeGreaterThan(1000);
    // The pass and hills loops share about 1 km of road, drawn once.
    const shared = layout.shared.get('boucle-du-col');
    expect(shared?.reduce((n, v) => n + v, 0)).toBeGreaterThan(100);
    // Nothing inside the villages.
    const spans = villageSpans(routes, villages);
    for (const r of layout.runs) {
      for (const span of spans.filter((x) => x.routeId === r.routeId)) {
        expect(r.toM <= span.fromM || r.fromM >= span.toM).toBe(true);
      }
    }
  });
});

describe('a loop that rides a road twice or crosses itself (lot 2.13)', () => {
  const flat = terrainOf(() => 500);
  /** A loop from explicit points, about 5 m apart. */
  const fromPoints = (id: string, pts: [number, number][]) =>
    loopRouteFromPoints({
      id,
      name: { fr: id, en: id },
      worldId: 'w',
      x: Float64Array.from(pts, (p) => p[0]),
      y: Float64Array.from(pts, (p) => p[1]),
      z: new Float64Array(pts.length).fill(500),
    });
  const line = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.round(Math.hypot(bx - ax, by - ay) / 5);
    return Array.from({ length: n }, (_, k): [number, number] => [
      ax + ((bx - ax) * k) / n,
      ay + ((by - ay) * k) / n,
    ]);
  };
  const plan = (routes: Route[]) =>
    planRoadside({
      terrain: flat,
      routes,
      spans: [],
      buildings: [],
      waterLevelM: null,
      forest: () => 0,
    });

  it('draws an out-and-back road once', () => {
    // Out east along y = 0 and back along y = 1 m: the same road.
    const route = fromPoints('aller-retour', [
      ...line(0, 0, 1000, 0),
      ...line(1000, 0, 1000, 1),
      ...line(1000, 1, 0, 1),
      ...line(0, 1, 0, 0),
    ]);
    const shared = plan([route]).shared.get(route.id) as Uint8Array;
    const n = route.pointCount;
    const back = Array.from(shared).filter((v, i) => v === 1 && (route.d[i] as number) > 1100);
    // The way back (but its first and last 60 m, by the turns) lies on the way out.
    expect(back.length * 5).toBeGreaterThan(800);
    // The way out is drawn.
    expect(shared.slice(0, Math.floor(n / 3)).every((v) => v === 0)).toBe(true);
  });

  it('marks the crossing of a figure of eight on its second passage', () => {
    const route = fromPoints('huit', [
      ...line(0, 0, 500, 500),
      ...line(500, 500, 500, 0),
      ...line(500, 0, 0, 500),
      ...line(0, 500, 0, 0),
    ]);
    const crossing = plan([route]).crossing?.get(route.id) as Uint8Array;
    const marked = Array.from(crossing.keys()).filter((i) => crossing[i] === 1);
    // Only around (250, 250), on the second diagonal.
    expect(marked.length).toBeGreaterThan(0);
    for (const i of marked) {
      expect(Math.hypot((route.x[i] as number) - 250, (route.y[i] as number) - 250)).toBeLessThan(
        12,
      );
      expect(route.d[i] as number).toBeGreaterThan(1000);
    }
  });
});
