// Closed centripetal Catmull-Rom spline in 2D, resampled at a constant spacing.

export type Vec2 = readonly [number, number];

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): [number, number] {
  // Barry-Goldman pyramid, centripetal parametrization (alpha = 0.5): no cusps or loops.
  const knot = (a: Vec2, b: Vec2) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: Vec2, b: Vec2, ta: number, tb: number): [number, number] => {
    const wa = (tb - t) / (tb - ta);
    const wb = (t - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/**
 * Samples a closed spline through `controls` (the first control point is the
 * start of the loop) every `stepM` meters. The returned spacing is adjusted so
 * that the loop length is an exact multiple of it; the last point does not
 * duplicate the first one.
 */
export function resampleClosedSpline(
  controls: readonly Vec2[],
  stepM: number,
): { points: [number, number][]; spacingM: number; lengthM: number } {
  const n = controls.length;
  if (n < 3) throw new Error('A closed spline needs at least 3 control points');
  const at = (i: number) => controls[((i % n) + n) % n] as Vec2;

  // Dense polyline (~0.5 m), then arc-length resampling.
  const dense: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p1 = at(i);
    const p2 = at(i + 1);
    const count = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
    for (let k = 0; k < count; k++) dense.push(catmullRom(at(i - 1), p1, p2, at(i + 2), k / count));
  }
  dense.push([at(0)[0], at(0)[1]]);
  const cumulative = new Float64Array(dense.length);
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1] as [number, number];
    const b = dense[i] as [number, number];
    cumulative[i] = (cumulative[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const lengthM = cumulative[dense.length - 1] as number;
  const count = Math.max(3, Math.round(lengthM / stepM));
  const spacingM = lengthM / count;
  const points: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = k * spacingM;
    while (j < dense.length - 2 && (cumulative[j + 1] as number) < target) j++;
    const a = dense[j] as [number, number];
    const b = dense[j + 1] as [number, number];
    const c0 = cumulative[j] as number;
    const c1 = cumulative[j + 1] as number;
    const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { points, spacingM, lengthM };
}
