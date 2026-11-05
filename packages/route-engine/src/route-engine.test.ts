import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildLoopRoute, type LoopDesign, loopRouteFromPoints } from './build-loop';
import { LapTracker } from './laps';
import { ascentDescent, computeGrades, limitGrade, smooth } from './profile';
import { angleDelta, emptyRoutePoint, Route } from './route';
import { resampleClosedSpline } from './spline';
import { validateLoop } from './validate';

/** A hilly ellipse: one ~150 m climb and descent per lap. */
const hillyLoop = (overrides: Partial<LoopDesign> = {}): Route => {
  const controls: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    controls.push([Math.sin(a) * 2000, Math.cos(a) * 1200]);
  }
  return buildLoopRoute({
    id: 'test-loop',
    name: { fr: 'Test', en: 'Test' },
    worldId: 'test',
    controls,
    elevationAt: (x, y) =>
      500 + 150 * Math.exp(-((x - 1500) ** 2 + y ** 2) / 1e6) + 3 * Math.sin(x / 7),
    ...overrides,
  });
};

describe('resampleClosedSpline', () => {
  it('passes through the first control point and spaces points evenly', () => {
    const square: [number, number][] = [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 1000],
    ];
    const { points, spacingM, lengthM } = resampleClosedSpline(square, 5);
    expect(points[0]).toEqual([0, 0]);
    expect(spacingM).toBeCloseTo(lengthM / points.length, 9);
    expect(Math.abs(spacingM - 5)).toBeLessThan(0.01);
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1] as [number, number];
      const [bx, by] = points[i] as [number, number];
      // Chord ≤ arc length, and close to it on a smooth curve.
      expect(Math.hypot(bx - ax, by - ay)).toBeGreaterThan(spacingM * 0.98);
      expect(Math.hypot(bx - ax, by - ay)).toBeLessThanOrEqual(spacingM + 1e-6);
    }
  });
});

describe('profile processing', () => {
  it('limitGrade respects the limit, also across the line of a loop', () => {
    const z = Float64Array.from({ length: 400 }, (_, i) => (i % 100 < 50 ? 0 : 40) + Math.sin(i));
    const out = limitGrade(z, 5, 10, true);
    for (let i = 0; i < out.length; i++) {
      const dz = (out[(i + 1) % out.length] as number) - (out[i] as number);
      expect(Math.abs(dz)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('limitGrade leaves a gentle profile untouched', () => {
    const z = Float64Array.from({ length: 200 }, (_, i) => 100 + 0.1 * i);
    expect(Array.from(limitGrade(z, 5, 10, false))).toEqual(Array.from(z));
  });

  it('circular smoothing keeps the mean altitude', () => {
    const z = Float64Array.from({ length: 300 }, (_, i) => Math.sin(i / 3) * 20);
    const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(smooth(z, 4, 3, true))).toBeCloseTo(mean(z), 9);
  });

  it('computes grades and ascent on a ramp', () => {
    const z = Float64Array.from({ length: 101 }, (_, i) => i * 0.5); // 10 % at 5 m spacing
    const g = computeGrades(z, 5, 5, false);
    expect(g[50]).toBeCloseTo(10, 9);
    expect(ascentDescent(z, false)).toEqual({ ascentM: 50, descentM: 0 });
  });
});

describe('buildLoopRoute', () => {
  const route = hillyLoop();

  it('builds a closed loop with net zero elevation change', () => {
    expect(route.loop).toBe(true);
    expect(route.lengthM).toBeGreaterThan(10_000);
    expect(route.meta.ascentM).toBeCloseTo(route.meta.descentM, 6);
    expect(route.meta.ascentM).toBeGreaterThan(100);
  });

  it('passes the loop validator', () => {
    expect(validateLoop(route)).toEqual([]);
  });

  it('respects the maximum road grade', () => {
    const steep = hillyLoop({
      maxGradePercent: 6,
      elevationAt: (x) => 500 + 200 * Math.sin(x / 300),
    });
    for (const g of steep.grade) expect(Math.abs(g)).toBeLessThanOrEqual(6 + 1e-6);
  });

  it('round-trips through JSON', () => {
    const copy = Route.fromJson(JSON.parse(JSON.stringify(route.toJson())));
    for (const d of [0, 1234.5, route.lengthM - 0.1]) {
      const a = route.sampleAt(d);
      const b = copy.sampleAt(d);
      expect(b.z).toBeCloseTo(a.z, 1);
      expect(b.gradePercent).toBeCloseTo(a.gradePercent, 1);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.02);
    }
  });
});

describe('Route.sampleAt on a loop', () => {
  const route = hillyLoop();
  const L = route.lengthM;

  it('is periodic: sampleAt(d) = sampleAt(d + k·L)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: L, noNaN: true }),
        fc.integer({ min: 1, max: 40 }),
        (d, k) => {
          const a = route.sampleAt(d);
          const b = route.sampleAt(d + k * L);
          expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-6 * k * L + 1e-6);
          expect(b.z).toBeCloseTo(a.z, 4);
          expect(b.gradePercent).toBeCloseTo(a.gradePercent, 4);
        },
      ),
    );
  });

  it('is continuous across the start/finish line', () => {
    const before = route.sampleAt(L - 0.01);
    const after = route.sampleAt(L + 0.01);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.05);
    expect(Math.abs(after.z - before.z)).toBeLessThan(0.01);
    expect(Math.abs(after.gradePercent - before.gradePercent)).toBeLessThan(0.05);
    expect(Math.abs(angleDelta(before.heading, after.heading))).toBeLessThan(0.01);
  });

  it('is continuous everywhere (small step → small change)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 50 * L, noNaN: true }), (d) => {
        const a = route.sampleAt(d);
        const b = route.sampleAt(d + 0.1);
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.11);
        expect(Math.abs(b.gradePercent - a.gradePercent)).toBeLessThan(0.2);
      }),
    );
  });

  it('reuses the output object', () => {
    const out = emptyRoutePoint();
    expect(route.sampleAt(100, out)).toBe(out);
  });

  it('gives the lap and the distance in the lap', () => {
    expect(route.lapOf(0)).toEqual({ lap: 1, lapDistanceM: 0 });
    const r = route.lapOf(2.5 * L);
    expect(r.lap).toBe(3);
    expect(r.lapDistanceM).toBeCloseTo(0.5 * L, 6);
  });
});

describe('Route with non-uniform points (open route)', () => {
  const route = new Route(
    {
      id: 'open',
      version: 1,
      name: { fr: 'o', en: 'o' },
      mode: 'real',
      worldId: null,
      loop: false,
      lengthM: 30,
      ascentM: 3,
      descentM: 0,
      sampleStepM: 10,
      segments: [],
      surface: [],
      attribution: [],
    },
    {
      d: [0, 5, 30],
      x: [0, 5, 30],
      y: [0, 0, 0],
      z: [0, 0.5, 3],
      grade: [10, 10, 10],
      heading: [0, 0, 0],
    },
  );

  it('interpolates with a binary search and clamps at the ends', () => {
    expect(route.sampleAt(17.5).z).toBeCloseTo(1.75, 9);
    expect(route.sampleAt(-10).x).toBe(0);
    expect(route.sampleAt(100).x).toBe(30);
    expect(route.lapOf(100)).toEqual({ lap: 1, lapDistanceM: 30 });
  });
});

describe('LapTracker', () => {
  it('detects line crossings with interpolated times', () => {
    const t = new LapTracker(1000);
    expect(t.update(10, 900)).toEqual([]);
    const [first] = t.update(12, 1100); // line crossed half-way between t=10 and t=12
    expect(first?.lap).toBe(1);
    expect(first?.durationS).toBeCloseTo(11, 9);
    expect(first?.isBest).toBe(true);
    expect(first?.deltaToBestS).toBeNull();
    expect(t.currentLap).toBe(2);
    expect(t.currentLapTimeS(15)).toBeCloseTo(4, 9);
  });

  it('keeps the best lap and the delta', () => {
    const t = new LapTracker(1000);
    t.update(100, 1000);
    const [slower] = t.update(220, 2000);
    expect(slower?.isBest).toBe(false);
    expect(slower?.deltaToBestS).toBeCloseTo(20, 9);
    const [faster] = t.update(300, 3000);
    expect(faster?.isBest).toBe(true);
    expect(faster?.deltaToBestS).toBeCloseTo(-20, 9);
    expect(t.bestLapS).toBeCloseTo(80, 9);
    expect(t.laps.map((l) => l.lap)).toEqual([1, 2, 3]);
  });

  it('counts every lap of a long ride', () => {
    const t = new LapTracker(5000);
    let crossings = 0;
    for (let s = 1; s <= 6 * 3600; s++) crossings += t.update(s, s * 10).length;
    expect(crossings).toBe(Math.floor((6 * 3600 * 10) / 5000));
  });
});

describe('loopRouteFromPoints', () => {
  it('builds a loop from placed points: lengths, grades and headings', () => {
    // A 400 m square, 4 points per side, climbing 4 m along the first side.
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    const corners: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    corners.forEach(([ax, ay], k) => {
      const [bx, by] = corners[(k + 1) % 4] as [number, number];
      for (let s = 0; s < 4; s++) {
        x.push(ax + ((bx - ax) * s) / 4);
        y.push(ay + ((by - ay) * s) / 4);
        z.push(k === 0 ? 500 + s : k === 1 ? 504 : k === 2 ? 504 - (s * 4) / 8 : 502 - s / 2);
      }
    });
    const route = loopRouteFromPoints({
      id: 'square',
      name: { fr: 'Carré', en: 'Square' },
      worldId: 'w',
      x: Float64Array.from(x),
      y: Float64Array.from(y),
      z: Float64Array.from(z),
    });
    expect(route.lengthM).toBeCloseTo(400, 6);
    expect(route.pointCount).toBe(16);
    expect(route.d[4]).toBeCloseTo(100, 6);
    // Heading east along the first side (0 = north, clockwise).
    expect(route.heading[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(route.grade[1]).toBeGreaterThan(0);
    expect(route.meta.ascentM).toBeCloseTo(4, 6);
  });
});
