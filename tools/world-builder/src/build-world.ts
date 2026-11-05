// Builds a world from its design file: real DEM, loops planned over the
// terrain, internal route files and the world manifest.
//
// Usage: pnpm build-world [--world content/worlds/world-1] [--out apps/web/public/worlds] [--preview file.png]

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildLoopRoute,
  limitGrade,
  loopRouteFromPoints,
  type Route,
  resampleClosedSpline,
  smooth,
  validateLoop,
  type WorldManifest,
} from '@hrt/route-engine';
import { DEM_ATTRIBUTION, fetchHeightmap, type Heightmap, heightAt } from './dem';
import { type NetworkRoad, pinProfile, snapToNetwork } from './network';
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
  villages?: WorldManifest['villages'];
  loops: LoopSpec[];
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

// Planning of the loops (lot 2.13, docs/16 §1). A loop is first planned as
// before; when its road strays more than GAP_TOLERANCE_M from the ground (the
// line climbs steeper than the loop's limit, so the profile cuts or bridges),
// it is planned again "strictly": grades read along every move, a margin
// under the limits, a cost for turning (real hairpins) and corners rounded
// over a shorter window; then steered away from where it still strays.
// Settings chosen on world-1 (2026-11-05): gaps ≤ 8 m, grades within limits.

/** The loops reuse the roads planned before them: their cells cost this much less. */
const REUSE_FACTOR = 0.45;
/** A loop is planned again, steered away from where its road strays further from the ground (m). */
const GAP_TOLERANCE_M = 6;
const MAX_ATTEMPTS = 4;
/** Strict planning: grade margin under the loop's limits (points of %), blur passes. */
const PLAN_MARGIN_PERCENT = 1.5;
const STRICT_BLUR_PASSES = 1;
/** Cost factors around the places where the road strays 6-12, 12-25 and over 25 m, and their reach (m). */
const STEER = [1.5, 2, 3] as const;
const STEER_RADIUS_M = 30;
/** Strict planning: cost of a half turn (m of road) and corner rounding window (m). */
const TURN_COST_M = 120;
const STRICT_WINDOW_M = 30;
/** Altitude smoothing window and step of the route samples (as buildLoopRoute). */
const SMOOTHING_M = 120;
const STEP_M = 5;
/** Length over which a loop's altitude moves to the network's around a shared stretch or a crossing. */
const PIN_BLEND_M = 150;

type ElevationAt = (x: number, y: number) => number;

/**
 * A loop over the network: its line goes onto the roads it runs along and its
 * altitude takes theirs there and at the crossings; elsewhere it follows the
 * ground under the grade limit, as `buildLoopRoute`.
 */
function networkLoop(
  spec: LoopSpec,
  design: WorldDesign,
  controls: readonly Point[],
  network: readonly NetworkRoad[],
  elevationAt: ElevationAt,
) {
  const { points } = resampleClosedSpline(controls, STEP_M);
  const snap = snapToNetwork(
    points.map((p) => p[0]),
    points.map((p) => p[1]),
    network,
    { groundAt: elevationAt },
  );
  const n = snap.x.length;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pin = snap.pinned[i] as number;
    raw[i] = Number.isNaN(pin) ? elevationAt(snap.x[i] as number, snap.y[i] as number) : pin;
  }
  let step = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    step += Math.hypot(
      (snap.x[j] as number) - (snap.x[i] as number),
      (snap.y[j] as number) - (snap.y[i] as number),
    );
  }
  step /= n;
  const limited = limitGrade(raw, step, spec.maxGradePercent, true);
  const half = Math.max(1, Math.round(SMOOTHING_M / step / 2 / 3));
  const smoothed = smooth(limited, half, 3, true);
  const pins = Float64Array.from(snap.pinned);
  const crossings = snap.crossings.map((c) => ({
    ...c,
    gapM: (smoothed[c.index] as number) - c.z,
  }));
  for (const c of snap.crossings) pins[c.index] = c.z;
  const blend = Math.round(PIN_BLEND_M / step);
  const onNetwork = pinProfile(smoothed, pins, blend);
  // The way back of an out and back takes the altitudes of the way out.
  const back = new Float64Array(n).fill(Number.NaN);
  const refs = Float64Array.from(snap.selfRef);
  for (const c of snap.selfCrossings) refs[c.index] = c.ref;
  for (let i = 0; i < n; i++) {
    const ref = refs[i] as number;
    if (Number.isNaN(ref)) continue;
    const a = Math.floor(ref) % n;
    const t = ref - Math.floor(ref);
    back[i] =
      (onNetwork[a] as number) +
      ((onNetwork[(a + 1) % n] as number) - (onNetwork[a] as number)) * t;
  }
  const z = pinProfile(onNetwork, back, blend);
  const route = loopRouteFromPoints({
    id: spec.id,
    version: design.version,
    name: spec.name,
    worldId: design.id,
    x: snap.x,
    y: snap.y,
    z,
    attribution: [DEM_ATTRIBUTION],
  });
  return { route, sharedM: snap.sharedM + snap.selfSharedM, crossings, pinned: snap.pinned };
}

/** Distance between the road and the ground under it, at every sample (m, signed). */
function groundGaps(route: Route, elevationAt: ElevationAt): Float64Array {
  const out = new Float64Array(route.pointCount);
  for (let i = 0; i < route.pointCount; i++) {
    out[i] = (route.z[i] as number) - elevationAt(route.x[i] as number, route.y[i] as number);
  }
  return out;
}

const percentile = (values: Iterable<number>, q: number) => {
  const a = Float64Array.from(values).sort();
  return a[Math.floor(q * (a.length - 1))] ?? 0;
};

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

  const network: NetworkRoad[] = [];
  for (const [k, spec] of design.loops.entries()) {
    const t0 = performance.now();
    // First as before; a loop whose road strays from the ground is planned
    // again with the strict grades, a margin under its limits, and steered
    // away from where it strayed.
    const makePlanner = (strict: boolean) => {
      const margin = strict ? PLAN_MARGIN_PERCENT : 0;
      const planner = new RoadPlanner(hm, {
        targetGradePercent: spec.targetGradePercent - margin,
        maxGradePercent: spec.maxGradePercent - margin,
        waterLevelM: water,
        cellM: 20,
        strictGrade: strict,
        blurPasses: strict ? STRICT_BLUR_PASSES : 3,
        turnCostM: strict ? TURN_COST_M : 0,
      });
      // Run along the roads of the loops planned before rather than beside them.
      for (const road of network) {
        const pts: Point[] = [];
        for (let i = 0; i < road.x.length; i += 2)
          pts.push([road.x[i] as number, road.y[i] as number]);
        planner.scaleCost(pts, 20, REUSE_FACTOR);
      }
      return planner;
    };
    let planner = makePlanner(false);
    // Plan, measure how far the road strays from the ground, steer the next
    // attempt away from those places; keep the best attempt.
    let best: {
      route: Route;
      controls: Point[];
      maxGap: number;
      sharedM: number;
      crossings: { gapM: number }[];
      attempt: number;
    } | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const path = planner.loop(spec.waypoints);
      const controls = smoothClosed(path, { windowM: attempt === 0 ? 60 : STRICT_WINDOW_M });
      const built =
        network.length === 0
          ? {
              route: buildLoopRoute({
                id: spec.id,
                version: design.version,
                name: spec.name,
                worldId: design.id,
                controls,
                elevationAt,
                maxGradePercent: spec.maxGradePercent,
                attribution: [DEM_ATTRIBUTION],
              }),
              sharedM: 0,
              crossings: [],
            }
          : networkLoop(spec, design, controls, network, elevationAt);
      const gaps = groundGaps(built.route, elevationAt);
      const maxGap = Math.max(...Array.from(gaps, Math.abs));
      if (!best || maxGap < best.maxGap) best = { ...built, controls, maxGap, attempt };
      if (maxGap <= GAP_TOLERANCE_M) break;
      if (attempt === 0) {
        planner = makePlanner(true);
        continue;
      }
      // Steer away: the further the road from the ground, the costlier the cells around.
      for (const [from, to, factor] of [
        [GAP_TOLERANCE_M, 12, STEER[0]],
        [12, 25, STEER[1]],
        [25, Number.POSITIVE_INFINITY, STEER[2]],
      ] as const) {
        const pts: Point[] = [];
        gaps.forEach((g, i) => {
          if (Math.abs(g) > from && Math.abs(g) <= to)
            pts.push([built.route.x[i] as number, built.route.y[i] as number]);
        });
        if (pts.length) planner.scaleCost(pts, STEER_RADIUS_M, factor);
      }
    }
    if (!best) throw new Error(`No road for ${spec.id}`);
    const { route, controls } = best;
    network.push({ x: route.x, y: route.y, z: route.z });
    const gaps = Array.from(groundGaps(route, elevationAt), Math.abs);
    const issues = validateLoop(route);
    const maxGrade = Math.max(...Array.from(route.grade, Math.abs));
    const climb = longestClimb(route);
    console.log(
      `${spec.id}: ${(route.lengthM / 1000).toFixed(1)} km, D+ ${route.meta.ascentM.toFixed(0)} m, ` +
        `max ${maxGrade.toFixed(1)} %, longest climb ${(climb.lengthM / 1000).toFixed(1)} km ` +
        `+${climb.gainM.toFixed(0)} m (${climb.avgGradePercent.toFixed(1)} %), ` +
        `${controls.length} control points, ${Math.round(performance.now() - t0)} ms`,
    );
    console.log(
      `  road vs ground: median ${percentile(gaps, 0.5).toFixed(1)} m, 90 % ${percentile(gaps, 0.9).toFixed(1)} m, ` +
        `max ${best.maxGap.toFixed(1)} m (attempt ${best.attempt + 1}); ` +
        `shared with the loops before ${(best.sharedM / 1000).toFixed(2)} km, ` +
        `${best.crossings.length} crossing(s)` +
        (best.crossings.length
          ? ` (levels moved by ${best.crossings.map((c) => c.gapM.toFixed(1)).join(', ')} m)`
          : ''),
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
    villages: design.villages ?? [],
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
