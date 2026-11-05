import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  convexHull,
  gearGeometry,
  plateGeometry,
  revolveX,
  signedVolume,
  slabGeometry,
  sweptTube,
  taper,
  uniform,
} from './bike-parts';

const finite = (g: { getAttribute(n: string): { array: ArrayLike<number> } }) =>
  Array.from(g.getAttribute('position').array).every(Number.isFinite) &&
  Array.from(g.getAttribute('normal').array).every(Number.isFinite);

describe('sweptTube', () => {
  it('makes a closed outward solid whose size follows the section', () => {
    const g = sweptTube([new Vector3(0, 0, 0), new Vector3(0, 0, 1)], uniform({ w: 0.04, d: 0.1 }));
    expect(signedVolume(g)).toBeGreaterThan(0);
    // Ellipse of 0.04 × 0.1 over 1 m: π/4 · w · d · length (the polygon is a bit smaller).
    expect(signedVolume(g)).toBeGreaterThan(0.8 * (Math.PI / 4) * 0.04 * 0.1);
    expect(signedVolume(g)).toBeLessThan((Math.PI / 4) * 0.04 * 0.1 * 1.01);
    g.computeBoundingBox();
    expect(g.boundingBox?.max.x).toBeCloseTo(0.02, 3);
    expect(g.boundingBox?.max.y).toBeCloseTo(0.05, 3);
    expect(finite(g)).toBe(true);
  });

  it('follows a curved path and tapers', () => {
    const g = sweptTube(
      [new Vector3(0, 0, 0), new Vector3(0, 0.3, 0.2), new Vector3(0, 0.3, 0.6)],
      taper({ w: 0.05, d: 0.05 }, { w: 0.02, d: 0.02 }),
      { exponent: 3, color: () => ({ r: 1, g: 0, b: 0 }) as never },
    );
    expect(signedVolume(g)).toBeGreaterThan(0);
    expect(g.getAttribute('color')).toBeDefined();
    expect(finite(g)).toBe(true);
  });

  it('never flips the section between two rings (it would pinch the tube)', () => {
    // Along X with a slight wobble in Z, like the tops of a handlebar.
    const radial = 12;
    const samples = 20;
    const g = sweptTube(
      [new Vector3(0, 0, 0), new Vector3(0.05, 0, -0.002), new Vector3(0.1, 0, 0.001)],
      uniform({ w: 0.04, d: 0.02 }),
      { radial, samples, caps: false },
    );
    const pos = g.getAttribute('position');
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < samples; i++) {
      for (let j = 0; j < radial; j++) {
        a.fromBufferAttribute(pos, i * radial + j);
        b.fromBufferAttribute(pos, (i + 1) * radial + j);
        // The rings are 5 mm apart: a vertex never jumps across the section.
        expect(a.distanceTo(b)).toBeLessThan(0.008);
      }
    }
  });

  it('keeps the section upright along a path parallel to X', () => {
    const g = sweptTube(
      [new Vector3(0, 0, 0), new Vector3(1, 0, 0)],
      uniform({ w: 0.07, d: 0.014 }),
    );
    g.computeBoundingBox();
    expect(g.boundingBox?.max.y).toBeCloseTo(0.007, 3);
    expect(g.boundingBox?.max.z).toBeCloseTo(0.035, 3);
  });
});

describe('revolveX', () => {
  const profile = [
    [0.3, -0.01],
    [0.34, 0],
    [0.3, 0.01],
  ] as const;
  it('revolves a closed profile about X, outward', () => {
    const g = revolveX(profile, 48);
    expect(signedVolume(g)).toBeGreaterThan(0);
    g.computeBoundingBox();
    expect(g.boundingBox?.max.y).toBeCloseTo(0.34, 2);
    expect(g.boundingBox?.max.x).toBeCloseTo(0.01, 6);
    expect(finite(g)).toBe(true);
  });
});

describe('flat parts', () => {
  it('makes a toothed wheel along X, outward, with a hole', () => {
    const g = gearGeometry(50, 0.101, 0.007, 0.003, -0.05, 0.079);
    expect(signedVolume(g)).toBeGreaterThan(0);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.x).toBeCloseTo(-0.05, 6);
    expect(g.boundingBox?.max.x).toBeCloseTo(-0.047, 6);
    expect(g.boundingBox?.max.y).toBeGreaterThan(0.1);
    expect(g.boundingBox?.max.y).toBeLessThan(0.106);
  });

  it('makes a plate between circles, in the YZ plane', () => {
    const g = plateGeometry(
      [
        [0, 0, 0.02],
        [-0.175, 0, 0.015],
      ],
      0.017,
      0.064,
      0.003,
    );
    expect(signedVolume(g)).toBeGreaterThan(0);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.y).toBeCloseTo(-0.19, 2);
    expect(g.boundingBox?.min.x).toBeCloseTo(0.064, 3);
    expect(g.boundingBox?.max.x).toBeCloseTo(0.064 + 0.017, 3);
  });

  it('makes a slab: the outline in x and z, standing on y = 0', () => {
    const g = slabGeometry(
      [
        [0.05, -0.1],
        [0.05, 0.1],
        [-0.05, 0.1],
        [-0.05, -0.1],
      ],
      0.03,
      0.006,
    );
    expect(signedVolume(g)).toBeGreaterThan(0);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.y).toBeCloseTo(0, 6);
    expect(g.boundingBox?.max.y).toBeCloseTo(0.03, 6);
    expect(g.boundingBox?.max.z).toBeCloseTo(0.106, 3);
  });
});

describe('convexHull', () => {
  it('drops the inner points', async () => {
    const { Vector2 } = await import('three');
    const hull = convexHull([
      new Vector2(0, 0),
      new Vector2(1, 0),
      new Vector2(1, 1),
      new Vector2(0, 1),
      new Vector2(0.5, 0.5),
    ]);
    expect(hull).toHaveLength(4);
  });
});
