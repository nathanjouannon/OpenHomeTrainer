import { describe, expect, it } from 'vitest';
import type { Heightmap } from './dem';
import { type NetworkRoad, pinProfile, resampleClosed, snapToNetwork, unfold } from './network';
import { RoadPlanner } from './road-planner';

/** A closed rectangle of points every `step` m, counter-clockwise from (x0, y0). */
function rectangle(x0: number, y0: number, w: number, h: number, step = 5) {
  const xs: number[] = [];
  const ys: number[] = [];
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.round(Math.hypot(bx - ax, by - ay) / step);
    for (let k = 0; k < n; k++) {
      xs.push(ax + ((bx - ax) * k) / n);
      ys.push(ay + ((by - ay) * k) / n);
    }
  };
  side(x0, y0, x0 + w, y0);
  side(x0 + w, y0, x0 + w, y0 + h);
  side(x0 + w, y0 + h, x0, y0 + h);
  side(x0, y0 + h, x0, y0);
  return { xs, ys };
}

const road = (xs: number[], ys: number[], z: (i: number) => number): NetworkRoad => ({
  x: xs,
  y: ys,
  z: xs.map((_, i) => z(i)),
});

describe('snapToNetwork', () => {
  // A road along y = 0 from x = 0 to 1000 (the south side of a 1000 × 600 loop).
  const a = rectangle(0, 0, 1000, 600);
  const network = [road(a.xs, a.ys, (i) => 500 + i * 0.01)];

  it('lays a line running 10 m beside a road onto it, with its altitude', () => {
    // South side 10 m north of the road's, other sides 100 m from the road's.
    const b = rectangle(100, 10, 800, 300);
    const s = snapToNetwork(b.xs, b.ys, network, { groundAt: () => 500 });
    let onRoad = 0;
    for (let i = 0; i < s.x.length; i++) {
      if (Number.isNaN(s.pinned[i] as number)) continue;
      onRoad++;
      expect(Math.abs(s.y[i] as number)).toBeLessThan(0.05);
    }
    // Most of the 800 m south side (the ends move onto it gradually).
    expect(onRoad * 5).toBeGreaterThan(550);
    expect(s.sharedM).toBeGreaterThan(550);
  });

  it('keeps apart from a road that does not lie at its ground level', () => {
    const b = rectangle(100, 10, 800, 300);
    const s = snapToNetwork(b.xs, b.ys, network, { groundAt: () => 520 });
    expect(s.sharedM).toBe(0);
  });

  it('finds where the line crosses the road', () => {
    // A tall rectangle across the south side of the road loop.
    const b = rectangle(400, -200, 100, 400);
    const s = snapToNetwork(b.xs, b.ys, network, { groundAt: () => 500 });
    expect(s.crossings).toHaveLength(2);
    for (const c of s.crossings) expect(Math.abs(s.y[c.index] as number)).toBeLessThan(5);
  });

  it('keeps the points evenly spaced', () => {
    const b = rectangle(0, 10, 1000, 300);
    const s = snapToNetwork(b.xs, b.ys, network, { groundAt: () => 500 });
    const n = s.x.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const step = Math.hypot(
        (s.x[j] as number) - (s.x[i] as number),
        (s.y[j] as number) - (s.y[i] as number),
      );
      expect(step).toBeGreaterThan(3.5);
      expect(step).toBeLessThan(5.5);
    }
  });
});

describe('profile pins', () => {
  it('takes the pinned altitudes exactly and blends into them', () => {
    const z = new Float64Array(100).fill(500);
    const pinned = new Float64Array(100).fill(Number.NaN);
    for (let i = 40; i < 60; i++) pinned[i] = 504;
    const out = pinProfile(z, pinned, 10);
    expect(out[50]).toBe(504);
    expect(out[20]).toBe(500);
    // Monotonic blend, no jump bigger than the pin over the blend length.
    for (let i = 30; i < 40; i++) {
      expect(out[i + 1] as number).toBeGreaterThanOrEqual(out[i] as number);
      expect((out[i + 1] as number) - (out[i] as number)).toBeLessThan(1);
    }
  });
});

describe('line helpers', () => {
  it('resamples a closed line evenly, values following', () => {
    const x = [0, 1, 10, 10, 0];
    const y = [0, 0, 0, 10, 10];
    const r = resampleClosed(x, y, [[1, 2, 3, 4, 5]]);
    const L = 40;
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      expect(
        Math.hypot(
          (r.x[j] as number) - (r.x[i] as number),
          (r.y[j] as number) - (r.y[i] as number),
        ),
      ).toBeLessThanOrEqual(L / 5 + 1e-9);
    }
    expect(r.indexOf(0)).toBeCloseTo(0, 9);
  });

  it('rounds off a fold of a line', () => {
    // A straight line with one point thrown back on itself.
    const x = Float64Array.from({ length: 40 }, (_, i) => Math.cos((i / 40) * 2 * Math.PI) * 100);
    const y = Float64Array.from({ length: 40 }, (_, i) => Math.sin((i / 40) * 2 * Math.PI) * 100);
    x[10] = (x[8] as number) - 5;
    y[10] = (y[8] as number) - 5;
    unfold(x, y, () => false);
    for (let i = 0; i < 40; i++) {
      const a = (i + 39) % 40;
      const b = (i + 1) % 40;
      const ux = (x[i] as number) - (x[a] as number);
      const uy = (y[i] as number) - (y[a] as number);
      const vx = (x[b] as number) - (x[i] as number);
      const vy = (y[b] as number) - (y[i] as number);
      const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
      expect(cos).toBeGreaterThan(Math.cos((100 * Math.PI) / 180) - 1e-6);
    }
  });
});

describe('road planner with turns', () => {
  // A flat 4 km map with a round hill in the middle.
  const samples = 201;
  const sizeM = 4000;
  const heights = new Float32Array(samples * samples);
  for (let r = 0; r < samples; r++) {
    for (let c = 0; c < samples; c++) {
      const x = -sizeM / 2 + (c * sizeM) / (samples - 1);
      const y = sizeM / 2 - (r * sizeM) / (samples - 1);
      heights[r * samples + c] = 500 + 120 * Math.exp(-(x * x + y * y) / 300 ** 2);
    }
  }
  const hm: Heightmap = { sizeM, samples, heights, minElevationM: 500, maxElevationM: 620 };

  it('goes through its waypoints without turning back', () => {
    const planner = new RoadPlanner(hm, {
      targetGradePercent: 6,
      maxGradePercent: 9,
      strictGrade: true,
      turnCostM: 120,
      blurPasses: 1,
    });
    // The summit of the hill is a waypoint between two on the plain.
    const path = planner.loop([
      [-1200, 0],
      [0, 0],
      [1200, 0],
      [0, -1200],
    ]);
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const a = path[(i + n - 1) % n] as [number, number];
      const p = path[i] as [number, number];
      const b = path[(i + 1) % n] as [number, number];
      const ux = p[0] - a[0];
      const uy = p[1] - a[1];
      const vx = b[0] - p[0];
      const vy = b[1] - p[1];
      const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
      // A single move never turns back by more than 135°.
      expect(cos).toBeGreaterThan(Math.cos((135 * Math.PI) / 180) - 1e-6);
    }
  });
});
