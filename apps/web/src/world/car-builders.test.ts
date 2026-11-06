import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildCar } from './car-builders';
import { pickCarModel } from './car-fleet';
import { CAR_SPECS } from './car-geometry';
import { CAR_STYLES } from './car-styles';
import { mulberry32 } from './world-data';

const triangles = (id: string, logos = true) => {
  const g = buildCar(id, { logos });
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
};

describe('cars (lot 2.17)', () => {
  it('has a shape for every model', () => {
    expect(CAR_SPECS.length).toBe(14);
    for (const s of CAR_SPECS) expect(CAR_STYLES[s.id], s.id).toBeDefined();
  });

  it.each(CAR_SPECS.map((s) => [s.id, s] as const))('%s has the sheet sizes', (_id, spec) => {
    const box = new Box3().setFromBufferAttribute(
      buildCar(spec.id).getAttribute('position') as never,
    );
    // Length and height of the sheet; width gets the mirrors and the wheels (< 0.35 m).
    expect(box.max.z - box.min.z).toBeGreaterThan(spec.lengthM - 0.05);
    expect(box.max.z - box.min.z).toBeLessThan(spec.lengthM + 0.16);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(box.max.y).toBeGreaterThan(spec.heightM - 0.08);
    expect(box.max.y).toBeLessThan(spec.heightM + 0.05);
    expect(box.max.x - box.min.x).toBeGreaterThan(spec.widthM);
    expect(box.max.x - box.min.x).toBeLessThan(spec.widthM + 0.35);
    // Centred on its length and symmetric.
    expect(Math.abs(box.max.z + box.min.z)).toBeLessThan(0.1);
    expect(Math.abs(box.max.x + box.min.x)).toBeLessThan(0.01);
  });

  it('keeps each car within the triangle budget', () => {
    for (const s of CAR_SPECS) {
      expect(triangles(s.id), s.id).toBeLessThan(6000);
      expect(triangles(s.id, false), s.id).toBeLessThan(triangles(s.id, true));
    }
  });

  it('picks small cars on the plain and 4x4s and pickups high up', () => {
    const count = (altitude: number, farm: boolean, klasses: string[]) => {
      const rand = mulberry32(5);
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const spec = CAR_SPECS[pickCarModel(altitude, farm, rand)];
        if (spec && klasses.includes(spec.klass)) n++;
      }
      return n / 2000;
    };
    expect(count(400, false, ['city', 'compact'])).toBeGreaterThan(
      count(1200, false, ['city', 'compact']),
    );
    expect(count(1200, false, ['offroad', 'pickup', 'suv'])).toBeGreaterThan(
      count(400, false, ['offroad', 'pickup', 'suv']),
    );
    expect(count(600, true, ['pickup'])).toBeGreaterThan(count(600, false, ['pickup']));
  });

  it('leaves out the cars too long for a village pad', () => {
    const rand = mulberry32(9);
    for (let i = 0; i < 500; i++) {
      const spec = CAR_SPECS[pickCarModel(1000, false, rand, 4.8)];
      expect(spec?.lengthM ?? 0).toBeLessThanOrEqual(4.8);
    }
  });
});
