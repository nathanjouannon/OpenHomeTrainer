import type { LocalizedText } from './route';

/** Manifest of a built world (world.json), produced by tools/world-builder. */
export interface WorldManifest {
  format: 'hrt-world/1';
  id: string;
  version: number;
  name: LocalizedText;
  description: LocalizedText;
  /** Square heightmap: float32 LE, row-major, row 0 = north edge, column 0 = west edge. */
  heightmap: {
    file: string;
    sizeM: number;
    samples: number;
    minElevationM: number;
    maxElevationM: number;
  };
  waterLevelM: number | null;
  routes: {
    id: string;
    file: string;
    name: LocalizedText;
    profile: 'flat' | 'rolling' | 'mountain';
    lengthM: number;
    ascentM: number;
    maxGradePercent: number;
  }[];
  attribution: string[];
  builtAt: string;
}
