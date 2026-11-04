import { describe, expect, it } from 'vitest';
import { SPECIES_INDEX } from './plants';
import {
  batchPlants,
  buildClump,
  buildImposter,
  buildModel,
  buildShadowModel,
  FOLIAGE_UV,
  grassUv,
  instanceTint,
  MODEL_SIZE,
  type ModelName,
  type PlantInstance,
} from './vegetation-builders';
import type { Terrain } from './world-data';

const NAMES = Object.keys(MODEL_SIZE) as ModelName[];
const triangles = (g: { index: { count: number } | null }) => (g.index?.count ?? 0) / 3;

describe('tree models', () => {
  for (const name of NAMES) {
    describe(name, () => {
      const lod0 = buildModel(name, 0);
      const lod1 = buildModel(name, 1);

      it('is well formed: finite positions, unit normals, UVs inside the atlas', () => {
        for (const g of [lod0, lod1]) {
          const p = g.getAttribute('position');
          const n = g.getAttribute('normal');
          const uv = g.getAttribute('uv');
          for (let i = 0; i < p.count; i++) {
            expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
            expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 3);
            expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
            expect(uv.getX(i)).toBeLessThanOrEqual(1);
            expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
            expect(uv.getY(i)).toBeLessThanOrEqual(1);
          }
        }
      });

      it('is about as tall as announced and stands on the ground', () => {
        const box = lod0.boundingBox;
        expect(box).not.toBeNull();
        if (!box) return;
        const { heightM } = MODEL_SIZE[name];
        expect(box.min.y).toBeGreaterThanOrEqual(-0.6);
        expect(box.min.y).toBeLessThanOrEqual(0.3);
        expect(box.max.y).toBeGreaterThan(heightM * 0.7);
        expect(box.max.y).toBeLessThan(heightM * 1.3);
      });

      it('gets much lighter at the next level of detail, with the same height', () => {
        expect(triangles(lod1)).toBeLessThan(triangles(lod0) * 0.5);
        expect(triangles(lod1)).toBeGreaterThan(10);
        expect(triangles(lod0)).toBeLessThan(5000);
        const h0 = lod0.boundingBox?.max.y ?? 0;
        const h1 = lod1.boundingBox?.max.y ?? 0;
        expect(h1).toBeGreaterThan(h0 * 0.75);
        expect(h1).toBeLessThan(h0 * 1.25);
      });

      it('has a silhouette for the shadows, lighter than the model', () => {
        const shadow = buildShadowModel(name);
        expect(shadow.getAttribute('position').count).toBeGreaterThan(0);
        expect(shadow.getAttribute('position').count / 3).toBeLessThan(triangles(lod0));
      });
    });
  }

  it('paints the bark with the opaque texel of the atlas', () => {
    const lod0 = buildModel('beech', 0);
    const uv = lod0.getAttribute('uv');
    const s = FOLIAGE_UV.solid;
    // The first vertices belong to the trunk.
    expect(uv.getX(0)).toBeGreaterThanOrEqual(s.u0);
    expect(uv.getX(0)).toBeLessThanOrEqual(s.u1);
  });
});

describe('imposters', () => {
  it('stand on the ground with the height and width of their tree', () => {
    const g = buildImposter('spruce', grassUv('grass'), 3);
    // 3 crossed quads, a card on each side.
    expect(triangles(g)).toBe(12);
    const box = g.boundingBox;
    expect(box?.min.y).toBeCloseTo(0, 5);
    expect(box?.max.y).toBeCloseTo(MODEL_SIZE.spruce.heightM, 5);
    expect((box?.max.x ?? 0) - (box?.min.x ?? 0)).toBeCloseTo(MODEL_SIZE.spruce.widthM, 1);
  });
});

describe('grass clumps', () => {
  it('are crossed quads with a bend of 0 at the root and 1 at the tip', () => {
    const g = buildClump(grassUv('grass'), 0.8, 0.5, 3);
    expect(triangles(g)).toBe(6);
    const bend = g.getAttribute('bend');
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(bend.getX(i)).toBe(p.getY(i) > 0 ? 1 : 0);
    // Normals point up.
    expect(g.getAttribute('normal').getY(0)).toBe(1);
  });
});

describe('batchPlants', () => {
  const t: Terrain = {
    sizeM: 8000,
    samples: 3,
    heights: new Float32Array(9),
    minElevationM: 0,
  };
  const plant = (x: number, y: number, species: PlantInstance['species']): PlantInstance => ({
    x,
    y,
    z: 100,
    scale: 1,
    rotation: 0,
    tint: 0.5,
    species,
  });

  it('groups the plants by chunk, with their species and colour', () => {
    const batches = batchPlants(
      [plant(-3900, 3900, 'spruce'), plant(-3800, 3800, 'beech'), plant(3900, -3900, 'pine')],
      t,
      0,
    );
    expect(batches).toHaveLength(2);
    const first = batches.find((b) => b.count === 2);
    expect(first).toBeDefined();
    expect(Array.from(first?.species ?? [])).toEqual([SPECIES_INDEX.spruce, SPECIES_INDEX.beech]);
    // Scene frame: x east, y up (altitude − base − the sunk root), z south.
    expect(first?.matrices[12]).toBe(-3900);
    expect(first?.matrices[13]).toBeCloseTo(99.7, 5);
    expect(first?.matrices[14]).toBe(-3900);
    expect(first?.colors.every((c) => c > 0)).toBe(true);
  });

  it('colours each species differently', () => {
    const a = instanceTint('spruce', 0.5);
    const b = instanceTint('pine', 0.5);
    expect(a.equals(b)).toBe(false);
  });
});
