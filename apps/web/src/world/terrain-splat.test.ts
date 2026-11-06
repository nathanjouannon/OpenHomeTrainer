import { describe, expect, it } from 'vitest';
import {
  computeSplatMap,
  LAYER_COUNT,
  type SplatInput,
  TERRAIN_LAYERS,
  terrainSplat,
} from './terrain-splat';

const base: SplatInput = {
  altitudeM: 600,
  up: 1,
  roadDistM: Number.POSITIVE_INFINITY,
  forest: 0,
  waterLevelM: 444.6,
  noiseA: 0.3,
  noiseB: 0.3,
};

const weight = (w: Float32Array, layer: (typeof TERRAIN_LAYERS)[number]) =>
  w[TERRAIN_LAYERS.indexOf(layer)] as number;

/** The layer with the largest weight. */
const main = (w: Float32Array) => TERRAIN_LAYERS[w.indexOf(Math.max(...w))];

describe('terrainSplat', () => {
  it('always sums to 1', () => {
    for (const up of [0.2, 0.7, 0.9, 1]) {
      for (const altitudeM of [440, 600, 1400, 2100]) {
        for (const forest of [0, 1]) {
          const w = terrainSplat({ ...base, up, altitudeM, forest, roadDistM: 5 });
          expect(w.length).toBe(LAYER_COUNT);
          expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
          for (const v of w) expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('puts grass on the flat valley floor', () => {
    expect(main(terrainSplat(base))).toBe('grass');
  });

  it('bares the rock on cliffs', () => {
    expect(main(terrainSplat({ ...base, up: 0.45 }))).toBe('rock');
  });

  it('puts snow on the gentle high slopes, not on the cliffs', () => {
    expect(main(terrainSplat({ ...base, altitudeM: 2150, up: 0.97 }))).toBe('snow');
    expect(main(terrainSplat({ ...base, altitudeM: 2150, up: 0.5 }))).toBe('rock');
  });

  it('adds scree high up, forest floor under the trees and worn ground by the road', () => {
    expect(weight(terrainSplat({ ...base, altitudeM: 1600, up: 0.9 }), 'scree')).toBeGreaterThan(
      0.2,
    );
    expect(main(terrainSplat({ ...base, forest: 1 }))).toBe('dirt');
    const byRoad = weight(terrainSplat({ ...base, roadDistM: 5 }), 'dirt');
    const farFromRoad = weight(terrainSplat({ ...base, roadDistM: 30 }), 'dirt');
    expect(byRoad).toBeGreaterThan(0.2);
    expect(farFromRoad).toBe(0);
  });

  it('mixes meadow patches into the grass', () => {
    expect(weight(terrainSplat({ ...base, noiseA: 0.9 }), 'meadow')).toBeGreaterThan(0.4);
    expect(weight(terrainSplat({ ...base, noiseA: 0.1 }), 'meadow')).toBeLessThan(0.1);
  });
});

describe('computeSplatMap', () => {
  it('gives each sample its weights, rock on the steep half', () => {
    const samples = 3;
    const t = { sizeM: 20, samples, heights: new Float32Array(9).fill(600) };
    const normals = new Float32Array(27);
    for (let i = 0; i < 9; i++) normals[i * 3 + 1] = i % 3 === 0 ? 0.4 : 1;
    const map = computeSplatMap(
      t,
      normals,
      null,
      () => 0,
      () => 0.2,
    );
    expect(map.length).toBe(9 * LAYER_COUNT);
    const at = (i: number) => map.subarray(i * LAYER_COUNT, (i + 1) * LAYER_COUNT);
    expect(at(0)[TERRAIN_LAYERS.indexOf('rock')]).toBeGreaterThan(200);
    expect(at(1)[TERRAIN_LAYERS.indexOf('grass')]).toBeGreaterThan(200);
  });
});

describe('mountain ground (lot 2.14)', () => {
  const at = (altitudeM: number) => terrainSplat({ ...base, altitudeM, noiseA: 0.3, noiseB: 0.5 });

  it('keeps the valley grassy and the high roads bare', () => {
    expect(main(at(500))).toBe('grass');
    const soft = (w: Float32Array) => weight(w, 'grass') + weight(w, 'meadow');
    expect(soft(at(500))).toBeGreaterThan(0.8);
    expect(weight(at(1050), 'grass')).toBe(0);
    expect(soft(at(1050))).toBeLessThan(0.6);
    expect(weight(at(1050), 'scree')).toBeGreaterThan(0.4);
  });

  it('replaces the grass progressively, with no jump', () => {
    const soft = (z: number) => weight(at(z), 'grass') + weight(at(z), 'meadow');
    let prev = soft(500);
    for (let z = 550; z <= 1100; z += 50) {
      const v = soft(z);
      expect(v).toBeLessThanOrEqual(prev + 1e-6);
      expect(prev - v).toBeLessThan(0.25);
      prev = v;
    }
  });
});
