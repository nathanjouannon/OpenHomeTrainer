// Builds a world from its design file: real DEM, loops planned over the
// terrain, internal route files and the world manifest.
//
// Usage: pnpm build-world [--world content/worlds/world-1] [--out apps/web/public/worlds] [--preview file.png]

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildLoopRoute, type Route, validateLoop } from '@hrt/route-engine';
import { DEM_ATTRIBUTION, fetchHeightmap, type Heightmap, heightAt } from './dem';
import { renderPreview } from './preview';
import { type Point, RoadPlanner, smoothClosed } from './road-planner';

interface LoopSpec {
  id: string;
  name: { fr: string; en: string };
  profile: 'flat' | 'rolling' | 'mountain';
  targetGradePercent: number;
  maxGradePercent: number;
  waypoints: [number, number][];
}

interface WorldDesign {
  id: string;
  version: number;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  dem: { center: { lat: number; lon: number }; sizeM: number; samples: number; zoom: number };
  waterLevelM: number | null;
  loops: LoopSpec[];
}

/** Manifest read by the app (world.json). */
export interface WorldManifest {
  format: 'hrt-world/1';
  id: string;
  version: number;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  heightmap: {
    file: string;
    sizeM: number;
    samples: number;
    minElevationM: number;
    maxElevationM: number;
  };
  waterLevelM: number | null;
  routes: {
    id: string;
    file: string;
    name: { fr: string; en: string };
    profile: LoopSpec['profile'];
    lengthM: number;
    ascentM: number;
    maxGradePercent: number;
  }[];
  attribution: string[];
  builtAt: string;
}

const ROOT = resolve(import.meta.dirname, '../../..');

const { values } = parseArgs({
  options: {
    world: { type: 'string', default: 'content/worlds/world-1' },
    out: { type: 'string', default: 'apps/web/public/worlds' },
    preview: { type: 'string' },
  },
});

async function loadDem(design: WorldDesign): Promise<Heightmap> {
  const key = createHash('sha1').update(JSON.stringify(design.dem)).digest('hex').slice(0, 12);
  const cacheDir = resolve(ROOT, 'tools/world-builder/.cache');
  const bin = resolve(cacheDir, `dem-${key}.bin`);
  const meta = resolve(cacheDir, `dem-${key}.json`);
  try {
    const m = JSON.parse(await readFile(meta, 'utf8')) as Omit<Heightmap, 'heights'>;
    const buf = await readFile(bin);
    const heights = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
    return { ...m, heights };
  } catch {
    const hm = await fetchHeightmap({ ...design.dem, log: console.log });
    await mkdir(cacheDir, { recursive: true });
    await writeFile(bin, new Uint8Array(hm.heights.buffer));
    const { heights: _h, ...m } = hm;
    await writeFile(meta, JSON.stringify(m));
    return hm;
  }
}

/** Longest continuous climb of a lap: length, gain and average grade. */
function longestClimb(route: Route) {
  const n = route.pointCount;
  const step = route.lengthM / n;
  let best = { lengthM: 0, gainM: 0 };
  // Start where the grade is the lowest, so a climb is never cut by the line.
  let start = 0;
  for (let i = 1; i < n; i++) if ((route.z[i] as number) < (route.z[start] as number)) start = i;
  let climbStart = -1;
  let low = 0;
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n;
    const g = route.grade[i] as number;
    if (g > 1.5 && climbStart < 0) {
      climbStart = k;
      low = route.z[i] as number;
    } else if ((g < 0.5 || k === n) && climbStart >= 0) {
      const gain = (route.z[i] as number) - low;
      const len = (k - climbStart) * step;
      if (gain > best.gainM) best = { lengthM: len, gainM: gain };
      climbStart = -1;
    }
  }
  return { ...best, avgGradePercent: best.lengthM ? (best.gainM / best.lengthM) * 100 : 0 };
}

async function main() {
  const designDir = resolve(ROOT, values.world);
  const design = JSON.parse(
    await readFile(resolve(designDir, 'world.json'), 'utf8'),
  ) as WorldDesign;
  const hm = await loadDem(design);
  console.log(`DEM ${hm.minElevationM.toFixed(0)}–${hm.maxElevationM.toFixed(0)} m`);
  const water = design.waterLevelM;
  // Roads stay above the lake.
  const elevationAt = (x: number, y: number) =>
    Math.max(heightAt(hm, x, y), water === null ? Number.NEGATIVE_INFINITY : water + 1.5);

  const outDir = resolve(ROOT, values.out, design.id);
  await mkdir(resolve(outDir, 'routes'), { recursive: true });
  const manifestRoutes: WorldManifest['routes'] = [];
  const overlays: Parameters<typeof renderPreview>[1] = { overlays: [], waterLevelM: water };
  const colors: [number, number, number][] = [
    [40, 110, 255],
    [255, 170, 0],
    [230, 30, 60],
  ];
  let failed = false;

  for (const [k, spec] of design.loops.entries()) {
    const t0 = performance.now();
    const planner = new RoadPlanner(hm, {
      targetGradePercent: spec.targetGradePercent,
      maxGradePercent: spec.maxGradePercent,
      waterLevelM: water,
      cellM: 20,
    });
    const path = planner.loop(spec.waypoints);
    const controls = smoothClosed(path, { windowM: 60 });
    const route = buildLoopRoute({
      id: spec.id,
      version: design.version,
      name: spec.name,
      worldId: design.id,
      controls,
      elevationAt,
      maxGradePercent: spec.maxGradePercent,
      attribution: [DEM_ATTRIBUTION],
    });
    const issues = validateLoop(route);
    const maxGrade = Math.max(...Array.from(route.grade, Math.abs));
    const climb = longestClimb(route);
    console.log(
      `${spec.id}: ${(route.lengthM / 1000).toFixed(1)} km, D+ ${route.meta.ascentM.toFixed(0)} m, ` +
        `max ${maxGrade.toFixed(1)} %, longest climb ${(climb.lengthM / 1000).toFixed(1)} km ` +
        `+${climb.gainM.toFixed(0)} m (${climb.avgGradePercent.toFixed(1)} %), ` +
        `${controls.length} control points, ${Math.round(performance.now() - t0)} ms`,
    );
    for (const issue of issues) {
      console.error(`  ✗ ${issue.code}: ${issue.message}`);
      failed = true;
    }
    const file = `routes/${spec.id}.json`;
    await writeFile(resolve(outDir, file), JSON.stringify(route.toJson()));
    manifestRoutes.push({
      id: spec.id,
      file,
      name: spec.name,
      profile: spec.profile,
      lengthM: Math.round(route.lengthM),
      ascentM: Math.round(route.meta.ascentM),
      maxGradePercent: Math.round(maxGrade * 10) / 10,
    });
    const pts: Point[] = [];
    for (let i = 0; i < route.pointCount; i += 4)
      pts.push([route.x[i] as number, route.y[i] as number]);
    overlays.overlays?.push({
      points: pts,
      closed: true,
      color: colors[k % 3] as [number, number, number],
      markers: [controls[0] as Point],
    });
  }

  await writeFile(resolve(outDir, 'heightmap.bin'), new Uint8Array(hm.heights.buffer));
  const manifest: WorldManifest = {
    format: 'hrt-world/1',
    id: design.id,
    version: design.version,
    name: design.name,
    description: design.description,
    heightmap: {
      file: 'heightmap.bin',
      sizeM: hm.sizeM,
      samples: hm.samples,
      minElevationM: Math.round(hm.minElevationM * 10) / 10,
      maxElevationM: Math.round(hm.maxElevationM * 10) / 10,
    },
    waterLevelM: water,
    routes: manifestRoutes,
    attribution: [DEM_ATTRIBUTION],
    builtAt: new Date().toISOString(),
  };
  await writeFile(resolve(outDir, 'world.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (values.preview) {
    await writeFile(resolve(values.preview), renderPreview(hm, { ...overlays, pixels: 1000 }));
  }
  console.log(`World ${design.id} → ${outDir}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
