// Road planning on a heightmap: shortest path between waypoints where the
// grade is penalized above a target and forbidden above a maximum, so steep
// slopes are climbed with switchbacks, like a real mountain road.

import { type Heightmap, heightAt } from './dem';

export type Point = readonly [number, number];

export interface PlannerOptions {
  /** Grade the road tries to stay under, in %. */
  targetGradePercent: number;
  /** Grade above which the road becomes very expensive, in %. */
  maxGradePercent: number;
  /** Planning grid spacing, in m. */
  cellM?: number;
  /** Altitude at or below which the ground is water (impassable). */
  waterLevelM?: number | null;
  /** Distance kept from the edges of the map, in m. */
  marginM?: number;
  /** Box blur passes of the planning surface (default 3: grades over ~100 m). */
  blurPasses?: number;
  /**
   * Grade of a move taken as its steepest part (sampled every 10 m) instead
   * of the difference between its ends, and moves above the maximum nearly
   * forbidden: the road cannot slip through a gully or over a spur that the
   * coarse grid does not see (lot 2.13). Off by default: same roads as before.
   */
  strictGrade?: boolean;
  /**
   * Cost of a half turn, as metres of road (0: off, the search ignores the
   * direction). With it the search knows where the road comes from: turning
   * costs `turnCostM × (1 − cos θ) / 2` and a single move never turns more
   * than 135°, so a climb makes a few real hairpins instead of zigzagging
   * from cell to cell.
   */
  turnCostM?: number;
}

// 16-neighbourhood: straight, diagonal and knight moves (smoother angles).
const MOVES: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];

/** With the turns, a leg ends within this distance of its waypoint (m). */
const WAYPOINT_RADIUS_M = 120;

/**
 * Turning cost between two moves, in half turns: (1 − cos θ) / 2, or −1 when
 * a single move would turn more than 135° (not allowed).
 */
const TURN_TABLE = (() => {
  const t = new Float64Array(MOVES.length * MOVES.length);
  MOVES.forEach(([ax, ay], a) => {
    MOVES.forEach(([bx, by], b) => {
      const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
      t[a * MOVES.length + b] = cos < Math.cos((135 * Math.PI) / 180) ? -1 : (1 - cos) / 2;
    });
  });
  return t;
})();

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((k[p] as number) <= key) break;
      k[i] = k[p] as number;
      v[i] = v[p] as number;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  pop(): [number, number] {
    const k = this.keys;
    const v = this.vals;
    const topK = k[0] as number;
    const topV = v[0] as number;
    const lastK = k.pop() as number;
    const lastV = v.pop() as number;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (k[r] as number) < (k[l] as number) ? r : l;
        if ((k[c] as number) >= lastK) break;
        k[i] = k[c] as number;
        v[i] = v[c] as number;
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return [topK, topV];
  }
}

export class RoadPlanner {
  private readonly n: number;
  private readonly cell: number;
  private readonly half: number;
  private z: Float32Array;
  private readonly blocked: Uint8Array;
  /** Cells next to a road already planned for this loop (discourages out-and-back legs). */
  private used: Uint8Array;
  /**
   * Cost factor of each cell (1 by default): below 1 along the roads of the
   * loops planned before (they are reused rather than doubled), above 1 where
   * an earlier attempt strayed from the ground (see `penalize`).
   */
  private readonly factor: Float32Array;
  /** Smallest cost factor: the A* heuristic is scaled by it to stay admissible. */
  private minFactor = 1;

  constructor(
    hm: Heightmap,
    private readonly o: PlannerOptions,
  ) {
    this.cell = o.cellM ?? 20;
    this.half = hm.sizeM / 2;
    this.n = Math.floor(hm.sizeM / this.cell) + 1;
    this.z = new Float32Array(this.n * this.n);
    this.blocked = new Uint8Array(this.n * this.n);
    this.used = new Uint8Array(this.n * this.n);
    this.factor = new Float32Array(this.n * this.n).fill(1);
    const margin = Math.ceil((o.marginM ?? 200) / this.cell);
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) {
        const [x, y] = this.toWorld(c, r);
        const h = heightAt(hm, x, y);
        const i = r * this.n + c;
        this.z[i] = h;
        const edge = r < margin || c < margin || r >= this.n - margin || c >= this.n - margin;
        const water = o.waterLevelM != null && h <= o.waterLevelM + 0.6;
        this.blocked[i] = edge || water ? 1 : 0;
      }
    }
    // DEM noise makes short-scale grades meaningless: plan on a smoothed surface.
    this.z = blur(this.z, this.n, 2, o.blurPasses ?? 3);
  }

  private toWorld(c: number, r: number): [number, number] {
    return [-this.half + c * this.cell, this.half - r * this.cell];
  }

  /** Grid cell of a point, moved to the nearest dry cell if it falls in water (≤ 500 m). */
  private toCell([x, y]: Point): [number, number] {
    const c = Math.round((x + this.half) / this.cell);
    const r = Math.round((this.half - y) / this.cell);
    const reach = Math.ceil(500 / this.cell);
    let best: [number, number] | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let dr = -reach; dr <= reach; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        const c2 = c + dc;
        const r2 = r + dr;
        if (c2 < 0 || r2 < 0 || c2 >= this.n || r2 >= this.n || this.blocked[r2 * this.n + c2])
          continue;
        const d = dc * dc + dr * dr;
        if (d < bestDist) {
          bestDist = d;
          best = [c2, r2];
        }
      }
    }
    if (!best) throw new Error(`Waypoint ${x}, ${y} is in water or off the map`);
    return best;
  }

  /** Planning surface between cells (bilinear, in cell coordinates). */
  private zAt(cf: number, rf: number): number {
    const n = this.n;
    const c0 = Math.min(n - 2, Math.max(0, Math.floor(cf)));
    const r0 = Math.min(n - 2, Math.max(0, Math.floor(rf)));
    const fx = cf - c0;
    const fy = rf - r0;
    const z = this.z;
    const a = (z[r0 * n + c0] as number) * (1 - fx) + (z[r0 * n + c0 + 1] as number) * fx;
    const b =
      (z[(r0 + 1) * n + c0] as number) * (1 - fx) + (z[(r0 + 1) * n + c0 + 1] as number) * fx;
    return a * (1 - fy) + b * fy;
  }

  /** Steepest grade (%) along a move, sampled about every 10 m. */
  private steepest(c: number, r: number, dc: number, dr: number, len: number): number {
    const parts = Math.max(1, Math.ceil(len / 10));
    let prev = this.zAt(c, r);
    let worst = 0;
    for (let k = 1; k <= parts; k++) {
      const z = this.zAt(c + (dc * k) / parts, r + (dr * k) / parts);
      worst = Math.max(worst, Math.abs(z - prev));
      prev = z;
    }
    return (worst / (len / parts)) * 100;
  }

  /** Cheapest path from a to b, as world points (a and b included). */
  path(a: Point, b: Point): Point[] {
    if (this.o.turnCostM) return this.pathWithTurns(a, b, this.o.turnCostM).points;
    const n = this.n;
    const [ac, ar] = this.toCell(a);
    const [bc, br] = this.toCell(b);
    const start = ar * n + ac;
    const goal = br * n + bc;
    const cost = new Float64Array(n * n).fill(Number.POSITIVE_INFINITY);
    const from = new Int32Array(n * n).fill(-1);
    const heap = new MinHeap();
    cost[start] = 0;
    heap.push(0, start);
    const { targetGradePercent: target, maxGradePercent: max } = this.o;
    // A* with the straight-line distance as an admissible heuristic.
    const h = (i: number) =>
      Math.hypot((i % n) - bc, Math.floor(i / n) - br) * this.cell * this.minFactor;
    while (heap.size) {
      const [, i] = heap.pop();
      if (i === goal) break;
      const ci = cost[i] as number;
      const c = i % n;
      const r = Math.floor(i / n);
      for (const [dc, dr] of MOVES) {
        const c2 = c + dc;
        const r2 = r + dr;
        if (c2 < 0 || r2 < 0 || c2 >= n || r2 >= n) continue;
        const j = r2 * n + c2;
        if (this.blocked[j]) continue;
        const len = Math.hypot(dc, dr) * this.cell;
        const grade = this.o.strictGrade
          ? this.steepest(c, r, dc, dr, len)
          : (Math.abs((this.z[j] as number) - (this.z[i] as number)) / len) * 100;
        // Above the maximum the road is not forbidden but very expensive, so a
        // badly placed waypoint still gives a (reported) result.
        const excess = Math.max(0, grade - target);
        const step =
          len *
          (1 + 0.6 * excess * excess + 0.02 * grade) *
          (grade > max ? (this.o.strictGrade ? 25 : 3) : 1) *
          (this.used[j] ? 4 : 1) *
          (this.factor[j] as number);
        const next = ci + step;
        if (next < (cost[j] as number)) {
          cost[j] = next;
          from[j] = i;
          heap.push(next + h(j), j);
        }
      }
    }
    if (from[goal] === -1 && goal !== start) throw new Error(`No road found from ${a} to ${b}`);
    const cells: number[] = [];
    for (let i = goal; i !== -1; i = from[i] as number) cells.push(i);
    cells.reverse();
    return cells.map((i) => this.toWorld(i % n, Math.floor(i / n)));
  }

  /** Cost of a move: length, grade, own legs, cost factor of the cell reached. */
  private moveCost(i: number, j: number, c: number, r: number, dc: number, dr: number): number {
    const { targetGradePercent: target, maxGradePercent: max } = this.o;
    const len = Math.hypot(dc, dr) * this.cell;
    const grade = this.o.strictGrade
      ? this.steepest(c, r, dc, dr, len)
      : (Math.abs((this.z[j] as number) - (this.z[i] as number)) / len) * 100;
    const excess = Math.max(0, grade - target);
    return (
      len *
      (1 + 0.6 * excess * excess + 0.02 * grade) *
      (grade > max ? (this.o.strictGrade ? 25 : 3) : 1) *
      (this.used[j] ? 4 : 1) *
      (this.factor[j] as number)
    );
  }

  /**
   * As `path`, searching over (cell, direction of arrival) with a cost for
   * turning. `startDir` is the direction the road arrives with at `a` (from
   * the previous leg), `endDir` the one it must leave `b` with (next leg):
   * the road goes through a waypoint without turning back. The leg ends as
   * soon as it passes within `goalRadiusM` of `b`: a waypoint on a summit or
   * a shoulder is not a dead end the road must reach and turn back from.
   * Returns the points and the directions of the first and last moves.
   */
  private pathWithTurns(
    a: Point,
    b: Point,
    turnCostM: number,
    startDir = -1,
    endDir = -1,
    goalRadiusM = 0,
  ): { points: Point[]; firstDir: number; lastDir: number } {
    const n = this.n;
    const D = MOVES.length;
    const S = D + 1; // the start has no direction
    const [ac, ar] = this.toCell(a);
    const [bc, br] = this.toCell(b);
    const goal = br * n + bc;
    const cost = new Float64Array(n * n * S).fill(Number.POSITIVE_INFINITY);
    const from = new Int32Array(n * n * S).fill(-1);
    const turn = TURN_TABLE;
    const heap = new MinHeap();
    const start = (ar * n + ac) * S + (startDir >= 0 ? startDir : D);
    cost[start] = 0;
    heap.push(0, start);
    const radius = goalRadiusM / this.cell;
    const toGoal = (cell: number) => Math.hypot((cell % n) - bc, Math.floor(cell / n) - br);
    const h = (cell: number) => Math.max(0, toGoal(cell) - radius) * this.cell * this.minFactor;
    let end = -1;
    while (heap.size) {
      const [, s] = heap.pop();
      const i = Math.floor(s / S);
      const din = s % S;
      // At the goal, the road must be able to go on in the next leg's direction.
      const reached = radius > 0 ? toGoal(i) <= radius : i === goal;
      if (reached && (endDir < 0 || din === D || (turn[din * D + endDir] as number) >= 0)) {
        end = s;
        break;
      }
      const cs = cost[s] as number;
      const c = i % n;
      const r = Math.floor(i / n);
      for (let e = 0; e < D; e++) {
        const t = din === D ? 0 : (turn[din * D + e] as number);
        if (t < 0) continue;
        const [dc, dr] = MOVES[e] as [number, number];
        const c2 = c + dc;
        const r2 = r + dr;
        if (c2 < 0 || r2 < 0 || c2 >= n || r2 >= n) continue;
        const j = r2 * n + c2;
        if (this.blocked[j]) continue;
        const next = cs + this.moveCost(i, j, c, r, dc, dr) + t * turnCostM;
        const sj = j * S + e;
        if (next < (cost[sj] as number)) {
          cost[sj] = next;
          from[sj] = s;
          heap.push(next + h(j), sj);
        }
      }
    }
    if (end < 0) throw new Error(`No road found from ${a} to ${b}`);
    const states: number[] = [];
    for (let s = end; s !== -1; s = from[s] as number) states.push(s);
    states.reverse();
    const dirOf = (s: number | undefined) => (s === undefined ? -1 : s % S === D ? -1 : s % S);
    return {
      points: states.map((s) => {
        const i = Math.floor(s / S);
        return this.toWorld(i % n, Math.floor(i / n));
      }),
      firstDir: dirOf(states[1]),
      lastDir: dirOf(states.at(-1)),
    };
  }

  /** Closed loop through the waypoints (the first one is the start line). */
  loop(waypoints: readonly Point[]): Point[] {
    if (this.o.turnCostM) return this.loopWithTurns(waypoints, this.o.turnCostM);
    this.used.fill(0);
    const out: Point[] = [];
    for (let k = 0; k < waypoints.length; k++) {
      const leg = this.path(waypoints[k] as Point, waypoints[(k + 1) % waypoints.length] as Point);
      out.push(...leg.slice(0, -1));
      this.markUsed(leg, 60);
    }
    return out;
  }

  /**
   * As `loop`, the road keeping its direction through every waypoint: legs 1
   * to n − 1 in turn, each leaving its waypoint the way the previous one
   * arrived, then leg 0, which must also arrive at waypoint 1 the way leg 1
   * leaves it (the start line is not a corner either).
   */
  private loopWithTurns(waypoints: readonly Point[], turnCostM: number): Point[] {
    this.used.fill(0);
    const m = waypoints.length;
    const legs: Point[][] = new Array(m);
    let arrive = -1;
    let leave1 = -1;
    // Each leg starts where the previous one ended (near its waypoint); leg 0,
    // planned last, ends exactly where leg 1 started.
    let from = waypoints[1 % m] as Point;
    for (let k = 1; k <= m; k++) {
      const leg = k % m;
      const r =
        leg === 0
          ? this.pathWithTurns(from, waypoints[1 % m] as Point, turnCostM, arrive, leave1)
          : this.pathWithTurns(
              from,
              waypoints[(leg + 1) % m] as Point,
              turnCostM,
              arrive,
              -1,
              WAYPOINT_RADIUS_M,
            );
      if (leg === 1) leave1 = r.firstDir;
      arrive = r.lastDir;
      legs[leg] = r.points;
      from = r.points.at(-1) as Point;
      this.markUsed(r.points, 60);
    }
    return legs.flatMap((leg) => leg.slice(0, -1));
  }

  /**
   * Makes the cells within `radiusM` of the points `factor` times as costly
   * (cumulative). Below 1 along an existing road, above 1 to steer away.
   */
  scaleCost(points: readonly Point[], radiusM: number, factor: number) {
    const touched = new Uint8Array(this.n * this.n);
    this.forCells(points, radiusM, (i) => {
      if (touched[i]) return;
      touched[i] = 1;
      this.factor[i] = (this.factor[i] as number) * factor;
      this.minFactor = Math.min(this.minFactor, this.factor[i] as number);
    });
  }

  private forCells(points: readonly Point[], radiusM: number, visit: (i: number) => void) {
    const reach = Math.ceil(radiusM / this.cell);
    for (const p of points) {
      const c = Math.round((p[0] + this.half) / this.cell);
      const r = Math.round((this.half - p[1]) / this.cell);
      for (let dr = -reach; dr <= reach; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          const c2 = c + dc;
          const r2 = r + dr;
          if (c2 < 0 || r2 < 0 || c2 >= this.n || r2 >= this.n) continue;
          if (dc * dc + dr * dr <= reach * reach) visit(r2 * this.n + c2);
        }
      }
    }
  }

  private markUsed(points: readonly Point[], radiusM: number) {
    this.forCells(points, radiusM, (i) => {
      this.used[i] = 1;
    });
  }
}

/**
 * Rounds the corners of a planned grid path: resampled every `stepM`, circular
 * moving average over ±windowM (2 passes), then one control point every
 * `controlSpacingM`. The first point stays the start of the loop.
 */
export function smoothClosed(
  points: readonly Point[],
  options: { stepM?: number; windowM?: number; controlSpacingM?: number } = {},
): Point[] {
  const stepM = options.stepM ?? 10;
  const half = Math.max(1, Math.round((options.windowM ?? 40) / stepM));
  const every = Math.max(1, Math.round((options.controlSpacingM ?? 30) / stepM));
  // Resample at a constant spacing.
  const closed = [...points, points[0] as Point];
  const dense: [number, number][] = [];
  let carry = 0;
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1] as Point;
    const b = closed[i] as Point;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = carry;
    while (d < len) {
      const t = d / len;
      dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += stepM;
    }
    carry = d - len;
  }
  const n = dense.length;
  let cur = dense;
  for (let pass = 0; pass < 2; pass++) {
    const next: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      for (let k = -half; k <= half; k++) {
        const p = cur[(((i + k) % n) + n) % n] as [number, number];
        sx += p[0];
        sy += p[1];
      }
      next.push([sx / (2 * half + 1), sy / (2 * half + 1)]);
    }
    cur = next;
  }
  return cur.filter((_, i) => i % every === 0);
}

/** Separable box blur (radius in cells), repeated `passes` times. */
function blur(src: Float32Array, n: number, radius: number, passes: number): Float32Array {
  let a = src;
  for (let p = 0; p < passes; p++) {
    for (const horizontal of [true, false]) {
      const b = new Float32Array(n * n);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          let sum = 0;
          let count = 0;
          for (let k = -radius; k <= radius; k++) {
            const rr = horizontal ? r : r + k;
            const cc = horizontal ? c + k : c;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            sum += a[rr * n + cc] as number;
            count++;
          }
          b[r * n + c] = sum / count;
        }
      }
      a = b;
    }
  }
  return a;
}
