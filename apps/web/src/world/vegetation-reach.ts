// Reach of the vegetation around the camera (lot 2.13, docs/16 §5): trees,
// shrubs and grass reach further in front of the camera than behind it, and
// fade in and out instead of popping.
//   - The distance that decides a plant's tier is a "reach distance": the
//     horizontal distance with what lies ahead divided by REACH_AHEAD and what
//     lies behind by REACH_BEHIND. A tier that ended at 40 m now ends 64 m
//     ahead and 30 m behind, for about the same number of plants.
//   - Tier changes are dithered: across a band around each tier limit, both
//     tiers are drawn and each pixel keeps one of them (screen-space noise),
//     so a tree dissolves into its next level of detail.
//   - The grass rises out of the ground over the last metres of its reach and
//     thins out with distance (whole clumps sink, by rank).

// No Three.js here but a type (plants.ts uses it); the shader side is in
// vegetation-material.ts.

import type { Camera } from 'three';

export const REACH_AHEAD = 1.6;
export const REACH_BEHIND = 0.75;

/** Horizontal direction of the camera (scene x, z), unit; kept when it looks straight down. */
export interface ViewDirection {
  x: number;
  z: number;
}

/** Updates `out` with the horizontal direction the camera looks at. */
export function viewDirection(camera: Camera, out: ViewDirection): ViewDirection {
  const e = camera.matrixWorld.elements;
  // The camera looks down its local -Z axis.
  const x = -(e[8] as number);
  const z = -(e[10] as number);
  const len = Math.hypot(x, z);
  if (len > 1e-3) {
    out.x = x / len;
    out.z = z / len;
  }
  return out;
}

/** Reach distance of an offset (dx, dz) from the camera, looking along `dir`. */
export function reachDistance(dx: number, dz: number, dir: ViewDirection): number {
  const ahead = dx * dir.x + dz * dir.z;
  const side = dx * dir.z - dz * dir.x;
  const a = ahead / (ahead > 0 ? REACH_AHEAD : REACH_BEHIND);
  return Math.sqrt(a * a + side * side);
}

/** Half width of the dithered band around a tier limit at `limitM` (reach metres). */
export const fadeBandM = (limitM: number) => Math.max(3, limitM * 0.12);

/**
 * Margin added on the CPU side around a band: the GPU fades by pixel, and a
 * pixel of a tree lies up to its crown radius (and its height, leaning) away
 * from the instance origin the CPU tests.
 */
export const PLANT_REACH_MARGIN_M = 8;

// ------------------------------------------------------------------- grass

/** Fade of the grass at the edge of its reach and thinning with distance (reach metres). */
export interface GrassFade {
  /** Full density up to `thinFromM`, then fewer and fewer clumps... */
  thinFromM: number;
  /** ...down to `keepFar` of them at `fullM`... */
  fullM: number;
  keepFar: number;
  /** ...and none at `fullM + fadeM`. */
  fadeM: number;
}

/**
 * Slots of tiles for a grass radius (reach metres): the reach shape (REACH_AHEAD
 * ahead, REACH_BEHIND behind) grown by the release slack and half a tile.
 */
export function grassSlots(radiusM: number, tileM: number): number {
  const r = radiusM + tileM * 1.5;
  const area = (Math.PI / 2) * (REACH_AHEAD * r * r + REACH_BEHIND * r * r);
  return Math.ceil(area / tileM ** 2) + 16;
}

/**
 * Fade of the grass for a radius (reach metres). A tile is drawn when its
 * centre is within the radius, so the field is only complete half a tile
 * diagonal inside it: the clumps are all gone there, rising out of the ground
 * over `fadeM` before it, and thin out from half the way on.
 */
export function grassFadeFor(radiusM: number, tileM: number): GrassFade {
  const complete = radiusM - tileM * Math.SQRT1_2;
  const fadeM = Math.max(6, radiusM * 0.18);
  const fullM = Math.max(1, complete - fadeM);
  return { thinFromM: fullM * 0.5, fullM, keepFar: 0.45, fadeM };
}
