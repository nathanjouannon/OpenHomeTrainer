// Manifest of the CC0 assets downloaded by `pnpm fetch-assets` (written by
// tools/world-builder, read by the app). No Three.js here.

export const ASSETS_FORMAT = 'hrt-assets/1';
export const ASSETS_BASE_URL = '/assets';

export interface AssetManifest {
  format: typeof ASSETS_FORMAT;
  generatedAt: string;
  /** Environment map (lot 2.2). */
  hdri?: {
    file: string;
    source: string;
    license: 'CC0';
    author: string;
    /** Sun of the original image, Three.js equirectangular convention. */
    sun: { azimuthRad: number; elevationRad: number };
    /** Luminance the sun disc was clipped to. */
    clippedAt: number;
  };
  /** PBR texture sets by slot (terrain layers from lot 2.4). */
  textures?: Record<string, TextureSet>;
  /** Rigged rider (lot 2.10), imported by `pnpm import-avatar`. */
  avatar?: {
    /** glTF of the rider, relative to the assets folder. */
    file: string;
    source: string;
    license: 'CC0';
    author: string;
  };
}

/** Files of one PBR texture set (paths relative to the assets folder). */
export interface TextureSetFiles {
  color: string;
  /** OpenGL convention (green up). */
  normal: string;
  roughness: string;
  ao?: string;
  /** Height (displacement), used to blend the terrain layers. */
  height?: string;
}

export interface TextureSet extends TextureSetFiles {
  source: string;
  license: 'CC0';
  author: string;
}

export const isAssetManifest = (v: unknown): v is AssetManifest =>
  typeof v === 'object' && v !== null && (v as AssetManifest).format === ASSETS_FORMAT;
