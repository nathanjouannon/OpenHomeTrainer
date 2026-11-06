// Ground materials of the terrain (lot 2.4) and their mix at each heightmap
// sample: the splat weights, from the slope, the altitude, the distance to
// the road and the forest cover. The shader refines the mix per pixel (height
// blending, noise). No Three.js here, so that it can be tested.

/** Texture layers of the terrain, in the order of the texture arrays. */
export const TERRAIN_LAYERS = ['grass', 'meadow', 'dirt', 'rock', 'scree', 'snow'] as const;
export type TerrainLayer = (typeof TERRAIN_LAYERS)[number];
export const LAYER_COUNT = TERRAIN_LAYERS.length;

/** Size of one repetition of each layer's texture (m). */
export const LAYER_TILE_M: Record<TerrainLayer, number> = {
  grass: 2.5,
  meadow: 3.5,
  dirt: 3,
  rock: 6,
  scree: 3,
  snow: 4,
};

export interface SplatInput {
  /** Absolute altitude (m). */
  altitudeM: number;
  /** Vertical component of the terrain normal (1 = flat, 0 = vertical). */
  up: number;
  /** Horizontal distance to the nearest road axis (m), Infinity when far. */
  roadDistM: number;
  /** Forest cover, 0..1. */
  forest: number;
  /** Lake level (m), null without a lake. */
  waterLevelM: number | null;
  /** Two independent noise values in 0..1 (low-frequency patches). */
  noiseA: number;
  noiseB: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The grass gives way to mountain ground between these altitudes (m). */
export const ALPINE_FROM_M = 600;
export const ALPINE_FULL_M = 1000;

/** The verges of the road end at this distance from the axis (VERGE_OUTER_M). */
const VERGE_EDGE_M = 6.5;

/**
 * Weights of the terrain layers (sum 1) at one sample. Writes into `out`
 * (length LAYER_COUNT) and returns it.
 */
export function terrainSplat(i: SplatInput, out = new Float32Array(LAYER_COUNT)): Float32Array {
  const { altitudeM: z, up, noiseA, noiseB } = i;
  // Cliffs and steep slopes: bare rock, earlier higher up (thinner soil).
  const rockUp = 0.8 + smoothstep(1200, 1900, z) * 0.08 + (noiseA - 0.5) * 0.06;
  const rock = smoothstep(rockUp, rockUp - 0.14, up);
  // Mountain ground replaces the soil and the grass from 600 m, mostly by
  // 1000 m (lot 2.14): the roads of the passes run through scree, not lawns.
  const alpine = smoothstep(ALPINE_FROM_M, ALPINE_FULL_M, z);
  const alpineScree = (1 - rock) * alpine * (0.4 + 0.3 * noiseB);
  // Scree at the foot of the cliffs and on the high slopes.
  const high = smoothstep(1250, 1550, z);
  const scree =
    (1 - rock) * high * smoothstep(0.96, 0.86, up) * (0.55 + noiseB * 0.45) +
    (1 - rock) * high * smoothstep(0.65, 0.9, noiseB) * 0.35 +
    alpineScree;
  // Snow above ~1900 m, holding on gentle slopes only.
  const snowLine = 1880 + (noiseA - 0.5) * 160;
  const snow = smoothstep(snowLine, snowLine + 120, z) * smoothstep(0.72, 0.88, up);
  // Bare ground: forest floor, worn strip along the shoulders, lake shore.
  const roadside = smoothstep(VERGE_EDGE_M + 2.5, VERGE_EDGE_M, i.roadDistM) * 0.4;
  const shore =
    i.waterLevelM === null ? 0 : smoothstep(i.waterLevelM + 3, i.waterLevelM + 0.5, z) * 0.6;
  // Only dense woods bare their floor; sparse trees stand in the grass.
  const forestFloor = smoothstep(0.6, 1, i.forest) * 0.45;
  const dirt = Math.max(forestFloor, roadside, shore) * (1 - rock);
  // Pastures: patches everywhere, more of them above the valley floor and
  // in the woods (grass mixed with bare ground).
  const pasture =
    smoothstep(0.45, 0.75, noiseA) * 0.7 +
    smoothstep(700, 1300, z) * 0.4 +
    i.forest * 0.4 +
    alpine * 2;
  const soft = Math.max(0, 1 - rock - scree - snow - dirt);
  const meadow = soft * Math.min(1, pasture);
  const grass = soft - meadow;
  out[0] = grass;
  out[1] = meadow;
  out[2] = dirt;
  out[3] = rock;
  out[4] = scree;
  out[5] = snow;
  let sum = 0;
  for (let k = 0; k < LAYER_COUNT; k++) sum += out[k] as number;
  if (sum <= 1e-6) {
    out.fill(0);
    out[0] = 1;
    return out;
  }
  for (let k = 0; k < LAYER_COUNT; k++) out[k] = (out[k] as number) / sum;
  return out;
}

export interface SplatTerrain {
  sizeM: number;
  samples: number;
  heights: Float32Array;
  roadDistM?: Float32Array;
}

/**
 * Splat weights of every heightmap sample, LAYER_COUNT bytes per sample
 * (0..255), from the per-sample normals (3 floats per sample, scene frame:
 * Y up) and the forest cover.
 */
export function computeSplatMap(
  t: SplatTerrain,
  normals: Float32Array,
  waterLevelM: number | null,
  forest: (x: number, y: number, z: number) => number,
  noise: (x: number, y: number) => number,
): Uint8Array {
  const s = t.samples;
  const cell = t.sizeM / (s - 1);
  const half = t.sizeM / 2;
  const out = new Uint8Array(s * s * LAYER_COUNT);
  const w = new Float32Array(LAYER_COUNT);
  const input: SplatInput = {
    altitudeM: 0,
    up: 1,
    roadDistM: Number.POSITIVE_INFINITY,
    forest: 0,
    waterLevelM,
    noiseA: 0,
    noiseB: 0,
  };
  for (let r = 0; r < s; r++) {
    const y = half - r * cell;
    for (let c = 0; c < s; c++) {
      const i = r * s + c;
      const x = -half + c * cell;
      input.altitudeM = t.heights[i] as number;
      input.up = normals[i * 3 + 1] as number;
      input.roadDistM = t.roadDistM?.[i] ?? Number.POSITIVE_INFINITY;
      input.forest = forest(x, y, input.altitudeM);
      input.noiseA = noise(x / 260, y / 260);
      input.noiseB = noise(x / 70 + 31.7, y / 70 - 12.3);
      terrainSplat(input, w);
      for (let k = 0; k < LAYER_COUNT; k++) {
        out[i * LAYER_COUNT + k] = Math.round((w[k] as number) * 255);
      }
    }
  }
  return out;
}
