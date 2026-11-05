import { ascentDescent, computeGrades, limitGrade, smooth } from './profile';
import {
  type LocalizedText,
  Route,
  type RouteJson,
  type RouteSegment,
  type RouteSurface,
} from './route';
import { resampleClosedSpline, type Vec2 } from './spline';

export interface LoopDesign {
  id: string;
  version?: number;
  name: LocalizedText;
  worldId: string;
  /** Control points of the closed spline (x east, y north, meters). The first one is the start line. */
  controls: readonly Vec2[];
  /** Terrain altitude at (x, y), in meters. */
  elevationAt: (x: number, y: number) => number;
  stepM?: number;
  /** Steepest grade the road may have (the terrain is cut or filled beyond). */
  maxGradePercent?: number;
  /** Width of the altitude smoothing window, in meters. */
  smoothingM?: number;
  segments?: RouteSegment[];
  surface?: RouteSurface[];
  attribution?: string[];
}

const DEFAULTS = { stepM: 5, maxGradePercent: 12, smoothingM: 120 };
/** Grades are computed over ±25 m. */
const GRADE_HALF_WINDOW_M = 25;

export interface LoopPoints {
  id: string;
  version?: number;
  name: LocalizedText;
  worldId: string;
  /** Points of the closed line (x east, y north, z altitude, m), about evenly spaced; the first one is the start line. */
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  segments?: RouteSegment[];
  surface?: RouteSurface[];
  attribution?: string[];
}

/**
 * Builds a closed loop route from points already placed and given their
 * altitude (a loop sharing stretches with the roads of a network). The
 * distances are the lengths along the line; the grades and headings are
 * computed as in `buildLoopRoute`.
 */
export function loopRouteFromPoints(p: LoopPoints): Route {
  const { x, y, z } = p;
  const n = x.length;
  const d: number[] = new Array(n);
  let lengthM = 0;
  for (let i = 0; i < n; i++) {
    d[i] = lengthM;
    const j = (i + 1) % n;
    lengthM += Math.hypot((x[j] as number) - (x[i] as number), (y[j] as number) - (y[i] as number));
  }
  const spacingM = lengthM / n;
  const grade = computeGrades(
    z,
    spacingM,
    Math.max(1, Math.round(GRADE_HALF_WINDOW_M / spacingM)),
    true,
  );
  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    heading[i] = Math.atan2(
      (x[b] as number) - (x[a] as number),
      (y[b] as number) - (y[a] as number),
    );
  }
  const { ascentM, descentM } = ascentDescent(z, true);
  return Route.fromJson({
    format: 'hrt-route/1',
    id: p.id,
    version: p.version ?? 1,
    name: p.name,
    mode: 'virtual',
    worldId: p.worldId,
    loop: true,
    lengthM,
    ascentM,
    descentM,
    sampleStepM: spacingM,
    points: {
      d,
      x: Array.from(x),
      y: Array.from(y),
      z: Array.from(z),
      grade: Array.from(grade),
      heading: Array.from(heading),
    },
    segments: p.segments ?? [],
    surface: p.surface ?? [{ fromM: 0, toM: lengthM, type: 'asphalt' }],
    attribution: p.attribution ?? [],
  });
}

/** Builds a closed loop route from a spline drawn over a terrain. */
export function buildLoopRoute(design: LoopDesign): Route {
  const stepTarget = design.stepM ?? DEFAULTS.stepM;
  const { points, spacingM, lengthM } = resampleClosedSpline(design.controls, stepTarget);
  const n = points.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const raw = new Float64Array(n);
  points.forEach(([px, py], i) => {
    x[i] = px;
    y[i] = py;
    raw[i] = design.elevationAt(px, py);
  });

  const limited = limitGrade(
    raw,
    spacingM,
    design.maxGradePercent ?? DEFAULTS.maxGradePercent,
    true,
  );
  // Three passes of a box filter of width w ≈ a Gaussian of the same width.
  const half = Math.max(
    1,
    Math.round((design.smoothingM ?? DEFAULTS.smoothingM) / spacingM / 2 / 3),
  );
  const z = smooth(limited, half, 3, true);
  const grade = computeGrades(
    z,
    spacingM,
    Math.max(1, Math.round(GRADE_HALF_WINDOW_M / spacingM)),
    true,
  );

  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    heading[i] = Math.atan2(
      (x[b] as number) - (x[a] as number),
      (y[b] as number) - (y[a] as number),
    );
  }
  const { ascentM, descentM } = ascentDescent(z, true);
  const d = Array.from({ length: n }, (_, i) => i * spacingM);

  const json: RouteJson = {
    format: 'hrt-route/1',
    id: design.id,
    version: design.version ?? 1,
    name: design.name,
    mode: 'virtual',
    worldId: design.worldId,
    loop: true,
    lengthM,
    ascentM,
    descentM,
    sampleStepM: spacingM,
    points: {
      d,
      x: Array.from(x),
      y: Array.from(y),
      z: Array.from(z),
      grade: Array.from(grade),
      heading: Array.from(heading),
    },
    segments: design.segments ?? [],
    surface: design.surface ?? [{ fromM: 0, toM: lengthM, type: 'asphalt' }],
    attribution: design.attribution ?? [],
  };
  return Route.fromJson(json);
}
