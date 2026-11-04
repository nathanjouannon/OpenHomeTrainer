// Automatic quality (lot 2.9): when the average FPS stays under a threshold
// for a whole window, the renderer lowers a ladder of levers that do not need
// the world to be rebuilt: the render resolution and the grass around the
// camera. Kept free of Three.js and React so that it can be tested.

import type { RenderProfile } from './render-profile';

/** The window is judged on its average FPS (s). */
export const AUTO_WINDOW_S = 10;
/** Under this average FPS over a window, one more level is taken. */
export const AUTO_MIN_FPS = 45;

export interface AutoLevel {
  /** Share of the base pixel ratio used to render. */
  resolution: number;
  /** Share of the grass radius, density, tall grass and flowers; 0 turns the grass off. */
  grass: number;
}

/** Level 0 is the unchanged profile; each level after it saves more GPU time. */
export const AUTO_LEVELS: readonly AutoLevel[] = [
  { resolution: 1, grass: 1 },
  { resolution: 0.85, grass: 0.7 },
  { resolution: 0.7, grass: 0.45 },
  { resolution: 0.6, grass: 0 },
];

export const MAX_AUTO_LEVEL = AUTO_LEVELS.length - 1;

export const autoLevel = (level: number): AutoLevel =>
  AUTO_LEVELS[Math.min(MAX_AUTO_LEVEL, Math.max(0, Math.round(level)))] as AutoLevel;

/** The profile with the grass thinned out for a level (the same object at level 0). */
export function adaptProfile(profile: RenderProfile, level: number): RenderProfile {
  const { grass: share } = autoLevel(level);
  const grass = profile.vegetation.grass;
  if (share >= 1 || !grass) return profile;
  return {
    ...profile,
    vegetation: {
      ...profile.vegetation,
      grass:
        share <= 0
          ? null
          : {
              radiusM: grass.radiusM * share,
              density: grass.density * Math.max(share, 0.6),
              tall: grass.tall * share,
              flowers: grass.flowers * share,
            },
    },
  };
}

/**
 * Watches the frame times and says when to lower the level. Only goes down: a
 * level that was too heavy is not tried again during the ride, which avoids
 * flip-flopping around the threshold.
 */
export class AutoQuality {
  level = 0;
  private timeS = 0;
  private frames = 0;

  constructor(
    private readonly windowS = AUTO_WINDOW_S,
    private readonly minFps = AUTO_MIN_FPS,
  ) {}

  /** Records a frame; returns the new level when it has just changed. */
  push(deltaS: number): number | null {
    // A gap this long is a hidden tab or a pause, not rendering: start a new window.
    if (!(deltaS > 0) || deltaS >= 1) {
      this.timeS = 0;
      this.frames = 0;
      return null;
    }
    this.timeS += deltaS;
    this.frames++;
    if (this.timeS < this.windowS) return null;
    const fps = this.frames / this.timeS;
    this.timeS = 0;
    this.frames = 0;
    if (fps >= this.minFps || this.level >= MAX_AUTO_LEVEL) return null;
    this.level++;
    return this.level;
  }
}
