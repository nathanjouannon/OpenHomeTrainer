import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  type BoneSegment,
  boneShift,
  CYCLIST_SHAPE,
  reshapeVertex,
  splitBoneName,
} from './avatar-shape';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const segments = new Map<string, BoneSegment>([
  ['thigh_l', { from: v(0.114, 0.97, 0), to: v(0.114, 0.54, 0) }],
  ['thigh_r', { from: v(-0.114, 0.97, 0), to: v(-0.114, 0.54, 0) }],
  ['pelvis', { from: v(0, 0.95, 0), to: v(0, 1.07, 0) }],
  ['spine_02', { from: v(0, 1.18, 0.02), to: v(0, 1.31, 0.02) }],
]);

describe('splitBoneName / boneShift', () => {
  it('reads the side of a bone', () => {
    expect(splitBoneName('thigh_l')).toEqual({ part: 'thigh', side: 1 });
    expect(splitBoneName('upperarm_r')).toEqual({ part: 'upperarm', side: -1 });
    expect(splitBoneName('Head')).toEqual({ part: 'Head', side: 0 });
  });

  it('moves the arms, half the clavicles, the legs, not the spine', () => {
    expect(boneShift('upperarm_l', CYCLIST_SHAPE)).toBe(CYCLIST_SHAPE.shoulderShift);
    expect(boneShift('index_02_r', CYCLIST_SHAPE)).toBe(CYCLIST_SHAPE.shoulderShift);
    expect(boneShift('clavicle_l', CYCLIST_SHAPE)).toBe(CYCLIST_SHAPE.shoulderShift / 2);
    expect(boneShift('calf_r', CYCLIST_SHAPE)).toBe(CYCLIST_SHAPE.hipShift);
    expect(boneShift('spine_01', CYCLIST_SHAPE)).toBe(0);
    expect(boneShift('Head', CYCLIST_SHAPE)).toBe(0);
  });
});

describe('reshapeVertex', () => {
  const out = new Vector3();
  const one = (bone: string, weight = 1) => [{ bone, weight }];

  it('brings the legs together by the hip shift, mirrored, and slims them about their axis', () => {
    const left = reshapeVertex(
      v(0.164, 0.75, 0.05),
      one('thigh_l'),
      segments,
      CYCLIST_SHAPE,
      out,
    ).clone();
    expect(left.y).toBeCloseTo(0.75, 6);
    // Half-width from the axis 0.05 slimmed by the thigh share, axis moved in by hipShift.
    expect(left.x).toBeCloseTo(
      0.114 + 0.05 * (CYCLIST_SHAPE.limbs.thigh as number) - CYCLIST_SHAPE.hipShift,
      6,
    );
    expect(left.z).toBeCloseTo(0.05 * (CYCLIST_SHAPE.limbs.thigh as number), 6);
    const right = reshapeVertex(
      v(-0.164, 0.75, 0.05),
      one('thigh_r'),
      segments,
      CYCLIST_SHAPE,
      out,
    );
    expect(right.x).toBeCloseTo(-left.x, 6);
  });

  it('narrows the torso about the spine and leaves its height', () => {
    const p = reshapeVertex(v(0.2, 1.25, 0.12), one('spine_02'), segments, CYCLIST_SHAPE, out);
    const torso = CYCLIST_SHAPE.torso.spine_02 as { x: number; z: number };
    expect(p.x).toBeCloseTo(0.2 * torso.x, 6);
    expect(p.y).toBeCloseTo(1.25, 6);
    expect(p.z).toBeCloseTo(0.02 + 0.1 * torso.z, 6);
  });

  it('blends the bones by their weights, so the hip has no step', () => {
    const p = v(0.12, 0.96, 0.02);
    const pelvis = reshapeVertex(p, one('pelvis'), segments, CYCLIST_SHAPE, out).clone();
    const thigh = reshapeVertex(p, one('thigh_l'), segments, CYCLIST_SHAPE, out).clone();
    const mix = reshapeVertex(
      p,
      [
        { bone: 'pelvis', weight: 0.5 },
        { bone: 'thigh_l', weight: 0.5 },
      ],
      segments,
      CYCLIST_SHAPE,
      out,
    );
    expect(mix.x).toBeCloseTo((pelvis.x + thigh.x) / 2, 6);
    expect(mix.z).toBeCloseTo((pelvis.z + thigh.z) / 2, 6);
  });

  it('leaves a vertex alone when no bone reshapes it', () => {
    const p = v(0.01, 1.7, 0.05);
    expect(
      reshapeVertex(
        p,
        one('Head'),
        new Map([['Head', { from: v(0, 1.6, 0), to: v(0, 1.8, 0) }]]),
        CYCLIST_SHAPE,
        out,
      ).distanceTo(p),
    ).toBeLessThan(1e-9);
    expect(reshapeVertex(p, [], segments, CYCLIST_SHAPE, out).distanceTo(p)).toBe(0);
  });
});
