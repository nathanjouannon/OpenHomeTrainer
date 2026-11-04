// Material of the avatar body (lot 2.10), in TSL: the PBR skin of the model
// (colour, normal and roughness maps) where nothing is worn, and the cycling
// kit where the garment mask says so. The mask is sampled with filtering and
// cut at 0.5, which gives a clean edge to the garments. On the kit the muscles
// of the skin normal map are flattened (cloth does not show them), a fine knit
// breaks up the flat colour, and trims are drawn from a per-vertex attribute
// `kit` = (distance to the jersey hem, distance to the shorts hem, rest height).

import { Color, type DataTexture, type MeshStandardMaterial, type Texture } from 'three';
import {
  attribute,
  float,
  mix,
  mx_noise_float,
  normalize,
  normalMap,
  normalView,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

export interface KitColors {
  jersey: string;
  /** Collar, cuffs and hem of the jersey, chest band. */
  jerseyTrim: string;
  shorts: string;
  shortsTrim: string;
  /** Socks and shoes. */
  white: string;
  sole: string;
  gloves: string;
}

/** Roughness of the cloth of each channel of the mask (jersey, shorts, socks/shoes, gloves). */
const CLOTH_ROUGHNESS = [0.8, 0.85, 0.55, 0.75] as const;

/** Edges of the cut of the mask (it is 0.5 on the garment edge). */
const CUT = [0.4, 0.6] as const;

/** Width (m) of the trims at the hems, and the chest band (rest height, m). */
const TRIM_M = 0.035;
const BAND_Y = [1.255, 1.3] as const;
/** Height (m) of the sole of the shoes. */
const SOLE_Y = 0.028;
/** Frequency of the knit in UV space, and its share of the colour. */
const KNIT_FREQ = 900;
const KNIT_AMOUNT = 0.07;

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
  const hems: N = attribute('kit', 'vec3');
  const color = (c: string) => uniform(new Color(c));

  // Trims: a band just inside each hem, and a band across the chest.
  const edge = (distance: N, width: number) =>
    smoothstep(width + 0.004, width - 0.004, distance).mul(smoothstep(-0.004, 0.0, distance));
  const jerseyBand = smoothstep(BAND_Y[0] - 0.003, BAND_Y[0] + 0.003, hems.z).mul(
    smoothstep(BAND_Y[1] + 0.003, BAND_Y[1] - 0.003, hems.z),
  );
  const jersey: N = mix(
    mix(color(kit.jersey), color(kit.jerseyTrim), jerseyBand),
    color(kit.jerseyTrim),
    edge(hems.x, TRIM_M),
  );
  const shorts: N = mix(color(kit.shorts), color(kit.shortsTrim), edge(hems.y, 0.03));
  const white: N = mix(
    color(kit.white),
    color(kit.sole),
    smoothstep(SOLE_Y + 0.004, SOLE_Y - 0.004, hems.z),
  );
  const cloth = [jersey, shorts, white, color(kit.gloves)];

  let albedo: N = skin.map ? texture(skin.map, coords).rgb : color('#d9a27e');
  let roughness: N = skin.roughnessMap
    ? texture(skin.roughnessMap as Texture, coords).g
    : float(0.8);
  const knit = mx_noise_float(coords.mul(KNIT_FREQ)).mul(KNIT_AMOUNT).add(1);
  cloth.forEach((c, i) => {
    const w = [m.x, m.y, m.z, m.w][i];
    albedo = mix(albedo, c.mul(knit), w);
    roughness = mix(roughness, CLOTH_ROUGHNESS[i] as number, w);
  });
  material.colorNode = albedo;
  material.roughnessNode = roughness;

  if (skin.normalMap) {
    const scale = vec2(skin.normalScale.x, skin.normalScale.y);
    const worn = m.x.max(m.y).max(m.z).max(m.w);
    material.normalNode = normalize(
      mix(normalMap(texture(skin.normalMap, coords), scale), normalView, worn),
    );
  }
  return material;
}
