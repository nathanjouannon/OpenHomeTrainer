import { describe, expect, it } from 'vitest';
import { garmentOf, hemDistances, MASK_CHANNEL, rasterizeGarmentMask } from './avatar-garments';

describe('garmentOf', () => {
  it('dresses the torso and the upper arms in the jersey, bare below the sleeve', () => {
    expect(garmentOf('spine_02', 0.5, 1.2)).toBe('jersey');
    expect(garmentOf('clavicle_l', 0.5, 1.45)).toBe('jersey');
    expect(garmentOf('upperarm_r', 0.2, 1.45)).toBe('jersey');
    expect(garmentOf('upperarm_r', 0.8, 1.45)).toBe('skin');
    expect(garmentOf('lowerarm_l', 0.5, 1.45)).toBe('skin');
  });

  it('keeps the neck and the head bare', () => {
    expect(garmentOf('spine_03', 0.9, 1.52)).toBe('skin');
    expect(garmentOf('neck_01', 0.5, 1.55)).toBe('skin');
    expect(garmentOf('Head', 0.5, 1.7)).toBe('skin');
  });

  it('puts shorts from the waist to mid-thigh and socks at the ankle', () => {
    expect(garmentOf('pelvis', 0, 0.95)).toBe('shorts');
    expect(garmentOf('spine_01', 0.1, 0.98)).toBe('shorts');
    expect(garmentOf('thigh_l', 0.3, 0.8)).toBe('shorts');
    expect(garmentOf('thigh_l', 0.9, 0.6)).toBe('skin');
    expect(garmentOf('calf_l', 0.2, 0.45)).toBe('skin');
    expect(garmentOf('calf_l', 0.8, 0.15)).toBe('socks');
  });

  it('gloves the hands (cuff included) and shoes the feet', () => {
    expect(garmentOf('hand_l', 0.5, 1.4)).toBe('gloves');
    expect(garmentOf('index_02_r', 0.5, 1.4)).toBe('gloves');
    expect(garmentOf('thumb_01_l', 0.5, 1.4)).toBe('gloves');
    expect(garmentOf('lowerarm_l', 0.95, 1.4)).toBe('gloves');
    expect(garmentOf('foot_r', 0.5, 0.05)).toBe('shoes');
    expect(garmentOf('ball_r', 0.5, 0.02)).toBe('shoes');
  });
});

describe('hemDistances', () => {
  it('is positive inside the garment and negative past the hem', () => {
    expect(hemDistances('upperarm_l', 0.1, 1.45).jersey).toBeGreaterThan(0.09);
    expect(hemDistances('upperarm_l', 0.9, 1.45).jersey).toBeLessThan(0);
    expect(hemDistances('spine_02', 0.5, 1.2).jersey).toBeCloseTo(0.2, 6);
    expect(hemDistances('spine_01', 0.5, 0.9).jersey).toBeLessThan(0);
    expect(hemDistances('spine_03', 0.9, 1.52).jersey).toBeLessThan(0);
    expect(hemDistances('thigh_r', 0.2, 0.8).shorts).toBeGreaterThan(0.15);
    expect(hemDistances('thigh_r', 0.9, 0.6).shorts).toBeLessThan(0);
    expect(hemDistances('calf_r', 0.5, 0.3).shorts).toBeLessThan(0);
  });

  it('is continuous with the garment edge of garmentOf', () => {
    expect(hemDistances('upperarm_l', 0.5, 1.45).jersey).toBeCloseTo(0, 6);
    expect(hemDistances('thigh_l', 0.62, 0.7).shorts).toBeCloseTo(0, 6);
  });
});

describe('rasterizeGarmentMask', () => {
  // A square split in two triangles over a 8 × 8 mask: the left vertices are
  // in the jersey, the right ones bare.
  const uv = [0.1, 0.1, 0.9, 0.1, 0.1, 0.9, 0.9, 0.9];
  const index = [0, 1, 2, 1, 3, 2];
  const garments = ['jersey', 'skin', 'jersey', 'skin'] as const;
  const mask = rasterizeGarmentMask(uv, index, garments, 8);
  const texel = (x: number, y: number, c: number) => mask[(y * 8 + x) * 4 + c] as number;

  it('interpolates the garment between the vertices: the edge is half-way', () => {
    expect(texel(1, 4, 0)).toBeGreaterThan(200);
    expect(texel(6, 4, 0)).toBeLessThan(55);
    expect(texel(4, 4, 0)).toBeGreaterThan(100);
    expect(texel(4, 4, 0)).toBeLessThan(155);
    expect(texel(4, 4, 1)).toBe(0);
  });

  it('grows the islands so that filtering never meets an empty texel', () => {
    expect(texel(0, 0, 0)).toBeGreaterThan(0);
    expect(texel(7, 7, 0)).toBeLessThan(55);
    expect(texel(7, 4, 0)).toBe(texel(6, 4, 0));
  });

  it('puts socks and shoes in the same channel, bare skin in none', () => {
    expect(MASK_CHANNEL.socks).toBe(MASK_CHANNEL.shoes);
    expect(MASK_CHANNEL.skin).toBeNull();
    const all = new Set(Object.values(MASK_CHANNEL).filter((c) => c !== null));
    expect(all).toEqual(new Set([0, 1, 2, 3]));
  });
});
