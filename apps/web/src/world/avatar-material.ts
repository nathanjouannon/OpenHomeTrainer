// Material of the avatar body (lot 2.10), in TSL: the PBR skin of the model
// (colour, normal and roughness maps) where nothing is worn, and the cycling
// kit where the garment mask says so. The mask is sampled with filtering and
// cut at 0.5, which gives a clean edge to the garments.

import { Color, type DataTexture, type MeshStandardMaterial, type Texture } from 'three';
import { mix, smoothstep, texture, uniform, uv } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

export interface KitColors {
  jersey: string;
  shorts: string;
  /** Socks and shoes. */
  white: string;
  gloves: string;
}

/** Roughness of the cloth of each channel of the mask (jersey, shorts, socks/shoes, gloves). */
const CLOTH_ROUGHNESS = [0.78, 0.82, 0.55, 0.75] as const;

/** Edges of the cut of the mask (it is 0.5 on the garment edge). */
const CUT = [0.4, 0.6] as const;

// biome-ignore lint/suspicious/noExplicitAny: TSL graphs are untyped (see terrain-material.ts)
type N = any;

export function createAvatarMaterial(
  skin: MeshStandardMaterial,
  mask: DataTexture,
  kit: KitColors,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0, roughness: 1 });
  const coords = uv();
  const m: N = smoothstep(CUT[0], CUT[1], texture(mask, coords));
  const channels = [m.x, m.y, m.z, m.w];
  const colors = [kit.jersey, kit.shorts, kit.white, kit.gloves].map((c) => uniform(new Color(c)));

  let color: N = skin.map
    ? texture(skin.map, coords).rgb
    : uniform(skin.color ?? new Color('#d9a27e'));
  let roughness: N = roughnessOf(skin.roughnessMap, coords);
  channels.forEach((w, i) => {
    color = mix(color, colors[i] as N, w);
    roughness = mix(roughness, CLOTH_ROUGHNESS[i] as number, w);
  });
  material.colorNode = color;
  material.roughnessNode = roughness;
  if (skin.normalMap) {
    material.normalMap = skin.normalMap;
    material.normalScale.copy(skin.normalScale);
  }
  return material;
}

function roughnessOf(map: Texture | null, coords: N): N {
  return map ? texture(map, coords).g : uniform(0.8);
}
