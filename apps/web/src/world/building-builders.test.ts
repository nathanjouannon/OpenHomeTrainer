import { describe, expect, it } from 'vitest';
import { buildBuildings } from './building-builders';
import {
  type BuildingStyle,
  CHALET_STYLES,
  chaletShare,
  PLAIN_STYLES,
  pickHouseStyle,
  STYLE_DIMS,
} from './building-styles';
import type { Building } from './settlements';
import { mulberry32 } from './world-data';

const ALL: BuildingStyle[] = [...PLAIN_STYLES, ...CHALET_STYLES, 'barn', 'barn-alpine'];

function sample(style: BuildingStyle, withLot: boolean): Building {
  const d = STYLE_DIMS[style];
  return {
    x: 100,
    y: 50,
    z: 500,
    groundM: 499.6,
    yaw: 0.7,
    width: (d.width[0] + d.width[1]) / 2,
    depth: (d.depth[0] + d.depth[1]) / 2,
    wallHeight: (d.wallHeight[0] + d.wallHeight[1]) / 2,
    roofHeight: (d.roofHeight[0] + d.roofHeight[1]) / 2,
    kind: style.startsWith('barn') ? 'barn' : 'house',
    style,
    wallTint: 2,
    roofTint: 1,
    lot: withLot
      ? { fence: 'picket', frontM: 4, gate: true, gravel: true, roadZ: 500.1, groundM: 499.5 }
      : undefined,
  };
}

const triangles = (g: ReturnType<typeof buildBuildings>) =>
  Object.values(g).reduce((n, geo) => n + geo.getAttribute('position').count / 3, 0);

describe('building styles', () => {
  it('has ten plain-land houses and five chalets', () => {
    expect(PLAIN_STYLES).toHaveLength(10);
    expect(CHALET_STYLES).toHaveLength(5);
  });

  it('chooses chalets by altitude: none in the plain, all at the pass', () => {
    expect(chaletShare(450)).toBe(0);
    expect(chaletShare(544)).toBe(0);
    expect(chaletShare(862)).toBe(1);
    expect(chaletShare(675)).toBeGreaterThan(0.3);
    expect(chaletShare(675)).toBeLessThan(0.7);
    const rand = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      expect(CHALET_STYLES).toContain(pickHouseStyle(900, rand));
      expect(PLAIN_STYLES).toContain(pickHouseStyle(450, rand));
    }
  });

  it('uses every style of a range in a village', () => {
    const rand = mulberry32(7);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickHouseStyle(450, rand));
    expect(seen.size).toBe(PLAIN_STYLES.length);
  });
});

describe('building geometry', () => {
  for (const style of ALL) {
    it(`builds ${style} with finite vertices and a modest triangle count`, () => {
      const g = buildBuildings([sample(style, false)], 400);
      expect(triangles(g)).toBeGreaterThan(20);
      expect(triangles(g)).toBeLessThan(600);
      for (const geo of Object.values(g)) {
        for (const v of geo.getAttribute('position').array) expect(Number.isFinite(v)).toBe(true);
      }
    });
  }

  it('adds fences, gate pillars and a gravel path for a lot', () => {
    for (const style of ALL.filter((s) => !s.startsWith('barn'))) {
      const bare = triangles(buildBuildings([sample(style, false)], 400));
      const lot = triangles(buildBuildings([sample(style, true)], 400));
      expect(lot, style).toBeGreaterThan(bare + 10);
    }
  });

  it('keeps every building within its footprint, plus balconies, roofs and its lot', () => {
    for (const style of ALL) {
      const b = sample(style, true);
      const g = buildBuildings([b], 400);
      const reach = Math.hypot(b.width, b.depth) / 2 + 5 + (b.lot?.frontM ?? 0);
      for (const geo of Object.values(g)) {
        const p = geo.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          // Scene frame: x east, z south.
          const dx = p.getX(i) - b.x;
          const dy = -p.getZ(i) - b.y;
          expect(Math.hypot(dx, dy), `${style}`).toBeLessThan(reach);
          // Nothing under the ground by more than the foundations, or above the roof.
          const h = p.getY(i) + 400 - b.z;
          expect(h).toBeLessThan(b.wallHeight + b.roofHeight + 7);
          expect(h).toBeGreaterThan(-1.5);
        }
      }
    }
  });
});
