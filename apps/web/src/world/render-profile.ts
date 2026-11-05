// What each quality level turns on in the 3D view (phase 2). Kept free of
// Three.js so that it can be tested and shown in the settings.

import type { Quality } from '../store/settings';
import type { RendererBackend } from './renderer-options';

export interface ShadowProfile {
  /** Number of shadow cascades (cascaded shadow maps). */
  cascades: number;
  /** Size of each cascade's shadow map, in texels. */
  mapSize: number;
  /** Shadows are drawn up to this distance from the camera (m). */
  maxFarM: number;
}

export interface PostProfile {
  /** Screen-space ambient occlusion (GTAO) at a share of the resolution; null when off. */
  ao: { resolutionScale: number; samples: number } | null;
  /** Light bloom of the brightest parts (sky near the sun, glints). */
  bloom: boolean;
  /** Colour grading (3D LUT) after the tone mapping. */
  grading: boolean;
  /** SMAA anti-aliasing (the canvas has no MSAA once post-processing is on). */
  smaa: boolean;
}

export interface TerrainProfile {
  /** Stochastic sampling of the ground textures (no visible repetition). */
  stochastic: boolean;
  /** Triplanar projection of the rock and scree on steep slopes. */
  triplanar: boolean;
  /** Procedural micro-relief of the ground near the camera (lot 2.8). */
  microRelief: boolean;
}

export interface VegetationProfile {
  /** Trees placed in the world. */
  trees: number;
  /** Reach distances where the tree tiers end (m, further ahead of the camera): full model, LOD 1, LOD 2; imposters go on to `treeViewM`. */
  treeTiersM: readonly [number, number, number];
  treeViewM: number;
  /** Shrubs placed in the world, the distance where their full model ends and where they vanish (m). */
  shrubs: number;
  shrubFullM: number;
  shrubViewM: number;
  /** Grass around the camera: radius (reach metres, see vegetation-reach.ts) and clumps per m²; null when off. */
  grass: { radiusM: number; density: number; tall: number; flowers: number } | null;
}

export interface AtmosphereProfile {
  /** Clouds in the sky shader (fractal noise per sky pixel). */
  clouds: boolean;
  /** Mist that thickens towards the valley floor and tints with the sun, on top of the distance haze. */
  heightFog: boolean;
}

/** How the lake shows the sky: a flat colour, the environment map, or the scene itself (planar reflection). */
export type WaterMode = 'flat' | 'environment' | 'planar';

export interface RenderProfile {
  /** Cast shadows of the sun, null when off. */
  shadows: ShadowProfile | null;
  /** Post-processing chain, null to render the scene straight to the canvas. */
  post: PostProfile | null;
  /** PBR ground materials (lot 2.4), used once the CC0 textures are downloaded. */
  terrain: TerrainProfile;
  /** Trees, shrubs and grass (lot 2.6). */
  vegetation: VegetationProfile;
  /** Sky and haze (lot 2.7). */
  atmosphere: AtmosphereProfile;
  /** Lake (lot 2.7). */
  water: WaterMode;
}

const PROFILES: Record<Quality, RenderProfile> = {
  low: {
    shadows: null,
    post: { ao: null, bloom: false, grading: true, smaa: false },
    terrain: { stochastic: false, triplanar: false, microRelief: false },
    vegetation: {
      trees: 25_000,
      treeTiersM: [20, 100, 380],
      treeViewM: 1800,
      shrubs: 3000,
      shrubFullM: 35,
      shrubViewM: 200,
      grass: { radiusM: 32, density: 1.4, tall: 0.5, flowers: 0.25 },
    },
    atmosphere: { clouds: false, heightFog: false },
    water: 'flat',
  },
  medium: {
    shadows: { cascades: 3, mapSize: 1024, maxFarM: 160 },
    post: { ao: { resolutionScale: 0.5, samples: 8 }, bloom: true, grading: true, smaa: true },
    terrain: { stochastic: true, triplanar: true, microRelief: true },
    vegetation: {
      trees: 60_000,
      treeTiersM: [40, 170, 650],
      treeViewM: 2800,
      shrubs: 12_000,
      shrubFullM: 55,
      shrubViewM: 330,
      grass: { radiusM: 52, density: 2.6, tall: 0.9, flowers: 0.5 },
    },
    atmosphere: { clouds: true, heightFog: true },
    water: 'environment',
  },
  high: {
    shadows: { cascades: 3, mapSize: 2048, maxFarM: 200 },
    post: { ao: { resolutionScale: 0.75, samples: 12 }, bloom: true, grading: true, smaa: true },
    terrain: { stochastic: true, triplanar: true, microRelief: true },
    vegetation: {
      trees: 110_000,
      treeTiersM: [65, 250, 950],
      treeViewM: 4000,
      shrubs: 26_000,
      shrubFullM: 75,
      shrubViewM: 450,
      grass: { radiusM: 66, density: 3.6, tall: 1.2, flowers: 0.7 },
    },
    atmosphere: { clouds: true, heightFog: true },
    water: 'planar',
  },
};

export const renderProfile = (quality: Quality): RenderProfile => PROFILES[quality];

/**
 * Terrain sampling for a quality on a backend: the WebGL2 fallback drops the
 * stochastic sampling (twice the texture reads on every ground pixel), which
 * took it under the FPS budgets; the triplanar cliffs stay.
 */
export const terrainProfile = (quality: Quality, backend: RendererBackend): TerrainProfile => {
  const t = PROFILES[quality].terrain;
  return backend === 'webgl2' ? { ...t, stochastic: false } : t;
};
