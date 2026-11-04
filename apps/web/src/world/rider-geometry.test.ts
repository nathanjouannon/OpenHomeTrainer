import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BB, CRANK_L, pedalPosition, solveTwoBone } from './rider-geometry';

describe('solveTwoBone', () => {
  const root = new Vector3(0, 1, 0);
  const pole = new Vector3(0, 0, 1);

  it('keeps both bone lengths and bends towards the pole', () => {
    const end = new Vector3(0.1, 0.2, 0.3);
    const knee = solveTwoBone(root, end, 0.44, 0.45, pole, new Vector3());
    expect(knee.distanceTo(root)).toBeCloseTo(0.44, 5);
    expect(knee.distanceTo(end)).toBeCloseTo(0.45, 5);
    expect(knee.z).toBeGreaterThan((root.z + end.z) / 2);
  });

  it('stretches the chain when the target is out of reach', () => {
    const knee = solveTwoBone(root, new Vector3(0, -5, 0), 0.4, 0.4, pole, new Vector3());
    expect(knee.distanceTo(root)).toBeCloseTo(0.4, 3);
    expect(knee.y).toBeCloseTo(0.6, 3);
  });

  it('does not fail when the pole is along the chain', () => {
    const knee = solveTwoBone(
      root,
      new Vector3(0, 0.2, 0),
      0.5,
      0.5,
      new Vector3(0, 1, 0),
      new Vector3(),
    );
    expect(Number.isFinite(knee.x + knee.y + knee.z)).toBe(true);
  });
});

describe('pedalPosition', () => {
  it('turns around the bottom bracket, opposite pedals half a turn apart', () => {
    const l = pedalPosition(1, 0.7, new Vector3());
    const r = pedalPosition(-1, 0.7, new Vector3());
    expect(Math.hypot(l.y - BB.y, l.z - BB.z)).toBeCloseTo(CRANK_L, 6);
    expect(l.y - BB.y).toBeCloseTo(-(r.y - BB.y), 6);
    expect(l.z - BB.z).toBeCloseTo(-(r.z - BB.z), 6);
    expect(l.x).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(0);
  });

  it('starts with the left pedal at the bottom', () => {
    expect(pedalPosition(1, 0, new Vector3()).y).toBeCloseTo(BB.y - CRANK_L, 6);
  });
});
