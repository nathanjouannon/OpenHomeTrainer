// Catalogue of building styles (lot 2.16): ten plain-land houses, five chalets,
// two barns, and the choice between them from the altitude. No Three.js.

export const PLAIN_STYLES = [
  'gable',
  'hip',
  'villa',
  'gables',
  'bungalow',
  'balcony',
  'longere',
  'town',
  'garage',
  'shutters',
] as const;

export const CHALET_STYLES = [
  'chalet-classic',
  'chalet-garage',
  'chalet-black',
  'chalet-slats',
  'chalet-small',
] as const;

export type HouseStyle = (typeof PLAIN_STYLES)[number] | (typeof CHALET_STYLES)[number];
export type BuildingStyle = HouseStyle | 'barn' | 'barn-alpine';

/** Below this altitude (m) every house is a plain-land house. */
export const CHALET_FROM_M = 550;
/** From this altitude (m) every house is a chalet (the pass village stands higher). */
export const CHALET_FULL_M = 800;

/** Share of chalets (0..1) at an altitude: a smooth ramp between the two limits. */
export function chaletShare(altitudeM: number): number {
  const t = Math.min(1, Math.max(0, (altitudeM - CHALET_FROM_M) / (CHALET_FULL_M - CHALET_FROM_M)));
  return t * t * (3 - 2 * t);
}

export function isChalet(style: BuildingStyle): boolean {
  return (CHALET_STYLES as readonly string[]).includes(style);
}

/** A house style for an altitude; `rand` gives numbers in [0, 1). */
export function pickHouseStyle(altitudeM: number, rand: () => number): HouseStyle {
  const list = rand() < chaletShare(altitudeM) ? CHALET_STYLES : PLAIN_STYLES;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))] as HouseStyle;
}

export function pickBarnStyle(altitudeM: number, rand: () => number): 'barn' | 'barn-alpine' {
  return rand() < chaletShare(altitudeM) ? 'barn-alpine' : 'barn';
}

type Range = readonly [number, number];

/** Footprint and heights of each style (m): width, depth, wall height, roof rise. */
export const STYLE_DIMS: Record<
  BuildingStyle,
  { width: Range; depth: Range; wallHeight: Range; roofHeight: Range }
> = {
  gable: { width: [7, 13], depth: [7, 12], wallHeight: [5, 8.5], roofHeight: [2, 3.5] },
  hip: { width: [8, 12], depth: [8, 11], wallHeight: [5, 7], roofHeight: [2.2, 3.2] },
  villa: { width: [9, 12], depth: [8.5, 11], wallHeight: [6.5, 8], roofHeight: [2.4, 3] },
  gables: { width: [11, 14], depth: [9, 11], wallHeight: [6, 8], roofHeight: [3.5, 4.5] },
  bungalow: { width: [11, 14], depth: [9, 11], wallHeight: [3, 3.4], roofHeight: [0, 0] },
  balcony: { width: [8, 11], depth: [8, 10], wallHeight: [5.5, 7], roofHeight: [2.6, 3.4] },
  longere: { width: [12, 15], depth: [7, 8.5], wallHeight: [3.2, 4.2], roofHeight: [2.6, 3.2] },
  town: { width: [6.5, 8], depth: [9, 11], wallHeight: [8, 9.5], roofHeight: [3, 3.8] },
  garage: { width: [11, 14], depth: [8, 10], wallHeight: [5, 6.5], roofHeight: [2.2, 3] },
  shutters: { width: [8, 12], depth: [7.5, 10], wallHeight: [5.5, 7], roofHeight: [2.4, 3.4] },
  'chalet-classic': { width: [8, 11], depth: [8, 10], wallHeight: [5, 6], roofHeight: [3, 3.8] },
  'chalet-garage': { width: [10, 13], depth: [9, 11], wallHeight: [6.5, 7.5], roofHeight: [3, 4] },
  'chalet-black': { width: [9, 12], depth: [9, 11], wallHeight: [6, 7], roofHeight: [3.5, 4.5] },
  'chalet-slats': { width: [10, 13], depth: [8.5, 10.5], wallHeight: [6, 7], roofHeight: [3, 3.8] },
  'chalet-small': {
    width: [7, 9.5],
    depth: [7, 9],
    wallHeight: [4.5, 5.5],
    roofHeight: [2.4, 3.2],
  },
  barn: { width: [16, 24], depth: [10, 14], wallHeight: [6, 8], roofHeight: [3, 3] },
  'barn-alpine': { width: [14, 20], depth: [10, 13], wallHeight: [5.5, 7], roofHeight: [3.2, 3.2] },
};

/** Garden enclosure between the street and a house. */
export interface Lot {
  fence: 'hedge' | 'picket' | 'wall';
  /** Distance from the facade to the fence line (m). */
  frontM: number;
  /** Gate in the fence and a gravel path from it to the front door. */
  gate: boolean;
  gravel: boolean;
  /** Level of the street side of the lot (m). */
  roadZ: number;
  /** Lowest ground along the fence line (m): the fence goes down to it. */
  groundM: number;
}

/** Depth of the garden of a lot, from the facade to the fence line (m). */
export const LOT_FRONT_MIN_M = 3.4;
/** Free strip kept on each side of a decorated house (the gap to the neighbours is 3 m or more). */
export const LOT_MARGIN_M = 1.2;

/** Kind of fence of a decorated plot, or null for a house without garden decoration. */
export function pickFence(style: BuildingStyle, rand: () => number): Lot['fence'] | null {
  const chance = isChalet(style) ? 0.4 : style === 'bungalow' || style === 'villa' ? 0.7 : 0.5;
  if (rand() >= chance) return null;
  const r = rand();
  if (isChalet(style)) return r < 0.5 ? 'wall' : 'picket';
  return r < 0.4 ? 'hedge' : r < 0.75 ? 'picket' : 'wall';
}
