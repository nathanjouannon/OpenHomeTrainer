// Runtime loading of the CC0 assets listed in public/assets/manifest.json.
// Every loader resolves to null when an asset is missing (`pnpm fetch-assets`
// not run yet), and the world falls back to its procedural look.

import { type DataTexture, EquirectangularReflectionMapping } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { ASSETS_BASE_URL, type AssetManifest, isAssetManifest } from './asset-manifest';

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
