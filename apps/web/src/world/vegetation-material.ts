// Materials of the vegetation (lot 2.6).
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
  MeshStandardMaterial,
  type Texture,
} from 'three';
import { attribute, positionLocal, sin, transformNormalToView, uniform, vec3 } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

/** Alpha threshold of the cards (low enough for the mipmaps not to eat the foliage). */
export const FOLIAGE_ALPHA_TEST = 0.4;

export function createFoliageMaterial(map: Texture): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map,
    vertexColors: true,
    alphaTest: FOLIAGE_ALPHA_TEST,
    roughness: 0.85,
    metalness: 0,
    side: DoubleSide,
  });
}

export function createImposterMaterial(map: Texture): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map,
    vertexColors: true,
    alphaTest: FOLIAGE_ALPHA_TEST,
    roughness: 0.9,
    metalness: 0,
    side: FrontSide,
  });
}

/** Shadow-only copies: opaque silhouettes, no picture. */
export const createShadowMaterial = (): Material => new MeshBasicMaterial();

export interface GrassMaterial {
  material: MeshStandardNodeMaterial;
  /** Animation time (s): set `.value` every frame. */
  time: { value: number };
}

/** Wind: two slow waves travelling across the field, strongest at the tips. */
export function createGrassMaterial(map: Texture, strength = 1): GrassMaterial {
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
  material.positionNode = p.add(vec3(sway, 0, sway.mul(0.6)));
  material.normalNode = transformNormalToView(vec3(0, 1, 0));
  return { material, time: time as unknown as { value: number } };
}
