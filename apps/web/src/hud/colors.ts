// Colour-blind modes of the HUD (lot 3.12): grade bands and power zones.

import { getSettings } from '../store/settings';

export type ColorMode = 'default' | 'redGreen' | 'blueYellow';
export const COLOR_MODES: readonly ColorMode[] = ['default', 'redGreen', 'blueYellow'];

export const isColorMode = (v: unknown): v is ColorMode =>
  typeof v === 'string' && (COLOR_MODES as readonly string[]).includes(v);

// Six power zones, easy to hard. The colour-blind sets follow the Okabe-Ito palette
// (red-green) and a teal / pink / red set that avoids blue-yellow pairs (blue-yellow).
const ZONE_COLORS: Record<ColorMode, readonly string[]> = {
  default: ['#8aa0b4', '#4fa3d9', '#5cb85c', '#e6c229', '#f08a24', '#e0453a'],
  redGreen: ['#999999', '#56b4e9', '#009e73', '#f0e442', '#e69f00', '#cc79a7'],
  blueYellow: ['#9a9a9a', '#0b9aa8', '#3cb371', '#f4a6c0', '#e0453a', '#8e1b3a'],
};

/** Power zone 1..6 of a power (docs/09 §4); the colour comes from the `--z1..6` tokens. */
export function zoneIndex(watts: number, ftpW: number): 1 | 2 | 3 | 4 | 5 | 6 {
  const f = watts / Math.max(1, ftpW);
  return f < 0.56 ? 1 : f < 0.76 ? 2 : f < 0.91 ? 3 : f < 1.06 ? 4 : f < 1.21 ? 5 : 6;
}

export function zoneColor(watts: number, ftpW: number, mode = getSettings().colorMode): string {
  const f = watts / Math.max(1, ftpW);
  const z = f < 0.56 ? 0 : f < 0.76 ? 1 : f < 0.91 ? 2 : f < 1.06 ? 3 : f < 1.21 ? 4 : 5;
  return ZONE_COLORS[mode][z] as string;
}

/** Non-colour cue of a grade band, shown in the colour-blind modes. */
export const GRADE_MARK: Record<string, string> = {
  down: '▼',
  flat: '',
  g1: '▲',
  g2: '▲▲',
  g3: '▲▲▲',
};
