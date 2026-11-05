// Checks of the built world-1 (lot 2.13, docs/16 §1): the roads lie on the
// ground, keep to the grade limit of their loop, and roads that cross meet at
// the same level. Runs when the world has been built (`pnpm build-world`).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Route, type RouteJson, type WorldManifest } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { type Terrain, terrainHeightAt } from './world-data';

const WORLD_DIR = resolve(import.meta.dirname, '../../public/worlds/world-1');

describe.runIf(existsSync(resolve(WORLD_DIR, 'world.json')))('roads of world-1', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(WORLD_DIR, 'world.json'), 'utf8'),
  ) as WorldManifest;
  const buf = readFileSync(resolve(WORLD_DIR, manifest.heightmap.file));
  // The natural ground, before the terrain is laid under the roads.
  const ground: Terrain = {
    sizeM: manifest.heightmap.sizeM,
    samples: manifest.heightmap.samples,
    heights: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice(),
    minElevationM: manifest.heightmap.minElevationM,
  };
  const water = manifest.waterLevelM ?? Number.NEGATIVE_INFINITY;
  const routes = manifest.routes.map((r) => ({
    entry: r,
    route: Route.fromJson(
      JSON.parse(readFileSync(resolve(WORLD_DIR, r.file), 'utf8')) as RouteJson,
    ),
  }));

  it.each(routes.map((r) => [r.route.id, r] as const))('%s lies on the ground', (_, { route }) => {
    let worst = 0;
    for (let i = 0; i < route.pointCount; i++) {
      const x = route.x[i] as number;
      const y = route.y[i] as number;
      const g = Math.max(terrainHeightAt(ground, x, y), water + 1.5);
      worst = Math.max(worst, Math.abs((route.z[i] as number) - g));
    }
    // Was 77 m (col) and 37 m (hills) before the loops were planned again.
    expect(worst).toBeLessThan(10);
  });

  it.each(routes.map((r) => [r.route.id, r] as const))(
    '%s keeps to its grade limit',
    (_, { entry, route }) => {
      const limit = entry.maxGradePercent;
      for (const g of route.grade) expect(Math.abs(g)).toBeLessThanOrEqual(limit + 0.5);
    },
  );

  it('meets other roads at the same level where they cross', () => {
    type Seg = {
      ax: number;
      ay: number;
      bx: number;
      by: number;
      az: number;
      bz: number;
      i: number;
    };
    const segs = (r: Route): Seg[] =>
      Array.from({ length: r.pointCount }, (_, i) => {
        const j = (i + 1) % r.pointCount;
        return {
          ax: r.x[i] as number,
          ay: r.y[i] as number,
          bx: r.x[j] as number,
          by: r.y[j] as number,
          az: r.z[i] as number,
          bz: r.z[j] as number,
          i,
        };
      });
    let crossings = 0;
    for (let a = 0; a < routes.length; a++) {
      for (let b = a; b < routes.length; b++) {
        const sa = segs((routes[a] as (typeof routes)[number]).route);
        const sb = segs((routes[b] as (typeof routes)[number]).route);
        for (const p of sa) {
          for (const q of sb) {
            if (a === b && Math.abs(p.i - q.i) < 60) continue;
            if (
              Math.max(p.ax, p.bx) < Math.min(q.ax, q.bx) ||
              Math.max(q.ax, q.bx) < Math.min(p.ax, p.bx)
            )
              continue;
            if (
              Math.max(p.ay, p.by) < Math.min(q.ay, q.by) ||
              Math.max(q.ay, q.by) < Math.min(p.ay, p.by)
            )
              continue;
            const rx = p.bx - p.ax;
            const ry = p.by - p.ay;
            const sx = q.bx - q.ax;
            const sy = q.by - q.ay;
            const den = rx * sy - ry * sx;
            if (Math.abs(den) < 1e-9) continue;
            const u = ((q.ax - p.ax) * sy - (q.ay - p.ay) * sx) / den;
            const v = ((q.ax - p.ax) * ry - (q.ay - p.ay) * rx) / den;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            crossings++;
            const zp = p.az + (p.bz - p.az) * u;
            const zq = q.az + (q.bz - q.az) * v;
            // Was up to 28 m (a road over another, with no bridge).
            expect(
              Math.abs(zp - zq),
              `crossing at ${(p.ax + rx * u).toFixed(0)},${(p.ay + ry * u).toFixed(0)}`,
            ).toBeLessThan(0.6);
          }
        }
      }
    }
    expect(crossings).toBeGreaterThan(0);
  });
});
