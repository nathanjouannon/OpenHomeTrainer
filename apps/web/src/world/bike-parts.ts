// Shape builders for the bike (lot 2.12): tubes swept along a path, solids of
// revolution (tyres, rims), toothed wheels and flat plates. Pure geometry, no
// materials: every result is a closed, outward-facing `BufferGeometry` with
// `position` and `normal` (and `color` when asked, `uv` for the extruded ones).

import {
  BufferGeometry,
  CatmullRomCurve3,
  type Color,
  type Curve,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LineCurve3,
  Path,
  Shape,
  Vector2,
  Vector3,
} from 'three';

/** Size of a cross-section: `w` along X (or across), `d` in the plane of the bike. */
export interface Section {
  w: number;
  d: number;
}

export type ColorFn = (position: Vector3) => Color;

export interface SweepOptions {
  /** Rings along the path (default: one every 3 cm). */
  samples?: number;
  /** Vertices around the section. */
  radial?: number;
  /** Superellipse exponent: 2 is an ellipse, higher is a rounded rectangle. */
  exponent?: number;
  /** Flat caps at both ends (default true). */
  caps?: boolean;
  color?: ColorFn;
}

/** Linear blend between two sections, by the path parameter `t` in [0, 1]. */
export const taper =
  (a: Section, b: Section) =>
  (t: number): Section => ({ w: a.w + (b.w - a.w) * t, d: a.d + (b.d - a.d) * t });

/** The same section along the whole path. */
export const uniform = (s: Section) => (): Section => s;

const REF = new Vector3(1, 0, 0);

/** Signed volume of a closed mesh: positive when the faces point outwards. */
export function signedVolume(g: BufferGeometry): number {
  const pos = g.getAttribute('position');
  const index = g.index;
  const count = index ? index.count : pos.count;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

/** Flips the winding of every triangle. */
function flip(g: BufferGeometry): BufferGeometry {
  if (g.index) {
    const arr = g.index.array as Uint32Array | Uint16Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1] as number;
      arr[i + 1] = arr[i + 2] as number;
      arr[i + 2] = t;
    }
    g.index.needsUpdate = true;
    return g;
  }
  for (const attribute of Object.values(g.attributes)) {
    const { array, itemSize } = attribute;
    for (let tri = 0; tri < array.length; tri += 3 * itemSize) {
      for (let k = 0; k < itemSize; k++) {
        const a = tri + itemSize + k;
        const b = tri + 2 * itemSize + k;
        const t = array[a] as number;
        array[a] = array[b] as number;
        array[b] = t;
      }
    }
    attribute.needsUpdate = true;
  }
  return g;
}

/** Makes a closed mesh face outwards, whatever the order the points were given in. */
export function makeOutward(g: BufferGeometry): BufferGeometry {
  return outward(g);
}

function outward(g: BufferGeometry): BufferGeometry {
  if (signedVolume(g) < 0) flip(g);
  g.computeVertexNormals();
  return g;
}

function curveOf(points: readonly Vector3[]): Curve<Vector3> {
  const [first, second] = points;
  if (points.length === 2 && first && second) return new LineCurve3(first, second);
  return new CatmullRomCurve3([...points], false, 'centripetal');
}

function withColors(g: BufferGeometry, color: ColorFn | undefined): BufferGeometry {
  if (!color) return g;
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const c = color(p.fromBufferAttribute(pos, i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

/**
 * A tube along a path (Catmull-Rom through the points) whose superelliptic
 * section changes along it (`section` gets the path parameter and the point).
 * The section starts oriented by the plane of the bike (`d` in the plane, `w`
 * across; a path starting along X keeps `d` vertical), then is carried along
 * the path without twisting (parallel transport): it never flips half a turn
 * between two rings, which would pinch the tube.
 */
export function sweptTube(
  points: readonly Vector3[],
  section: (t: number, point: Vector3) => Section,
  options: SweepOptions = {},
): BufferGeometry {
  const curve = curveOf(points);
  const samples = options.samples ?? Math.max(2, Math.ceil(curve.getLength() / 0.03));
  const radial = options.radial ?? 12;
  const power = 2 / (options.exponent ?? 2);
  const caps = options.caps ?? true;
  const positions: number[] = [];
  const index: number[] = [];
  const p = new Vector3();
  const tangent = new Vector3();
  const normal = new Vector3();
  const binormal = new Vector3();
  const ring = (i: number): Vector3[] => {
    const t = i / samples;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tangent);
    if (i === 0) {
      normal.crossVectors(REF, tangent);
      if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);
    } else {
      // Previous normal, minus its part along the new tangent.
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-9) normal.crossVectors(REF, tangent);
    }
    normal.normalize();
    binormal.crossVectors(tangent, normal).normalize();
    const { w, d } = section(t, p);
    const out: Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const cx = Math.sign(c) * Math.abs(c) ** power;
      const sx = Math.sign(s) * Math.abs(s) ** power;
      out.push(
        new Vector3()
          .copy(p)
          .addScaledVector(normal, (cx * d) / 2)
          .addScaledVector(binormal, (sx * w) / 2),
      );
    }
    return out;
  };
  const rings: Vector3[][] = [];
  for (let i = 0; i <= samples; i++) rings.push(ring(i));
  for (const r of rings) for (const v of r) positions.push(v.x, v.y, v.z);
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      index.push(a, b, c, b, d, c);
    }
  }
  if (caps) {
    for (const [ringIndex, atEnd] of [
      [0, false],
      [samples, true],
    ] as const) {
      const r = rings[ringIndex] as Vector3[];
      const center = new Vector3();
      for (const v of r) center.add(v);
      center.divideScalar(r.length);
      const base = positions.length / 3;
      positions.push(center.x, center.y, center.z);
      for (const v of r) positions.push(v.x, v.y, v.z);
      for (let j = 0; j < radial; j++) {
        const a = base + 1 + j;
        const b = base + 1 + ((j + 1) % radial);
        if (atEnd) index.push(base, a, b);
        else index.push(base, b, a);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  withColors(g, options.color);
  return outward(g);
}

/**
 * A solid of revolution about the X axis, from a closed profile of
 * `[radius, x]` points (the order does not matter).
 */
export function revolveX(
  profile: readonly (readonly [number, number])[],
  segments: number,
  color?: (radius: number, x: number) => Color,
): BufferGeometry {
  const n = profile.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    const cy = Math.cos(a);
    const cz = Math.sin(a);
    for (const [r, x] of profile) {
      positions.push(x, r * cy, r * cz);
      if (color) {
        const c = color(r, x);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  for (let k = 0; k < segments; k++) {
    const next = (k + 1) % segments;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = k * n + i;
      const b = k * n + j;
      const c = next * n + i;
      const d = next * n + j;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (color) g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return outward(g);
}

/** Mirrors a profile given for x ≥ 0 into a closed one (top to bottom, then back). */
export function mirrorProfile(half: readonly (readonly [number, number])[]) {
  return [
    ...half.map(([r, x]) => [r, x] as const),
    ...[...half].reverse().map(([r, x]) => [r, -x] as const),
  ];
}

/** Outline of a toothed wheel (trapezoid teeth) around the origin of a shape. */
function gearPath(shape: Shape, teeth: number, pitchRadius: number, toothHeight: number) {
  const step = (Math.PI * 2) / teeth;
  const root = pitchRadius - toothHeight / 2;
  const tip = pitchRadius + toothHeight / 2;
  let first = true;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const pts: [number, number][] = [
      [root, a0 + step * 0.04],
      [tip, a0 + step * 0.22],
      [tip, a0 + step * 0.5],
      [root, a0 + step * 0.68],
    ];
    for (const [r, a] of pts) {
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      if (first) shape.moveTo(x, y);
      else shape.lineTo(x, y);
      first = false;
    }
  }
  shape.closePath();
}

/** Turns a shape drawn in (u, v) and extruded along Z into the YZ plane, extruded along X. */
function alongX(g: BufferGeometry, x0: number): BufferGeometry {
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  return g;
}

/**
 * A toothed wheel (chainring, sprocket, pulley) in the YZ plane, centred on
 * the X axis, from `x0` to `x0 + thickness`. `holeRadius` > 0 leaves a ring.
 */
export function gearGeometry(
  teeth: number,
  pitchRadius: number,
  toothHeight: number,
  thickness: number,
  x0: number,
  holeRadius = 0,
): BufferGeometry {
  const shape = new Shape();
  gearPath(shape, teeth, pitchRadius, toothHeight);
  if (holeRadius > 0) {
    const hole = new Path();
    hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const g = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: holeRadius > 0 ? 40 : 1,
  });
  return outward(alongX(g, x0));
}

/** Convex hull (monotone chain) of 2D points. */
export function convexHull(points: readonly Vector2[]): Vector2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vector2, a: Vector2, b: Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vector2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as Vector2, lower[lower.length - 1] as Vector2, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Vector2[] = [];
  for (const p of [...pts].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as Vector2, upper[upper.length - 1] as Vector2, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Circles `[y, z, radius]` of a plate in the YZ plane. */
export type PlateCircle = readonly [number, number, number];

/**
 * A flat plate (the convex hull of circles) in the YZ plane, from `x0` to
 * `x0 + thickness`: derailleur cage, crank arm, caliper.
 */
export function plateGeometry(
  circles: readonly PlateCircle[],
  thickness: number,
  x0: number,
  bevel = 0,
): BufferGeometry {
  const pts: Vector2[] = [];
  for (const [y, z, r] of circles) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      // The shape's (u, v) become (-z, y) once turned into the YZ plane.
      pts.push(new Vector2(-(z + r * Math.cos(a)), y + r * Math.sin(a)));
    }
  }
  const shape = new Shape(convexHull(pts));
  const g = new ExtrudeGeometry(
    shape,
    bevel > 0
      ? {
          depth: Math.max(1e-4, thickness - 2 * bevel),
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel,
          bevelSegments: 2,
          curveSegments: 1,
        }
      : { depth: thickness, bevelEnabled: false, curveSegments: 1 },
  );
  g.rotateY(Math.PI / 2);
  g.translate(x0 + Math.max(bevel, 0), 0, 0);
  return outward(g);
}

/**
 * A closed outline in the horizontal plane (`[x, z]` points) extruded
 * upwards by `height` with rounded edges: the saddle, a bag.
 */
export function slabGeometry(
  outline: readonly (readonly [number, number])[],
  height: number,
  bevel: number,
): BufferGeometry {
  // The shape's v axis is -z once the extrusion is turned to point up.
  const shape = new Shape(outline.map(([x, z]) => new Vector2(x, -z)));
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, height - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return outward(g);
}

/** A thin flat bar between two points (spoke, brake line), `w` × `h` in section. */
export function barBetween(a: Vector3, b: Vector3, w: number, h: number): BufferGeometry {
  return sweptTube([a, b], uniform({ w, d: h }), { radial: 4, exponent: 6, samples: 1 });
}
