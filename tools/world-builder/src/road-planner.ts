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
    this.z = blur(this.z, this.n, 2, 3);
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

  /** Cheapest path from a to b, as world points (a and b included). */
  path(a: Point, b: Point): Point[] {
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
    const h = (i: number) => Math.hypot((i % n) - bc, Math.floor(i / n) - br) * this.cell;
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
        const grade = (Math.abs((this.z[j] as number) - (this.z[i] as number)) / len) * 100;
        // Above the maximum the road is not forbidden but very expensive, so a
        // badly placed waypoint still gives a (reported) result.
        const excess = Math.max(0, grade - target);
        const step =
          len *
          (1 + 0.6 * excess * excess + 0.02 * grade) *
          (grade > max ? 3 : 1) *
          (this.used[j] ? 4 : 1);
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

  /** Closed loop through the waypoints (the first one is the start line). */
  loop(waypoints: readonly Point[]): Point[] {
    this.used.fill(0);
    const out: Point[] = [];
    for (let k = 0; k < waypoints.length; k++) {
      const leg = this.path(waypoints[k] as Point, waypoints[(k + 1) % waypoints.length] as Point);
      out.push(...leg.slice(0, -1));
      this.markUsed(leg, 60);
    }
    return out;
  }

  private markUsed(points: readonly Point[], radiusM: number) {
    const reach = Math.ceil(radiusM / this.cell);
    for (const p of points) {
      const c = Math.round((p[0] + this.half) / this.cell);
      const r = Math.round((this.half - p[1]) / this.cell);
      for (let dr = -reach; dr <= reach; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          const c2 = c + dc;
          const r2 = r + dr;
          if (c2 < 0 || r2 < 0 || c2 >= this.n || r2 >= this.n) continue;
          if (dc * dc + dr * dr <= reach * reach) this.used[r2 * this.n + c2] = 1;
        }
      }
    }
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
