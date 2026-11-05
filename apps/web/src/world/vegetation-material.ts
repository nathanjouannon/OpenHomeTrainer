// Materials of the vegetation (lot 2.6; fades of lot 2.13, see vegetation-reach.ts).
//   - foliage: alpha-tested cards with vertex colours (ambient occlusion) and
//     a colour multiplier per instance;
//   - imposters: the same, one-sided;
//   - grass and flowers (TSL): the wind bends the tips of the blades, the
//     shading normal is fixed to "up" so that the ground and the grass on it
//     are lit alike, whichever face of the card is seen.

import {
  DoubleSide,
  FrontSide,
  type Material,
  MeshBasicMaterial,
  type Texture,
  Vector2,
} from 'three';
import {
  attribute,
  float,
  hash,
  instanceIndex,
  interleavedGradientNoise,
  positionLocal,
  positionWorld,
  screenCoordinate,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import { fadeBandM, type GrassFade, REACH_AHEAD, REACH_BEHIND } from './vegetation-reach';

/** Alpha threshold of the cards (low enough for the mipmaps not to eat the foliage). */
export const FOLIAGE_ALPHA_TEST = 0.4;

/**
 * Leaves, branches and trunks of the full models and LOD 1. With `fade`, the
 * material dithers in and out at the limits of its tier (see TierFade).
 */
export function createFoliageMaterial(
  map: Texture,
  fade?: { reach: ReachUniforms; tier: TierFade },
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    map,
    vertexColors: true,
    alphaTest: FOLIAGE_ALPHA_TEST,
    roughness: 0.85,
    metalness: 0,
    side: DoubleSide,
  });
  if (fade) material.maskNode = tierMaskNode(fade.reach, fade.tier);
  return material;
}

export function createImposterMaterial(
  map: Texture,
  fade?: { reach: ReachUniforms; tier: TierFade },
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    map,
    vertexColors: true,
    alphaTest: FOLIAGE_ALPHA_TEST,
    roughness: 0.9,
    metalness: 0,
    side: FrontSide,
  });
  if (fade) material.maskNode = tierMaskNode(fade.reach, fade.tier);
  return material;
}

/** Shadow-only copies: opaque silhouettes, no picture. */
export const createShadowMaterial = (): Material => new MeshBasicMaterial();

export interface GrassMaterial {
  material: MeshStandardNodeMaterial;
  /** Animation time (s): set `.value` every frame. */
  time: { value: number };
}

/**
 * Wind: two slow waves travelling across the field, strongest at the tips.
 * With `fade`, the clumps sink under the ground towards the edge of the reach.
 */
export function createGrassMaterial(
  map: Texture,
  strength = 1,
  fade?: { reach: ReachUniforms; grass: GrassFadeNodes },
): GrassMaterial {
  const time = uniform(0);
  const material = new MeshStandardNodeMaterial({
    map,
    alphaTest: FOLIAGE_ALPHA_TEST,
    roughness: 0.92,
    metalness: 0,
    side: DoubleSide,
  });
  // After instancing, `positionLocal` is the world position (the meshes sit at the origin).
  const p = positionLocal;
  const bend = attribute('bend', 'float');
  const phase = p.x.mul(0.37).add(p.z.mul(0.23));
  const gust = sin(time.mul(1.7).add(phase))
    .mul(0.6)
    .add(sin(time.mul(3.1).add(phase.mul(2.3))).mul(0.4));
  const sway = bend
    .mul(bend)
    .mul(gust)
    .mul(0.16 * strength);
  const sink = fade ? grassSinkNode(reachNode(fade.reach, p), fade.grass) : float(0);
  material.positionNode = p.add(vec3(sway, sink.negate(), sway.mul(0.6)));
  material.normalNode = transformNormalToView(vec3(0, 1, 0));
  return { material, time: time as unknown as { value: number } };
}

// ------------------------------------------------------- reach and fades (2.13)

/**
 * Camera position and horizontal direction seen by a group of vegetation
 * materials. The position follows the camera every frame; the direction only
 * changes when the CPU sorts the plants again (with it), so that a quick turn
 * of the camera never fades out plants the CPU has not moved to another tier.
 */
export interface ReachUniforms {
  camera: { value: Vector2 };
  dir: { value: Vector2 };
}

export function createReachUniforms(): ReachUniforms {
  return { camera: uniform(new Vector2()), dir: uniform(new Vector2(0, -1)) };
}

const uniformNodes = (u: ReachUniforms) =>
  u as unknown as { camera: Node<'vec2'>; dir: Node<'vec2'> };

/** Reach distance of a world position (scene frame), as `reachDistance`. */
export function reachNode(u: ReachUniforms, position: Node<'vec3'>): Node<'float'> {
  const { camera, dir } = uniformNodes(u);
  const d = vec2(position.x, position.z).sub(camera);
  const ahead = d.dot(dir);
  const side = d.x.mul(dir.y).sub(d.y.mul(dir.x));
  const a = ahead.div(ahead.greaterThan(0).select(float(REACH_AHEAD), float(REACH_BEHIND)));
  return a.mul(a).add(side.mul(side)).sqrt();
}

/** Tier limits of one material, in reach metres; null when that side does not fade. */
export interface TierFade {
  /** Limit with the previous (closer) tier. */
  inner: number | null;
  /** Limit with the next tier, or where the plants vanish. */
  outer: number | null;
}

/**
 * Mask of a tier (true where the pixel is kept). With the same noise on both
 * sides of a limit, the closer tier keeps a pixel where `noise < 1 - s` and
 * the farther one where `noise >= 1 - s`: each pixel shows exactly one tier.
 */
export function tierMaskNode(u: ReachUniforms, fade: TierFade): Node<'bool'> | null {
  if (fade.inner === null && fade.outer === null) return null;
  const m = reachNode(u, positionWorld);
  const noise = interleavedGradientNoise(screenCoordinate.xy);
  const step = (limit: number) =>
    smoothstep(float(limit - fadeBandM(limit)), float(limit + fadeBandM(limit)), m);
  let keep: Node<'bool'> | null = null;
  if (fade.inner !== null) keep = noise.greaterThanEqual(float(1).sub(step(fade.inner)));
  if (fade.outer !== null) {
    const below = noise.lessThan(float(1).sub(step(fade.outer)));
    keep = keep ? keep.and(below) : below;
  }
  return keep;
}

/** GrassFade as shader values (uniforms, so that a new radius needs no new shader). */
export type GrassFadeNodes = { [K in keyof GrassFade]: Node<'float'> };

/** Depth the grass clumps sink under the ground where they fade out (m, taller than any clump). */
const GRASS_SINK_M = 1.4;

/**
 * How far a grass clump sinks under the ground (m) at the reach distance of
 * its vertex: whole clumps go down, ranked by instance, so the field thins out
 * and its edge rises out of the ground instead of popping.
 */
export function grassSinkNode(m: Node<'float'>, fade: GrassFadeNodes): Node<'float'> {
  const end = fade.fullM.add(fade.fadeM);
  const edge = smoothstep(fade.fullM, end, m);
  const keep = float(1).sub(
    smoothstep(fade.thinFromM, fade.fullM, m).mul(float(1).sub(fade.keepFar)),
  );
  const rank = hash(instanceIndex);
  // Clumps above the kept share go down over a short band, not all at once.
  const thin = smoothstep(keep.sub(0.04), keep.add(0.04), rank);
  return edge.max(thin).mul(GRASS_SINK_M);
}
