// Time and randomness of the world animations (pedestrians, traffic, rider,
// camera). A ride uses the real clock; the benchmark uses a fixed step and a
// seeded generator so that a capture taken after N frames is always the same.

import { createContext, useContext } from 'react';
import { mulberry32 } from './world-data';

export interface WorldClock {
  /** Animation step for a rendered frame, from the real frame time (s). */
  step(frameDeltaS: number): number;
  /** Random number in [0, 1) for the animated objects. */
  random(): number;
}

export const realClock: WorldClock = {
  step: (frameDeltaS) => frameDeltaS,
  random: Math.random,
};

/**
 * Benchmark clock. `fixed`: the same step every frame, so the state after N
 * frames never depends on the frame rate; `frozen`: nothing moves; `real`:
 * real frame time, while measuring.
 */
export class BenchClock implements WorldClock {
  mode: 'fixed' | 'frozen' | 'real' = 'fixed';
  readonly random: () => number;

  constructor(
    seed: number,
    private readonly stepS = 1 / 60,
  ) {
    this.random = mulberry32(seed);
  }

  step(frameDeltaS: number): number {
    if (this.mode === 'frozen') return 0;
    return this.mode === 'real' ? frameDeltaS : this.stepS;
  }
}

export const WorldClockContext = createContext<WorldClock>(realClock);

export const useWorldClock = () => useContext(WorldClockContext);
