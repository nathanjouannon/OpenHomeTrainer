// Runtime loading of the CC0 assets listed in public/assets/manifest.json.
// Every loader resolves to null when an asset is missing (`pnpm fetch-assets`
// not run yet), and the world falls back to its procedural look.

import { type DataTexture, EquirectangularReflectionMapping } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { ASSETS_BASE_URL, type AssetManifest, isAssetManifest } from './asset-manifest';
import { loadTextureArrays, type TextureArrays } from './texture-arrays';

let manifest: Promise<AssetManifest | null> | null = null;

/** The asset manifest, fetched once. */
export function assetManifest(): Promise<AssetManifest | null> {
  manifest ??= fetch(`${ASSETS_BASE_URL}/manifest.json`)
    .then(async (res) => {
      if (!res.ok) return null;
      const json: unknown = await res.json();
      return isAssetManifest(json) ? json : null;
    })
    .catch(() => null);
  return manifest;
}

export interface EnvironmentMap {
  texture: DataTexture;
  /** Sun direction in the map (equirectangular convention of Three.js). */
  sun: { azimuthRad: number; elevationRad: number };
}

export async function loadEnvironmentMap(): Promise<EnvironmentMap | null> {
  const hdri = (await assetManifest())?.hdri;
  if (!hdri) return null;
  try {
    const texture = await new HDRLoader().loadAsync(`${ASSETS_BASE_URL}/${hdri.file}`);
    texture.mapping = EquirectangularReflectionMapping;
    return { texture, sun: hdri.sun };
  } catch {
    return null;
  }
}

/** Texture arrays of the given slots, in order; null if one of them is missing. */
export async function loadTextureSlots(slots: readonly string[]): Promise<TextureArrays | null> {
  const textures = (await assetManifest())?.textures;
  if (!textures) return null;
  const sets = slots.map((slot) => textures[slot]);
  if (sets.some((s) => !s)) return null;
  return loadTextureArrays(sets as NonNullable<(typeof sets)[number]>[]);
}
