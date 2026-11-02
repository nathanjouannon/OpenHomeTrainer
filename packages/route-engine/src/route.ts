// Internal route format shared by mode A (virtual loops) and mode B (real routes).
// See docs/07-donnees-et-api.md §1.
//
// Coordinates: x points east, y points north (meters, world frame), z is the altitude (m).
// Heading is in radians, 0 = north, π/2 = east (clockwise from north).

export type LocalizedText = { fr: string; en: string };

export interface RouteSegment {
  id: string;
  name: LocalizedText;
  type: 'climb' | 'sprint' | 'other';
  startM: number;
  endM: number;
}

export interface RouteSurface {
  fromM: number;
  toM: number;
  type: 'asphalt' | 'gravel' | 'dirt';
}

/** Serialized route (route.json). Points are stored as columns. */
export interface RouteJson {
  format: 'hrt-route/1';
  id: string;
  version: number;
  name: LocalizedText;
  mode: 'virtual' | 'real';
  worldId: string | null;
  loop: boolean;
  lengthM: number;
  ascentM: number;
  descentM: number;
  sampleStepM: number;
  points: {
    d: number[];
    x: number[];
    y: number[];
    z: number[];
    grade: number[];
    heading: number[];
  };
  segments: RouteSegment[];
  surface: RouteSurface[];
  attribution: string[];
}

export interface RoutePoint {
  /** Distance along the lap, in meters. */
  d: number;
  x: number;
  y: number;
  z: number;
  gradePercent: number;
  heading: number;
}

export const emptyRoutePoint = (): RoutePoint => ({
  d: 0,
  x: 0,
  y: 0,
  z: 0,
  gradePercent: 0,
  heading: 0,
});

const TWO_PI = Math.PI * 2;

/** Shortest signed angle from a to b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/**
 * Runtime route: typed arrays plus interpolation.
 * For a loop, the last point does not duplicate the first one: the closing
 * segment goes from the last point back to point 0 over `lengthM`.
 */
export class Route {
  readonly d: Float64Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly grade: Float64Array;
  readonly heading: Float64Array;
  private readonly uniformStepM: number | null;
  private lastIndex = 0;

  constructor(
    readonly meta: Omit<RouteJson, 'points' | 'format'>,
    points: RouteJson['points'],
  ) {
    const n = points.d.length;
    if (n < 2) throw new Error(`Route ${meta.id}: at least 2 points are required`);
    for (const key of ['x', 'y', 'z', 'grade', 'heading'] as const) {
      if (points[key].length !== n)
        throw new Error(`Route ${meta.id}: column ${key} has wrong size`);
    }
    this.d = Float64Array.from(points.d);
    this.x = Float64Array.from(points.x);
    this.y = Float64Array.from(points.y);
    this.z = Float64Array.from(points.z);
    this.grade = Float64Array.from(points.grade);
    this.heading = Float64Array.from(points.heading);
    const step = meta.sampleStepM;
    const uniform = this.d.every((d, i) => Math.abs(d - i * step) < 1e-3);
    this.uniformStepM = uniform ? step : null;
  }

  static fromJson(json: RouteJson): Route {
    if (json.format !== 'hrt-route/1') throw new Error(`Unsupported route format: ${json.format}`);
    const { points, format: _format, ...meta } = json;
    return new Route(meta, points);
  }

  toJson(): RouteJson {
    const col = (a: Float64Array, decimals: number) => Array.from(a, (v) => round(v, decimals));
    return {
      format: 'hrt-route/1',
      ...this.meta,
      points: {
        d: col(this.d, 3),
        x: col(this.x, 2),
        y: col(this.y, 2),
        z: col(this.z, 2),
        grade: col(this.grade, 2),
        heading: col(this.heading, 4),
      },
    };
  }

  get id() {
    return this.meta.id;
  }

  get lengthM() {
    return this.meta.lengthM;
  }

  get loop() {
    return this.meta.loop;
  }

  get pointCount() {
    return this.d.length;
  }

  /** Distance along the lap: modulo the lap length for a loop, clamped otherwise. */
  wrap(distanceM: number): number {
    const L = this.meta.lengthM;
    if (this.meta.loop) return ((distanceM % L) + L) % L;
    return Math.min(L, Math.max(0, distanceM));
  }

  /** Lap number (1-based) and distance within the lap for a total ridden distance. */
  lapOf(totalDistanceM: number): { lap: number; lapDistanceM: number } {
    if (!this.meta.loop) return { lap: 1, lapDistanceM: this.wrap(totalDistanceM) };
    const L = this.meta.lengthM;
    const lap = Math.floor(Math.max(0, totalDistanceM) / L) + 1;
    return { lap, lapDistanceM: this.wrap(totalDistanceM) };
  }

  /** Index i of the segment [i, i+1] that contains the wrapped distance d. */
  private segmentIndex(d: number): number {
    const n = this.d.length;
    if (this.uniformStepM !== null) {
      return Math.min(n - 1, Math.max(0, Math.floor(d / this.uniformStepM)));
    }
    // Most calls move forward a little: try the cached index first.
    const cached = this.lastIndex;
    const end = (i: number) => (i + 1 < n ? (this.d[i + 1] as number) : this.meta.lengthM);
    if ((this.d[cached] as number) <= d && d < end(cached)) return cached;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.d[mid] as number) <= d) lo = mid;
      else hi = mid - 1;
    }
    this.lastIndex = lo;
    return lo;
  }

  /** Interpolated point at a distance (taken modulo the lap length for a loop). */
  sampleAt(distanceM: number, out: RoutePoint = emptyRoutePoint()): RoutePoint {
    const n = this.d.length;
    const d = this.wrap(distanceM);
    const i0 = this.segmentIndex(d);
    const closing = i0 === n - 1;
    if (closing && !this.meta.loop) return this.copyPoint(i0, d, out);
    const i1 = closing ? 0 : i0 + 1;
    const d0 = this.d[i0] as number;
    const d1 = closing ? this.meta.lengthM : (this.d[i1] as number);
    const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
    const lerp = (a: Float64Array) =>
      (a[i0] as number) + ((a[i1] as number) - (a[i0] as number)) * t;
    out.d = d;
    out.x = lerp(this.x);
    out.y = lerp(this.y);
    out.z = lerp(this.z);
    out.gradePercent = lerp(this.grade);
    const h0 = this.heading[i0] as number;
    out.heading = h0 + angleDelta(h0, this.heading[i1] as number) * t;
    return out;
  }

  private copyPoint(i: number, d: number, out: RoutePoint): RoutePoint {
    out.d = d;
    out.x = this.x[i] as number;
    out.y = this.y[i] as number;
    out.z = this.z[i] as number;
    out.gradePercent = this.grade[i] as number;
    out.heading = this.heading[i] as number;
    return out;
  }

  /** Downsampled elevation profile of one lap (for the HUD and the route picker). */
  profile(samples = 200): { d: number; z: number }[] {
    const p = emptyRoutePoint();
    const out: { d: number; z: number }[] = [];
    for (let k = 0; k <= samples; k++) {
      const d = (k / samples) * this.meta.lengthM;
      // Sampling exactly lengthM wraps to 0 on a loop, which is the same point anyway.
      this.sampleAt(Math.min(d, this.meta.lengthM - 1e-6), p);
      out.push({ d, z: p.z });
    }
    return out;
  }

  /** Bounding box of the route in the world frame. */
  bounds(): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
    const range = (a: Float64Array) => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const v of a) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return [min, max] as const;
    };
    const [minX, maxX] = range(this.x);
    const [minY, maxY] = range(this.y);
    const [minZ, maxZ] = range(this.z);
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  /** Surface type at a distance along the lap. */
  surfaceAt(distanceM: number): RouteSurface['type'] {
    const d = this.wrap(distanceM);
    return this.meta.surface.find((s) => d >= s.fromM && d < s.toM)?.type ?? 'asphalt';
  }
}
