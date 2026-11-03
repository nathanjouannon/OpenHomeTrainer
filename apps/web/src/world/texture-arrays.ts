// Packs PBR texture sets (colour, normal, roughness, ambient occlusion,
// height) into two texture arrays, one layer per material (lot 2.4):
//   - albedo: sRGB colour darkened by its ambient occlusion, height in alpha;
//   - surface: normal X and Y (OpenGL convention) in RG, roughness in B.
// One array per kind keeps a single binding for all the materials of a shader.

import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { ASSETS_BASE_URL, type TextureSetFiles } from './asset-manifest';

export const ARRAY_TEXTURE_SIZE = 1024;
/** Share of the ambient occlusion baked into the colour. */
const AO_IN_ALBEDO = 0.6;

export interface TextureArrays {
  albedo: DataArrayTexture;
  surface: DataArrayTexture;
  layers: number;
}

async function pixels(url: string, size: number): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return ctx.getImageData(0, 0, size, size).data;
}

/** Writes one material into layer `layer` of the albedo and surface arrays. */
export function packLayer(
  layer: number,
  size: number,
  maps: {
    color: Uint8ClampedArray;
    normal: Uint8ClampedArray;
    roughness: Uint8ClampedArray;
    ao: Uint8ClampedArray | null;
    height: Uint8ClampedArray | null;
  },
  albedo: Uint8Array,
  surface: Uint8Array,
): void {
  const n = size * size;
  const o = layer * n * 4;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const ao = maps.ao ? (maps.ao[p] as number) / 255 : 1;
    const k = 1 - AO_IN_ALBEDO * (1 - ao);
    albedo[o + p] = (maps.color[p] as number) * k;
    albedo[o + p + 1] = (maps.color[p + 1] as number) * k;
    albedo[o + p + 2] = (maps.color[p + 2] as number) * k;
    albedo[o + p + 3] = maps.height ? (maps.height[p] as number) : 128;
    surface[o + p] = maps.normal[p] as number;
    surface[o + p + 1] = maps.normal[p + 1] as number;
    surface[o + p + 2] = maps.roughness[p] as number;
    surface[o + p + 3] = 255;
  }
}

function arrayTexture(data: Uint8Array, size: number, layers: number, srgb: boolean) {
  const t = new DataArrayTexture(data, size, size, layers);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Texture arrays of the given sets, in order; null if one of them cannot be loaded. */
export async function loadTextureArrays(
  sets: readonly TextureSetFiles[],
  size = ARRAY_TEXTURE_SIZE,
): Promise<TextureArrays | null> {
  try {
    const layers = sets.length;
    const albedo = new Uint8Array(size * size * 4 * layers);
    const surface = new Uint8Array(size * size * 4 * layers);
    const url = (f: string) => `${ASSETS_BASE_URL}/${f}`;
    await Promise.all(
      sets.map(async (set, layer) => {
        const [color, normal, roughness, ao, height] = await Promise.all([
          pixels(url(set.color), size),
          pixels(url(set.normal), size),
          pixels(url(set.roughness), size),
          set.ao ? pixels(url(set.ao), size) : null,
          set.height ? pixels(url(set.height), size) : null,
        ]);
        packLayer(layer, size, { color, normal, roughness, ao, height }, albedo, surface);
      }),
    );
    return {
      albedo: arrayTexture(albedo, size, layers, true),
      surface: arrayTexture(surface, size, layers, false),
      layers,
    };
  } catch {
    return null;
  }
}
