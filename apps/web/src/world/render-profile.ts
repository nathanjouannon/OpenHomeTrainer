// What each quality level turns on in the 3D view (phase 2). Kept free of
// Three.js so that it can be tested and shown in the settings.

import type { Quality } from '../store/settings';

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

export interface RenderProfile {
  /** Cast shadows of the sun, null when off. */
  shadows: ShadowProfile | null;
  /** Post-processing chain, null to render the scene straight to the canvas. */
  post: PostProfile | null;
}

const PROFILES: Record<Quality, RenderProfile> = {
  low: {
    shadows: null,
    post: { ao: null, bloom: false, grading: true, smaa: false },
  },
  medium: {
    shadows: { cascades: 3, mapSize: 1024, maxFarM: 160 },
    post: { ao: { resolutionScale: 0.5, samples: 8 }, bloom: true, grading: true, smaa: true },
  },
  high: {
    shadows: { cascades: 3, mapSize: 2048, maxFarM: 200 },
    post: { ao: { resolutionScale: 0.75, samples: 12 }, bloom: true, grading: true, smaa: true },
  },
};

export const renderProfile = (quality: Quality): RenderProfile => PROFILES[quality];
