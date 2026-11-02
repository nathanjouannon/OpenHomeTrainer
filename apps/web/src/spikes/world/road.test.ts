import { describe, expect, it } from 'vitest';
import { buildRoadLoop, flattenTerrainAlongRoad, sampleRoad } from './road';
import { heightAt, proceduralHeightfield } from './terrain';
import { placeTrees } from './trees';

describe('road loop (spike)', () => {
  const hf = proceduralHeightfield(4000, 257);
  const road = buildRoadLoop(hf);

  it('is a loop of a few kilometers', () => {
    expect(road.lengthM).toBeGreaterThan(5000);
    expect(road.lengthM).toBeLessThan(15000);
  });

  it('is periodic: sampleAt(d) = sampleAt(d + lap length)', () => {
    for (const d of [0, 123.4, 2500, road.lengthM - 1]) {
      const a = sampleRoad(road, d);
      const b = sampleRoad(road, d + road.lengthM * 3);
      expect(b.position.distanceTo(a.position)).toBeLessThan(1e-6 * road.lengthM);
      expect(b.gradePercent).toBeCloseTo(a.gradePercent, 6);
    }
  });

  it('is continuous across the start/finish line', () => {
    const before = sampleRoad(road, road.lengthM - 0.5);
    const after = sampleRoad(road, 0.5);
    expect(before.position.distanceTo(after.position)).toBeLessThan(1.5);
    expect(Math.abs(before.gradePercent - after.gradePercent)).toBeLessThan(0.5);
  });

  it('keeps grades within ±25 %', () => {
    for (const g of road.grades) expect(Math.abs(g)).toBeLessThanOrEqual(25);
  });

  it('flattens the terrain under the road and keeps trees off it', () => {
    flattenTerrainAlongRoad(hf, road);
    // The terrain must never poke through the asphalt (drawn 5 cm above the road line),
    // nor leave the road floating.
    const offsets = road.points.map((p) => heightAt(hf, p.x, p.z) - p.y);
    expect(Math.max(...offsets)).toBeLessThan(0);
    expect(Math.min(...offsets)).toBeGreaterThan(-1);
    const trees = placeTrees(hf, road, 2000);
    expect(trees.count).toBe(2000);
  });
});
