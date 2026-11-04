import { buildLoopRoute } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import {
  collectTiers,
  createTierBuffers,
  type GrassSource,
  generateGrassTile,
  grassMask,
  maskAt,
  placeShrubs,
  type RoadHit,
  RoadIndex,
  SPECIES_INDEX,
  speciesOf,
  tilesAround,
  type VegetationBatch,
  writeClumpMatrix,
} from './plants';
import { VERGE_OUTER_M } from './roadside';
import { lateral } from './settlements';
import type { Terrain } from './world-data';

const SIZE = 2000;
const SAMPLES = 201;

function flatTerrain(): Terrain {
  return {
    sizeM: SIZE,
    samples: SAMPLES,
    heights: new Float32Array(SAMPLES * SAMPLES).fill(500),
    minElevationM: 500,
  };
}

const square = buildLoopRoute({
  id: 'square',
  name: { fr: 'carré', en: 'square' },
  worldId: 'w',
  controls: [
    [-600, -600],
    [600, -600],
    [600, 600],
    [-600, 600],
  ],
  elevationAt: () => 500,
});

describe('speciesOf', () => {
  it('is stable and keeps conifers and broadleaves apart', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 37.3;
      const y = i * -12.9;
      expect(speciesOf('conifer', x, y, 800)).toBe(speciesOf('conifer', x, y, 800));
      expect(['spruce', 'pine']).toContain(speciesOf('conifer', x, y, 800));
      expect(['beech', 'poplar']).toContain(speciesOf('broadleaf', x, y, 300));
    }
  });

  it('puts more spruces higher up', () => {
    const share = (z: number) => {
      let n = 0;
      for (let i = 0; i < 1000; i++)
        if (speciesOf('conifer', i * 3.7, i * 1.3, z) === 'spruce') n++;
      return n / 1000;
    };
    expect(share(1300)).toBeGreaterThan(share(400) + 0.2);
  });
});

/** A batch of plants of the given species at the given (x, z) scene positions. */
function batch(center: [number, number], plants: { at: [number, number]; species: number }[]) {
  const matrices = new Float32Array(plants.length * 16);
  const colors = new Float32Array(plants.length * 3);
  plants.forEach((p, i) => {
    matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p.at[0], 5, p.at[1], 1], i * 16);
    colors.set([i, i, i], i * 3);
  });
  return {
    chunk: 0,
    center: { x: center[0], z: center[1] },
    matrices,
    colors,
    species: Uint8Array.from(plants.map((p) => p.species)),
    count: plants.length,
  } satisfies VegetationBatch;
}

describe('collectTiers', () => {
  const spruce = SPECIES_INDEX.spruce;
  const beech = SPECIES_INDEX.beech;
  const batches = [
    batch(
      [0, 0],
      [
        { at: [10, 0], species: spruce },
        { at: [0, 100], species: spruce },
        { at: [300, 0], species: spruce },
        { at: [0, 900], species: spruce },
        { at: [5, 5], species: beech },
      ],
    ),
    // Too far for any of its plants to be in reach.
    batch([9000, 0], [{ at: [8990, 0], species: spruce }]),
  ];
  const buffers = () =>
    [0, 1, 2, 3, 4].map((s) =>
      s === spruce || s === beech ? [0, 1, 2].map(() => createTierBuffers(10)) : [],
    );

  it('sorts the plants into the tiers of their species by distance', () => {
    const out = buffers();
    const dropped = collectTiers(batches, 0, 0, [50, 200], 500, 1250, out);
    expect(dropped).toBe(0);
    const counts = (s: number) => (out[s] ?? []).map((t) => t?.count);
    // 10 m and 100 m, then 300 m; the one at 900 m is past the last tier.
    expect(counts(spruce)).toEqual([1, 1, 1]);
    expect(counts(beech)).toEqual([1, 0, 0]);
    expect(out[spruce]?.[0]?.matrices[12]).toBe(10);
    // Colours follow the matrices.
    expect(out[spruce]?.[1]?.colors[0]).toBe(1);
  });

  it('resets the counts at each call', () => {
    const out = buffers();
    collectTiers(batches, 0, 0, [50, 200], 500, 1250, out);
    collectTiers(batches, 9000, 0, [50, 200], 500, 1250, out);
    expect(out[spruce]?.map((t) => t?.count)).toEqual([1, 0, 0]);
  });

  it('never writes past a tier buffer and says how many it left out', () => {
    const out = [[createTierBuffers(1)]];
    const crowd = batch(
      [0, 0],
      Array.from({ length: 5 }, (_, i) => ({ at: [i, 0] as [number, number], species: 0 })),
    );
    expect(collectTiers([crowd], 0, 0, [], 100, 1250, out)).toBe(4);
    expect(out[0]?.[0]?.count).toBe(1);
  });
});

/** A point of the road, 8 m to the side of it, on a straight stretch. */
const D_ALONG = square.lengthM * 0.12;
const roadside = lateral(square, D_ALONG, 8);

describe('RoadIndex', () => {
  const index = new RoadIndex([square]);
  const hit: RoadHit = { distM: 0, routeId: '', alongM: 0 };

  it('measures the distance to the road and where along it', () => {
    expect(index.nearest(roadside.x, roadside.y, hit)).toBe(true);
    expect(hit.distM).toBeCloseTo(8, 0);
    expect(hit.routeId).toBe('square');
    expect(hit.alongM).toBeCloseTo(D_ALONG, -1);
  });

  it('knows nothing of places far from every road', () => {
    expect(index.nearest(0, 0, hit)).toBe(false);
  });

  it('finds the nearest of two roads', () => {
    const other = buildLoopRoute({
      id: 'other',
      name: { fr: 'autre', en: 'other' },
      worldId: 'w',
      controls: [
        [-1400, -1400],
        [-1000, -1400],
        [-1000, -1000],
        [-1400, -1000],
      ],
      elevationAt: () => 500,
    });
    const two = new RoadIndex([square, other]);
    const p = lateral(other, 100, 5);
    expect(two.nearest(p.x, p.y, hit)).toBe(true);
    expect(hit.routeId).toBe('other');
    expect(hit.distM).toBeCloseTo(5, 0);
  });
});

describe('grass mask', () => {
  const t = flatTerrain();

  it('is open ground everywhere without a splatmap', () => {
    const mask = grassMask(null, t.samples);
    expect(maskAt(mask, t, 100, 100)).toBeGreaterThan(0.5);
  });

  it('interpolates between the samples', () => {
    const mask = new Uint8Array(SAMPLES * SAMPLES);
    // Samples of the column at x = 0 are grassy, the next column is not.
    const c = (SAMPLES - 1) / 2;
    for (let r = 0; r < SAMPLES; r++) mask[r * SAMPLES + c] = 255;
    const cell = SIZE / (SAMPLES - 1);
    expect(maskAt(mask, t, 0, 0)).toBeCloseTo(1, 5);
    expect(maskAt(mask, t, cell / 2, 0)).toBeCloseTo(0.5, 1);
    expect(maskAt(mask, t, cell, 0)).toBeCloseTo(0, 5);
  });
});

describe('grass tiles', () => {
  const t = flatTerrain();
  const src: GrassSource = {
    terrain: t,
    base: 400,
    mask: grassMask(null, t.samples),
    roads: new RoadIndex([square]),
    spans: [],
  };
  const tile = (kind: 'grass' | 'tall' | 'daisy', x0: number, y0: number, density = 3) => {
    const matrices = new Float32Array(16 * 600);
    const colors = new Float32Array(3 * 600);
    const n = generateGrassTile(src, { kind, density, x0, y0, sizeM: 12 }, matrices, colors);
    return { n, matrices, colors };
  };

  it('is deterministic', () => {
    const a = tile('grass', 24, 36);
    const b = tile('grass', 24, 36);
    expect(a.n).toBeGreaterThan(20);
    expect(a.n).toBe(b.n);
    expect(Array.from(a.matrices.subarray(0, 16))).toEqual(Array.from(b.matrices.subarray(0, 16)));
  });

  it('puts the clumps on the ground of the scene frame, inside the tile', () => {
    const { n, matrices } = tile('grass', 24, 36);
    for (let i = 0; i < n; i++) {
      const x = matrices[i * 16 + 12] as number;
      const y = matrices[i * 16 + 13] as number;
      const z = matrices[i * 16 + 14] as number;
      expect(x).toBeGreaterThanOrEqual(24);
      expect(x).toBeLessThanOrEqual(36);
      // 500 m of altitude − 400 m base, a hair under the ground; scene z = −y.
      expect(y).toBeCloseTo(100 - 0.04, 5);
      expect(-z).toBeGreaterThanOrEqual(36);
      expect(-z).toBeLessThanOrEqual(48);
    }
  });

  it('leaves the verge of the road bare and grows nothing on the asphalt', () => {
    // A tile that begins on the road: nothing within the verge of it.
    const p = lateral(square, D_ALONG, 10);
    const { n, matrices } = tile('grass', Math.floor(p.x / 12) * 12, Math.floor(p.y / 12) * 12, 6);
    expect(n).toBeGreaterThan(0);
    const hit: RoadHit = { distM: 0, routeId: '', alongM: 0 };
    for (let i = 0; i < n; i++) {
      const x = matrices[i * 16 + 12] as number;
      const y = -(matrices[i * 16 + 14] as number);
      expect(src.roads.nearest(x, y, hit)).toBe(true);
      expect(hit.distM).toBeGreaterThanOrEqual(VERGE_OUTER_M + 0.2 - 0.001);
    }
  });

  it('puts the tall grass in a band along the road and none far from it', () => {
    const near = tile(
      'tall',
      Math.floor(roadside.x / 12) * 12,
      Math.floor(roadside.y / 12) * 12,
      3,
    );
    expect(near.n).toBeGreaterThan(0);
    expect(tile('tall', 0, 0).n).toBe(0);
    expect(tile('daisy', 0, 0).n).toBe(0);
  });

  it('never writes more than the buffer holds', () => {
    const matrices = new Float32Array(16 * 3);
    const colors = new Float32Array(3 * 3);
    expect(
      generateGrassTile(
        src,
        { kind: 'grass', density: 5, x0: 24, y0: 36, sizeM: 12 },
        matrices,
        colors,
      ),
    ).toBe(3);
  });
});

describe('writeClumpMatrix', () => {
  it('composes a rotation around Y, a scale and a translation', () => {
    const m = new Float32Array(16);
    writeClumpMatrix(m, 0, 1, 2, 3, Math.PI / 2, 2, 3);
    // Rotation of 90° around Y turns +X into −Z.
    expect(m[0]).toBeCloseTo(0, 5);
    expect(m[2]).toBeCloseTo(-2, 5);
    expect(m[5]).toBe(3);
    expect([m[12], m[13], m[14], m[15]]).toEqual([1, 2, 3, 1]);
  });
});

describe('tilesAround', () => {
  it('lists the tiles whose centre is within the radius', () => {
    const tiles = tilesAround(0, 0, 20, 12);
    expect(tiles.length).toBeGreaterThan(8);
    for (const { ix, iy } of tiles) {
      expect(Math.hypot((ix + 0.5) * 12, (iy + 0.5) * 12)).toBeLessThanOrEqual(20);
    }
  });
});

describe('placeShrubs', () => {
  const t = flatTerrain();
  const roads = new RoadIndex([square]);
  const open = () => 0.15;

  it('places the asked number, off the verge and on dry land', () => {
    const shrubs = placeShrubs(t, roads, open, null, 300, () => false);
    expect(shrubs.length).toBe(300);
    const hit: RoadHit = { distM: 0, routeId: '', alongM: 0 };
    for (const s of shrubs) {
      if (roads.nearest(s.x, s.y, hit)) expect(hit.distM).toBeGreaterThan(VERGE_OUTER_M);
    }
  });

  it('keeps out of blocked places and out of the water', () => {
    expect(placeShrubs(t, roads, open, null, 50, () => true)).toHaveLength(0);
    // Water above the ground everywhere.
    expect(placeShrubs(t, roads, open, 600, 50, () => false)).toHaveLength(0);
  });
});
