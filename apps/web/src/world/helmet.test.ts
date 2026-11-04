import { describe, expect, it } from 'vitest';
import { buildHelmetGeometry, HELMET } from './helmet';

describe('buildHelmetGeometry', () => {
  const geometry = buildHelmetGeometry('#ffffff', '#000000');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as NonNullable<typeof geometry.boundingBox>;

  it('is close to the head: narrower than 22 cm, longer than wide, tail behind', () => {
    expect(box.max.x - box.min.x).toBeLessThan(0.22);
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.x - box.min.x);
    expect(-box.min.z).toBeGreaterThan(box.max.z * 1.2);
    expect(box.max.y).toBeCloseTo(HELMET.ry, 2);
  });

  it('has a rim higher at the front than at the back', () => {
    const position = geometry.getAttribute('position');
    let front = Number.POSITIVE_INFINITY;
    let back = Number.POSITIVE_INFINITY;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i)) > 0.01) continue;
      if (position.getZ(i) > 0.08) front = Math.min(front, position.getY(i));
      if (position.getZ(i) < -0.12) back = Math.min(back, position.getY(i));
    }
    expect(front).toBeGreaterThan(back);
  });

  it('has smooth normals (welded) and painted vents', () => {
    const normal = geometry.getAttribute('normal');
    const position = geometry.getAttribute('position');
    const seen = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)]
        .map((v) => v.toFixed(5))
        .join();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(normal.count).toBe(position.count);
    const colour = geometry.getAttribute('color');
    let dark = 0;
    for (let i = 0; i < colour.count; i++) if (colour.getX(i) < 0.5) dark++;
    expect(dark).toBeGreaterThan(20);
    expect(dark).toBeLessThan(colour.count / 3);
  });
});
