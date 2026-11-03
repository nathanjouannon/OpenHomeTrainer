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
