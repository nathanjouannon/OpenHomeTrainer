// Cars of lot 2.17 built in code from sheet sizes (`car-geometry.ts`) and
// photo-read shapes (`car-styles.ts`). Car frame: X to the right, Y up, Z
// forward, centred on the length, wheels on the ground (y = 0).
//
// The body is lofted from cross-sections along the car (smooth hood, tapered
// nose and tail, narrowing glass house); glass, roof, lights, wheels and logos
// are separate coloured parts. White parts take the instance colour, the others
// keep their own (vertex colours multiply).

import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Path,
  PlaneGeometry,
  Shape,
  Vector3,
} from 'three';
import { CAR_SPECS, type CarSpec } from './car-geometry';
import { CAR_STYLES, type CarStyle } from './car-styles';
import { merge, paint } from './prop-builders';

const BODY = '#ffffff';
const GLASS = '#202b35';
const TRIM = '#26292d';
const CHROME = '#aeb3ba';
const TYRE = '#131313';
/** Height of the lofts' orientation reference axis. */
const AXIS_Y = 0.6;

type Pt = [number, number];
interface Station {
  z: number;
  pts: Pt[];
}

/** Smooth monotone curve through [s, value] points (no overshoot between them). */
function curve(points: readonly [number, number][]): (s: number) => number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of points) {
    const last = xs[xs.length - 1];
    xs.push(last !== undefined && x <= last ? last + 1e-4 : x);
    ys.push(y);
  }
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - (xs[i] as number));
  const d = h.map((hi, i) => ((ys[i + 1] as number) - (ys[i] as number)) / hi);
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1] as number;
    const d1 = d[i] as number;
    if (d0 * d1 <= 0) m[i] = 0;
    else {
      const w1 = 2 * (h[i] as number) + (h[i - 1] as number);
      const w2 = (h[i] as number) + 2 * (h[i - 1] as number);
      m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
  }
  return (s: number) => {
    if (s <= (xs[0] as number)) return ys[0] as number;
    if (s >= (xs[n - 1] as number)) return ys[n - 1] as number;
    let i = 0;
    while (s > (xs[i + 1] as number)) i++;
    const hi = h[i] as number;
    const t = (s - (xs[i] as number)) / hi;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[i] as number) +
      (t3 - 2 * t2 + t) * hi * (m[i] as number) +
      (-2 * t3 + 3 * t2) * (ys[i + 1] as number) +
      (t3 - t2) * hi * (m[i + 1] as number)
    );
  };
}

function sorted(values: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - (out[out.length - 1] as number) > 0.01) out.push(v);
  }
  return out;
}

/** A surface swept through cross-section polylines, oriented outward from the car axis. */
function strip(stations: readonly Station[], hex: string): BufferGeometry {
  const n = stations[0]?.pts.length ?? 0;
  const positions: number[] = [];
  for (const st of stations) for (const [x, y] of st.pts) positions.push(x, y, st.z);
  const index: number[] = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    for (let k = 0; k + 1 < n; k++) {
      const a = i * n + k;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  // Orientation: the sum of (face normal . outward direction) must be positive.
  let score = 0;
  for (let t = 0; t < index.length; t += 3) {
    const [ia, ib, ic] = [index[t], index[t + 1], index[t + 2]] as [number, number, number];
    const p = (i: number) =>
      [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]] as number[];
    const [A, B, C] = [p(ia), p(ib), p(ic)] as [number[], number[], number[]];
    const u = [
      (B[0] as number) - (A[0] as number),
      (B[1] as number) - (A[1] as number),
      (B[2] as number) - (A[2] as number),
    ];
    const v = [
      (C[0] as number) - (A[0] as number),
      (C[1] as number) - (A[1] as number),
      (C[2] as number) - (A[2] as number),
    ];
    const nx = (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number);
    const ny = (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number);
    const cx = ((A[0] as number) + (B[0] as number) + (C[0] as number)) / 3;
    const cy = ((A[1] as number) + (B[1] as number) + (C[1] as number)) / 3 - AXIS_Y;
    score += nx * cx + ny * cy;
  }
  if (score < 0) {
    for (let t = 0; t < index.length; t += 3) {
      const tmp = index[t + 1] as number;
      index[t + 1] = index[t + 2] as number;
      index[t + 2] = tmp;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return paint(g, hex);
}

/**
 * Rounded cross-section of the lower body: elliptic shoulder (`rx` x `ry`),
 * rounded rocker (`rb`), crowned top. The right half runs from the bottom
 * to the top centre; the lower paths end at `ySplit` (the dark bumper and
 * sill band), the upper path goes over the top.
 */
function roundRing(
  hw: number,
  yb: number,
  ySplit: number,
  top: number,
  rx: number,
  ry: number,
  rb: number,
  crown: number,
) {
  const half: Pt[] = [];
  for (const a of [-90, -45, 0]) {
    const r = (a * Math.PI) / 180;
    half.push([hw - rb + rb * Math.cos(r), yb + rb + rb * Math.sin(r)]);
  }
  const yTop = top - ry;
  const split = Math.min(Math.max(ySplit, yb + rb), yTop - 0.02);
  half.push([hw, split], [hw, (split + yTop) / 2], [hw, yTop]);
  for (const a of [30, 60, 90]) {
    const r = (a * Math.PI) / 180;
    half.push([hw - rx + rx * Math.cos(r), yTop + ry * Math.sin(r)]);
  }
  half.push([(hw - rx) / 2, top + crown * 0.75], [0, top + crown]);
  const mirror = (p: Pt): Pt => [-p[0], p[1]];
  const lowerR = half.slice(0, 4);
  const upperRight = half.slice(3);
  const upper: Pt[] = [...upperRight.map(mirror), ...[...upperRight].reverse().slice(1)];
  const full: Pt[] = [...half.map(mirror), ...[...half].reverse().slice(1)];
  return { lowerR, lowerL: lowerR.map(mirror), upper, full };
}

/** A flat fan closing a cross-section, facing +Z (`front`) or -Z. */
function cap(station: Station, hex: string, front: boolean): BufferGeometry {
  const cx = station.pts.reduce((s, p) => s + p[0], 0) / station.pts.length;
  const cy = station.pts.reduce((s, p) => s + p[1], 0) / station.pts.length;
  const positions: number[] = [];
  for (let k = 0; k < station.pts.length; k++) {
    const a = station.pts[k] as Pt;
    const b = station.pts[(k + 1) % station.pts.length] as Pt;
    const tri: Pt[] = [[cx, cy], a, b];
    // Cross product z of (a - c) x (b - c): positive = counter-clockwise seen from +Z.
    const cross = (a[0] - cx) * (b[1] - cy) - (a[1] - cy) * (b[0] - cx);
    const ordered: Pt[] = cross > 0 === front ? tri : [tri[0] as Pt, tri[2] as Pt, tri[1] as Pt];
    for (const p of ordered) positions.push(p[0], p[1], station.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return paint(g, hex);
}

/**
 * A vertical band following a path in plan view ([x, z] points), from y0 to y1:
 * lights that wrap round the rounded corners of the body.
 */
function wallStrip(path: readonly Pt[], y0: number, y1: number, hex: string): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  path.forEach(([x, z], k) => {
    positions.push(x, y0, z, x, y1, z);
    if (k > 0) {
      const a = (k - 1) * 2;
      const [px, pz] = path[k - 1] as Pt;
      // Outward = away from the car centre: flip the quad when its normal points inward.
      const nx = z - pz;
      const nz = -(x - px);
      const outward = nx * (x + px) + nz * (z + pz) >= 0;
      if (outward) index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return paint(g, hex);
}

/** A box centred at (x, y, z). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string) {
  return paint(new BoxGeometry(w, h, d).translate(x, y, z), hex);
}

/** A cylinder along X (a wheel axis, a lamp) centred at (x, y, z). */
function discX(r: number, len: number, x: number, y: number, z: number, hex: string, seg = 16) {
  return paint(new CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z), hex);
}

/** A flat disc facing +Z (a lamp, a badge), `rx` x `ry`, `t` thick. */
function ellipseZ(
  rx: number,
  ry: number,
  t: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  yaw = 0,
) {
  return paint(
    new CylinderGeometry(1, 1, t, 20)
      .rotateX(Math.PI / 2)
      .scale(rx, ry, 1)
      .rotateY(yaw)
      .translate(x, y, z),
    hex,
  );
}

/** A box turned by `yaw` about the vertical axis, centred at (x, y, z). */
function boxR(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  hex: string,
) {
  return paint(new BoxGeometry(w, h, d).rotateY(yaw).translate(x, y, z), hex);
}

function ringZ(rx: number, ry: number, width: number, t: number, hex: string) {
  const shape = new Shape();
  shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  const hole = new Path();
  hole.absellipse(0, 0, rx - width, ry - width, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
  return paint(
    new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 8 }),
    hex,
  );
}

function polyZ(points: readonly Pt[], t: number, hex: string) {
  const shape = new Shape();
  points.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return paint(new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), hex);
}

/** A rectangular bar between two points (`w` wide across the car, `t` thick). */
function bar3(
  a: [number, number, number],
  b: [number, number, number],
  w: number,
  t: number,
  hex: string,
) {
  const from = new Vector3(...a);
  const to = new Vector3(...b);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const m = new Matrix4().lookAt(to, from, new Vector3(0, 1, 0)).setPosition(mid);
  return paint(new BoxGeometry(w, t, from.distanceTo(to)).applyMatrix4(m), hex);
}

/** A bar from (x1, y1) to (x2, y2), `w` wide, `t` thick (badge strokes). */
function barZ(x1: number, y1: number, x2: number, y2: number, w: number, t: number, hex: string) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return paint(
    new BoxGeometry(len, w, t)
      .rotateZ(Math.atan2(y2 - y1, x2 - x1))
      .translate((x1 + x2) / 2, (y1 + y2) / 2, 0),
    hex,
  );
}

/**
 * The badge of the make, facing +Z, about `size` high, centred on the origin.
 * Trademarks: built only when the `logos` option is on (docs/11).
 */
export function badgeGeometry(logo: CarStyle['logo'], size: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const s = size;
  switch (logo) {
    case 'renault':
      parts.push(
        polyZ(
          [
            [0, 0.62 * s],
            [0.42 * s, 0],
            [0, -0.62 * s],
            [-0.42 * s, 0],
          ],
          0.012,
          CHROME,
        ),
        polyZ(
          [
            [0, 0.4 * s],
            [0.25 * s, 0],
            [0, -0.4 * s],
            [-0.25 * s, 0],
          ],
          0.02,
          '#15171a',
        ),
      );
      break;
    case 'peugeot':
      parts.push(
        polyZ(
          [
            [-0.38 * s, 0.5 * s],
            [0.38 * s, 0.5 * s],
            [0.38 * s, -0.1 * s],
            [0, -0.55 * s],
            [-0.38 * s, -0.1 * s],
          ],
          0.012,
          CHROME,
        ),
        polyZ(
          [
            [-0.26 * s, 0.38 * s],
            [0.26 * s, 0.38 * s],
            [0.26 * s, -0.06 * s],
            [0, -0.4 * s],
            [-0.26 * s, -0.06 * s],
          ],
          0.02,
          '#15171a',
        ),
      );
      break;
    case 'vw':
      parts.push(
        ellipseZ(0.5 * s, 0.5 * s, 0.012, 0, 0, 0.006, '#15171a'),
        ringZ(0.5 * s, 0.5 * s, 0.07 * s, 0.02, CHROME),
        barZ(-0.2 * s, 0.28 * s, 0, -0.26 * s, 0.07 * s, 0.026, CHROME),
        barZ(0.2 * s, 0.28 * s, 0, -0.26 * s, 0.07 * s, 0.026, CHROME),
      );
      break;
    case 'fiat':
      parts.push(
        polyZ(
          [
            [-0.55 * s, 0.22 * s],
            [0.55 * s, 0.22 * s],
            [0.55 * s, -0.22 * s],
            [-0.55 * s, -0.22 * s],
          ],
          0.012,
          CHROME,
        ),
        polyZ(
          [
            [-0.48 * s, 0.15 * s],
            [0.48 * s, 0.15 * s],
            [0.48 * s, -0.15 * s],
            [-0.48 * s, -0.15 * s],
          ],
          0.02,
          '#8a1f2b',
        ),
      );
      break;
    case 'ford':
      parts.push(
        ellipseZ(0.62 * s, 0.4 * s, 0.012, 0, 0, 0.006, '#17356b'),
        ringZ(0.62 * s, 0.4 * s, 0.05 * s, 0.02, CHROME),
      );
      break;
    case 'skoda':
      parts.push(
        ringZ(0.5 * s, 0.5 * s, 0.1 * s, 0.014, '#3f9d39'),
        ellipseZ(0.38 * s, 0.38 * s, 0.01, 0, 0, 0.004, '#15171a'),
        barZ(-0.2 * s, -0.12 * s, 0.2 * s, 0.14 * s, 0.07 * s, 0.022, CHROME),
      );
      break;
    case 'dacia':
      parts.push(
        polyZ(
          [
            [-0.6 * s, 0.2 * s],
            [0.6 * s, 0.2 * s],
            [0.6 * s, -0.2 * s],
            [-0.6 * s, -0.2 * s],
          ],
          0.012,
          CHROME,
        ),
        polyZ(
          [
            [-0.52 * s, 0.13 * s],
            [0.52 * s, 0.13 * s],
            [0.52 * s, -0.13 * s],
            [-0.52 * s, -0.13 * s],
          ],
          0.02,
          '#15171a',
        ),
      );
      break;
    case 'landrover':
      parts.push(
        ellipseZ(0.7 * s, 0.42 * s, 0.012, 0, 0, 0.006, '#1d4a2f'),
        ringZ(0.7 * s, 0.42 * s, 0.05 * s, 0.02, CHROME),
      );
      break;
    case 'toyota':
      parts.push(
        ringZ(0.62 * s, 0.4 * s, 0.05 * s, 0.016, CHROME),
        ringZ(0.3 * s, 0.4 * s, 0.05 * s, 0.02, CHROME),
        ringZ(0.62 * s, 0.17 * s, 0.05 * s, 0.024, CHROME),
      );
      break;
    case 'citroen':
      for (const dy of [0.17, -0.1]) {
        parts.push(
          barZ(-0.4 * s, (dy - 0.14) * s, 0, (dy + 0.1) * s, 0.09 * s, 0.014, CHROME),
          barZ(0.4 * s, (dy - 0.14) * s, 0, (dy + 0.1) * s, 0.09 * s, 0.014, CHROME),
        );
      }
      break;
  }
  return merge(parts);
}

export interface CarOptions {
  /** Make badges on the grille and the tailgate (default on; trademarks). */
  logos?: boolean;
}

/** A flat disc in the YZ plane facing outward (`sx` = side), centred at (x, y, z). */
function faceDisc(
  r: number,
  seg: number,
  sx: number,
  x: number,
  y: number,
  z: number,
  hex: string,
) {
  return paint(new CircleGeometry(r, seg).rotateY(sx * (Math.PI / 2)).translate(x, y, z), hex);
}

/** A flat rectangle in the YZ plane facing outward: `d` along the car, `h` high. */
function faceRect(d: number, h: number, sx: number, x: number, y: number, z: number, hex: string) {
  return paint(new PlaneGeometry(d, h).rotateY(sx * (Math.PI / 2)).translate(x, y, z), hex);
}

function wheel(
  spec: CarSpec,
  style: CarStyle,
  sx: number,
  z: number,
  hw: number,
): BufferGeometry[] {
  const r = spec.wheelDiameterM / 2;
  const tw = style.tyreW;
  const outer = hw + 0.012;
  const parts: BufferGeometry[] = [];
  // Dark arch behind the wheel, and the cladding ring of SUVs. Its lowest
  // point stays on the ground: centre raised by the margin.
  const margin = style.cladding ? 0.06 : 0.035;
  parts.push(faceDisc(r + margin, 14, sx, sx * (hw + 0.004), r + margin, z, TRIM));
  parts.push(discX(r, tw, sx * (outer - tw / 2), r, z, TYRE, 14));
  const face = sx * (outer + 0.002);
  const rimR = r * (style.rim === 'steel' ? 0.7 : 0.76);
  const rimBack: Record<CarStyle['rim'], string> = {
    alloy5: '#23262a',
    alloy10: '#23262a',
    steel: '#9aa0a6',
    mesh: '#111214',
    dark10: '#0e0f11',
  };
  parts.push(faceDisc(rimR, 14, sx, face, r, z, rimBack[style.rim]));
  const spokes = { alloy5: 5, alloy10: 10, steel: 0, mesh: 12, dark10: 10 }[style.rim];
  const spokeColor =
    style.rim === 'dark10' ? '#33363b' : style.rim === 'mesh' ? '#d9dcdf' : '#b9bdc4';
  const width = style.rim === 'alloy5' ? 0.075 : style.rim === 'mesh' ? 0.025 : 0.04;
  for (let k = 0; k < spokes; k++) {
    parts.push(
      paint(
        new PlaneGeometry(width, rimR * 0.92)
          .translate(0, rimR * 0.46, 0)
          .rotateY(sx * (Math.PI / 2))
          .rotateX((k / spokes) * Math.PI * 2)
          .translate(face + sx * 0.002, r, z),
        spokeColor,
      ),
    );
  }
  // Hub (a hubcap for the steel wheels).
  const steel = style.rim === 'steel';
  parts.push(
    faceDisc(
      rimR * (steel ? 0.3 : 0.2),
      8,
      sx,
      face + sx * 0.004,
      r,
      z,
      steel ? '#c3c7cc' : '#2a2d31',
    ),
  );
  return parts;
}

/** The geometry of one car (instance colour = paint). */
export function buildCar(id: string, options: CarOptions = {}): BufferGeometry {
  const spec = CAR_SPECS.find((c) => c.id === id);
  const st = CAR_STYLES[id];
  if (!spec || !st) throw new Error(`Unknown car ${id}`);
  const L = spec.lengthM;
  const sh = spec.widthM / 2;
  const roofH = spec.heightM - (st.roofRails ? 0.04 : 0);
  const yb = spec.clearanceM + 0.1;
  const z = (s: number) => L / 2 - s;
  const parts: BufferGeometry[] = [];

  const rF = st.rF ?? 0.5;
  const rR = st.rR ?? 0.4;
  const rS = st.rS ?? 0.22;
  // Half width of the lower body: round corners in plan view (quarter ellipses).
  const hwAt = (s: number) => {
    let w = sh;
    if (s < rF) w = sh - rF + rF * Math.sqrt(Math.max(1 - ((rF - s) / rF) ** 2, 0));
    const u = L - s;
    if (u < rR) {
      w = Math.min(w, sh * 0.97 - rR + rR * Math.sqrt(Math.max(1 - ((rR - u) / rR) ** 2, 0)));
    }
    return w;
  };
  // Top of the lower body (nose, bonnet, belt, deck), floor of the pickup bed.
  const floorH = (st.bedH ?? 1.1) - 0.32;
  const topPoints: [number, number][] = [
    [0, st.noseH - (st.boxy ? 0.02 : 0.12)],
    [0.05, st.noseH - (st.boxy ? 0.01 : 0.05)],
    [0.16, st.noseH - 0.005],
    [st.sCowl * 0.5, st.noseH + (st.beltH - st.noseH) * 0.4],
    [st.sCowl, st.cowlH ?? st.beltH],
  ];
  if (st.cowlH) topPoints.push([st.sCowl + 0.14, st.beltH]);
  else topPoints.push([st.sCowl + 0.2, st.beltH]);
  if (st.tail === 'pickup') {
    const cab = st.sCabRear ?? st.sTail;
    topPoints.push([cab, st.beltH], [cab + 0.04, floorH], [L - 0.1, floorH], [L, floorH - 0.05]);
  } else {
    topPoints.push(
      [st.sTail, st.deckH],
      [L - 0.25, st.deckH - 0.01],
      [L - 0.08, st.deckH - 0.07],
      [L, st.deckH - 0.2],
    );
  }
  const topAt = curve(topPoints);
  const ybAt = curve([
    [0, yb + (st.boxy ? 0.02 : 0.14)],
    [0.2, yb + (st.boxy ? 0.01 : 0.05)],
    [0.5, yb],
    [L - 0.5, yb],
    [L - 0.2, yb + (st.boxy ? 0.01 : 0.05)],
    [L, yb + (st.boxy ? 0.02 : 0.12)],
  ]);
  // Dark bumper (ends) and sill (sides) band: high on SUVs and trucks, a thin lip on the others.
  const big = st.skirtH >= 0.28 || st.boxy;
  const endBand = big ? st.skirtH : st.skirtH * 0.5;
  const bandAt = curve([
    [0, endBand],
    [0.5, endBand],
    [1.0, big ? 0.1 : 0.04],
    [L - 1.0, big ? 0.1 : 0.04],
    [L - 0.5, endBand],
    [L, endBand],
  ]);
  const rxAt = curve([
    [0, rS],
    [st.sCowl, rS],
    [st.sCowl + 0.3, rS * 0.5],
    [st.sTail, rS * 0.5],
    [L - 0.3, rS * 0.7],
    [L, rS * 0.8],
  ]);

  // Lower body: dense stations at both ends (round nose and tail).
  const tubS = sorted([
    ...topPoints.map((p) => p[0]),
    0,
    0.03,
    0.07,
    0.13,
    0.21,
    0.32,
    0.46,
    L - 0.46,
    L - 0.32,
    L - 0.21,
    L - 0.13,
    L - 0.07,
    L - 0.03,
    L,
    ...Array.from({ length: Math.floor((L - 1) / 0.6) }, (_, i) => 0.8 + i * 0.6),
  ]);
  const tub = tubS.map((s) => {
    const hw = hwAt(s);
    const top = topAt(s);
    const base = ybAt(s);
    const rx = Math.min(rxAt(s), hw * 0.9);
    const ry = Math.min(rx * 0.75, (top - base) * 0.3);
    return { z: z(s), ...roundRing(hw, base, base + bandAt(s), top, rx, ry, 0.12, 0.022) };
  });
  parts.push(
    strip(
      tub.map((t) => ({ z: t.z, pts: t.upper })),
      BODY,
    ),
    strip(
      tub.map((t) => ({ z: t.z, pts: t.lowerR })),
      TRIM,
    ),
    strip(
      tub.map((t) => ({ z: t.z, pts: t.lowerL })),
      TRIM,
    ),
  );
  const first = tub[0];
  const last = tub[tub.length - 1];
  if (first && last) {
    // End faces: body-coloured, the dark band is the bumper lip.
    for (const [t, isFront] of [
      [first, true],
      [last, false],
    ] as const) {
      parts.push(cap({ z: t.z, pts: t.upper }, BODY, isFront));
      parts.push(cap({ z: t.z, pts: [...t.lowerL, ...[...t.lowerR].reverse()] }, TRIM, isFront));
    }
  }

  // Glass house.
  const tailTop = st.deckH - 0.01;
  const cowl = st.cowlH ?? st.beltH;
  const rearRoof = roofH - (st.tail === 'hatch' ? 0.04 : 0.015);
  const gTop = curve([
    [st.sCowl, cowl],
    [(st.sCowl + st.sRoofF) / 2, cowl + (roofH - cowl) * 0.5 + 0.015],
    [st.sRoofF, roofH - 0.015],
    [(st.sRoofF + st.sRoofR) / 2, roofH],
    [st.sRoofR, rearRoof],
    [(st.sRoofR + st.sTail) / 2, (rearRoof + tailTop) / 2 + 0.02],
    [st.sTail, tailTop],
  ]);
  const glassStation = (s: number): Station & { top: number; hwTop: number; hwBot: number } => {
    const top = gTop(s);
    const hwBot = hwAt(s) - 0.05;
    const k = Math.min(Math.max((top - st.beltH) / Math.max(roofH - st.beltH, 0.01), 0), 1);
    const hwTop = hwBot - st.tumble * k;
    return { z: z(s), pts: [], top, hwTop, hwBot };
  };
  const topPts = (g: { hwTop: number; top: number }): Pt[] => [
    [-g.hwTop, g.top - 0.08],
    [-g.hwTop + 0.035, g.top - 0.03],
    [-g.hwTop + 0.12, g.top],
    [0, g.top + 0.02],
    [g.hwTop - 0.12, g.top],
    [g.hwTop - 0.035, g.top - 0.03],
    [g.hwTop, g.top - 0.08],
  ];
  const bounds = sorted([
    st.sCowl,
    st.sRoofF,
    ...(st.sGlassEnd ? [st.sGlassEnd] : []),
    st.sRoofR,
    st.sTail,
  ]);
  const roofColor = st.blackRoof ? '#15171a' : BODY;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i] as number;
    const b = bounds[i + 1] as number;
    const front = b <= st.sRoofF + 0.01;
    const rear = a >= st.sRoofR - 0.01;
    const sideGlass = st.sGlassEnd ? b <= st.sGlassEnd + 0.01 : true;
    const topHex = front ? GLASS : rear ? (st.tail === 'van' ? BODY : GLASS) : roofColor;
    const sideHex = rear && st.tail === 'van' ? BODY : sideGlass || front ? GLASS : BODY;
    const n = Math.max(2, Math.ceil((b - a) / 0.4));
    const sts = Array.from({ length: n + 1 }, (_, k) => glassStation(a + ((b - a) * k) / n));
    parts.push(
      strip(
        sts.map((g) => ({ z: g.z, pts: topPts(g) })),
        topHex,
      ),
    );
    for (const sign of [-1, 1]) {
      parts.push(
        strip(
          sts.map((g) => ({
            z: g.z,
            pts: [
              [sign * g.hwBot, Math.min(st.beltH - 0.04, g.top - 0.1)],
              [sign * g.hwTop, g.top - 0.08],
            ] as Pt[],
          })),
          sideHex,
        ),
      );
    }
  }
  const tail = glassStation(st.sTail);
  parts.push(
    cap(
      {
        z: tail.z,
        pts: [[-tail.hwBot, st.beltH - 0.04], ...topPts(tail), [tail.hwBot, st.beltH - 0.04]],
      },
      BODY,
      false,
    ),
  );

  // A pillars (windscreen edges) and C pillars (rear window edges).
  {
    const a0 = glassStation(st.sCowl + 0.02);
    const a1 = glassStation(st.sRoofF);
    const c0 = glassStation(st.sRoofR);
    const c1 = glassStation(st.sTail);
    const pillar = st.blackRoof ? '#15171a' : BODY;
    for (const sign of [-1, 1]) {
      parts.push(
        bar3(
          [sign * a0.hwBot, (st.cowlH ?? st.beltH) - 0.02, a0.z],
          [sign * (a1.hwTop - 0.02), a1.top - 0.07, a1.z],
          0.05,
          0.05,
          pillar,
        ),
      );
      if (st.tail !== 'van') {
        parts.push(
          bar3(
            [sign * (c0.hwTop - 0.02), c0.top - 0.08, c0.z],
            [sign * c1.hwBot, st.beltH - 0.02, c1.z],
            0.07,
            0.07,
            pillar,
          ),
        );
      }
    }
  }

  // Pillars and door lines.
  const sB = st.sRoofF + (st.sRoofR - st.sRoofF) * (st.tail === 'hatch' ? 0.5 : 0.36);
  const pillarS = st.sGlassEnd ? [] : st.doors === 2 ? [sB + 0.2] : [sB];
  if (st.tail === 'wagon' && !st.boxy) pillarS.push(sB + (st.sRoofR - sB) * 0.62);
  for (const s of pillarS) {
    const g = glassStation(s);
    const h = g.top - st.beltH;
    const mid = (g.hwBot + g.hwTop) / 2;
    const tilt = Math.atan2(g.hwBot - g.hwTop, h);
    for (const sign of [-1, 1]) {
      parts.push(
        paint(
          new BoxGeometry(0.03, h, 0.1)
            .rotateZ(sign * tilt)
            .translate(sign * (mid + 0.006), st.beltH + h / 2 - 0.02, z(s)),
          st.tail === 'van' || st.blackRoof ? '#15171a' : BODY,
        ),
      );
    }
  }
  const lines =
    st.tail === 'pickup' || st.sGlassEnd
      ? [st.sCowl + 0.3, sB]
      : st.doors === 2
        ? [st.sCowl + 0.3, sB + 0.25]
        : [st.sCowl + 0.3, sB, sB + (st.tail === 'wagon' ? 0.95 : 0.85)];
  for (const s of lines) {
    const h = st.beltH - 0.06 - (yb + 0.1);
    for (const sign of [-1, 1]) {
      parts.push(
        faceRect(0.012, h, sign, sign * (hwAt(s) + 0.002), yb + 0.1 + h / 2, z(s), '#202226'),
      );
    }
  }
  // Door handles.
  for (const s of lines.slice(1)) {
    for (const sign of [-1, 1]) {
      parts.push(
        faceRect(0.13, 0.025, sign, sign * (hwAt(s) + 0.003), st.beltH - 0.1, z(s) + 0.2, CHROME),
      );
    }
  }
  // Mirrors.
  for (const sign of [-1, 1]) {
    const g = glassStation(st.sCowl + 0.3);
    parts.push(
      box(0.2, 0.12, 0.11, sign * (g.hwBot + 0.1), st.beltH + 0.09, z(st.sCowl + 0.25), TRIM),
    );
    parts.push(
      box(0.1, 0.03, 0.04, sign * (g.hwBot + 0.02), st.beltH + 0.03, z(st.sCowl + 0.28), TRIM),
    );
  }
  // Roof rails.
  if (st.roofRails) {
    const g = glassStation((st.sRoofF + st.sRoofR) / 2);
    const a = st.sRoofF + 0.25;
    const b = st.sRoofR - 0.05;
    for (const sign of [-1, 1]) {
      parts.push(
        box(0.035, 0.035, b - a, sign * (g.hwTop - 0.05), roofH + 0.03, z((a + b) / 2), '#2a2c30'),
      );
    }
  }

  // Where a point at distance x from the axis meets the rounded corner (s from the end, tangent angle).
  const cornerAt = (x: number, r: number, rearEnd: boolean) => {
    const flat = sh * (rearEnd ? 0.97 : 1) - r;
    if (x <= flat) return { s: 0, a: 0 };
    const q = Math.min((x - flat) / r, 0.97);
    return { s: r * (1 - Math.sqrt(1 - q * q)), a: Math.asin(q) };
  };
  const flatHalfF = sh - rF;
  // Front: grille, lights, plate, air intake.
  const front = L / 2;
  const grille = st.grille;
  const grilleW = Math.max(Math.min(grille.w, flatHalfF * 1.9), 0.3);
  parts.push(box(grilleW, grille.h, 0.06, 0, grille.y, front - 0.012, '#15171a'));
  if (st.headlight === 'bar') {
    parts.push(box(flatHalfF * 2 + 0.1, 0.014, 0.05, 0, st.noseH - 0.17, front - 0.005, '#f4f6f8'));
  }
  const lampW = { slim: 0.46, fangs: 0.4, round: 0.19, bar: 0.44, wide: 0.55 }[st.headlight];
  const lampH = { slim: 0.07, fangs: 0.07, round: 0.19, bar: 0.07, wide: 0.1 }[st.headlight];
  const lampY = st.noseH - 0.17;
  // Outline of the right half of an end of the body: straight face, then the round corner.
  const outline = (r: number, rearEnd: boolean): Pt[] => {
    const flat = sh * (rearEnd ? 0.97 : 1) - r;
    const pts: Pt[] = [];
    for (let x = 0; x < flat; x += 0.05) pts.push([x, 0]);
    for (let k = 0; k <= 14; k++) {
      const s = (r * k) / 14;
      const w = flat + r * Math.sqrt(Math.max(1 - ((r - s) / r) ** 2, 0));
      pts.push([w, s]);
    }
    return pts;
  };
  /** The part of an end outline between arc lengths `from` and `from + length`, as [x, z] points. */
  const outlineBand = (r: number, rearEnd: boolean, from: number, length: number, sign: number) => {
    const pts = outline(r, rearEnd);
    const out: Pt[] = [];
    let acc = 0;
    for (let k = 0; k < pts.length; k++) {
      if (k > 0) {
        const [x0, s0] = pts[k - 1] as Pt;
        const [x1, s1] = pts[k] as Pt;
        acc += Math.hypot(x1 - x0, s1 - s0);
      }
      if (acc >= from && acc <= from + length) {
        const [x, s] = pts[k] as Pt;
        // A hair outside the body, along the outward direction.
        const zz = rearEnd ? -L / 2 + s : L / 2 - s;
        const len = Math.hypot(x, zz) || 1;
        out.push([sign * (x + (0.004 * x) / len), zz + (0.004 * zz) / len]);
      }
    }
    return out;
  };
  const roundLamp = st.headlight === 'round';
  const lc = cornerAt(sh * 0.62, rF, false);
  for (const sign of [-1, 1]) {
    if (roundLamp) {
      const lx = sign * sh * 0.62;
      const lz = front - lc.s + 0.012;
      parts.push(ellipseZ(0.095, 0.095, 0.05, lx, st.noseH - 0.2, lz, '#eef1f4', sign * lc.a));
      parts.push(
        ellipseZ(0.105, 0.105, 0.03, lx, st.noseH - 0.2, lz - 0.012, '#15171a', sign * lc.a),
      );
    } else {
      const from = Math.max(flatHalfF - 0.2, 0.1);
      const path = outlineBand(rF, false, from, lampW, sign);
      if (path.length > 1) {
        parts.push(wallStrip(path, lampY - lampH / 2, lampY + lampH / 2, '#cdd5dc'));
        parts.push(wallStrip(path, lampY - lampH / 2 - 0.012, lampY - lampH / 2, '#15171a'));
      }
    }
    if (st.headlight === 'fangs') {
      for (let k = 0; k < 3; k++) {
        const fx = sh * 0.5 - k * 0.04;
        const fc = cornerAt(fx, rF, false);
        parts.push(boxR(0.022, 0.15, 0.03, sign * fx, 0.42, front - fc.s, sign * fc.a, '#f4f6f8'));
      }
    }
  }
  parts.push(box(0.5, 0.11, 0.02, 0, yb + 0.12, front + 0.004, '#f4f4f4'));
  if (!big) {
    parts.push(
      box(
        Math.min(sh * 0.9, flatHalfF * 1.8),
        st.skirtH * 0.4,
        0.04,
        0,
        yb + 0.12,
        front - 0.002,
        '#15171a',
      ),
    );
  }

  // Rear: lights and plate.
  const rear = -L / 2;
  const tall = st.tail !== 'hatch';
  const tailY = tall ? st.deckH - 0.36 : st.deckH - 0.27;
  const flatR = sh * 0.97 - rR;
  for (const sign of [-1, 1]) {
    const from = tall ? flatR - 0.02 : Math.max(flatR - 0.28, 0.15);
    const path = outlineBand(rR, true, from, tall ? 0.2 : 0.4, sign);
    if (path.length > 1) {
      const h = tall ? 0.34 : 0.1;
      parts.push(wallStrip(path, tailY - h / 2, tailY + h / 2, '#a30d12'));
    }
  }
  parts.push(box(0.5, 0.11, 0.02, 0, yb + 0.28, rear - 0.004, '#f4f4f4'));
  if (st.tail === 'hatch') {
    parts.push(box(0.5, 0.012, 0.05, 0, tailY, rear + 0.005, '#a30d12'));
  }

  // Pickup bed: walls and tailgate around a dark liner.
  if (st.tail === 'pickup') {
    const cab = st.sCabRear ?? st.sTail;
    const bedLen = L - cab - 0.06;
    const wall = (st.bedH ?? 1.1) - floorH;
    const zc = z(cab + 0.03 + bedLen / 2);
    parts.push(box(spec.widthM - 0.16, 0.02, bedLen, 0, floorH + 0.01, zc, '#1a1c1f'));
    for (const sign of [-1, 1]) {
      parts.push(box(0.07, wall, bedLen + 0.06, sign * (sh - 0.04), floorH + wall / 2, zc, BODY));
    }
    parts.push(box(spec.widthM - 0.1, wall, 0.06, 0, floorH + wall / 2, rear + 0.03, BODY));
    parts.push(box(spec.widthM - 0.16, wall, 0.05, 0, floorH + wall / 2, z(cab + 0.05), BODY));
  }

  // Wheels.
  const axles = [z(st.ovF), z(st.ovF + spec.wheelbaseM)];
  for (const az of axles) {
    for (const sign of [-1, 1]) {
      parts.push(...wheel(spec, st, sign, az, hwAt(L / 2 - az)));
    }
  }

  // Badges.
  if (options.logos !== false) {
    const size = st.logo === 'landrover' || st.logo === 'toyota' ? 0.12 : 0.1;
    const noseBadge = badgeGeometry(st.logo, size).translate(
      0,
      grille.y + grille.h / 2 + size * 0.6,
      front + 0.004,
    );
    const tailBadge = badgeGeometry(st.logo, size)
      .rotateY(Math.PI)
      .translate(0, yb + 0.5, rear - 0.004);
    parts.push(noseBadge, tailBadge);
  }

  return merge(parts);
}

/** Models usable by a place: the ids, by body class. */
export const CAR_IDS = CAR_SPECS.map((c) => c.id);
