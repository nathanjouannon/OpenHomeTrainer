import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { cellSize, type Heightfield, heightAt } from './terrain';

/** Closed road loop sampled at a fixed spacing (prototype of the phase 1 route format). */
export interface RoadLoop {
  points: Vector3[];
  spacingM: number;
  lengthM: number;
  grades: Float32Array;
}

const SPACING_M = 5;

/** Circular moving average: the window wraps around the start/finish line. */
function smoothCircular(values: Float32Array, halfWindow: number, passes: number): Float32Array {
  let src = values;
  const n = values.length;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -halfWindow; k <= halfWindow; k++) sum += src[(i + k + n) % n] ?? 0;
      dst[i] = sum / (2 * halfWindow + 1);
    }
    src = dst;
  }
  return src;
}

/** Builds a closed loop over the terrain, with a smoothed altitude profile. */
export function buildRoadLoop(hf: Heightfield): RoadLoop {
  const controls: Vector3[] = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const wobble = 1 + 0.16 * Math.sin(2 * a + 0.7) + 0.09 * Math.sin(5 * a + 1.9);
    controls.push(new Vector3(Math.cos(a) * 1350 * wobble, 0, Math.sin(a) * 1100 * wobble));
  }
  const curve = new CatmullRomCurve3(controls, true, 'centripetal');
  const lengthM = curve.getLength();
  const n = Math.round(lengthM / SPACING_M);
  const points = curve.getSpacedPoints(n).slice(0, n);

  const raw = new Float32Array(n);
  points.forEach((p, i) => {
    raw[i] = heightAt(hf, p.x, p.z);
  });
  const profile = smoothCircular(raw, 16, 4);
  points.forEach((p, i) => {
    p.y = profile[i] ?? 0;
  });

  const grades = new Float32Array(n);
  const k = 5; // ±25 m window
  for (let i = 0; i < n; i++) {
    const dz = (profile[(i + k) % n] ?? 0) - (profile[(i - k + n) % n] ?? 0);
    grades[i] = Math.max(-25, Math.min(25, (dz / (2 * k * SPACING_M)) * 100));
  }
  return { points, spacingM: lengthM / n, lengthM, grades };
}

export interface RoadSample {
  position: Vector3;
  direction: Vector3;
  gradePercent: number;
}

/** Interpolated position, direction and grade at a distance (taken modulo the lap length). */
export function sampleRoad(road: RoadLoop, distanceM: number, out?: RoadSample): RoadSample {
  const n = road.points.length;
  const d = ((distanceM % road.lengthM) + road.lengthM) % road.lengthM;
  const f = d / road.spacingM;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const t = f - Math.floor(f);
  const p0 = road.points[i0] as Vector3;
  const p1 = road.points[i1] as Vector3;
  const res = out ?? { position: new Vector3(), direction: new Vector3(), gradePercent: 0 };
  res.position.copy(p0).lerp(p1, t);
  res.direction.subVectors(p1, p0).normalize();
  res.gradePercent = (road.grades[i0] ?? 0) * (1 - t) + (road.grades[i1] ?? 0) * t;
  return res;
}

/** Flattens the terrain along the road (full within halfWidth, blended out to falloff). */
export function flattenTerrainAlongRoad(
  hf: Heightfield,
  road: RoadLoop,
  halfWidthM = 5,
  falloffM = 16,
): void {
  const s = hf.samples;
  const cell = cellSize(hf);
  const half = hf.sizeM / 2;
  // Every vertex of a grid cell crossed by the road must be fully flattened,
  // otherwise bilinear interpolation lifts the terrain above the asphalt.
  const fullM = halfWidthM + cell;
  const falloff = Math.max(falloffM, fullM + cell);
  const bestDist = new Float32Array(s * s).fill(Number.POSITIVE_INFINITY);
  const target = new Float32Array(s * s);
  const reach = Math.ceil(falloff / cell);
  // Sub-sample the road every ~1 m so each vertex gets the height of its true
  // projection on the road, not of a sample up to 2.5 m away on a slope.
  const subSteps = Math.max(1, Math.round(road.spacingM));
  const n = road.points.length;
  const p = new Vector3();
  for (let i = 0; i < n * subSteps; i++) {
    const a = road.points[Math.floor(i / subSteps)] as Vector3;
    const b = road.points[(Math.floor(i / subSteps) + 1) % n] as Vector3;
    p.copy(a).lerp(b, (i % subSteps) / subSteps);
    const cc = Math.round((p.x + half) / cell);
    const rc = Math.round((p.z + half) / cell);
    for (let r = rc - reach; r <= rc + reach; r++) {
      for (let c = cc - reach; c <= cc + reach; c++) {
        if (r < 0 || c < 0 || r >= s || c >= s) continue;
        const dx = -half + c * cell - p.x;
        const dz = -half + r * cell - p.z;
        const dist = Math.hypot(dx, dz);
        const i = r * s + c;
        if (dist < (bestDist[i] ?? Number.POSITIVE_INFINITY)) {
          bestDist[i] = dist;
          target[i] = p.y;
        }
      }
    }
  }
  for (let i = 0; i < s * s; i++) {
    const dist = bestDist[i] ?? Number.POSITIVE_INFINITY;
    if (dist >= falloff) continue;
    const w = dist <= fullM ? 1 : 1 - (dist - fullM) / (falloff - fullM);
    const smooth = w * w * (3 - 2 * w);
    const h = hf.heights[i] ?? 0;
    // Sink the terrain slightly under the asphalt to avoid z-fighting.
    hf.heights[i] = h + ((target[i] ?? 0) - 0.25 - h) * smooth;
  }
}

/** Ribbon mesh following the loop, closed at the start/finish line. */
export function buildRoadGeometry(road: RoadLoop, widthM = 6): BufferGeometry {
  const n = road.points.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const side = new Vector3();
  const dir = new Vector3();
  for (let i = 0; i < n; i++) {
    const prev = road.points[(i - 1 + n) % n] as Vector3;
    const next = road.points[(i + 1) % n] as Vector3;
    const p = road.points[i] as Vector3;
    dir.subVectors(next, prev).setY(0).normalize();
    side.set(-dir.z, 0, dir.x).multiplyScalar(widthM / 2);
    positions.set(
      [p.x - side.x, p.y + 0.05, p.z - side.z, p.x + side.x, p.y + 0.05, p.z + side.z],
      i * 6,
    );
    uvs.set([0, i * road.spacingM, 1, i * road.spacingM], i * 4);
  }
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    indices.set([a, a + 1, b, a + 1, b + 1, b], i * 6);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
