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
}

export const isAssetManifest = (v: unknown): v is AssetManifest =>
  typeof v === 'object' && v !== null && (v as AssetManifest).format === ASSETS_FORMAT;
