import { describe, expect, it } from 'vitest';
import { packLayer } from './texture-arrays';

const px = (...rgba: number[]) => Uint8ClampedArray.from(rgba);

describe('packLayer', () => {
  it('packs colour + AO + height and normal + roughness into the layer', () => {
    // Two 1×1 layers; write the second one.
    const albedo = new Uint8Array(8);
    const surface = new Uint8Array(8);
    packLayer(
      1,
      1,
      {
        color: px(200, 100, 50, 255),
        normal: px(128, 140, 255, 255),
        roughness: px(180, 180, 180, 255),
        ao: px(0, 0, 0, 255),
        height: px(77, 77, 77, 255),
      },
      albedo,
      surface,
    );
    expect([...albedo.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    // Full occlusion darkens the colour by 60 %; height in alpha.
    expect([...albedo.subarray(4)]).toEqual([80, 40, 20, 77]);
    expect([...surface.subarray(4)]).toEqual([128, 140, 180, 255]);
  });

  it('uses a neutral height without a height map', () => {
    const albedo = new Uint8Array(4);
    const surface = new Uint8Array(4);
    const c = px(10, 20, 30, 255);
    packLayer(0, 1, { color: c, normal: c, roughness: c, ao: null, height: null }, albedo, surface);
    expect([...albedo]).toEqual([10, 20, 30, 128]);
  });
});
