import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { barPath, beltPath, buildBike } from './bike-builder';
import {
  BAR,
  BB_HEIGHT,
  COCKPIT,
  FRAME,
  FRONT_AXLE,
  REAR_AXLE,
  SADDLE_TOP,
  STEM,
  WHEEL_RADIUS,
} from './bike-geometry';
import { mergeStaticParts } from './Rider';

function stats(root: Object3D) {
  let triangles = 0;
  const materials = new Set<unknown>();
  let meshes = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    meshes++;
    materials.add(m.material);
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return { triangles, meshes, materials: materials.size };
}

describe('buildBike', () => {
  const bike = buildBike({ textures: false });
  bike.root.updateMatrixWorld(true);

  it('has finite geometry everywhere', () => {
    bike.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      for (const name of ['position', 'normal']) {
        const a = m.geometry.getAttribute(name);
        expect(Array.from(a.array).every(Number.isFinite), `${m.name} ${name}`).toBe(true);
      }
    });
  });

  it('stays within the budget: triangles, meshes and materials', () => {
    const s = stats(bike.root);
    expect(s.triangles).toBeLessThan(45000);
    expect(s.materials).toBeLessThanOrEqual(14);
  });

  it('costs few draw calls once the static parts are merged by material', () => {
    const merged = buildBike({ textures: false });
    mergeStaticParts(merged.root, new Set([merged.pedals.l, merged.pedals.r]));
    const s = stats(merged.root);
    expect(s.meshes).toBeLessThanOrEqual(24);
    // The merge keeps every triangle.
    expect(s.triangles).toBeCloseTo(stats(bike.root).triangles, -1);
    merged.dispose();
  });

  it('fits the measured geometry', () => {
    const box = new Box3().setFromObject(bike.root);
    // Ground contact, saddle and hoods.
    expect(box.min.y).toBeGreaterThan(-0.005);
    expect(box.min.y).toBeLessThan(0.02);
    expect(box.max.y).toBeGreaterThan(SADDLE_TOP.y);
    expect(box.max.y).toBeLessThan(SADDLE_TOP.y + 0.05);
    expect(box.min.z).toBeCloseTo(REAR_AXLE.z - WHEEL_RADIUS, 1);
    expect(box.max.z).toBeGreaterThan(FRONT_AXLE.z + WHEEL_RADIUS - 0.01);
    expect(box.max.z).toBeLessThan(FRONT_AXLE.z + WHEEL_RADIUS + 0.12);
    expect(Math.abs(box.max.x + box.min.x)).toBeLessThan(0.02);
    expect(box.max.x).toBeLessThan(0.3);
    expect(COCKPIT.hoodTip.z).toBeLessThan(box.max.z);
  });

  it('has round wheels of the right radius at the axles', () => {
    for (const [wheel, axle] of [
      [bike.rearWheel, REAR_AXLE],
      [bike.frontWheel, FRONT_AXLE],
    ] as const) {
      expect(wheel.position.y).toBeCloseTo(axle.y, 9);
      expect(wheel.position.z).toBeCloseTo(axle.z, 9);
      const box = new Box3().setFromObject(wheel);
      expect(box.max.y - wheel.position.y).toBeCloseTo(WHEEL_RADIUS, 2);
      expect(wheel.position.y - box.min.y).toBeCloseTo(WHEEL_RADIUS, 2);
    }
  });

  it('turns the wheels and the cranks and moves the pedals', () => {
    bike.setPose(1.2, 3.4);
    expect(bike.rearWheel.rotation.x).toBeCloseTo(3.4, 9);
    expect(bike.frontWheel.rotation.x).toBeCloseTo(3.4, 9);
    expect(bike.crank.rotation.x).toBeCloseTo(1.2, 9);
    const l = bike.pedals.l.position.clone();
    bike.setPose(1.2 + Math.PI, 0);
    const l2 = bike.pedals.l.position;
    expect(l.y - BB_HEIGHT).toBeCloseTo(-(l2.y - BB_HEIGHT), 6);
    expect(bike.pedals.l.position.x).toBeGreaterThan(0);
    expect(bike.pedals.r.position.x).toBeLessThan(0);
  });

  it('keeps the chain loop a plausible length', () => {
    expect(bike.chainLength).toBeGreaterThan(1.1);
    expect(bike.chainLength).toBeLessThan(1.8);
  });

  it('has the crank at the bottom bracket', () => {
    expect(new Vector3().copy(bike.crank.position).y).toBeCloseTo(BB_HEIGHT, 9);
  });
});

describe('barPath', () => {
  const path = barPath();
  const c = COCKPIT.barCenter;

  it('is symmetric and as wide as the measured bar', () => {
    const xs = path.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(BAR.width / 2, 6);
    expect(Math.min(...xs)).toBeCloseTo(-BAR.width / 2, 6);
    for (let i = 0; i < path.length; i++) {
      const p = path[i] as Vector3;
      const q = path[path.length - 1 - i] as Vector3;
      expect(p.x).toBeCloseTo(-q.x, 9);
      expect(p.y).toBeCloseTo(q.y, 9);
      expect(p.z).toBeCloseTo(q.z, 9);
    }
  });

  it('has the reach and the drop of `BAR`, and straight tops', () => {
    const zs = path.map((p) => p.z - c.z);
    const ys = path.map((p) => p.y - c.y);
    expect(Math.max(...zs)).toBeCloseTo(BAR.reach, 6);
    expect(Math.min(...ys)).toBeCloseTo(-BAR.drop, 6);
    // The tops stay level and within the sweep, up to the bend.
    for (const p of path.filter((q) => Math.abs(q.x) < BAR.width / 2 - BAR.bendRadius)) {
      expect(p.y).toBeCloseTo(c.y, 9);
      expect(p.z - c.z).toBeGreaterThanOrEqual(0);
      expect(p.z - c.z).toBeLessThanOrEqual(BAR.topsSweep + 1e-9);
    }
  });

  it('starts the bar 11 cm ahead of the steering axis (short stem)', () => {
    expect(STEM.length).toBeGreaterThan(0.09);
    expect(STEM.length).toBeLessThan(0.13);
    expect(c.z - FRAME.stemTop.z).toBeGreaterThan(0.08);
    expect(c.z - FRAME.stemTop.z).toBeLessThan(0.13);
  });
});

describe('beltPath', () => {
  it('goes around two equal circles on outer tangents', () => {
    const path = beltPath(
      [
        { y: 0, z: 0, r: 1, ccw: true },
        { y: 0, z: 4, r: 1, ccw: true },
      ],
      0.05,
    );
    const ys = path.map((p) => p[1]);
    expect(Math.max(...ys)).toBeCloseTo(1, 2);
    expect(Math.min(...ys)).toBeCloseTo(-1, 2);
    const zs = path.map((p) => p[0]);
    expect(Math.max(...zs)).toBeCloseTo(5, 2);
    expect(Math.min(...zs)).toBeCloseTo(-1, 2);
  });
});
