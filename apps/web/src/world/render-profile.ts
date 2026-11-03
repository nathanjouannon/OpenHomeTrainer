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

export interface RenderProfile {
  /** Cast shadows of the sun, null when off. */
  shadows: ShadowProfile | null;
}

const PROFILES: Record<Quality, RenderProfile> = {
  low: { shadows: null },
  medium: { shadows: { cascades: 3, mapSize: 1024, maxFarM: 160 } },
  high: { shadows: { cascades: 3, mapSize: 2048, maxFarM: 200 } },
};

export const renderProfile = (quality: Quality): RenderProfile => PROFILES[quality];
