// CC0 assets of the world (phase 2), downloaded by `pnpm fetch-assets` into
// apps/web/public/assets/ (kept out of git, like the built world). The web
// app reads the manifest written next to them and falls back to procedural
// textures and lighting for anything missing.

export interface HdriAsset {
  /** Poly Haven asset id. */
  id: string;
  title: string;
  author: string;
  resolution: '1k' | '2k';
}

/** Environment map: ambient light and reflections (lot 2.2). */
export const HDRI: HdriAsset = {
  id: 'alps_field',
  title: 'Alps Field',
  author: 'Andreas Mischok',
  resolution: '1k',
};

/** Share of the HDRI pixels kept as is; brighter ones (the sun disc) are clipped to it. */
export const HDRI_CLIP_PERCENTILE = 0.9995;

export interface TextureAsset {
  source: 'polyhaven' | 'ambientcg';
  /** Asset id on the source site. */
  id: string;
  author: string;
}

/**
 * PBR textures, in 1K JPG, by slot. The terrain slots are the layers of
 * apps/web/src/world/terrain-splat.ts (lot 2.4).
 */
export const TEXTURES: Record<string, TextureAsset> = {
  grass: { source: 'ambientcg', id: 'Grass004', author: 'ambientCG (Lennart Demes)' },
  meadow: { source: 'ambientcg', id: 'Ground037', author: 'ambientCG (Lennart Demes)' },
  dirt: { source: 'polyhaven', id: 'forest_ground_04', author: 'Rob Tuytel, Rico Cilliers' },
  rock: { source: 'ambientcg', id: 'Rock030', author: 'ambientCG (Lennart Demes)' },
  scree: { source: 'polyhaven', id: 'gray_rocks', author: 'Dimitrios Savva' },
  snow: { source: 'polyhaven', id: 'snow_02', author: 'Rob Tuytel' },
};
