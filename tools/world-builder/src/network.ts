// Road network of a world (lot 2.13): a loop planned after others reuses
// their roads where it runs along them, with the very same line and altitude,
// and meets them at the same level where it crosses them; a loop that comes
// back along its own road (out and back) rides that same road again. Without
// this, loops planned on their own made roads side by side at different
// altitudes, and crossings without a junction or a bridge (docs/16 §1).

/** A closed road already in the network (x east, y north, z altitude, m). */
export interface NetworkRoad {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
}

export interface SnapOptions {
  /** A point closer than this to a road, running along it, joins it (m). */
  snapM?: number;
  /** Largest angle between the two directions for a point to run along a road (rad). */
  maxAngle?: number;
  /** Shortest shared stretch kept (m): shorter ones stay apart. */
  minRunM?: number;
  /** Length over which the line moves onto the road before and after a shared stretch (m). */
  blendM?: number;
  /**
   * Ground altitude: a road of the network is only joined where it lies
   * within `maxGroundGapM` of the ground (not a road passing high above).
   */
  groundAt?: (x: number, y: number) => number;
  maxGroundGapM?: number;
}

export interface Crossing {
  /** Index of the point of the new line nearest the crossing. */
  index: number;
  /** Altitude of the crossed road there (m). */
  z: number;
}

export interface SnapResult {
  x: Float64Array;
  y: Float64Array;
  /** Altitude of the network road under each point of a shared stretch, NaN elsewhere. */
  pinned: Float64Array;
  /**
   * For a point on the line's own earlier passage (out and back): the
   * fractional index of that passage, so it takes its altitude; NaN elsewhere.
   */
  selfRef: Float64Array;
  /** Where the line crosses a road of the network (outside the shared stretches). */
  crossings: Crossing[];
  /**
   * Where the line crosses itself: the later passage (`index`) takes the
   * altitude of the earlier one at the fractional index `ref`.
   */
  selfCrossings: { index: number; ref: number }[];
  sharedM: number;
  selfSharedM: number;
}

type Segment = {
  road: number;
  i: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

const CELL_M = 40;

/** Segments of closed lines, bucketed in square cells. */
class SegmentIndex {
  private readonly buckets = new Map<string, Segment[]>();

  constructor(readonly roads: readonly NetworkRoad[]) {
    roads.forEach((road, ri) => {
      const n = road.x.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const s: Segment = {
          road: ri,
          i,
          ax: road.x[i] as number,
          ay: road.y[i] as number,
          bx: road.x[j] as number,
          by: road.y[j] as number,
        };
        const c0 = Math.floor(Math.min(s.ax, s.bx) / CELL_M);
        const c1 = Math.floor(Math.max(s.ax, s.bx) / CELL_M);
        const r0 = Math.floor(Math.min(s.ay, s.by) / CELL_M);
        const r1 = Math.floor(Math.max(s.ay, s.by) / CELL_M);
        for (let c = c0; c <= c1; c++) {
          for (let r = r0; r <= r1; r++) {
            const key = `${c},${r}`;
            const list = this.buckets.get(key);
            if (list) list.push(s);
            else this.buckets.set(key, [s]);
          }
        }
      }
    });
  }

  /** Segments of the 3 × 3 cells around (x, y): all those within one cell (40 m) of it. */
  near(x: number, y: number): Segment[] {
    const out: Segment[] = [];
    const cc = Math.floor(x / CELL_M);
    const rc = Math.floor(y / CELL_M);
    for (let c = cc - 1; c <= cc + 1; c++) {
      for (let r = rc - 1; r <= rc + 1; r++) {
        const list = this.buckets.get(`${c},${r}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }

  /** Altitude of a road at a fraction `t` of its segment `i`. */
  zAt(s: Segment, t: number): number {
    const road = this.roads[s.road] as NetworkRoad;
    const n = road.z.length;
    const a = road.z[s.i] as number;
    const b = road.z[(s.i + 1) % n] as number;
    return a + (b - a) * t;
  }
}

/** Projection of (x, y) on a segment: point, fraction along it and distance. */
function project(s: Segment, x: number, y: number) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy) / len2)) : 0;
  const px = s.ax + dx * t;
  const py = s.ay + dy * t;
  return { px, py, t, dist: Math.hypot(x - px, y - py) };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Where a point of the line lies on another road (or its own earlier
 * passage): the point, its altitude, the road and the fractional index along
 * it (`roadN` samples, closed).
 */
type Hit = { px: number; py: number; z: number; road: number; ref: number; roadN: number };

/**
 * True if two consecutive hits follow on along the network: their points are
 * close (two roads already merged count as one; a jump to another road
 * nearby, at a junction, does not).
 */
function continues(a: Hit, b: Hit, stepM: number): boolean {
  return Math.hypot(b.px - a.px, b.py - a.py) <= 3 * stepM;
}

/**
 * Moves the points of the runs of hits onto their road (runs shorter than
 * `minRun` dropped, short gaps not filled), with a smooth shift over `blend`
 * points before and after. Returns the mask of the points moved.
 */
function moveOnto(
  x: Float64Array,
  y: Float64Array,
  hits: (Hit | null)[],
  minRun: number,
  blend: number,
): Uint8Array {
  const n = x.length;
  let stepM = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    stepM += Math.hypot((x[j] as number) - (x[i] as number), (y[j] as number) - (y[i] as number));
  }
  stepM /= n;
  const at = (i: number) => ((i % n) + n) % n;
  const on = new Uint8Array(n);
  let start = 0;
  while (start < n && hits[start]) start++;
  if (start === n) start = 0;
  // A run follows one road continuously: a hit on another road, or a jump
  // along it, starts a new run (near a junction two roads are within reach).
  const runs: [number, number][] = [];
  let runStart = -1;
  for (let k = 0; k <= n; k++) {
    const h = k < n ? hits[at(start + k)] : null;
    const prev = k > 0 ? hits[at(start + k - 1)] : null;
    const goesOn = h && prev && runStart >= 0 && continues(prev, h, stepM);
    if (runStart >= 0 && !goesOn) {
      if (k - runStart >= minRun) runs.push([runStart, k - 1]);
      runStart = -1;
    }
    if (h && runStart < 0) runStart = k;
  }
  const shift = new Float64Array(n * 2);
  const weight = new Float64Array(n);
  for (const [a, b] of runs) {
    for (let k = a; k <= b; k++) {
      const i = at(start + k);
      const h = hits[i] as Hit;
      on[i] = 1;
      shift[i * 2] = h.px - (x[i] as number);
      shift[i * 2 + 1] = h.py - (y[i] as number);
      weight[i] = 1;
    }
  }
  for (const [a, b] of runs) {
    for (const [edge, dir] of [
      [a, -1],
      [b, 1],
    ] as const) {
      const e = at(start + edge);
      for (let k = 1; k <= blend; k++) {
        const i = at(start + edge + dir * k);
        if (on[i]) break;
        const w = smoothstep(1 - k / (blend + 1));
        if (w <= (weight[i] as number)) continue;
        weight[i] = w;
        shift[i * 2] = (shift[e * 2] as number) * w;
        shift[i * 2 + 1] = (shift[e * 2 + 1] as number) * w;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    x[i] = (x[i] as number) + (shift[i * 2] as number);
    y[i] = (y[i] as number) + (shift[i * 2 + 1] as number);
  }
  return on;
}

/** Direction of a closed line at point i (not normalised). */
function tangent(x: ArrayLike<number>, y: ArrayLike<number>, i: number): [number, number] {
  const n = x.length;
  const a = (i - 1 + n) % n;
  const b = (i + 1) % n;
  return [(x[b] as number) - (x[a] as number), (y[b] as number) - (y[a] as number)];
}

/**
 * Moves a closed line (evenly spaced points) onto the roads of the network
 * where it runs along one of them, then onto its own earlier passage where it
 * comes back along it, finds where it crosses the network, and spaces its
 * points evenly again.
 */
export function snapToNetwork(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  roads: readonly NetworkRoad[],
  options: SnapOptions = {},
): SnapResult {
  const n = xs.length;
  let x = Float64Array.from(xs);
  let y = Float64Array.from(ys);
  const snapM = options.snapM ?? 30;
  const cosMax = Math.cos(options.maxAngle ?? (35 * Math.PI) / 180);
  const maxGroundGap = options.maxGroundGapM ?? 6;
  let stepM = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    stepM += Math.hypot((x[j] as number) - (x[i] as number), (y[j] as number) - (y[i] as number));
  }
  stepM /= n;
  const minRun = Math.max(2, Math.round((options.minRunM ?? 80) / stepM));
  const blend = Math.max(1, Math.round((options.blendM ?? 100) / stepM));
  const at = (i: number) => ((i % n) + n) % n;

  /** Nearest segment running along the line at point i, among `segs`, accepted by `keep`. */
  const nearest = (index: SegmentIndex, i: number, keep: (s: Segment) => boolean) => {
    const [tx, ty] = tangent(x, y, i);
    const tl = Math.hypot(tx, ty) || 1;
    let best: (Hit & { dist: number }) | null = null;
    for (const s of index.near(x[i] as number, y[i] as number)) {
      if (!keep(s)) continue;
      const sl = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
      const cos = Math.abs((tx * (s.bx - s.ax) + ty * (s.by - s.ay)) / (tl * sl));
      if (cos < cosMax) continue;
      const p = project(s, x[i] as number, y[i] as number);
      if (p.dist > snapM || (best && p.dist >= best.dist)) continue;
      best = {
        px: p.px,
        py: p.py,
        z: index.zAt(s, p.t),
        road: s.road,
        ref: s.i + p.t,
        roadN: (index.roads[s.road] as NetworkRoad).x.length,
        dist: p.dist,
      };
    }
    return best;
  };

  // 1. Onto the network roads that lie on the ground there.
  const pinnedRaw = new Float64Array(n).fill(Number.NaN);
  let shared: Uint8Array = new Uint8Array(n);
  const network = new SegmentIndex(roads);
  if (roads.length) {
    const hits = Array.from({ length: n }, (_, i) => {
      const h = nearest(network, i, () => true);
      if (!h) return null;
      // The road lies on the ground there, at the level of the line's ground
      // (not a road higher up the slope, or passing above on an embankment).
      const g = options.groundAt;
      if (
        g &&
        (Math.abs(h.z - g(h.px, h.py)) > maxGroundGap ||
          Math.abs(h.z - g(x[i] as number, y[i] as number)) > maxGroundGap)
      ) {
        return null;
      }
      return h;
    });
    shared = moveOnto(x, y, hits, minRun, blend);
    for (let i = 0; i < n; i++) if (shared[i]) pinnedRaw[i] = (hits[i] as Hit).z;
  }

  // 2. Onto its own earlier passage (out and back), off the network roads.
  const selfRaw = new Float64Array(n).fill(Number.NaN);
  const minGap = Math.round(300 / stepM);
  const self = new SegmentIndex([{ x, y, z: new Float64Array(n) }]);
  const selfHits = Array.from({ length: n }, (_, i) => {
    if (shared[i]) return null;
    const h = nearest(self, i, (s) => {
      const gap = i - s.i;
      // An earlier passage, far enough back along the line (not the same stretch).
      return gap > minGap && n - gap > minGap && !shared[s.i];
    });
    // Both passages on the ground at the same level (not one above the other on a slope).
    const g = options.groundAt;
    if (h && g && Math.abs(g(h.px, h.py) - g(x[i] as number, y[i] as number)) > maxGroundGap / 2) {
      return null;
    }
    return h;
  });
  const selfOn = moveOnto(x, y, selfHits, minRun, blend);
  for (let i = 0; i < n; i++) if (selfOn[i]) selfRaw[i] = (selfHits[i] as Hit).ref;

  // 3. Crossings with the network roads, off the shared stretches.
  const crossings: Crossing[] = [];
  for (let i = 0; i < n; i++) {
    const j = at(i + 1);
    if (shared[i] || shared[j]) continue;
    const ax = x[i] as number;
    const ay = y[i] as number;
    const bx = x[j] as number;
    const by = y[j] as number;
    for (const s of network.near((ax + bx) / 2, (ay + by) / 2)) {
      const hit = intersect(ax, ay, bx, by, s.ax, s.ay, s.bx, s.by);
      if (!hit) continue;
      const near = hit.u < 0.5 ? i : j;
      if (crossings.some((c) => Math.abs(c.index - near) < 4)) continue;
      crossings.push({ index: near, z: network.zAt(s, hit.v) });
    }
  }

  // 4. Folds (a point where the line turns back on itself, left by a tight
  // hairpin or a shift) rounded off, on the points that are not on a road.
  // The last few points of a stretch on a road may move too: the stretch can
  // run a little past the point where the line actually turns off.
  const on = (i: number) => shared[at(i)] === 1 || selfOn[at(i)] === 1;
  unfold(x, y, (i) => on(i) && on(i - 3) && on(i + 3));

  // 5. Even spacing again (the shifts stretched or squeezed the line).
  const even = resampleClosed(x, y, [pinnedRaw, selfRaw]);
  x = even.x;
  y = even.y;
  const [pinned, selfRef] = even.values as [Float64Array, Float64Array];
  for (const c of crossings) c.index = Math.min(n - 1, Math.round(even.indexOf(c.index)));
  let sharedM = 0;
  let selfSharedM = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(pinned[i] as number)) sharedM += stepM;
    if (!Number.isNaN(selfRef[i] as number)) selfSharedM += stepM;
  }
  // Self references point at the old indices: map them to the new ones.
  for (let i = 0; i < n; i++) {
    const r = selfRef[i] as number;
    if (!Number.isNaN(r)) selfRef[i] = even.indexOf(r);
  }
  // 6. Crossings of the line with itself (an X between two passages).
  const selfCrossings: { index: number; ref: number }[] = [];
  const own = new SegmentIndex([{ x, y, z: new Float64Array(n) }]);
  for (let j = 0; j < n; j++) {
    const k = at(j + 1);
    const ax = x[j] as number;
    const ay = y[j] as number;
    const bx = x[k] as number;
    const by = y[k] as number;
    for (const s of own.near((ax + bx) / 2, (ay + by) / 2)) {
      const gap = j - s.i;
      if (gap <= minGap || n - gap <= minGap) continue;
      const hit = intersect(ax, ay, bx, by, s.ax, s.ay, s.bx, s.by);
      if (!hit) continue;
      const index = hit.u < 0.5 ? j : k;
      if (selfCrossings.some((c) => Math.abs(c.index - index) < 4)) continue;
      selfCrossings.push({ index, ref: s.i + hit.v });
    }
  }
  return { x, y, pinned, selfRef, crossings, selfCrossings, sharedM, selfSharedM };
}

/**
 * The same number of points, evenly spaced along a closed line; `values`
 * follow (linear, NaN where either neighbour is NaN). `indexOf` maps an old
 * fractional index to the new one.
 */
export function resampleClosed(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  values: readonly ArrayLike<number>[],
) {
  const n = x.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] =
      (cum[i] as number) +
      Math.hypot((x[j] as number) - (x[i] as number), (y[j] as number) - (y[i] as number));
  }
  const L = cum[n] as number;
  const ox = new Float64Array(n);
  const oy = new Float64Array(n);
  const ov = values.map(() => new Float64Array(n));
  let k = 0;
  for (let m = 0; m < n; m++) {
    const d = (L * m) / n;
    while (k < n - 1 && (cum[k + 1] as number) <= d) k++;
    const seg = (cum[k + 1] as number) - (cum[k] as number);
    const t = seg > 0 ? (d - (cum[k] as number)) / seg : 0;
    const j = (k + 1) % n;
    ox[m] = (x[k] as number) + ((x[j] as number) - (x[k] as number)) * t;
    oy[m] = (y[k] as number) + ((y[j] as number) - (y[k] as number)) * t;
    values.forEach((v, q) => {
      const a = v[k] as number;
      const b = v[j] as number;
      (ov[q] as Float64Array)[m] =
        Number.isNaN(a) || Number.isNaN(b) ? Number.NaN : a + (b - a) * t;
    });
  }
  const indexOf = (old: number) => {
    const i = Math.floor(old);
    const t = old - i;
    const d = (cum[i % n] as number) + ((cum[(i % n) + 1] as number) - (cum[i % n] as number)) * t;
    return ((d / L) * n) % n;
  };
  return { x: ox, y: oy, values: ov, indexOf };
}

/** Largest turn allowed at a point of the line before it counts as a fold (rad). */
const MAX_TURN = (100 * Math.PI) / 180;

/**
 * Moves the free points where a closed line turns by more than MAX_TURN
 * towards the middle of their neighbours, a few times, so that no fold is
 * left (each pass also softens the points next to it).
 */
export function unfold(x: Float64Array, y: Float64Array, fixed: (i: number) => boolean) {
  const n = x.length;
  const turnAt = (i: number) => {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const ux = (x[i] as number) - (x[a] as number);
    const uy = (y[i] as number) - (y[a] as number);
    const vx = (x[b] as number) - (x[i] as number);
    const vy = (y[b] as number) - (y[i] as number);
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return l > 0 ? Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / l))) : Math.PI;
  };
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (fixed(i) || turnAt(i) <= MAX_TURN) continue;
      // The fold and two points on each side move halfway to their neighbours' middle.
      for (let k = -2; k <= 2; k++) {
        const j = (i + k + n) % n;
        if (fixed(j)) continue;
        const a = (j - 1 + n) % n;
        const b = (j + 1) % n;
        x[j] = ((x[j] as number) + ((x[a] as number) + (x[b] as number)) / 2) / 2;
        y[j] = ((y[j] as number) + ((y[a] as number) + (y[b] as number)) / 2) / 2;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

/** Intersection of segments AB and CD: fractions along each, or null. */
function intersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { u: number; v: number } | null {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const u = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const v = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
}

/**
 * Altitudes of a line that keep to `z` (its own profile) but take exactly
 * the pinned altitudes, and move to them over `blend` points around: shared
 * stretches lie on the network road, crossings meet it at the same level.
 */
export function pinProfile(z: Float64Array, pinned: Float64Array, blend: number): Float64Array {
  const n = z.length;
  const out = Float64Array.from(z);
  const at = (i: number) => ((i % n) + n) % n;
  const weight = new Float64Array(n);
  const corr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = pinned[i] as number;
    if (Number.isNaN(p)) continue;
    weight[i] = 1;
    corr[i] = p - (z[i] as number);
  }
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(pinned[i] as number)) continue;
    for (const dir of [-1, 1]) {
      // Only from the edge of a pinned stretch.
      if (!Number.isNaN(pinned[at(i + dir)] as number)) continue;
      for (let k = 1; k <= blend; k++) {
        const j = at(i + dir * k);
        if (!Number.isNaN(pinned[j] as number)) break;
        const w = smoothstep(1 - k / (blend + 1));
        if (w <= (weight[j] as number)) continue;
        weight[j] = w;
        corr[j] = (corr[i] as number) * w;
      }
    }
  }
  for (let i = 0; i < n; i++) out[i] = (z[i] as number) + (corr[i] as number);
  return out;
}
